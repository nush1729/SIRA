export interface BusyPeriod {
  start: Date;
  end: Date;
}

export interface CreateEventInput {
  organizerEmail: string;
  attendeeEmails: string[];
  title: string;
  description: string;
  start: Date;
  end: Date;
}

export interface CreateEventResult {
  externalEventId: string;
  meetingJoinUrl: string | null; // populated when conferenceData/Meet is requested
}

/**
 * The one interface every calendar integration implements — Google today, a Mock for
 * sandbox/demo, and (P3) Outlook/Graph later without touching any calling code.
 * See architecture doc Section 9 / Section 15 trade-off log.
 */
export interface CalendarProvider {
  getBusyPeriods(accountEmail: string, rangeStart: Date, rangeEnd: Date): Promise<BusyPeriod[]>;
  createEvent(input: CreateEventInput): Promise<CreateEventResult>;
  updateEvent(externalEventId: string, input: Partial<CreateEventInput>): Promise<void>;
  cancelEvent(externalEventId: string): Promise<void>;
}
