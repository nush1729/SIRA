import { describe, expect, it } from "vitest";
import { generateCandidateSlots } from "../generateSlots";
import { filterHardConstraints } from "../hardConstraints";
import { Participant, TimeWindow } from "../types";

const CONFIG = { bufferMinutes: 15, workingHoursStart: "09:00", workingHoursEnd: "18:00" };

function utc(dateStr: string): Date {
  return new Date(dateStr);
}

describe("filterHardConstraints", () => {
  it("accepts a slot with full overlap between candidate and interviewer availability", () => {
    const dateRange: TimeWindow = { start: utc("2026-03-10T09:00:00Z"), end: utc("2026-03-10T18:00:00Z") };
    const slots = generateCandidateSlots(dateRange, 60);

    const participants: Participant[] = [
      {
        id: "candidate-1",
        role: "candidate",
        timezone: "UTC",
        isRequired: true,
        availability: [{ start: utc("2026-03-10T10:00:00Z"), end: utc("2026-03-10T12:00:00Z") }],
        busy: [],
      },
      {
        id: "interviewer-1",
        role: "interviewer",
        timezone: "UTC",
        isRequired: true,
        availability: [{ start: utc("2026-03-10T09:00:00Z"), end: utc("2026-03-10T17:00:00Z") }],
        busy: [],
      },
    ];

    const result = filterHardConstraints(slots, participants, CONFIG);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((r) => r.slot.start >= utc("2026-03-10T10:00:00Z"))).toBe(true);
    expect(result.every((r) => r.slot.end <= utc("2026-03-10T12:00:00Z"))).toBe(true);
  });

  it("rejects every slot when there is no overlap at all", () => {
    const dateRange: TimeWindow = { start: utc("2026-03-10T09:00:00Z"), end: utc("2026-03-10T18:00:00Z") };
    const slots = generateCandidateSlots(dateRange, 60);

    const participants: Participant[] = [
      {
        id: "candidate-1",
        role: "candidate",
        timezone: "UTC",
        isRequired: true,
        availability: [{ start: utc("2026-03-10T09:00:00Z"), end: utc("2026-03-10T10:00:00Z") }],
        busy: [],
      },
      {
        id: "interviewer-1",
        role: "interviewer",
        timezone: "UTC",
        isRequired: true,
        availability: [{ start: utc("2026-03-10T16:00:00Z"), end: utc("2026-03-10T18:00:00Z") }],
        busy: [],
      },
    ];

    const result = filterHardConstraints(slots, participants, CONFIG);
    expect(result).toHaveLength(0);
  });

  it("rejects a slot that would fit availability but violates the required buffer against an existing event", () => {
    const dateRange: TimeWindow = { start: utc("2026-03-10T09:00:00Z"), end: utc("2026-03-10T18:00:00Z") };
    const slots = generateCandidateSlots(dateRange, 60);

    const participants: Participant[] = [
      {
        id: "candidate-1",
        role: "candidate",
        timezone: "UTC",
        isRequired: true,
        availability: [{ start: utc("2026-03-10T09:00:00Z"), end: utc("2026-03-10T18:00:00Z") }],
        busy: [],
      },
      {
        id: "interviewer-1",
        role: "interviewer",
        timezone: "UTC",
        isRequired: true,
        availability: [{ start: utc("2026-03-10T09:00:00Z"), end: utc("2026-03-10T18:00:00Z") }],
        // Busy 12:00-13:00 — with a 15min buffer, 11:00-12:00 and 13:00-14:00 slots should be rejected too.
        busy: [{ start: utc("2026-03-10T12:00:00Z"), end: utc("2026-03-10T13:00:00Z") }],
      },
    ];

    const result = filterHardConstraints(slots, participants, CONFIG);
    const overlapsBusyOrBuffer = result.some(
      (r) => r.slot.start < utc("2026-03-10T13:15:00Z") && r.slot.end > utc("2026-03-10T11:45:00Z")
    );
    expect(overlapsBusyOrBuffer).toBe(false);
  });

  it("rejects a slot outside a participant's local working hours even if flagged available", () => {
    // Interviewer in a timezone where 09:00 UTC is before their 09:00 local working-hours start.
    const dateRange: TimeWindow = { start: utc("2026-03-10T00:00:00Z"), end: utc("2026-03-10T23:00:00Z") };
    const slots = generateCandidateSlots(dateRange, 60);

    const participants: Participant[] = [
      {
        id: "candidate-1",
        role: "candidate",
        timezone: "UTC",
        isRequired: true,
        availability: [dateRange],
        busy: [],
      },
      {
        id: "interviewer-1",
        role: "interviewer",
        timezone: "America/Los_Angeles", // UTC-8 in March (pre-DST) — 09:00 UTC is 01:00 local
        isRequired: true,
        availability: [dateRange],
        busy: [],
      },
    ];

    const result = filterHardConstraints(slots, participants, CONFIG);
    // No slot at 09:00 UTC (01:00 PST, outside working hours) should survive.
    const has9amUtcSlot = result.some((r) => r.slot.start.getTime() === utc("2026-03-10T09:00:00Z").getTime());
    expect(has9amUtcSlot).toBe(false);
  });
});
