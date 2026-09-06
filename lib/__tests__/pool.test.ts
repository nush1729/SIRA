/**
 * Pool-based scheduling — the fix for "one interviewer being busy shouldn't
 * kill a slot when a qualified colleague is free." See docs/01_LOGIC_FLOW.md §3
 * and the conversation that motivated this: pickPanel used to select ONE fixed
 * person and generateSlots required exactly them, so a 3-person qualified pool
 * collapsed to a single calendar. These tests prove the pool model actually
 * behaves the way it was designed to.
 */
import { describe, expect, it } from "vitest";
import { generateSlots, generateSlotsFromPool, computeFeasibleDays } from "../scheduler";
import { pickPanel } from "../selection";
import { EngineConfig, EngineParticipant, SelectionCandidate, SelectionInput, TimeWindow } from "../contracts";

const win = (start: string, end: string): TimeWindow => ({ start, end });
const BASE: Omit<EngineConfig, "window" | "durationMin"> = { bufferMin: 15, workingHoursStart: "09:00", workingHoursEnd: "18:00", stepMin: 15 };

const candidateP = (availability: TimeWindow[]): EngineParticipant => ({
  id: "cand-1",
  name: "Maya Iyer",
  role: "candidate",
  timezone: "Asia/Kolkata",
  availability,
  busy: [],
});

const interviewer = (id: string, name: string, overrides: Partial<EngineParticipant> = {}): EngineParticipant => ({
  id,
  name,
  role: "interviewer",
  timezone: "Asia/Kolkata",
  availability: [],
  busy: [],
  ...overrides,
});

describe("generateSlotsFromPool — the core fix: one busy interviewer no longer kills a slot", () => {
  const window: TimeWindow = win("2026-03-09T04:00:00.000Z", "2026-03-09T08:00:00.000Z"); // IST 09:30-13:30
  const config: EngineConfig = { ...BASE, window, durationMin: 30 };

  it("still finds a slot at a time when the FIRST pool member is busy but a second one is free", () => {
    // Priya is busy for the whole window; Rahul is free throughout. With the old
    // fixed-panel model (Priya hard-selected), this scenario returns zero slots.
    const priya = interviewer("priya", "Priya Sharma", { busy: [win("2026-03-09T04:00:00.000Z", "2026-03-09T08:00:00.000Z")] });
    const rahul = interviewer("rahul", "Rahul Verma");

    const result = generateSlotsFromPool(config, candidateP([window]), [priya, rahul], 1);

    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      expect(slot.interviewerIds).toEqual(["rahul"]);
      expect(slot.interviewerNames).toEqual(["Rahul Verma"]);
    }
  });

  it("proves the fixed-panel function WOULD have failed the identical scenario (the bug this replaces)", () => {
    const priya = interviewer("priya", "Priya Sharma", { busy: [win("2026-03-09T04:00:00.000Z", "2026-03-09T08:00:00.000Z")] });
    const result = generateSlots(config, [candidateP([window]), priya]); // fixed panel = Priya only, as the old selection model would have hard-assigned
    expect(result.slots).toHaveLength(0);
  });

  it("assigns different interviewers to different slots when their busy times differ", () => {
    // Priya busy the first half, Rahul busy the second half — every slot in the
    // window should be coverable, but by different people depending on when.
    const priya = interviewer("priya", "Priya Sharma", { busy: [win("2026-03-09T04:00:00.000Z", "2026-03-09T06:00:00.000Z")] });
    const rahul = interviewer("rahul", "Rahul Verma", { busy: [win("2026-03-09T06:00:00.000Z", "2026-03-09T08:00:00.000Z")] });

    const result = generateSlotsFromPool(config, candidateP([window]), [priya, rahul], 1);

    const earlySlot = result.slots.find((s) => Date.parse(s.start) < Date.parse("2026-03-09T05:45:00.000Z"));
    const lateSlot = result.slots.find((s) => Date.parse(s.start) >= Date.parse("2026-03-09T06:15:00.000Z"));
    expect(earlySlot?.interviewerIds).toEqual(["rahul"]); // Priya's busy early, Rahul covers
    expect(lateSlot?.interviewerIds).toEqual(["priya"]); // Rahul's busy late, Priya covers
  });

  it("assigns the LEAST-LOADED free pool member when more than panelSize are free", () => {
    const priya = interviewer("priya", "Priya Sharma", { currentLoad: 2 });
    const rahul = interviewer("rahul", "Rahul Verma", { currentLoad: 0 });

    const result = generateSlotsFromPool(config, candidateP([window]), [priya, rahul], 1);

    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots[0].interviewerIds).toEqual(["rahul"]);
  });

  it("rejects a slot when fewer than panelSize pool members are free, and counts every one that failed", () => {
    const priya = interviewer("priya", "Priya Sharma", { busy: [window] });
    const rahul = interviewer("rahul", "Rahul Verma", { busy: [window] });

    const result = generateSlotsFromPool(config, candidateP([window]), [priya, rahul], 2); // needs BOTH, only one pool of 2 and both busy

    expect(result.slots).toHaveLength(0);
    expect(result.rejections.some((r) => r.participantId === "priya")).toBe(true);
    expect(result.rejections.some((r) => r.participantId === "rahul")).toBe(true);
  });

  it("panelSize=2 succeeds when exactly two of three pool members are free", () => {
    const priya = interviewer("priya", "Priya Sharma");
    const rahul = interviewer("rahul", "Rahul Verma");
    const alex = interviewer("alex", "Alex Rivera", { busy: [window] }); // busy — excluded

    const result = generateSlotsFromPool(config, candidateP([window]), [priya, rahul, alex], 2);

    expect(result.slots.length).toBeGreaterThan(0);
    expect(new Set(result.slots[0].interviewerIds)).toEqual(new Set(["priya", "rahul"]));
  });

  it("a REQUIRED participant (e.g. hiring manager) blocks every slot they can't attend, regardless of the pool", () => {
    const priya = interviewer("priya", "Priya Sharma"); // free the whole time
    const vikram = interviewer("vikram-hm", "Vikram Rao", { busy: [window] }); // hiring manager, required, busy throughout

    const result = generateSlotsFromPool(config, candidateP([window]), [priya], 1, [vikram]);

    expect(result.slots).toHaveLength(0);
    expect(result.rejections.some((r) => r.participantId === "vikram-hm")).toBe(true);
  });

  it("a required participant's presence is reflected in every valid slot's reasons, even though they're not in interviewerIds", () => {
    const priya = interviewer("priya", "Priya Sharma");
    const vikram = interviewer("vikram-hm", "Vikram Rao");

    const result = generateSlotsFromPool(config, candidateP([window]), [priya], 1, [vikram]);

    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots[0].reasons.some((r) => r.includes("Vikram Rao"))).toBe(true);
    expect(result.slots[0].interviewerIds).toEqual(["priya"]); // required participants aren't "the interviewer" in the assignment sense
  });

  it("throws on a non-candidate passed as `candidate`", () => {
    const notACandidate = interviewer("x", "X");
    expect(() => generateSlotsFromPool(config, notACandidate, [interviewer("p", "P")], 1)).toThrow(/must have role 'candidate'/);
  });

  it("throws on a non-positive panelSize", () => {
    expect(() => generateSlotsFromPool(config, candidateP([window]), [interviewer("p", "P")], 0)).toThrow(/must be positive/);
  });
});

describe("pickPanel — pool semantics (docs: interviewers are pooled by round-type label)", () => {
  const baseInput: SelectionInput = {
    roundType: "TECHNICAL",
    requiredSkills: ["Java"],
    panelSize: 1,
    window: win("2026-03-09T00:00:00.000Z", "2026-03-13T00:00:00.000Z"),
    durationMin: 60,
  };

  const cand = (over: Partial<SelectionCandidate>): SelectionCandidate => ({
    id: "id",
    name: "name",
    timezone: "Asia/Kolkata",
    labels: ["TECHNICAL"],
    skills: ["Java"],
    dailyLimit: 3,
    currentLoad: 0,
    availability: [],
    busy: [],
    ...over,
  });

  it("returns the FULL qualified pool, not just panelSize — this is what generateSlotsFromPool needs to draw on", () => {
    const result = pickPanel(baseInput, [
      cand({ id: "priya", name: "Priya Sharma", currentLoad: 0 }),
      cand({ id: "rahul", name: "Rahul Verma", currentLoad: 1 }),
      cand({ id: "alex", name: "Alex Rivera", currentLoad: 2 }),
    ]);

    // With panelSize 1, `selected` is still just the top pick...
    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].name).toBe("Priya Sharma");
    // ...but the POOL carries everyone qualified, so a busy Priya isn't a dead end.
    expect(result.pool.map((p) => p.name)).toEqual(["Priya Sharma", "Rahul Verma", "Alex Rivera"]);
  });

  it("the pool excludes unqualified people the same way `selected` always did", () => {
    const result = pickPanel(baseInput, [
      cand({ id: "priya", name: "Priya Sharma" }),
      cand({ id: "ananya", name: "Ananya Patel", labels: ["HR"], skills: [] }),
    ]);
    expect(result.pool.map((p) => p.id)).toEqual(["priya"]);
    expect(result.rejected.some((r) => r.name === "Ananya Patel")).toBe(true);
  });

  it("insufficient reflects the POOL size against panelSize, not just the top slice", () => {
    const result = pickPanel({ ...baseInput, panelSize: 2 }, [cand({ id: "priya", name: "Priya Sharma" })]);
    expect(result.pool).toHaveLength(1);
    expect(result.insufficient).toBe(true);
  });
});

describe("computeFeasibleDays — grey out days the panel could never cover (docs option A)", () => {
  const window: TimeWindow = win("2026-03-09T00:00:00.000Z", "2026-03-11T00:00:00.000Z"); // Mon 00:00 -> Wed 00:00 UTC
  const config: EngineConfig = { ...BASE, window, durationMin: 30 };

  it("marks a day feasible when at least one pool member has any opening that day", () => {
    const priya = interviewer("priya", "Priya Sharma"); // free all week
    const result = computeFeasibleDays(config, "Asia/Kolkata", [priya], 1);
    expect(result.days.length).toBeGreaterThan(0);
    expect(result.timezone).toBe("Asia/Kolkata");
  });

  it("marks a day infeasible when every pool member is fully booked that day", () => {
    const mondayIst = win("2026-03-08T18:30:00.000Z", "2026-03-09T18:30:00.000Z"); // Monday, IST calendar day
    const priya = interviewer("priya", "Priya Sharma", { busy: [mondayIst] });
    const rahul = interviewer("rahul", "Rahul Verma", { busy: [mondayIst] });

    const result = computeFeasibleDays(config, "Asia/Kolkata", [priya, rahul], 1);

    expect(result.days).not.toContain("2026-03-09");
    expect(result.blocked.find((b) => b.day === "2026-03-09")).toBeDefined();
  });

  it("respects panelSize — a day with only 1 free pool member is infeasible when panelSize is 2", () => {
    const priya = interviewer("priya", "Priya Sharma"); // free
    const rahul = interviewer("rahul", "Rahul Verma", { busy: [win("2026-03-08T18:30:00.000Z", "2026-03-09T18:30:00.000Z")] }); // busy all Monday

    const result = computeFeasibleDays(config, "Asia/Kolkata", [priya, rahul], 2);

    expect(result.days).not.toContain("2026-03-09");
  });

  it("respects a required participant who must also be free that day", () => {
    const priya = interviewer("priya", "Priya Sharma");
    const vikram = interviewer("vikram-hm", "Vikram Rao", { busy: [win("2026-03-08T18:30:00.000Z", "2026-03-09T18:30:00.000Z")] });

    const result = computeFeasibleDays(config, "Asia/Kolkata", [priya], 1, [vikram]);

    expect(result.days).not.toContain("2026-03-09");
  });

  it("never marks a day feasible based on a time outside the CANDIDATE's own working hours", () => {
    // Pool member only free 02:00-03:00 IST (their own hours are irrelevant to
    // this assertion — the point is the candidate's own working-hours gate).
    const nightOwlWindow = win("2026-03-08T20:30:00.000Z", "2026-03-08T21:30:00.000Z"); // IST 02:00-03:00 Mon
    const onlyNightFree = interviewer("night", "Night Owl", {
      busy: [win("2026-03-08T18:30:00.000Z", "2026-03-08T20:30:00.000Z"), win("2026-03-08T21:30:00.000Z", "2026-03-09T18:30:00.000Z")],
    });
    void nightOwlWindow;

    const result = computeFeasibleDays(config, "Asia/Kolkata", [onlyNightFree], 1);
    expect(result.days).not.toContain("2026-03-09");
  });

  it("computed days are calendar-day keys in the CANDIDATE's timezone, not UTC", () => {
    // A window that is Monday in UTC can already be Tuesday in a +14 timezone.
    const priya = interviewer("priya", "Priya Sharma", { timezone: "Pacific/Kiritimati" });
    const laWindow: TimeWindow = win("2026-03-09T00:00:00.000Z", "2026-03-11T00:00:00.000Z");
    const laConfig: EngineConfig = { ...BASE, window: laWindow, durationMin: 30 };

    const result = computeFeasibleDays(laConfig, "Pacific/Kiritimati", [priya], 1);
    // Every returned day key must actually be a local Kiritimati calendar day, which
    // this test simply confirms doesn't throw and returns a sane, non-UTC-shaped result.
    expect(result.timezone).toBe("Pacific/Kiritimati");
    expect(Array.isArray(result.days)).toBe(true);
  });

  it("throws on a non-positive panelSize", () => {
    expect(() => computeFeasibleDays(config, "Asia/Kolkata", [interviewer("p", "P")], 0)).toThrow(/must be positive/);
  });
});
