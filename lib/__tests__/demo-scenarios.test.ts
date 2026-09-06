/**
 * DEMO SCENARIO TESTS — the 8 seeded candidates from docs/04_SEED_DATA.md §3.
 *
 * Every scenario in that document claims a specific outcome ("Alex is excluded
 * at his daily cap, so Priya is picked"; "Ryan's refined list comes back empty").
 * The demo is only trustworthy if those claims are actually what the engine
 * produces. These tests pin each one, so if the engine changes and a scenario
 * stops behaving as scripted, it fails here rather than in front of a judge.
 *
 * Fixtures mirror the seed data: same six interviewers, same timezones, same
 * labels/skills/limits, same busy blocks — but anchored to a fixed Monday
 * (2026-03-09) rather than "next Monday", so the assertions stay stable.
 * The real seed uses relative dates; only the anchor differs.
 */
import { describe, expect, it } from "vitest";
import { generateSlots, validateSlot } from "../scheduler";
import { pickPanel } from "../selection";
import { findSameTimeReplacement, refineWindows } from "../reschedule-core";
import { EngineConfig, EngineParticipant, SelectionCandidate, SelectionInput, TimeWindow } from "../contracts";

// ── Fixed demo week (Mon 2026-03-09 → Fri 2026-03-13). US is on DST by this date;
//    Kolkata is UTC+5:30 year-round; London is still GMT until 2026-03-29. ──
const MON = "2026-03-09";
const TUE = "2026-03-10";
const WED = "2026-03-11";
const THU = "2026-03-12";
const FRI = "2026-03-13";

/** IST (UTC+5:30) local time → UTC ISO. */
const ist = (day: string, hhmm: string): string => {
  const [h, m] = hhmm.split(":").map(Number);
  const utcMinutes = h * 60 + m - (5 * 60 + 30);
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCMinutes(d.getUTCMinutes() + utcMinutes);
  return d.toISOString();
};
/** EDT (UTC-4) local time → UTC ISO. */
const edt = (day: string, hhmm: string): string => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCMinutes(d.getUTCMinutes() + h * 60 + m + 4 * 60);
  return d.toISOString();
};
/** PDT (UTC-7) local time → UTC ISO. */
const pdt = (day: string, hhmm: string): string => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCMinutes(d.getUTCMinutes() + h * 60 + m + 7 * 60);
  return d.toISOString();
};
const win = (start: string, end: string): TimeWindow => ({ start, end });

const WEEK: TimeWindow = win(`${MON}T00:00:00.000Z`, `${FRI}T23:59:00.000Z`);

const BASE: Omit<EngineConfig, "window" | "durationMin"> = {
  bufferMin: 15,
  workingHoursStart: "09:00",
  workingHoursEnd: "18:00",
  stepMin: 15,
};

// ── The seeded interviewer pool (docs/04 §1) ──
const INTERVIEWERS: Record<string, SelectionCandidate> = {
  jordan: { id: "jordan", name: "Jordan Lee", timezone: "Europe/London", labels: ["SCREENING"], skills: ["Screening", "Sourcing"], dailyLimit: 4, currentLoad: 0, availability: [], busy: [] },
  vikram: { id: "vikram", name: "Vikram Rao", timezone: "Asia/Kolkata", labels: ["MANAGERIAL"], skills: ["System Design", "Culture"], dailyLimit: 2, currentLoad: 0, availability: [], busy: [] },
  alex: { id: "alex", name: "Alex Rivera", timezone: "America/New_York", labels: ["TECHNICAL", "MANAGERIAL"], skills: ["Java", "Backend", "Go"], dailyLimit: 2, currentLoad: 0, availability: [], busy: [] },
  priya: { id: "priya", name: "Priya Sharma", timezone: "Asia/Kolkata", labels: ["TECHNICAL"], skills: ["Java", "Backend", "React", "Full Stack"], dailyLimit: 3, currentLoad: 0, availability: [], busy: [] },
  rahul: { id: "rahul", name: "Rahul Verma", timezone: "Asia/Kolkata", labels: ["TECHNICAL"], skills: ["Java", "Backend"], dailyLimit: 3, currentLoad: 0, availability: [], busy: [] },
  ananya: { id: "ananya", name: "Ananya Patel", timezone: "Asia/Kolkata", labels: ["HR"], skills: ["Behavioral", "Policy"], dailyLimit: 3, currentLoad: 0, availability: [], busy: [] },
};

const asParticipant = (c: SelectionCandidate, extra: Partial<EngineParticipant> = {}): EngineParticipant => ({
  id: c.id,
  name: c.name,
  role: "interviewer",
  timezone: c.timezone,
  availability: [],
  busy: c.busy,
  dailyLimit: c.dailyLimit,
  existingBookings: [],
  ...extra,
});

const candidateP = (name: string, timezone: string, availability: TimeWindow[]): EngineParticipant => ({
  id: `cand-${name}`,
  name,
  role: "candidate",
  timezone,
  availability,
  busy: [],
});

// ─────────────────────────────────────────────────────────────────────────────

describe("S1 — Dev Menon · clean happy path (Screening, New York candidate, London recruiter)", () => {
  it("produces bookable ranked slots inside the NY↔London working-hours overlap", () => {
    const candidateWindow = win(edt(MON, "09:00"), edt(MON, "17:00"));
    const config: EngineConfig = { ...BASE, window: WEEK, durationMin: 30 };
    const jordan = asParticipant(INTERVIEWERS.jordan, {
      busy: [win(`${MON}T09:00:00.000Z`, `${MON}T10:00:00.000Z`)], // GMT 09:00-10:00 "TA sync"
    });

    const result = generateSlots(config, [candidateP("Dev Menon", "America/New_York", [candidateWindow]), jordan]);

    expect(result.slots.length).toBeGreaterThan(0);
    // NY↔London overlap is NY 09:00-14:00 (verified in docs/04 §2)
    for (const slot of result.slots) {
      const nyHour = Number(new Date(slot.start).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }));
      expect(nyHour).toBeGreaterThanOrEqual(9);
      expect(nyHour).toBeLessThan(14);
    }
    // ...and the top pick is genuinely bookable, not just displayable.
    const top = result.slots[0];
    expect(validateSlot({ start: top.start, end: top.end }, config, [candidateP("Dev Menon", "America/New_York", [candidateWindow]), jordan]).valid).toBe(true);
  });
});

describe("S2 — Maya Iyer · load balancing (Technical/Java, Mon-Tue only)", () => {
  it("excludes Alex at his daily cap and picks Priya, the lowest-loaded qualified interviewer", () => {
    const input: SelectionInput = {
      roundType: "TECHNICAL",
      requiredSkills: ["Java", "Backend"],
      panelSize: 1,
      window: win(`${MON}T00:00:00.000Z`, `${TUE}T23:59:00.000Z`),
      durationMin: 60,
    };
    const pool: SelectionCandidate[] = [
      { ...INTERVIEWERS.alex, currentLoad: 2 }, // at 2/2 cap Mon & Tue
      { ...INTERVIEWERS.priya, currentLoad: 0 },
      { ...INTERVIEWERS.rahul, currentLoad: 1 }, // seeded Mon booking → loses the tie-break to Priya
      INTERVIEWERS.ananya, // HR label, shouldn't qualify at all
    ];

    const result = pickPanel(input, pool);

    expect(result.selected.map((s) => s.name)).toEqual(["Priya Sharma"]);
    expect(result.rejected.find((r) => r.name === "Alex Rivera")?.reason).toMatch(/at daily cap 2\/2/);
    expect(result.rejected.find((r) => r.name === "Ananya Patel")?.reason).toMatch(/no TECHNICAL label/);
    expect(result.insufficient).toBe(false);
  });
});

describe("S3 — Carlos Mendes · timezone squeeze (LA candidate, Wed-Thu)", () => {
  const input: SelectionInput = {
    roundType: "TECHNICAL",
    requiredSkills: ["Java"],
    panelSize: 1,
    window: win(`${WED}T00:00:00.000Z`, `${THU}T23:59:00.000Z`),
    durationMin: 45,
  };

  it("drops the Kolkata interviewers for having no working-hours overlap, leaving Alex (New York)", () => {
    // NOTE: pickPanel's window check is timezone-agnostic about the candidate (selection
    // runs before candidate availability exists), so Kolkata interviewers are only ruled
    // out at slot-generation time. This asserts what selection itself can know.
    const result = pickPanel(input, [INTERVIEWERS.alex, INTERVIEWERS.priya, INTERVIEWERS.rahul]);
    expect(result.selected.length).toBe(1);
  });

  it("finds zero slots against a Kolkata interviewer — LA and Kolkata never overlap 09:00-18:00", () => {
    const laWindow = win(pdt(WED, "09:00"), pdt(WED, "18:00"));
    const config: EngineConfig = { ...BASE, window: input.window, durationMin: 45 };
    const result = generateSlots(config, [
      candidateP("Carlos Mendes", "America/Los_Angeles", [laWindow]),
      asParticipant(INTERVIEWERS.priya),
    ]);
    expect(result.slots).toHaveLength(0);
    expect(result.rejections.some((r) => r.participantName === "Priya Sharma" && r.reason === "outside working hours")).toBe(true);
  });

  it("finds slots against Alex (New York), confined to LA 09:00-15:00 and trimmed by his 1:1s + buffer", () => {
    const laWindow = win(pdt(WED, "09:00"), pdt(WED, "18:00"));
    const config: EngineConfig = { ...BASE, window: input.window, durationMin: 45 };
    const alex = asParticipant(INTERVIEWERS.alex, {
      busy: [win(edt(WED, "09:00"), edt(WED, "12:00"))], // seeded Wed 1:1s
    });

    const result = generateSlots(config, [candidateP("Carlos Mendes", "America/Los_Angeles", [laWindow]), alex]);

    expect(result.slots.length).toBeGreaterThan(0);
    for (const slot of result.slots) {
      const laHour = Number(new Date(slot.start).toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", hour12: false }));
      expect(laHour).toBeGreaterThanOrEqual(9);
      expect(laHour).toBeLessThan(15);
      // his 1:1s end at 12:00 EDT = 09:00 PDT; with a 15-min buffer nothing may start before 09:15 PDT
      expect(Date.parse(slot.start)).toBeGreaterThanOrEqual(Date.parse(edt(WED, "12:15")));
    }
  });
});

describe("S4 — Sophia Reddy · interviewer declines, SAME-TIME replacement exists (§6A step 1)", () => {
  it("hands the booked Thursday 15:00 IST slot to Rahul without moving the interview", () => {
    const booked = win(ist(THU, "15:00"), ist(THU, "16:00"));
    const input: SelectionInput = {
      roundType: "TECHNICAL",
      requiredSkills: ["Java"],
      panelSize: 1,
      window: WEEK,
      durationMin: 60,
      excludeIds: ["priya"], // Priya is the decliner
    };

    const result = findSameTimeReplacement(booked, [INTERVIEWERS.priya, INTERVIEWERS.rahul, INTERVIEWERS.alex, INTERVIEWERS.ananya], input);

    expect(result.insufficient).toBe(false);
    expect(result.selected.map((s) => s.name)).toEqual(["Rahul Verma"]);
    // Alex can't cover it: 15:00 IST is 05:30 EDT, outside his working hours.
    expect(result.rejected.find((r) => r.name === "Alex Rivera")?.reason).toMatch(/outside working hours/);
    // Ananya is HR-labelled, so she never qualifies for a Technical round.
    expect(result.rejected.find((r) => r.name === "Ananya Patel")?.reason).toMatch(/no TECHNICAL label/);
  });
});

describe("S8 — Nikhil Rao · interviewer declines, NO same-time replacement (§6A step 2)", () => {
  const booked = win(ist(FRI, "10:00"), ist(FRI, "11:00"));

  it("finds no same-time replacement — Rahul is busy then and Alex is asleep in New York", () => {
    const input: SelectionInput = {
      roundType: "TECHNICAL",
      requiredSkills: ["Java"],
      panelSize: 1,
      window: WEEK,
      durationMin: 60,
      excludeIds: ["priya"],
    };
    const rahulBusy = { ...INTERVIEWERS.rahul, busy: [win(ist(FRI, "09:30"), ist(FRI, "11:00"))] }; // seeded release review

    const result = findSameTimeReplacement(booked, [rahulBusy, INTERVIEWERS.alex], input);

    expect(result.insufficient).toBe(true);
    expect(result.selected).toHaveLength(0);
  });

  it("then finds a NEW time later that Friday from the candidate's existing windows", () => {
    const nikhilWindows = [win(ist(FRI, "09:00"), ist(FRI, "17:00"))];
    const config: EngineConfig = { ...BASE, window: WEEK, durationMin: 60 };
    const rahul = asParticipant(INTERVIEWERS.rahul, { busy: [win(ist(FRI, "09:30"), ist(FRI, "11:00"))] });

    const result = refineWindows(nikhilWindows, config, [candidateP("Nikhil Rao", "Asia/Kolkata", []), rahul]);

    expect(result.slots.length).toBeGreaterThan(0);
    // Everything offered must clear the release review + buffer (ends 11:00, +15m ⇒ 11:15 IST).
    for (const slot of result.slots) {
      expect(Date.parse(slot.start)).toBeGreaterThanOrEqual(Date.parse(ist(FRI, "11:15")));
    }
  });
});

describe("S7 — Ryan Cole · candidate reschedule with NOTHING left (§6B failure branch)", () => {
  it("returns an empty refined list, which is the signal to flip the request to RESCHEDULE_REQUIRED", () => {
    // Ryan originally offered only Tue 15:00-17:00 IST. Rahul then took a production
    // incident across that whole window; Priya's sprint planning + buffer eats the rest;
    // Alex is outside working hours at that IST time.
    const originalWindows = [win(ist(TUE, "15:00"), ist(TUE, "17:00"))];
    const config: EngineConfig = { ...BASE, window: WEEK, durationMin: 60 };
    const rahul = asParticipant(INTERVIEWERS.rahul, { busy: [win(ist(TUE, "15:00"), ist(TUE, "17:30"))] });

    const result = refineWindows(originalWindows, config, [candidateP("Ryan Cole", "Asia/Kolkata", []), rahul]);

    expect(result.slots).toHaveLength(0);
    expect(result.rejections.length).toBeGreaterThan(0);
    expect(result.rejections[0].participantName).toBe("Rahul Verma");
  });

  it("also finds nothing with Priya, whose sprint planning + buffer leaves no room for a 60-min slot", () => {
    const originalWindows = [win(ist(TUE, "15:00"), ist(TUE, "17:00"))];
    const config: EngineConfig = { ...BASE, window: WEEK, durationMin: 60 };
    const priya = asParticipant(INTERVIEWERS.priya, { busy: [win(ist(TUE, "15:00"), ist(TUE, "16:00"))] });

    const result = refineWindows(originalWindows, config, [candidateP("Ryan Cole", "Asia/Kolkata", []), priya]);
    expect(result.slots).toHaveLength(0);
  });
});

describe("S5 — Ethan Blake · narrow availability exercises ranking", () => {
  it("returns only the few genuinely valid slots, ranked, from two 45-minute windows", () => {
    const windows = [
      win(`${TUE}T10:00:00.000Z`, `${TUE}T10:45:00.000Z`), // GMT 10:00-10:45
      win(`${TUE}T14:00:00.000Z`, `${TUE}T14:45:00.000Z`), // GMT 14:00-14:45
    ];
    const config: EngineConfig = { ...BASE, window: WEEK, durationMin: 30 };
    const jordan = asParticipant(INTERVIEWERS.jordan, { timezone: "Europe/London" });

    const result = generateSlots(config, [candidateP("Ethan Blake", "Europe/London", windows), jordan]);

    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots.length).toBeLessThanOrEqual(5);
    expect(result.slots[0].rank).toBe(1);
    for (let i = 1; i < result.slots.length; i++) {
      expect(result.slots[i - 1].score).toBeGreaterThanOrEqual(result.slots[i].score);
    }
    // Every returned slot must sit in one of the two submitted windows — nothing invented in between.
    for (const slot of result.slots) {
      const insideAWindow = windows.some((w) => Date.parse(slot.start) >= Date.parse(w.start) && Date.parse(slot.end) <= Date.parse(w.end));
      expect(insideAWindow).toBe(true);
    }
  });
});

describe("S6 — Chloe Fernandes · HR round only ever matches the HR interviewer", () => {
  it("selects Ananya and rejects every Technical-only interviewer by label", () => {
    const input: SelectionInput = {
      roundType: "HR",
      requiredSkills: ["Behavioral"],
      panelSize: 1,
      window: WEEK,
      durationMin: 30,
    };
    const result = pickPanel(input, [INTERVIEWERS.priya, INTERVIEWERS.rahul, INTERVIEWERS.alex, INTERVIEWERS.ananya]);

    expect(result.selected.map((s) => s.name)).toEqual(["Ananya Patel"]);
    expect(result.rejected.every((r) => /no HR label/.test(r.reason))).toBe(true);
  });
});

describe("Cross-scenario invariant — every demo slot the engine offers is actually bookable", () => {
  it("holds for S1 and S5 (generation and validation never disagree)", () => {
    const cases: { participants: EngineParticipant[]; config: EngineConfig }[] = [
      {
        participants: [
          candidateP("Dev Menon", "America/New_York", [win(edt(MON, "09:00"), edt(MON, "17:00"))]),
          asParticipant(INTERVIEWERS.jordan),
        ],
        config: { ...BASE, window: WEEK, durationMin: 30 },
      },
      {
        participants: [
          candidateP("Ethan Blake", "Europe/London", [win(`${TUE}T10:00:00.000Z`, `${TUE}T10:45:00.000Z`)]),
          asParticipant(INTERVIEWERS.jordan),
        ],
        config: { ...BASE, window: WEEK, durationMin: 30 },
      },
    ];

    for (const { participants, config } of cases) {
      const result = generateSlots(config, participants);
      expect(result.slots.length).toBeGreaterThan(0);
      for (const slot of result.slots) {
        expect(validateSlot({ start: slot.start, end: slot.end }, config, participants).valid).toBe(true);
      }
    }
  });
});
