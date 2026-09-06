import { describe, expect, it } from "vitest";
import { formatLocal, localDayKey, sameLocalDay, withinWorkingHours } from "../tz";

describe("withinWorkingHours", () => {
  it("accepts a slot fully inside 09:00-18:00 local", () => {
    // 2026-03-10 10:00-11:00 IST = 04:30-05:30 UTC
    expect(withinWorkingHours({ start: "2026-03-10T04:30:00.000Z", end: "2026-03-10T05:30:00.000Z" }, "Asia/Kolkata")).toBe(true);
  });

  it("rejects a slot starting before 09:00 local", () => {
    // 2026-03-10 08:00 IST = 02:30 UTC
    expect(withinWorkingHours({ start: "2026-03-10T02:30:00.000Z", end: "2026-03-10T03:30:00.000Z" }, "Asia/Kolkata")).toBe(false);
  });

  it("rejects a slot ending after 18:00 local", () => {
    // 2026-03-10 17:30-18:30 IST
    expect(withinWorkingHours({ start: "2026-03-10T12:00:00.000Z", end: "2026-03-10T13:00:00.000Z" }, "Asia/Kolkata")).toBe(false);
  });

  it("evaluates in the participant's OWN zone, not UTC or server zone", () => {
    // 14:30 UTC = 20:00 IST (outside hours) but = 09:30 EST (inside hours) — same instant, different verdicts
    const slot = { start: "2026-03-09T14:30:00.000Z", end: "2026-03-09T15:00:00.000Z" };
    expect(withinWorkingHours(slot, "Asia/Kolkata")).toBe(false);
    expect(withinWorkingHours(slot, "America/New_York")).toBe(true);
  });

  it("rejects a slot that would cross local midnight", () => {
    // IST midnight (00:00 Mar 10) falls at 18:30 UTC Mar 9. This window straddles it:
    // start = 2026-03-09T18:15Z = IST 23:45 (Mar 9); end = 2026-03-09T18:45Z = IST 00:15 (Mar 10).
    const slot = { start: "2026-03-09T18:15:00.000Z", end: "2026-03-09T18:45:00.000Z" };
    expect(sameLocalDay(slot, "Asia/Kolkata")).toBe(false);
    expect(withinWorkingHours(slot, "Asia/Kolkata")).toBe(false);
  });
});

describe("sameLocalDay", () => {
  it("true when start and end share a local calendar day", () => {
    expect(sameLocalDay({ start: "2026-03-10T04:00:00.000Z", end: "2026-03-10T05:00:00.000Z" }, "Asia/Kolkata")).toBe(true);
  });
});

describe("localDayKey", () => {
  it("returns the local calendar date, not the UTC date", () => {
    // 23:00 UTC on Mar 9 = 04:30 IST on Mar 10
    expect(localDayKey("2026-03-09T23:00:00.000Z", "Asia/Kolkata")).toBe("2026-03-10");
    expect(localDayKey("2026-03-09T23:00:00.000Z", "UTC")).toBe("2026-03-09");
  });
});

describe("formatLocal", () => {
  it("includes a zone label, never a bare time", () => {
    const label = formatLocal("2026-03-10T04:30:00.000Z", "Asia/Kolkata");
    expect(label).toContain("IST");
    expect(label).toMatch(/\d{1,2}:\d{2} (AM|PM)/);
  });
});
