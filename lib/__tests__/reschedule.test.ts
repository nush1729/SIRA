import { describe, expect, it } from "vitest";
import { findSameTimeReplacement, refineWindows } from "../reschedule-core";
import { EngineConfig, EngineParticipant, SelectionCandidate, SelectionInput, TimeWindow } from "../contracts";

const bookedSlot: TimeWindow = { start: "2026-03-12T09:30:00.000Z", end: "2026-03-12T10:30:00.000Z" }; // IST Thu 15:00-16:00

function selectionPool(overrides: Partial<SelectionCandidate>[]): SelectionCandidate[] {
  const base: SelectionCandidate = {
    id: "id",
    name: "name",
    timezone: "Asia/Kolkata",
    labels: ["TECHNICAL"],
    skills: ["Java"],
    dailyLimit: 3,
    currentLoad: 0,
    availability: [],
    busy: [],
  };
  return overrides.map((o, i) => ({ ...base, id: `p${i}`, ...o }));
}

const baseInput: SelectionInput = {
  roundType: "TECHNICAL",
  requiredSkills: ["Java"],
  panelSize: 1,
  window: { start: "2026-03-09T00:00:00.000Z", end: "2026-03-13T00:00:00.000Z" },
  durationMin: 60,
};

describe("findSameTimeReplacement — §6A step 1", () => {
  it("finds a qualified interviewer who is free at the exact booked time", () => {
    const pool = selectionPool([{ name: "Rahul Verma", busy: [] }]);
    const result = findSameTimeReplacement(bookedSlot, pool, baseInput);
    expect(result.insufficient).toBe(false);
    expect(result.selected[0].name).toBe("Rahul Verma");
  });

  it("rejects a candidate who has a conflict at that time, including the buffer", () => {
    const pool = selectionPool([
      { name: "Rahul Verma", busy: [{ start: "2026-03-12T10:00:00.000Z", end: "2026-03-12T11:00:00.000Z" }] }, // overlaps booked+buffer
    ]);
    const result = findSameTimeReplacement(bookedSlot, pool, baseInput);
    expect(result.insufficient).toBe(true);
    expect(result.rejected[0].reason).toMatch(/conflicts with existing event/);
  });

  it("never proposes the decliner themselves when excluded", () => {
    const pool = selectionPool([
      { id: "decliner", name: "Priya Sharma", busy: [] },
      { id: "backup", name: "Rahul Verma", busy: [] },
    ]);
    const result = findSameTimeReplacement(bookedSlot, pool, { ...baseInput, excludeIds: ["decliner"] });
    expect(result.selected[0].name).toBe("Rahul Verma");
  });

  it("is insufficient when nobody qualified is free at that exact time", () => {
    const pool = selectionPool([{ name: "Ananya Patel", labels: ["HR"] }]);
    const result = findSameTimeReplacement(bookedSlot, pool, baseInput);
    expect(result.insufficient).toBe(true);
    expect(result.selected).toHaveLength(0);
  });
});

describe("refineWindows — §6B, reuses generateSlots against pinned candidate windows", () => {
  const config: EngineConfig = {
    bufferMin: 15,
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
    stepMin: 15,
    window: { start: "2026-03-09T00:00:00.000Z", end: "2026-03-13T00:00:00.000Z" },
    durationMin: 30,
  };

  function participants(interviewerBusy: TimeWindow[] = []): EngineParticipant[] {
    return [
      { id: "cand-1", name: "Ryan Cole", role: "candidate", timezone: "Asia/Kolkata", availability: [], busy: [] },
      { id: "int-1", name: "Rahul Verma", role: "interviewer", timezone: "Asia/Kolkata", availability: [], busy: interviewerBusy },
    ];
  }

  const originalWindows: TimeWindow[] = [{ start: "2026-03-10T04:00:00.000Z", end: "2026-03-10T08:00:00.000Z" }]; // IST Tue 09:30-13:30

  it("ignores whatever is on the candidate participant and uses the passed-in windows instead", () => {
    const result = refineWindows(originalWindows, config, participants());
    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      expect(Date.parse(slot.start)).toBeGreaterThanOrEqual(Date.parse(originalWindows[0].start));
      expect(Date.parse(slot.end)).toBeLessThanOrEqual(Date.parse(originalWindows[0].end));
    }
  });

  it("returns an empty list — the failure branch that flips a request to RESCHEDULE_REQUIRED — when nothing in those windows still works", () => {
    const fullyBlocked: TimeWindow = { start: "2026-03-10T03:00:00.000Z", end: "2026-03-10T09:00:00.000Z" }; // covers the whole original window incl. buffer
    const result = refineWindows(originalWindows, config, participants([fullyBlocked]));
    expect(result.slots).toHaveLength(0);
    expect(result.rejections.length).toBeGreaterThan(0);
  });
});
