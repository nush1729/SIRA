/**
 * Timezone helpers. Every other module in this engine goes through here for any
 * local-time reasoning — nothing else is allowed to call `new Date()` and assume
 * server-local time. See docs/07_ROLE_A_ENGINE.md and docs/01_LOGIC_FLOW.md §4/§16.
 */
import { DateTime } from "luxon";
import { TimeWindow } from "./contracts";

/** Convert a UTC ISO string into a luxon DateTime in the given IANA zone. */
export function toLocal(utcIso: string, tz: string): DateTime {
  return DateTime.fromISO(utcIso, { zone: "utc" }).setZone(tz);
}

// A handful of common demo zones get a friendly abbreviation ("IST", "PT") since
// IANA doesn't officially assign one for every zone (India Standard Time collides
// with Israel Standard Time, so luxon/ICU won't guess it). Falls back to the
// zone's own short offset name (e.g. "GMT+5:30") for anything not in this list —
// never silently wrong, just less pretty.
const FRIENDLY_ZONE_LABEL: Record<string, string> = {
  "Asia/Kolkata": "IST",
  "America/New_York": "ET",
  "America/Los_Angeles": "PT",
  "America/Chicago": "CT",
  "Europe/London": "GMT/BST",
};

function zoneLabel(dt: DateTime, tz: string): string {
  return FRIENDLY_ZONE_LABEL[tz] ?? dt.offsetNameShort ?? tz;
}

/** "Tue 14 Nov · 3:00 PM IST" — used directly in engine reason strings and the UI. */
export function formatLocal(utcIso: string, tz: string): string {
  const dt = toLocal(utcIso, tz);
  return `${dt.toFormat("ccc d LLL")} · ${dt.toFormat("h:mm a")} ${zoneLabel(dt, tz)}`;
}

/** Just the time + zone, for compact reason strings ("3:00 PM IST"). */
export function formatLocalTime(utcIso: string, tz: string): string {
  const dt = toLocal(utcIso, tz);
  return `${dt.toFormat("h:mm a")} ${zoneLabel(dt, tz)}`;
}

/**
 * True if the whole window falls within [start, end) local time, on one local
 * calendar day. A window that would require crossing local midnight to fit is
 * rejected outright — this is deliberately conservative (docs/01 §4/§16).
 */
export function withinWorkingHours(
  w: TimeWindow,
  tz: string,
  start = "09:00",
  end = "18:00"
): boolean {
  if (!sameLocalDay(w, tz)) return false;

  const localStart = toLocal(w.start, tz);
  const localEnd = toLocal(w.end, tz);

  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);

  const dayWindowStart = localStart.set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
  const dayWindowEnd = localStart.set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });

  return localStart >= dayWindowStart && localEnd <= dayWindowEnd;
}

/** True if the window's start and end fall on the same local calendar day. */
export function sameLocalDay(w: TimeWindow, tz: string): boolean {
  const localStart = toLocal(w.start, tz);
  const localEnd = toLocal(w.end, tz);
  return localStart.hasSame(localEnd, "day");
}

/** Local calendar-day key, e.g. "2026-03-09" — used for daily-cap counting (docs §3). */
export function localDayKey(utcIso: string, tz: string): string {
  return toLocal(utcIso, tz).toFormat("yyyy-LL-dd");
}

/** Minutes since local midnight for the window's start — used by the "comfortable
 * hours" / "edge hours" scoring rules in docs §5. */
export function localMinutesOfDay(utcIso: string, tz: string): number {
  const dt = toLocal(utcIso, tz);
  return dt.hour * 60 + dt.minute;
}

/**
 * The UTC bounds of one local calendar day, e.g. `localDayBoundsUtc("2026-03-09", "Asia/Kolkata")`
 * → { start: 2026-03-08T18:30:00Z, end: 2026-03-09T18:30:00Z }. Used by
 * `computeFeasibleDays` (scheduler.ts) to search day-by-day in the CANDIDATE'S
 * timezone, since "which days work" only means something in one specific zone —
 * a day boundary in UTC would silently be wrong by hours for most candidates.
 */
export function localDayBoundsUtc(localDayKeyStr: string, tz: string): { start: string; end: string } {
  const startOfDay = DateTime.fromISO(localDayKeyStr, { zone: tz }).startOf("day");
  return { start: startOfDay.toUTC().toISO()!, end: startOfDay.plus({ days: 1 }).toUTC().toISO()! };
}

/**
 * The UTC bounds of the WORKING-HOURS sub-window (e.g. 09:00-18:00) of one
 * local calendar day. Used to scan for feasibility only within hours a
 * candidate could plausibly be offered, rather than the full 24-hour day —
 * scanning the whole day would waste the vast majority of steps on instants no
 * candidate would ever accept anyway, and worse, would make "outside working
 * hours" numerically dominate any other rejection reason simply by step count,
 * masking a real blocker like "the whole panel is booked" (see
 * `computeFeasibleDays` in scheduler.ts).
 */
export function localWorkingHoursBoundsUtc(localDayKeyStr: string, tz: string, start: string, end: string): { start: string; end: string } {
  const day = DateTime.fromISO(localDayKeyStr, { zone: tz }).startOf("day");
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return {
    start: day.set({ hour: startHour, minute: startMinute }).toUTC().toISO()!,
    end: day.set({ hour: endHour, minute: endMinute }).toUTC().toISO()!,
  };
}

/**
 * Every local calendar-day key a UTC window touches, in the given timezone.
 * Used to walk a scheduling window one candidate-local day at a time.
 */
export function enumerateLocalDays(window: TimeWindow, tz: string): string[] {
  const startDay = toLocal(window.start, tz).startOf("day");
  const endDay = toLocal(window.end, tz).startOf("day");
  const days: string[] = [];
  for (let cursor = startDay; cursor <= endDay; cursor = cursor.plus({ days: 1 })) {
    days.push(cursor.toFormat("yyyy-LL-dd"));
  }
  return days;
}
