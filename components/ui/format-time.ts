import { DateTime } from "luxon";
import type { TimeWindow } from "@/lib/contracts";
/** Display conversion only. Scheduling validity remains the backend's responsibility. */
export function formatSlotTime(slot: TimeWindow, timezone: string) {
  const start = DateTime.fromISO(slot.start, { zone: "utc" }).setZone(timezone).setLocale("en");
  const end = DateTime.fromISO(slot.end, { zone: "utc" }).setZone(timezone).setLocale("en");
  if (!start.isValid || !end.isValid || end <= start) return null;
  return {
    date: start.toFormat("cccc, d LLLL"),
    time: `${start.toFormat("h:mm a")}–${end.toFormat(start.hasSame(end, "day") ? "h:mm a" : "ccc d LLL, h:mm a")}`,
    timezone,
    day: start.toISODate()!,
  };
}
