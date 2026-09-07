import { DateTime } from "luxon";

/** Minimal RFC 5545 VCALENDAR/VEVENT — enough for every major calendar app to import. */
export function generateIcsContent(
  title: string,
  description: string,
  location: string,
  startUtc: string,
  endUtc: string
): string {
  const formatUtcForIcs = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }).toFormat("yyyyLLdd'T'HHmmss'Z'");

  const dtStart = formatUtcForIcs(startUtc);
  const dtEnd = formatUtcForIcs(endUtc);
  const dtStamp = DateTime.utc().toFormat("yyyyLLdd'T'HHmmss'Z'");
  const uid = `sira-${Date.now()}@sira.local`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SIRA//Smart Interview Scheduling//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** `data:` URL ready to drop straight into an `<a download>` link. */
export function icsDataUrl(
  title: string,
  description: string,
  location: string,
  startUtc: string,
  endUtc: string
): string {
  return `data:text/calendar;charset=utf8,${encodeURIComponent(
    generateIcsContent(title, description, location, startUtc, endUtc)
  )}`;
}
