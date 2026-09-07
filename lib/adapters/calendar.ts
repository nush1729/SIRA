import prisma from '@/lib/db';

export interface EventInput {
  requestId: string;
  startUtc: Date;
  endUtc: Date;
  attendees: string[]; // emails
  summary: string;
  description: string;
  // Which calendar to create the event on — the assigned interviewer's own
  // secondary calendar, so the booked event lands in the same place getBusy()
  // reads from. Falls back to the master account's primary calendar if unset.
  calendarId?: string;
}

export interface CalendarAdapter {
  getBusy(calendarId: string, from: Date, to: Date): Promise<{start: Date; end: Date}[]>;
  createEvent(i: EventInput): Promise<{ eventId: string; meetLink: string | null }>;
  updateEvent(eventId: string, i: Partial<EventInput>, calendarId?: string): Promise<void>;
  deleteEvent(eventId: string, calendarId?: string): Promise<void>;
}

export const MockCalendar: CalendarAdapter = {
  async getBusy(calendarId, from, to) {
    const busy = await prisma.calendarBusy.findMany({
      where: {
        calendarId,
        startUtc: { lt: to },
        endUtc: { gt: from }
      }
    });
    return busy.map(b => ({ start: b.startUtc, end: b.endUtc }));
  },
  
  async createEvent(i) {
    const eventId = `mock-evt-${Math.random().toString(36).substring(2, 9)}`;
    const meetLink = `https://meet.google.com/mock-${Math.random().toString(36).substring(2, 9)}`;
    console.log(`[MockCalendar] Created event ${eventId} for ${i.summary}`);
    return { eventId, meetLink };
  },
  
  async updateEvent(eventId, i) {
    console.log(`[MockCalendar] Updated event ${eventId}`, i);
  },
  
  async deleteEvent(eventId) {
    console.log(`[MockCalendar] Deleted event ${eventId}`);
  }
};

/**
 * PROVIDER_MODE=google reads real free/busy and writes real events with Meet
 * links; anything else uses the seeded CalendarBusy rows. Same interface, so
 * nothing above this line changes.
 */
export function getCalendarAdapter(): CalendarAdapter {
  if (process.env.PROVIDER_MODE !== 'google') return MockCalendar;

  const { GoogleCalendar, googleCredentialsPresent } = require('./google') as typeof import('./google');
  if (!googleCredentialsPresent()) {
    console.warn('[calendar] PROVIDER_MODE=google but Google credentials are missing — using MockCalendar.');
    return MockCalendar;
  }
  return GoogleCalendar;
}
