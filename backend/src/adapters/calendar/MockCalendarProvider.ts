import { v4 as uuid } from "uuid";
import { prisma } from "../../lib/prisma";
import { BusyPeriod, CalendarProvider, CreateEventInput, CreateEventResult } from "./CalendarProvider";

/**
 * Demo/Sandbox calendar adapter. Reads "busy periods" straight out of the CalendarEvent table
 * seeded by prisma/seed.ts, so each demo interviewer genuinely has a different, realistic-looking
 * schedule instead of everyone being free all the time — that's what makes the Recommendations
 * tab's "here's the one slot where everyone overlaps" moment mean something in a demo. No real
 * Google account or network call is involved.
 */
export class MockCalendarProvider implements CalendarProvider {
  async getBusyPeriods(accountEmail: string, rangeStart: Date, rangeEnd: Date): Promise<BusyPeriod[]> {
    const events = await prisma.calendarEvent.findMany({
      where: {
        ownerId: accountEmail,
        provider: "mock",
        startUtc: { lt: rangeEnd },
        endUtc: { gt: rangeStart },
      },
    });
    return events.map((e) => ({ start: e.startUtc, end: e.endUtc }));
  }

  async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
    const externalEventId = `mock-evt-${uuid()}`;
    await prisma.calendarEvent.create({
      data: {
        ownerId: input.organizerEmail,
        provider: "mock",
        externalEventId,
        startUtc: input.start,
        endUtc: input.end,
      },
    });
    return {
      externalEventId,
      meetingJoinUrl: `https://meet.google.com/mock-${externalEventId.slice(-8)}?sandbox=true`,
    };
  }

  async updateEvent(externalEventId: string, input: Partial<CreateEventInput>): Promise<void> {
    await prisma.calendarEvent.updateMany({
      where: { externalEventId },
      data: {
        ...(input.start ? { startUtc: input.start } : {}),
        ...(input.end ? { endUtc: input.end } : {}),
      },
    });
  }

  async cancelEvent(externalEventId: string): Promise<void> {
    await prisma.calendarEvent.deleteMany({ where: { externalEventId } });
  }
}
