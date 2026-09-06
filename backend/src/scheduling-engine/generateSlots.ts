import { TimeWindow } from "./types";

/**
 * Step 1 of the pipeline: enumerate every candidate time window of the requested duration
 * across the date range, at a fixed step granularity. This is intentionally naive/exhaustive —
 * correctness comes from the filtering stages, not from being clever here.
 */
export function generateCandidateSlots(
  dateRange: TimeWindow,
  durationMinutes: number,
  stepMinutes = 15
): TimeWindow[] {
  const slots: TimeWindow[] = [];
  const durationMs = durationMinutes * 60_000;
  const stepMs = stepMinutes * 60_000;

  for (
    let cursor = dateRange.start.getTime();
    cursor + durationMs <= dateRange.end.getTime();
    cursor += stepMs
  ) {
    slots.push({ start: new Date(cursor), end: new Date(cursor + durationMs) });
  }

  return slots;
}
