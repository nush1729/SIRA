import { DateTime } from "luxon";
import type {
  BookingDTO,
  GenerateSlotsResult,
  PublicRequestDTO,
  TimeWindow,
} from "@/lib/contracts";

/**
 * Compute the next Monday 00:00 UTC so demo slots are always in the present/future.
 */
function getNextMonday(): DateTime {
  const now = DateTime.utc();
  const daysUntilMonday = (8 - now.weekday) % 7 || 7;
  return now.plus({ days: daysUntilMonday }).startOf("day");
}

export function createDemoFixtures() {
  const mon = getNextMonday();
  const tue = mon.plus({ days: 1 });
  const wed = mon.plus({ days: 2 });
  const thu = mon.plus({ days: 3 });

  const devSlots: GenerateSlotsResult = {
    slots: [
      {
        start: mon.set({ hour: 14, minute: 0 }).toISO()!, // 10:00 AM EDT
        end: mon.set({ hour: 14, minute: 30 }).toISO()!,
        rank: 1,
        score: 92,
        reasons: [
          "Fits candidate preferred window",
          "Interviewer available",
          "Within working hours in America/New_York and Europe/London",
          "15-min buffer respected",
        ],
      },
      {
        start: mon.set({ hour: 15, minute: 30 }).toISO()!, // 11:30 AM EDT
        end: mon.set({ hour: 16, minute: 0 }).toISO()!,
        rank: 2,
        score: 84,
        reasons: [
          "Fits candidate availability",
          "Interviewer available",
          "Within working hours",
          "15-min buffer respected",
        ],
      },
      {
        start: tue.set({ hour: 14, minute: 30 }).toISO()!, // 10:30 AM EDT
        end: tue.set({ hour: 15, minute: 0 }).toISO()!,
        rank: 3,
        score: 78,
        reasons: [
          "Fits candidate availability",
          "Interviewer available",
          "Within working hours",
        ],
      },
      {
        start: wed.set({ hour: 15, minute: 0 }).toISO()!, // 11:00 AM EDT
        end: wed.set({ hour: 15, minute: 30 }).toISO()!,
        rank: 4,
        score: 72,
        reasons: [
          "Fits candidate availability",
          "Interviewer available",
        ],
      },
      {
        start: thu.set({ hour: 16, minute: 0 }).toISO()!, // 12:00 PM EDT
        end: thu.set({ hour: 16, minute: 30 }).toISO()!,
        rank: 5,
        score: 65,
        reasons: [
          "Fits candidate availability",
          "Interviewer available",
        ],
      },
    ],
    rejections: [],
  };

  const fewSlots: GenerateSlotsResult = {
    slots: [
      {
        start: mon.set({ hour: 10, minute: 0 }).toISO()!, // 11:00 AM BST
        end: mon.set({ hour: 10, minute: 30 }).toISO()!,
        rank: 1,
        score: 88,
        reasons: [
          "Fits candidate availability",
          "Interviewer available",
          "15-min buffer respected",
        ],
      },
      {
        start: mon.set({ hour: 11, minute: 30 }).toISO()!, // 12:30 PM BST
        end: mon.set({ hour: 12, minute: 0 }).toISO()!,
        rank: 2,
        score: 75,
        reasons: [
          "Fits candidate availability",
          "Interviewer available",
        ],
      },
    ],
    rejections: [
      {
        participantId: "jordan",
        participantName: "Jordan Lee",
        reason: "outside candidate specified windows",
        count: 6,
      },
    ],
  };

  const ryanRescheduleSlots: GenerateSlotsResult = {
    slots: [],
    rejections: [
      {
        participantId: "rahul",
        participantName: "Rahul Verma",
        reason: "conflicts with existing event (incl. 15-min buffer)",
        count: 5,
      },
      {
        participantId: "priya",
        participantName: "Priya Sharma",
        reason: "unavailable in candidate earlier windows",
        count: 3,
      },
    ],
  };

  const byToken: Record<string, PublicRequestDTO> = {
    "demo-dev": {
      candidateName: "Dev Menon",
      candidateTimezone: "America/New_York",
      jobTitle: "Senior Frontend Engineer",
      roundType: "SCREENING",
      durationMin: 30,
      status: "AWAITING_AVAILABILITY",
      recruiterName: "Jordan Lee",
      booking: null,
    },
    "demo-few": {
      candidateName: "Ethan Blake",
      candidateTimezone: "Europe/London",
      jobTitle: "Senior Infrastructure Engineer",
      roundType: "SCREENING",
      durationMin: 30,
      status: "READY_TO_SCHEDULE",
      recruiterName: "Jordan Lee",
      booking: null,
    },
    "demo-ryan": {
      candidateName: "Ryan Cole",
      candidateTimezone: "Asia/Kolkata",
      jobTitle: "Data Engineer",
      roundType: "TECHNICAL",
      durationMin: 60,
      status: "SCHEDULED",
      recruiterName: "Jordan Lee",
      booking: {
        startUtc: tue.set({ hour: 10, minute: 30 }).toISO()!, // 16:00 IST
        endUtc: tue.set({ hour: 11, minute: 30 }).toISO()!,   // 17:00 IST
        meetLink: "https://meet.google.com/mock-s7-ryan",
        interviewerNames: ["Rahul Verma"],
      },
    },
  };

  return {
    byToken,
    slotsByToken: {
      "demo-dev": devSlots,
      "demo-few": fewSlots,
      "demo-ryan": ryanRescheduleSlots,
    } as Record<string, GenerateSlotsResult>,
    rescheduleSlotsByToken: {
      "demo-dev": devSlots,
      "demo-few": fewSlots,
      "demo-ryan": ryanRescheduleSlots,
    } as Record<string, GenerateSlotsResult>,
    default: byToken["demo-dev"],
  };
}

export type CandidateFixtures = ReturnType<typeof createDemoFixtures>;
export const candidateFixtures = createDemoFixtures();

// In-memory state for mock sessions to simulate real interactions:
interface MockSessionState {
  availabilitySubmitted: Record<string, TimeWindow[]>;
  booked: Record<string, BookingDTO>;
  conflictTriggered: Record<string, boolean>;
}

const mockState: MockSessionState = {
  availabilitySubmitted: {},
  booked: {},
  conflictTriggered: {},
};

export function getMockState() {
  return mockState;
}

export function resetMockState() {
  mockState.availabilitySubmitted = {};
  mockState.booked = {};
  mockState.conflictTriggered = {};
}
