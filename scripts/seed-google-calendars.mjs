/**
 * Mirrors the CalendarBusy rows written by `npm run seed` into the real
 * Google secondary calendars, so PROVIDER_MODE=google reproduces the exact
 * same demo scenarios (docs/04 §2) as mock mode.
 *
 * Run order matters:
 *   1. Set GOOGLE_CAL_VIKRAM / _ALEX / _PRIYA / _RAHUL / _ANANYA in .env to
 *      the real secondary-calendar ids (from Google Calendar → Settings →
 *      each calendar → "Integrate calendar" → Calendar ID).
 *   2. npm run seed        (writes those real ids onto User.calendarId AND
 *                            into CalendarBusy, since lib/seed.ts now reads
 *                            the same env vars)
 *   3. node scripts/seed-google-calendars.mjs   (this script — pushes the
 *                            CalendarBusy rows as real events)
 *
 * Idempotent: every event this script creates is tagged with
 * extendedProperties.private.sira="1", and each run deletes its own
 * previously-created events in a calendar before re-creating them — safe to
 * re-run after every reseed.
 */
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import { loadEnv } from './lib/load-env.mjs';

loadEnv();

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
  console.error(
    'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN in .env.\n' +
    'Run scripts/mint-google-token.mjs first.'
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

const prisma = new PrismaClient();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * This script fires ~50-80 Calendar API calls in a few seconds (list+delete
 * per stale event, insert per fresh one, across 5 calendars) — enough to trip
 * Google's short burst-rate limit for an app still in OAuth "Testing" status,
 * even though the account's real daily quota is nowhere close to used.
 * A small fixed delay between calls plus a retry-with-backoff on that one
 * specific error (403 "Calendar usage limits exceeded") makes re-running this
 * after every reseed reliable instead of intermittently failing partway through.
 */
async function withRateLimitRetry(fn, { retries = 4, baseDelayMs = 2000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err?.message || err?.errors?.[0]?.message || '';
      const isBurstLimit = err?.code === 403 && /usage limits exceeded/i.test(message);
      if (!isBurstLimit || attempt >= retries) throw err;
      const delay = baseDelayMs * 2 ** attempt;
      console.warn(`  (Calendar API burst limit hit — retrying in ${delay}ms...)`);
      await sleep(delay);
    }
  }
}

async function clearPreviousSeedEvents(calendarId) {
  let pageToken;
  let deleted = 0;
  do {
    const res = await withRateLimitRetry(() =>
      calendar.events.list({
        calendarId,
        privateExtendedProperty: ['sira=1'],
        pageToken,
        maxResults: 2500,
        showDeleted: false,
      })
    );
    for (const ev of res.data.items ?? []) {
      await withRateLimitRetry(() => calendar.events.delete({ calendarId, eventId: ev.id }));
      deleted++;
      await sleep(120);
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return deleted;
}

async function main() {
  const rows = await prisma.calendarBusy.findMany();
  if (rows.length === 0) {
    console.error('CalendarBusy is empty — run `npm run seed` first.');
    process.exit(1);
  }

  const byCalendar = new Map();
  for (const row of rows) {
    if (!byCalendar.has(row.calendarId)) byCalendar.set(row.calendarId, []);
    byCalendar.get(row.calendarId).push(row);
  }

  // Real Google secondary-calendar ids look like "...@group.calendar.google.com".
  // Anything else is still a mock key — GOOGLE_CAL_* wasn't set for it, skip it
  // rather than trying to write to a calendar id that doesn't exist.
  for (const [calendarId, events] of byCalendar) {
    if (!calendarId.includes('@')) {
      console.log(`Skipping "${calendarId}" — looks like a mock key, not a real calendar id.`);
      continue;
    }
    const deleted = await clearPreviousSeedEvents(calendarId);
    console.log(`${calendarId}: cleared ${deleted} previous seed event(s), creating ${events.length}...`);
    for (const ev of events) {
      await withRateLimitRetry(() =>
        calendar.events.insert({
          calendarId,
          requestBody: {
            summary: ev.title,
            start: { dateTime: ev.startUtc.toISOString(), timeZone: 'UTC' },
            end: { dateTime: ev.endUtc.toISOString(), timeZone: 'UTC' },
            extendedProperties: { private: { sira: '1' } },
          },
        })
      );
      await sleep(120);
    }
  }

  await seedInterviewEvents();

  console.log('\nDone. These are the exact CalendarBusy rows already visible in mock mode —');
  console.log('now they exist as real Google Calendar events too.');
  await prisma.$disconnect();
}

/**
 * The seed script's pre-scheduled demo scenarios (Sophia, Ryan, Nikhil,
 * Chloe, ...) write straight to the Booking table with a fake meetLink —
 * cheap and fast for `npm run seed`, but it means they never existed as real
 * Calendar events in ANY mode. Recreate them for real here, on the currently
 * assigned interviewer's own calendar (mirrors createEvent()'s routing), and
 * write the real eventId/meetLink back so cancel/decline on these seeded
 * bookings can find and clean up the real event too.
 */
async function seedInterviewEvents() {
  const bookings = await prisma.booking.findMany({
    where: { status: 'CONFIRMED' },
    include: {
      request: {
        include: {
          candidate: true,
          panel: { include: { interviewer: true } },
        },
      },
    },
  });

  let created = 0;
  for (const booking of bookings) {
    const active = booking.request.panel.find(
      (p) => p.status !== 'DECLINED' && p.status !== 'REPLACED'
    );
    if (!active || !active.interviewer.calendarId?.includes('@')) continue;

    const res = await withRateLimitRetry(() =>
      calendar.events.insert({
        calendarId: active.interviewer.calendarId,
        conferenceDataVersion: 1,
        requestBody: {
          summary: `Interview: ${booking.request.jobTitle} — ${booking.request.candidate.name}`,
          description: 'Interview arranged by SIRA (seed data).',
          start: { dateTime: booking.startUtc.toISOString(), timeZone: 'UTC' },
          end: { dateTime: booking.endUtc.toISOString(), timeZone: 'UTC' },
          attendees: [{ email: booking.request.candidate.email }, { email: active.interviewer.email }],
          conferenceData: {
            createRequest: { requestId: `sira-seed-${booking.id}`, conferenceSolutionKey: { type: 'hangoutsMeet' } },
          },
          extendedProperties: { private: { sira: '1' } },
        },
      })
    );
    await sleep(120);

    await prisma.booking.update({
      where: { id: booking.id },
      data: { eventId: res.data.id, meetLink: res.data.hangoutLink ?? booking.meetLink },
    });
    created++;
    console.log(`  + real event for ${booking.request.candidate.name} on ${active.interviewer.name}'s calendar`);
  }
  console.log(`Created ${created} real interview event(s) for pre-scheduled demo scenarios.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
