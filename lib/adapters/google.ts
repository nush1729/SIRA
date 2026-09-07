/**
 * ============================================================================
 *  Real Google transport — Calendar v3 + Gmail v1.
 *
 *  One OAuth client, one master account. The six interviewer calendars are
 *  SECONDARY calendars under that account (docs/04 §2), so a single consent
 *  covers all of them and nobody needs six real Google accounts.
 *
 *  Selected only when PROVIDER_MODE=google AND the credentials are present.
 *  Missing credentials fall back to mock rather than crashing the app — a
 *  half-configured deploy should degrade, not 500.
 * ============================================================================
 */

import { google } from 'googleapis';
import type { CalendarAdapter, EventInput } from './calendar';
import type { MailAdapter } from './mail';

export function googleCredentialsPresent(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

function oauthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    // Only used during the one-off consent that mints the refresh token.
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A user is waiting on this request, so retry budget is short (a couple of
 * seconds total, not the seed script's ~30s) — enough to absorb a genuine
 * transient burst-rate blip without making a live booking feel hung. If
 * Google's quota is actually exhausted for the day (this OAuth app is still
 * in "Testing" status, which gets much stricter caps), retrying won't help —
 * callers must still treat this as a real failure, not assume it self-heals.
 */
async function withGoogleRetry<T>(fn: () => Promise<T>, { retries = 2, baseDelayMs = 500 } = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { code?: number; message?: string; errors?: { message?: string }[] };
      const message = e?.message || e?.errors?.[0]?.message || '';
      const isBurstLimit = e?.code === 403 && /usage limits exceeded/i.test(message);
      if (!isBurstLimit || attempt >= retries) throw err;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
}

/* -------------------------------------------------------------------------
 *  Calendar
 * ---------------------------------------------------------------------- */

/**
 * Full event titles for the signed-in interviewer's OWN calendar view
 * (app/api/calendar/mine) — separate from getBusy(), which the scheduling
 * engine uses and deliberately keeps to free/busy-only (that's all it needs,
 * and it's the more privacy-minimal call). The OAuth scope minted is the full
 * "https://www.googleapis.com/auth/calendar" (see mint-google-token.mjs), so
 * a real events.list() read is available — no reason to fall back to
 * generic "Busy" labels layered under a second, DB-derived "Interview" block
 * for the exact same real event. One real Calendar event -> one row here.
 */
export async function listEvents(
  calendarId: string,
  from: Date,
  to: Date
): Promise<{ id: string; title: string; startUtc: string; endUtc: string; kind: 'BUSY' | 'INTERVIEW' }[]> {
  const calendar = google.calendar({ version: 'v3', auth: oauthClient() });
  const res = await withGoogleRetry(() =>
    calendar.events.list({
      calendarId,
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    })
  );
  return (res.data.items ?? [])
    .filter((e) => e.status !== 'cancelled' && e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({
      id: e.id as string,
      title: e.summary || 'Busy',
      startUtc: e.start!.dateTime as string,
      endUtc: e.end!.dateTime as string,
      kind: e.summary?.startsWith('Interview') ? ('INTERVIEW' as const) : ('BUSY' as const),
    }));
}

export const GoogleCalendar: CalendarAdapter = {
  async getBusy(calendarId, from, to) {
    const calendar = google.calendar({ version: 'v3', auth: oauthClient() });
    const res = await withGoogleRetry(() =>
      calendar.freebusy.query({
        requestBody: {
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          items: [{ id: calendarId }],
        },
      })
    );
    const busy = res.data.calendars?.[calendarId]?.busy ?? [];
    return busy
      .filter((b) => b.start && b.end)
      .map((b) => ({ start: new Date(b.start as string), end: new Date(b.end as string) }));
  },

  async createEvent(input: EventInput) {
    const calendar = google.calendar({ version: 'v3', auth: oauthClient() });
    const res = await withGoogleRetry(() =>
      calendar.events.insert({
        calendarId: input.calendarId || process.env.GOOGLE_PRIMARY_CALENDAR_ID || 'primary',
        // Required for Google Meet to actually be created.
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: {
          summary: input.summary,
          description: input.description,
          start: { dateTime: input.startUtc.toISOString(), timeZone: 'UTC' },
          end: { dateTime: input.endUtc.toISOString(), timeZone: 'UTC' },
          attendees: input.attendees.map((email) => ({ email })),
          conferenceData: {
            createRequest: {
              requestId: `sira-${input.requestId}-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
      })
    );

    const meetLink =
      res.data.hangoutLink ??
      res.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
      null;

    return { eventId: res.data.id as string, meetLink };
  },

  async updateEvent(eventId, input, calendarId) {
    const calendar = google.calendar({ version: 'v3', auth: oauthClient() });
    await withGoogleRetry(() =>
      calendar.events.patch({
        calendarId: calendarId || process.env.GOOGLE_PRIMARY_CALENDAR_ID || 'primary',
        eventId,
        sendUpdates: 'all',
        requestBody: {
          ...(input.summary ? { summary: input.summary } : {}),
          ...(input.description ? { description: input.description } : {}),
          ...(input.startUtc ? { start: { dateTime: input.startUtc.toISOString(), timeZone: 'UTC' } } : {}),
          ...(input.endUtc ? { end: { dateTime: input.endUtc.toISOString(), timeZone: 'UTC' } } : {}),
          ...(input.attendees ? { attendees: input.attendees.map((email) => ({ email })) } : {}),
        },
      })
    );
  },

  async deleteEvent(eventId, calendarId) {
    const target = calendarId || process.env.GOOGLE_PRIMARY_CALENDAR_ID || 'primary';
    const calendar = google.calendar({ version: 'v3', auth: oauthClient() });
    try {
      await withGoogleRetry(() => calendar.events.delete({ calendarId: target, eventId, sendUpdates: 'all' }));
    } catch (err) {
      // Already gone is a success for our purposes — BUT a 404 here can also
      // mean the event exists on a DIFFERENT calendar than `target` (wrong
      // calendarId passed in), which silently strands a real event forever.
      // Log it instead of swallowing it invisibly — a caller passing the
      // wrong calendarId is a bug worth seeing, not a normal idempotent-delete case.
      const code = (err as { code?: number })?.code;
      if (code !== 404 && code !== 410) throw err;
      console.warn(`[GoogleCalendar] deleteEvent: ${eventId} not found on calendar ${target} (already deleted, or wrong calendarId was passed).`);
    }
  },

  async moveEvent(eventId, fromCalendarId, toCalendarId) {
    const from = fromCalendarId || process.env.GOOGLE_PRIMARY_CALENDAR_ID || 'primary';
    const to = toCalendarId || process.env.GOOGLE_PRIMARY_CALENDAR_ID || 'primary';
    if (from === to) return;
    const calendar = google.calendar({ version: 'v3', auth: oauthClient() });
    await withGoogleRetry(() => calendar.events.move({ calendarId: from, eventId, destination: to, sendUpdates: 'all' }));
  },
};

/* -------------------------------------------------------------------------
 *  Gmail
 * ---------------------------------------------------------------------- */

function rfc822(to: string, from: string, subject: string, html: string): string {
  // Subjects may contain non-ASCII (em dashes, names) — encode per RFC 2047.
  const encodedSubject = `=?utf-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
  ].join('\r\n');
}

export const GmailMailer: MailAdapter = {
  async send(m) {
    const from = process.env.GOOGLE_SENDER_EMAIL;
    if (!from) {
      console.error('[GmailMailer] GOOGLE_SENDER_EMAIL is not set — refusing to send.');
      return { ok: false };
    }
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauthClient() });
      const raw = Buffer.from(rfc822(m.to, from, m.subject, m.html), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
      return { ok: true };
    } catch (err) {
      // A failed email must never roll back a successful booking (docs/08).
      console.error('[GmailMailer] send failed:', (err as Error).message);
      return { ok: false };
    }
  },
};
