"use client";

/**
 * Role C — what a "no times available" screen shows instead of nothing
 * (docs/09 §5). The engine already aggregated these, so an empty slot list
 * costs the user an explanation, not a blank area.
 */

import type { RejectionReason } from "@/lib/contracts";

export function RejectionsPanel({ rejections }: { rejections: RejectionReason[] }) {
  return (
    <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-base shadow-sm ring-1 ring-amber-200" aria-hidden>
          ⚠
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-900">No times work right now</p>
          <p className="mt-0.5 text-[13px] text-amber-800">
            Here is exactly what blocked each candidate slot — nothing was silently dropped.
          </p>
        </div>
      </div>

      {rejections.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {rejections.map((r) => (
            <li
              key={`${r.participantId}-${r.reason}`}
              className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-white px-3 py-2 text-[13px] shadow-sm ring-1 ring-amber-100"
            >
              <span className="font-semibold text-amber-900">{r.participantName}</span>
              <span className="text-amber-800">— {r.reason}</span>
              {r.count > 0 && (
                <span className="ml-auto whitespace-nowrap font-medium tabular-nums text-amber-700">
                  · {r.count} slot{r.count === 1 ? "" : "s"}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-md bg-white/70 px-3 py-2 text-[13px] text-amber-800">
          The candidate hasn&apos;t submitted any availability yet, so there is nothing to search.
        </p>
      )}
    </div>
  );
}
