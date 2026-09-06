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

async function clearPreviousSeedEvents(calendarId) {
  let pageToken;
  let deleted = 0;
  do {
    const res = await calendar.events.list({
      calendarId,
      privateExtendedProperty: ['sira=1'],
      pageToken,
      maxResults: 2500,
      showDeleted: false,
    });
    for (const ev of res.data.items ?? []) {
      await calendar.events.delete({ calendarId, eventId: ev.id });
      deleted++;
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
      await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: ev.title,
          start: { dateTime: ev.startUtc.toISOString(), timeZone: 'UTC' },
          end: { dateTime: ev.endUtc.toISOString(), timeZone: 'UTC' },
          extendedProperties: { private: { sira: '1' } },
        },
      });
    }
  }

  console.log('\nDone. These are the exact CalendarBusy rows already visible in mock mode —');
  console.log('now they exist as real Google Calendar events too.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
