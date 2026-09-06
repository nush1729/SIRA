import { describe, expect, it } from "vitest";
import { generateSlots, rankSlots, validateSlot } from "../scheduler";
import { EngineConfig, EngineParticipant, TimeWindow } from "../contracts";

const BASE_CONFIG: Omit<EngineConfig, "window" | "durationMin"> = {
  bufferMin: 15,
  workingHoursStart: "09:00",
  workingHoursEnd: "18:00",
  stepMin: 15,
};

function candidate(overrides: Partial<EngineParticipant> = {}): EngineParticipant {
  return {
    id: "cand-1",
    name: "Maya Iyer",
    role: "candidate",
    timezone: "Asia/Kolkata",
    availability: [],
    busy: [],
    ...overrides,
  };
}

function interviewer(overrides: Partial<EngineParticipant> = {}): EngineParticipant {
  return {
    id: "int-1",
    name: "Priya Sharma",
    role: "interviewer",
    timezone: "Asia/Kolkata",
    availability: [],
    busy: [],
    ...overrides,
  };
}

describe("generateSlots — full overlap, no busy", () => {
  it("finds and ranks slots, earliest scoring highest in a single window", () => {
    const window: TimeWindow = { start: "2026-03-09T04:30:00.000Z", end: "2026-03-09T08:30:00.000Z" }; // IST 10:00-14:00
    const config: EngineConfig = { ...BASE_CONFIG, window, durationMin: 30 };
    const result = generateSlots(config, [candidate({ availability: [window] }), interviewer()]);

    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots[0].rank).toBe(1);
    expect(result.slots[0].start).toBe(window.start); // earliest-in-range scores highest here
    expect(result.rejections).toHaveLength(0);
  });
});

describe("generateSlots — zero overlap", () => {
  it("returns no slots and names the blocking interviewer when a zone is entirely incompatible", () => {
    const window: TimeWindow = { start: "2026-03-09T04:30:00.000Z", end: "2026-03-09T08:30:00.000Z" }; // IST 10:00-14:00
    const config: EngineConfig = { ...BASE_CONFIG, window, durationMin: 30 };
    // Kiritimati is UTC+14 — this whole IST-daytime window lands at 18:30-22:30 local, outside 09:00-18:00.
    const farInterviewer = interviewer({ id: "int-far", name: "Remote Interviewer", timezone: "Pacific/Kiritimati" });

    const result = generateSlots(config, [candidate({ availability: [window] }), farInterviewer]);

    expect(result.slots).toHaveLength(0);
    expect(result.rejections.length).toBeGreaterThan(0);
    const blocker = result.rejections.find((r) => r.participantId === "int-far");
    expect(blocker?.reason).toBe("outside working hours");
    expect(blocker!.count).toBeGreaterThan(0);
  });
});

describe("generateSlots/validateSlot — busy block + buffer", () => {
  const window: TimeWindow = { start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T08:00:00.000Z" }; // IST 09:30-13:30
  const busy: TimeWindow = { start: "2026-03-09T05:30:00.000Z", end: "2026-03-09T06:00:00.000Z" }; // IST 11:00-11:30
  const config: EngineConfig = { ...BASE_CONFIG, window, durationMin: 30 };
  const participants = [candidate({ availability: [window] }), interviewer({ busy: [busy] })];

  // Note: generateSlots ranks and returns only the top 5 slots by design (docs §5),
  // so these per-slot boundary checks go through validateSlot directly — the same
  // function B calls to re-check one exact slot — rather than searching the
  // (possibly truncated) ranked list for a specific timestamp.

  it("keeps a slot clearly before the busy block", () => {
    const check = validateSlot({ start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T04:30:00.000Z" }, config, participants);
    expect(check.valid).toBe(true);
  });

  it("keeps a slot clearly after the busy block", () => {
    const check = validateSlot({ start: "2026-03-09T06:30:00.000Z", end: "2026-03-09T07:00:00.000Z" }, config, participants);
    expect(check.valid).toBe(true);
  });

  it("rejects a slot that only touches the busy block through the buffer margin", () => {
    // 06:00-06:30 sits exactly in the 15-min buffer after the 05:30-06:00 busy block
    const check = validateSlot({ start: "2026-03-09T06:00:00.000Z", end: "2026-03-09T06:30:00.000Z" }, config, participants);
    expect(check.valid).toBe(false);
    expect(check.reasons[0]).toMatch(/conflicts with existing event/);
  });

  it("accepts the slot exactly at the far edge of the buffer margin", () => {
    // 06:15-06:45 is exactly 15 minutes clear of the busy block's end — buffer satisfied, not violated
    const check = validateSlot({ start: "2026-03-09T06:15:00.000Z", end: "2026-03-09T06:45:00.000Z" }, config, participants);
    expect(check.valid).toBe(true);
  });

  it("still finds and ranks a non-empty top-N list across the whole window", () => {
    const result = generateSlots(config, participants);
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots.length).toBeLessThanOrEqual(5);
  });
});

describe("generateSlots — working hours evaluated per participant's own zone", () => {
  it("rejects a window that is fine for the candidate but outside the interviewer's own working hours", () => {
    const window: TimeWindow = { start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T08:00:00.000Z" }; // IST 09:30-13:30
    const config: EngineConfig = { ...BASE_CONFIG, window, durationMin: 30 };
    // Same UTC window is 00:00-04:00 EDT for a New York interviewer — before their 09:00 start.
    const nyInterviewer = interviewer({ id: "int-ny", name: "Alex Rivera", timezone: "America/New_York" });

    const result = generateSlots(config, [candidate({ availability: [window] }), nyInterviewer]);

    expect(result.slots).toHaveLength(0);
    const blocker = result.rejections.find((r) => r.participantId === "int-ny");
    expect(blocker).toBeDefined();
    expect(result.rejections.some((r) => r.participantId === "cand-1")).toBe(false); // candidate's own zone was fine
  });
});

describe("generateSlots — verified cross-timezone facts (Los Angeles / Kolkata / New York)", () => {
  // These dates and offsets were verified numerically before writing the seed data
  // (see docs/04_SEED_DATA.md §2): US is on DST (EDT/PDT) by 2026-03-11.
  const laWindow: TimeWindow = { start: "2026-03-11T16:00:00.000Z", end: "2026-03-12T01:00:00.000Z" }; // LA 09:00-18:00 PDT

  it("LA candidate vs Kolkata interviewer: zero valid slots — the two zones never overlap 09:00-18:00", () => {
    const config: EngineConfig = { ...BASE_CONFIG, window: laWindow, durationMin: 45 };
    const laCandidate = candidate({ timezone: "America/Los_Angeles", availability: [laWindow] });
    const kolkataInterviewer = interviewer({ timezone: "Asia/Kolkata" });

    const result = generateSlots(config, [laCandidate, kolkataInterviewer]);

    expect(result.slots).toHaveLength(0);
    expect(result.rejections.some((r) => r.reason === "outside working hours")).toBe(true);
  });

  it("LA candidate vs New York interviewer: valid slots exist, confined to LA 09:00-15:00", () => {
    const config: EngineConfig = { ...BASE_CONFIG, window: laWindow, durationMin: 30 };
    const laCandidate = candidate({ timezone: "America/Los_Angeles", availability: [laWindow] });
    const nyInterviewer = interviewer({ id: "int-ny", name: "Alex Rivera", timezone: "America/New_York" });

    const result = generateSlots(config, [laCandidate, nyInterviewer]);

    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      const laHour = new Date(slot.start).toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", hour12: false });
      expect(Number(laHour)).toBeGreaterThanOrEqual(9);
      expect(Number(laHour)).toBeLessThan(15);
    }
  });
});

describe("generateSlots — slot crossing local midnight", () => {
  it("is rejected even though it fits the requested duration", () => {
    // IST 23:45 -> 00:15 next day: exactly one candidate window, exactly one possible slot.
    const window: TimeWindow = { start: "2026-03-09T18:15:00.000Z", end: "2026-03-09T18:45:00.000Z" };
    const config: EngineConfig = { ...BASE_CONFIG, window, durationMin: 30 };
    const result = generateSlots(config, [candidate({ availability: [window] }), interviewer()]);
    expect(result.slots).toHaveLength(0);
  });
});

describe("generateSlots — interviewer at daily cap", () => {
  it("excludes every slot on that local day and records a readable reason", () => {
    const window: TimeWindow = { start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T08:00:00.000Z" }; // IST 09:30-13:30, same local day as the existing booking below
    const config: EngineConfig = { ...BASE_CONFIG, window, durationMin: 30 };
    const cappedInterviewer = interviewer({
      dailyLimit: 1,
      existingBookings: [{ start: "2026-03-09T02:00:00.000Z", end: "2026-03-09T02:30:00.000Z" }], // IST 07:30, same local day
    });

    const result = generateSlots(config, [candidate({ availability: [window] }), cappedInterviewer]);

    expect(result.slots).toHaveLength(0);
    const capReason = result.rejections.find((r) => r.reason === "at daily cap");
    expect(capReason).toBeDefined();
    expect(capReason!.count).toBeGreaterThan(0);
  });
});

describe("ranking never promotes an invalid slot", () => {
  it("only ever returns slots that individually pass validateSlot", () => {
    const window: TimeWindow = { start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T08:00:00.000Z" };
    const config: EngineConfig = { ...BASE_CONFIG, window, durationMin: 30 };
    const blockingInterviewer = interviewer({
      id: "int-2",
      name: "Rahul Verma",
      busy: [{ start: "2026-03-09T06:00:00.000Z", end: "2026-03-09T08:00:00.000Z" }], // blocks the back half of the window
    });
    const participants = [candidate({ availability: [window] }), interviewer(), blockingInterviewer];

    const result = generateSlots(config, participants);

    expect(result.slots.length).toBeGreaterThan(0);
    for (let i = 1; i < result.slots.length; i++) {
      expect(result.slots[i].rank).toBe(i + 1);
      expect(result.slots[i - 1].score).toBeGreaterThanOrEqual(result.slots[i].score);
    }
    expect(result.slots.length).toBeLessThanOrEqual(5); // TOP_N cap

    for (const slot of result.slots) {
      const check = validateSlot({ start: slot.start, end: slot.end }, config, participants);
      expect(check.valid).toBe(true);
    }
  });
});

describe("validateSlot", () => {
  it("re-checks a single slot and explains a rejection in plain language", () => {
    const window: TimeWindow = { start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T08:00:00.000Z" };
    const config: EngineConfig = { ...BASE_CONFIG, window, durationMin: 30 };
    // The candidate must have offered this window — validateSlot now enforces that
    // (candidate availability is a hard constraint, docs §4), so the fixture says so explicitly.
    const withAvailability = candidate({ availability: [window] });
    const busyInterviewer = interviewer({ busy: [{ start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T04:30:00.000Z" }] });

    const stillOpen = validateSlot({ start: "2026-03-09T07:00:00.000Z", end: "2026-03-09T07:30:00.000Z" }, config, [withAvailability, busyInterviewer]);
    expect(stillOpen.valid).toBe(true);

    const nowTaken = validateSlot({ start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T04:30:00.000Z" }, config, [withAvailability, busyInterviewer]);
    expect(nowTaken.valid).toBe(false);
    expect(nowTaken.reasons[0]).toMatch(/conflicts with existing event/);
  });
});

describe("generateSlots — guards against caller misuse", () => {
  const window: TimeWindow = { start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T08:00:00.000Z" };

  it("throws when no candidate participant is supplied, rather than silently returning zero slots", () => {
    // A silent empty result here would be indistinguishable from a legitimate
    // "no overlap" and would send B hunting for a scheduling bug that isn't there.
    const config: EngineConfig = { ...BASE_CONFIG, window, durationMin: 30 };
    expect(() => generateSlots(config, [interviewer()])).toThrow(/must include exactly one participant with role 'candidate'/);
  });

  it("throws on a non-positive stepMin instead of looping forever", () => {
    const config: EngineConfig = { ...BASE_CONFIG, window, durationMin: 30, stepMin: 0 };
    expect(() => generateSlots(config, [candidate({ availability: [window] }), interviewer()])).toThrow(/must be positive/);
  });

  it("throws on a non-positive durationMin", () => {
    const config: EngineConfig = { ...BASE_CONFIG, window, durationMin: 0 };
    expect(() => generateSlots(config, [candidate({ availability: [window] }), interviewer()])).toThrow(/must be positive/);
  });

  it("returns a clean empty result (not an error) when the candidate simply hasn't submitted availability yet", () => {
    const config: EngineConfig = { ...BASE_CONFIG, window, durationMin: 30 };
    const result = generateSlots(config, [candidate({ availability: [] }), interviewer()]);
    expect(result.slots).toHaveLength(0);
    expect(result.rejections).toHaveLength(0);
  });
});

describe("generateSlots — overlapping candidate windows", () => {
  it("never emits the same slot twice when submitted windows overlap", () => {
    const w1: TimeWindow = { start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T06:00:00.000Z" };
    const w2: TimeWindow = { start: "2026-03-09T05:00:00.000Z", end: "2026-03-09T07:00:00.000Z" }; // overlaps w1
    const config: EngineConfig = { ...BASE_CONFIG, window: { start: "2026-03-09T00:00:00.000Z", end: "2026-03-10T00:00:00.000Z" }, durationMin: 30 };

    const result = generateSlots(config, [candidate({ availability: [w1, w2] }), interviewer()]);
    const starts = result.slots.map((s) => s.start);
    expect(new Set(starts).size).toBe(starts.length);
  });
});

describe("generateSlots — respects the request's own scheduling window", () => {
  it("clips candidate availability that runs past the recruiter's requested date range", () => {
    const requestWindow: TimeWindow = { start: "2026-03-09T00:00:00.000Z", end: "2026-03-09T05:00:00.000Z" };
    const candidateWindowBeyond: TimeWindow = { start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T08:00:00.000Z" };
    const config: EngineConfig = { ...BASE_CONFIG, window: requestWindow, durationMin: 30 };

    const result = generateSlots(config, [candidate({ availability: [candidateWindowBeyond] }), interviewer()]);

    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      expect(Date.parse(slot.end)).toBeLessThanOrEqual(Date.parse(requestWindow.end));
    }
  });
});

describe("validateSlot — hardening on the booking path (reachable from an unauthenticated token)", () => {
  const submitted: TimeWindow = { start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T06:00:00.000Z" }; // IST 09:30-11:30
  const config: EngineConfig = { ...BASE_CONFIG, window: { start: "2026-03-09T00:00:00.000Z", end: "2026-03-10T00:00:00.000Z" }, durationMin: 30 };
  const participants = [candidate({ availability: [submitted] }), interviewer()];

  it("rejects a slot the candidate never offered, even when nobody is busy then", () => {
    const neverOffered: TimeWindow = { start: "2026-03-09T08:00:00.000Z", end: "2026-03-09T08:30:00.000Z" }; // IST 13:30
    const check = validateSlot(neverOffered, config, participants);
    expect(check.valid).toBe(false);
    expect(check.reasons[0]).toMatch(/did not offer this time/);
  });

  it("rejects a slot whose length doesn't match the interview duration", () => {
    const tooLong: TimeWindow = { start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T07:00:00.000Z" }; // 3h vs 30m
    const check = validateSlot(tooLong, config, participants);
    expect(check.valid).toBe(false);
    expect(check.reasons[0]).toMatch(/requires 30 minutes/);
  });

  it("rejects a slot outside the request's scheduling window", () => {
    const narrowConfig: EngineConfig = { ...config, window: { start: "2026-03-09T00:00:00.000Z", end: "2026-03-09T04:30:00.000Z" } };
    const check = validateSlot({ start: "2026-03-09T05:00:00.000Z", end: "2026-03-09T05:30:00.000Z" }, narrowConfig, participants);
    expect(check.valid).toBe(false);
    expect(check.reasons[0]).toMatch(/outside the scheduling window/);
  });

  it("rejects any booking when the candidate has submitted no availability at all", () => {
    const check = validateSlot({ start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T04:30:00.000Z" }, config, [
      candidate({ availability: [] }),
      interviewer(),
    ]);
    expect(check.valid).toBe(false);
    expect(check.reasons[0]).toMatch(/has not submitted any availability/);
  });

  it("still accepts a legitimate slot that passes all three checks", () => {
    const check = validateSlot({ start: "2026-03-09T04:30:00.000Z", end: "2026-03-09T05:00:00.000Z" }, config, participants);
    expect(check.valid).toBe(true);
  });
});

describe("rankSlots — pure sort/rank behaviour", () => {
  it("assigns sequential ranks in descending score order", () => {
    const ranked = rankSlots([
      { slot: { start: "2026-03-09T04:00:00.000Z", end: "2026-03-09T04:30:00.000Z" }, reasons: [], score: 10 },
      { slot: { start: "2026-03-09T05:00:00.000Z", end: "2026-03-09T05:30:00.000Z" }, reasons: [], score: 40 },
      { slot: { start: "2026-03-09T06:00:00.000Z", end: "2026-03-09T06:30:00.000Z" }, reasons: [], score: 25 },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(ranked.map((r) => r.score)).toEqual([40, 25, 10]);
  });
});
