import { google } from "googleapis";
import { env } from "../../config/env";
import { BusyPeriod, CalendarProvider, CreateEventInput, CreateEventResult } from "./CalendarProvider";

/**
 * Real Google Calendar integration (PROVIDER_MODE=live). Requires a per-user OAuth refresh
 * token obtained via /auth/oauth/google — see architecture doc Section 7.6. Costs $0 to call
 * (Calendar API has no per-request charge; Section 7.10).
 *
 * NOTE: this is a structural implementation, not a fully wired one — connecting it to real
 * per-user stored OAuth tokens is a small amount of glue code intentionally left for
 * implementation time, not faked here. See README "What's real vs. scaffolded."
 */
export class GoogleCalendarProvider implements CalendarProvider {
  private oauthClient() {
    return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_OAUTH_REDIRECT_URI);
  }

  async getBusyPeriods(accountEmail: string, rangeStart: Date, rangeEnd: Date): Promise<BusyPeriod[]> {
    const auth = this.oauthClient();
    // auth.setCredentials({ refresh_token: <looked up per accountEmail> }) — see NOTE above.
    const calendar = google.calendar({ version: "v3", auth });

    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
        items: [{ id: accountEmail }],
      },
    });

    const busy = res.data.calendars?.[accountEmail]?.busy ?? [];
    return busy
      .filter((b) => b.start && b.end)
      .map((b) => ({ start: new Date(b.start as string), end: new Date(b.end as string) }));
  }

  async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
    const auth = this.oauthClient();
    const calendar = google.calendar({ version: "v3", auth });

    const res = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      requestBody: {
        summary: input.title,
        description: input.description,
        start: { dateTime: input.start.toISOString() },
        end: { dateTime: input.end.toISOString() },
        attendees: input.attendeeEmails.map((email) => ({ email })),
        conferenceData: {
          createRequest: { requestId: `${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } },
        },
      },
    });

    return {
      externalEventId: res.data.id ?? "",
      meetingJoinUrl: res.data.hangoutLink ?? null,
    };
  }

  async updateEvent(externalEventId: string, input: Partial<CreateEventInput>): Promise<void> {
    const auth = this.oauthClient();
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.patch({
      calendarId: "primary",
      eventId: externalEventId,
      requestBody: {
        ...(input.start ? { start: { dateTime: input.start.toISOString() } } : {}),
        ...(input.end ? { end: { dateTime: input.end.toISOString() } } : {}),
      },
    });
  }

  async cancelEvent(externalEventId: string): Promise<void> {
    const auth = this.oauthClient();
    const calendar = google.calendar({ version: "v3", auth });
    await calendar.events.delete({ calendarId: "primary", eventId: externalEventId });
  }
}
