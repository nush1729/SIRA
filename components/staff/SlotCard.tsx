"use client";

/**
 * Role C — a ranked recommended slot (docs/09 §5).
 * Shows the time in the candidate's zone AND the viewer's (feature 16), the
 * rank, and the engine's `reasons[]` as a checklist. Rendered, never computed.
 */

import { Button, cx } from "@/components/staff/kit";
import { fmtDay, fmtTimeRange } from "@/components/staff/format";
import type { GeneratedSlot } from "@/lib/contracts";

export function SlotCard({
  slot,
  candidateTz,
  viewerTz,
  candidateName,
  onBook,
  booking,
  disabled,
  canBook,
}: {
  slot: GeneratedSlot;
  candidateTz: string;
  viewerTz: string;
  candidateName: string;
  onBook: () => void;
  booking: boolean;
  disabled: boolean;
  /** Only admins book. Interviewers still see the slot and its reasons. */
  canBook: boolean;
}) {
  const sameZone = candidateTz === viewerTz;
  const top = slot.rank === 1;

  return (
    <li
      className={cx(
        "relative overflow-hidden rounded-xl p-4 pl-5 ring-1 transition duration-150",
        "hover:-translate-y-0.5 hover:shadow-md",
        top
          ? "bg-indigo-50/50 shadow-sm ring-indigo-200"
          : "bg-white ring-zinc-200/80 hover:ring-zinc-300"
      )}
    >
      <span
        className={cx("absolute inset-y-0 left-0 w-1", top ? "bg-indigo-500" : "bg-zinc-200")}
        aria-hidden
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold text-zinc-900">
              {fmtDay(slot.start, candidateTz)} · {fmtTimeRange(slot.start, slot.end, candidateTz)}
            </p>
            {top && (
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Recommended
              </span>
            )}
          </div>

          {slot.interviewerNames.length > 0 && (
            <p className="mt-1 text-[13px] font-medium text-zinc-700">
              with {slot.interviewerNames.join(" & ")}
            </p>
          )}

          <p className="mt-0.5 text-[13px] text-zinc-500">
            {sameZone ? (
              <>Same zone as {candidateName.split(" ")[0]} — {fmtTimeRange(slot.start, slot.end, viewerTz)}</>
            ) : (
              <>
                {fmtDay(slot.start, viewerTz)} · {fmtTimeRange(slot.start, slot.end, viewerTz)} your time
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={cx(
              "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              top ? "bg-white text-indigo-700 ring-1 ring-indigo-200" : "bg-zinc-100 text-zinc-500"
            )}
          >
            rank #{slot.rank}
          </span>
        </div>
      </div>

      {slot.reasons.length > 0 && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {slot.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[13px] text-zinc-600">
              <span className="mt-px text-emerald-600" aria-hidden>
                ✓
              </span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {canBook && (
        <div className="mt-4">
          <Button variant={top ? "primary" : "secondary"} loading={booking} disabled={disabled} onClick={onBook}>
            Book this slot
          </Button>
        </div>
      )}
    </li>
  );
}
