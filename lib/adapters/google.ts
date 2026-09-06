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

/* -------------------------------------------------------------------------
 *  Calendar
 * ---------------------------------------------------------------------- */

export const GoogleCalendar: CalendarAdapter = {
  async getBusy(calendarId, from, to) {
    const calendar = google.calendar({ version: 'v3', auth: oauthClient() });
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        items: [{ id: calendarId }],
      },
    });
    const busy = res.data.calendars?.[calendarId]?.busy ?? [];
    return busy
      .filter((b) => b.start && b.end)
      .map((b) => ({ start: new Date(b.start as string), end: new Date(b.end as string) }));
  },

  async createEvent(input: EventInput) {
    const calendar = google.calendar({ version: 'v3', auth: oauthClient() });
    const res = await calendar.events.insert({
      calendarId: process.env.GOOGLE_PRIMARY_CALENDAR_ID || 'primary',
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
    });

    const meetLink =
      res.data.hangoutLink ??
      res.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
      null;

    return { eventId: res.data.id as string, meetLink };
  },

  async updateEvent(eventId, input) {
    const calendar = google.calendar({ version: 'v3', auth: oauthClient() });
    await calendar.events.patch({
      calendarId: process.env.GOOGLE_PRIMARY_CALENDAR_ID || 'primary',
      eventId,
      sendUpdates: 'all',
      requestBody: {
        ...(input.summary ? { summary: input.summary } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.startUtc ? { start: { dateTime: input.startUtc.toISOString(), timeZone: 'UTC' } } : {}),
        ...(input.endUtc ? { end: { dateTime: input.endUtc.toISOString(), timeZone: 'UTC' } } : {}),
        ...(input.attendees ? { attendees: input.attendees.map((email) => ({ email })) } : {}),
      },
    });
  },

  async deleteEvent(eventId) {
    const calendar = google.calendar({ version: 'v3', auth: oauthClient() });
    try {
      await calendar.events.delete({
        calendarId: process.env.GOOGLE_PRIMARY_CALENDAR_ID || 'primary',
        eventId,
        sendUpdates: 'all',
      });
    } catch (err) {
      // Already gone is a success for our purposes.
      const code = (err as { code?: number })?.code;
      if (code !== 404 && code !== 410) throw err;
    }
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
