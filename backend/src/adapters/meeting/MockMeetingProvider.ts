import { v4 as uuid } from "uuid";
import { MeetingProvider } from "./MeetingProvider";

export class MockMeetingProvider implements MeetingProvider {
  async generateStandaloneLink(topic: string) {
    const id = uuid().slice(0, 8);
    return { joinUrl: `https://meet.google.com/mock-${id}?sandbox=true`, externalMeetingId: `mock-meet-${id}` };
  }
}

export const meetingProvider: MeetingProvider = new MockMeetingProvider();
