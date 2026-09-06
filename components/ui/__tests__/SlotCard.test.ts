import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SlotCard } from "../SlotCard";
import { formatSlotTime } from "../format-time";
import type { GeneratedSlot } from "../../../lib/contracts";

const slot: GeneratedSlot = {
  start: "2026-09-14T14:00:00Z",
  end: "2026-09-14T14:30:00Z",
  rank: 1,
  score: 73,
  interviewerIds: ["u_priya"],
  interviewerNames: ["Priya Sharma"],
  reasons: ["interviewer-private-id has load 2/3"],
};

describe("SlotCard privacy and timezone display", () => {
  it("keeps scoring and internal reasons out of the candidate card by default", () => {
    const html = renderToStaticMarkup(createElement(SlotCard, { slot, timezone: "Asia/Kolkata" }));
    expect(html).toContain("7:30 PM–8:00 PM");
    expect(html).toContain("Asia/Kolkata");
    expect(html).toContain("Recommended");
    expect(html).not.toContain("interviewer-private-id");
    expect(html).not.toContain("Score");
    expect(html).not.toContain("Rank");
  });

  it("allows staff to explicitly opt into the explanation", () => {
    const html = renderToStaticMarkup(createElement(SlotCard, { slot, timezone: "UTC", audience: "staff" }));
    expect(html).toContain("interviewer-private-id");
    expect(html).toContain("Score");
  });

  it("converts the same instant independently of the server timezone", () => {
    expect(formatSlotTime(slot, "America/New_York")?.time).toBe("10:00 AM–10:30 AM");
    expect(formatSlotTime(slot, "Europe/London")?.time).toBe("3:00 PM–3:30 PM");
  });

  it("uses daylight saving rules rather than fixed offsets", () => {
    expect(formatSlotTime({ start: "2026-01-14T14:00:00Z", end: "2026-01-14T14:30:00Z" }, "America/New_York")?.time).toBe("9:00 AM–9:30 AM");
  });

  it("includes the end date when a display zone crosses midnight", () => {
    expect(formatSlotTime({ start: "2026-09-14T18:00:00Z", end: "2026-09-14T19:00:00Z" }, "Asia/Kolkata")?.time).toContain("Tue 15 Sep");
  });

  it("returns a recoverable display state for invalid time or timezone data", () => {
    expect(formatSlotTime(slot, "invalid-zone")).toBeNull();
    expect(formatSlotTime({ start: "invalid", end: slot.end }, "UTC")).toBeNull();
  });
});
