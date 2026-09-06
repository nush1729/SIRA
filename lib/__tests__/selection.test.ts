import { describe, expect, it } from "vitest";
import { pickPanel } from "../selection";
import { SelectionCandidate, SelectionInput, TimeWindow } from "../contracts";

const WINDOW: TimeWindow = { start: "2026-03-09T00:00:00.000Z", end: "2026-03-13T00:00:00.000Z" }; // Mon-Fri

function pool(overrides: Partial<SelectionCandidate>[] = []): SelectionCandidate[] {
  const base: SelectionCandidate = {
    id: "id",
    name: "name",
    timezone: "Asia/Kolkata",
    labels: [],
    skills: [],
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
  window: WINDOW,
  durationMin: 60,
};

describe("pickPanel — eligibility filters, in order", () => {
  it("excludes an interviewer whose label doesn't match the round", () => {
    const result = pickPanel(baseInput, pool([{ name: "Ananya Patel", labels: ["HR"], skills: ["Java"] }]));
    expect(result.selected).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/no TECHNICAL label/);
  });

  it("excludes an interviewer missing a required skill", () => {
    const result = pickPanel(baseInput, pool([{ name: "Vikram Rao", labels: ["TECHNICAL"], skills: ["System Design"] }]));
    expect(result.selected).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/missing skill\(s\): Java/);
  });

  it("excludes an interviewer already at their daily cap", () => {
    const result = pickPanel(baseInput, pool([{ name: "Alex Rivera", labels: ["TECHNICAL"], skills: ["Java"], dailyLimit: 2, currentLoad: 2 }]));
    expect(result.selected).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/at daily cap 2\/2/);
  });

  it("excludes an interviewer with no working-hours overlap at all in the window", () => {
    // Kiritimati (UTC+14) working hours never line up with this UTC window's evaluation at all steps —
    // more simply: an interviewer whose only declared availability is outside the requested window entirely.
    const result = pickPanel(baseInput, pool([
      {
        name: "Remote",
        labels: ["TECHNICAL"],
        skills: ["Java"],
        availability: [{ start: "2020-01-01T00:00:00.000Z", end: "2020-01-02T00:00:00.000Z" }], // long past, no overlap with WINDOW
      },
    ]));
    expect(result.selected).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/no working-hours overlap/);
  });
});

describe("pickPanel — fairness never overrides qualification", () => {
  it("picks the qualified-but-busier candidate over an unqualified-but-idle one", () => {
    const result = pickPanel(baseInput, pool([
      { name: "Ananya Patel (HR only, idle)", labels: ["HR"], skills: [], currentLoad: 0 },
      { name: "Priya Sharma (qualified, some load)", labels: ["TECHNICAL"], skills: ["Java"], currentLoad: 2 },
    ]));
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].name).toContain("Priya Sharma");
  });

  it("among equally qualified candidates, picks the one with lower current load", () => {
    const result = pickPanel(baseInput, pool([
      { name: "Alex Rivera", labels: ["TECHNICAL"], skills: ["Java"], currentLoad: 2, dailyLimit: 3 },
      { name: "Priya Sharma", labels: ["TECHNICAL"], skills: ["Java"], currentLoad: 0, dailyLimit: 3 },
    ]));
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].name).toBe("Priya Sharma");
    expect(result.rejected).toHaveLength(0); // Alex wasn't rejected, just outranked — not eligible-and-excluded
  });
});

describe("pickPanel — insufficient panel", () => {
  it("flags insufficient when fewer candidates qualify than panelSize requires", () => {
    const result = pickPanel(
      { ...baseInput, panelSize: 2 },
      pool([{ name: "Priya Sharma", labels: ["TECHNICAL"], skills: ["Java"] }])
    );
    expect(result.selected).toHaveLength(1);
    expect(result.insufficient).toBe(true);
  });

  it("is not insufficient when exactly panelSize qualify", () => {
    const result = pickPanel(baseInput, pool([{ name: "Priya Sharma", labels: ["TECHNICAL"], skills: ["Java"] }]));
    expect(result.insufficient).toBe(false);
  });
});

describe("pickPanel — guards against caller misuse", () => {
  it("throws on a non-positive panelSize", () => {
    expect(() => pickPanel({ ...baseInput, panelSize: 0 }, pool([{ labels: ["TECHNICAL"], skills: ["Java"] }]))).toThrow(/must be positive/);
  });

  it("throws on a non-positive durationMin", () => {
    expect(() => pickPanel({ ...baseInput, durationMin: 0 }, pool([{ labels: ["TECHNICAL"], skills: ["Java"] }]))).toThrow(/must be positive/);
  });
});

describe("pickPanel — excludeIds (used when replacing a decliner)", () => {
  it("never considers an excluded id, and it does not appear in rejected either", () => {
    const candidates = pool([
      { id: "decliner", name: "Priya Sharma", labels: ["TECHNICAL"], skills: ["Java"] },
      { id: "backup", name: "Rahul Verma", labels: ["TECHNICAL"], skills: ["Java"], currentLoad: 1 },
    ]);
    const result = pickPanel({ ...baseInput, excludeIds: ["decliner"] }, candidates);
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].name).toBe("Rahul Verma");
    expect(result.rejected.some((r) => r.name === "Priya Sharma")).toBe(false);
  });
});
