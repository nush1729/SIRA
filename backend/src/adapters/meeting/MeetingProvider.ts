export interface MeetingProvider {
  /** Google Meet links are generated as a side effect of CalendarProvider.createEvent's
   * conferenceData — see GoogleCalendarProvider. This interface exists for providers (Zoom,
   * Teams — P3) that generate a link independently of the calendar event. */
  generateStandaloneLink(topic: string): Promise<{ joinUrl: string; externalMeetingId: string }>;
}
