"use client";

/**
 * Role C — the eligibility panel (docs/09 §4), the visible proof of #18 + #20.
 *
 * It renders `SelectionResult` verbatim. The engine wrote those reason strings
 * to be read by a human — do not reformat them here.
 */

import { Card, Skeleton } from "@/components/ui";
import type { SelectionResult } from "@/lib/contracts";

export function EligibilityPanel({
  result,
  loading,
  error,
  panelSize,
}: {
  result: SelectionResult | null;
  loading: boolean;
  error: string | null;
  panelSize: number;
}) {
  return (
    <Card
      title="Eligible interviewers"
      subtitle="Label → skills → daily cap → load, in that order"
      className="lg:sticky lg:top-20"
    >
      {loading && !result ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      ) : !result ? (
        <p className="text-sm text-zinc-500">Pick a round type to see who qualifies.</p>
      ) : (
        <div className={loading ? "space-y-4 opacity-60 transition" : "space-y-4 transition"}>
          {result.insufficient && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900">
              Only {result.selected.length} of {panelSize} panelists can be filled with these criteria.
            </p>
          )}

          <ul className="space-y-2">
            {result.selected.map((p) => (
              <li key={p.id} className="flex items-start gap-2.5 rounded-md bg-emerald-50/70 px-3 py-2">
                <span className="mt-0.5 text-emerald-600" aria-hidden>
                  ✅
                </span>
                <span className="min-w-0 text-sm">
                  <span className="font-semibold text-zinc-900">{p.name}</span>
                  <span className="text-zinc-600"> — </span>
                  <em className="not-italic text-zinc-600">{p.reason}</em>
                </span>
              </li>
            ))}

            {result.selected.length === 0 && (
              <li className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                Nobody qualifies for this round yet — loosen the required skills or change the round type.
              </li>
            )}

            {result.rejected.map((p) => (
              <li key={p.id} className="flex items-start gap-2.5 px-3 py-1.5">
                <span className="mt-0.5 text-zinc-400" aria-hidden>
                  ✖︎
                </span>
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-zinc-700">{p.name}</span>
                  <span className="text-zinc-500"> — </span>
                  <em className="not-italic text-zinc-500">{p.reason}</em>
                </span>
              </li>
            ))}
          </ul>

          <p className="border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            Fairness never overrides qualification: workload only decides between people who already
            passed the label and skill filters.
          </p>
        </div>
      )}
    </Card>
  );
}
