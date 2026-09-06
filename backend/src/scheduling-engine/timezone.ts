import { DateTime } from "luxon";
import { TimeWindow } from "./types";

/**
 * Checks whether a UTC time window falls entirely within the given local working-hours window,
 * on a single local calendar day, in the participant's own timezone. Deliberately conservative:
 * a slot that crosses local midnight is rejected rather than partially validated — this is the
 * kind of ambiguous-timestamp bug the architecture doc (Section 21) explicitly calls out.
 */
export function isWithinWorkingHours(
  window: TimeWindow,
  timezone: string,
  workingHoursStart: string,
  workingHoursEnd: string
): boolean {
  const localStart = DateTime.fromJSDate(window.start, { zone: "utc" }).setZone(timezone);
  const localEnd = DateTime.fromJSDate(window.end, { zone: "utc" }).setZone(timezone);

  if (!localStart.hasSame(localEnd, "day")) {
    return false;
  }

  const [startHour, startMinute] = workingHoursStart.split(":").map(Number);
  const [endHour, endMinute] = workingHoursEnd.split(":").map(Number);

  const dayStart = localStart.set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
  const dayEnd = localStart.set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });

  return localStart >= dayStart && localEnd <= dayEnd;
}

/** Formats a UTC instant in a given timezone for display — e.g. "Tue, Mar 12 · 3:00 PM IST". */
export function formatInTimezone(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).setZone(timezone).toFormat("ccc, LLL d '·' h:mm a ZZZZ");
}
