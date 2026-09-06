/**
 * Role C — display formatting only. No scheduling logic lives here (docs/09:
 * "don't compute scheduling logic client-side"); these functions turn UTC ISO
 * strings from the API into strings a human reads, in a named timezone.
 *
 * At integration these can be swapped for A's `formatLocal(utcIso, tz)`.
 */

const cache = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string, opts: Intl.DateTimeFormatOptions, locale = "en-GB"): Intl.DateTimeFormat {
  const key = locale + tz + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts });
    cache.set(key, f);
  }
  return f;
}

/**
 * Intl gives real abbreviations for the Western zones (EDT, BST, PDT) but falls
 * back to "GMT+5:30" for several others. Where a zone has a name people
 * actually say, use it — a candidate reads "IST", not "GMT+5:30".
 * Keyed by zone, then by that day's UTC offset in minutes so DST stays honest.
 */
const ZONE_ABBR: Record<string, Record<number, string>> = {
  "Asia/Kolkata": { 330: "IST" },
  "Asia/Singapore": { 480: "SGT" },
  "Asia/Dubai": { 240: "GST" },
  "Europe/Berlin": { 60: "CET", 120: "CEST" },
  "Australia/Sydney": { 600: "AEST", 660: "AEDT" },
};

function offsetMin(iso: string, tz: string): number {
  const ms = Date.parse(iso);
  const p = Object.fromEntries(
    fmt(tz, {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  );
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) === 24 ? 0 : Number(p.hour),
    Number(p.minute)
  );
  return Math.round((asUtc - ms) / 60_000);
}

/** "IST", "BST", "EDT" — never a bare time with no zone attached. */
export function zoneLabel(iso: string, tz: string): string {
  const known = ZONE_ABBR[tz]?.[offsetMin(iso, tz)];
  if (known) return known;
  const parts = fmt(tz, { timeZoneName: "short" }).formatToParts(new Date(iso));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}

/** "Tue 14 Nov" */
export function fmtDay(iso: string, tz: string): string {
  return fmt(tz, { weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
}

/** "3:00 PM" */
export function fmtTime(iso: string, tz: string): string {
  return fmt(tz, { hour: "numeric", minute: "2-digit", hour12: true }, "en-US").format(new Date(iso));
}

/** "3:00 – 4:00 PM IST" */
export function fmtTimeRange(startIso: string, endIso: string, tz: string): string {
  return `${fmtTime(startIso, tz)} – ${fmtTime(endIso, tz)} ${zoneLabel(startIso, tz)}`;
}

/** "Tue 14 Nov · 3:00 – 4:00 PM IST" */
export function fmtWhen(startIso: string, endIso: string, tz: string): string {
  return `${fmtDay(startIso, tz)} · ${fmtTimeRange(startIso, endIso, tz)}`;
}

/** "Tue 14 Nov, 3:00 PM IST" — single instant. */
export function fmtInstant(iso: string, tz: string): string {
  return `${fmtDay(iso, tz)}, ${fmtTime(iso, tz)} ${zoneLabel(iso, tz)}`;
}

/** Short city label for a zone: "Asia/Kolkata" -> "Kolkata". */
export function zoneCity(tz: string): string {
  const tail = tz.split("/").pop() ?? tz;
  return tail.replace(/_/g, " ");
}

/** "12 min ago", "3 h ago", else an absolute date (future timestamps included). */
export function fmtRelative(iso: string, tz: string): string {
  const diffMin = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (diffMin < 0) return fmtInstant(iso, tz);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)} h ago`;
  return fmtInstant(iso, tz);
}

export const ROUND_LABEL: Record<string, string> = {
  SCREENING: "Screening",
  TECHNICAL: "Technical",
  MANAGERIAL: "Managerial",
  HR: "HR",
};

export const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Berlin",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

/**
 * A stable, quiet colour per person so the same face keeps the same chip across
 * screens. Deliberately low-saturation — this is an identity cue, not decoration.
 */
const AVATAR_TONES = [
  "bg-indigo-50 text-indigo-700 ring-indigo-200",
  "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "bg-amber-50 text-amber-700 ring-amber-200",
  "bg-sky-50 text-sky-700 ring-sky-200",
  "bg-violet-50 text-violet-700 ring-violet-200",
  "bg-teal-50 text-teal-700 ring-teal-200",
  "bg-rose-50 text-rose-700 ring-rose-200",
];

export function avatarTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
