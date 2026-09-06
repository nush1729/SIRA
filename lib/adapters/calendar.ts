import prisma from '@/lib/db';

export interface EventInput {
  requestId: string;
  startUtc: Date;
  endUtc: Date;
  attendees: string[]; // emails
  summary: string;
  description: string;
}

export interface CalendarAdapter {
  getBusy(calendarId: string, from: Date, to: Date): Promise<{start: Date; end: Date}[]>;
  createEvent(i: EventInput): Promise<{ eventId: string; meetLink: string | null }>;
  updateEvent(eventId: string, i: Partial<EventInput>): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
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

export function getCalendarAdapter(): CalendarAdapter {
  // If PROVIDER_MODE is google, we'd normally return GoogleCalendar, but for MVP/RoleB focus we stick to Mock if it's not written.
  return MockCalendar; 
}
