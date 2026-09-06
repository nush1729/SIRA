"use client";

/**
 * Role C — the three pipeline counters (docs/09 §3):
 * Awaiting availability · Ready to schedule · Needs attention.
 * Clicking a tile filters the list — the counter and the filter agree.
 */

import { cx } from "@/components/ui";
import type { ReqStatus } from "@/lib/contracts";

export type CounterKey = "AWAITING_AVAILABILITY" | "READY_TO_SCHEDULE" | "RESCHEDULE_REQUIRED";

type Tile = {
  key: CounterKey;
  label: string;
  hint: string;
  num: string;
  bar: string;
  icon: React.ReactNode;
  iconWrap: string;
  active: string;
};

const TILES: Tile[] = [
  {
    key: "AWAITING_AVAILABILITY",
    label: "Awaiting availability",
    hint: "Waiting on the candidate",
    num: "text-amber-600",
    bar: "bg-amber-400",
    iconWrap: "bg-amber-50 text-amber-600",
    icon: "⏳",
    active: "ring-2 ring-amber-300 bg-amber-50/40",
  },
  {
    key: "READY_TO_SCHEDULE",
    label: "Ready to schedule",
    hint: "Slots can be booked now",
    num: "text-indigo-600",
    bar: "bg-indigo-500",
    iconWrap: "bg-indigo-50 text-indigo-600",
    icon: "⚡",
    active: "ring-2 ring-indigo-300 bg-indigo-50/40",
  },
  {
    key: "RESCHEDULE_REQUIRED",
    label: "Needs attention",
    hint: "Blocked — no options left",
    num: "text-amber-700",
    bar: "bg-amber-600",
    iconWrap: "bg-amber-100 text-amber-700",
    icon: "⚠",
    active: "ring-2 ring-amber-400 bg-amber-50/60",
  },
];

export function CounterTiles({
  counts,
  activeStatus,
  onSelect,
}: {
  counts: Record<string, number>;
  activeStatus: string;
  onSelect: (status: ReqStatus | "ALL") => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {TILES.map((t) => {
        const active = activeStatus === t.key;
        const n = counts[t.key] ?? 0;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(active ? "ALL" : (t.key as ReqStatus))}
            aria-pressed={active}
            title={active ? "Click again to clear this filter" : `Show only: ${t.label}`}
            className={cx(
              "group relative overflow-hidden rounded-xl bg-white p-4 pl-5 text-left shadow-sm ring-1 ring-zinc-200/80",
              "transition duration-150 hover:-translate-y-0.5 hover:shadow-md",
              active ? t.active : ""
            )}
          >
            <span className={cx("absolute inset-y-0 left-0 w-1", t.bar)} aria-hidden />

            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={cx("text-[28px] font-semibold leading-none tabular-nums", t.num)}>{n}</p>
                <p className="mt-2 text-sm font-medium text-zinc-800">{t.label}</p>
                <p className="text-xs text-zinc-500">{t.hint}</p>
              </div>
              <span
                className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full text-base", t.iconWrap)}
                aria-hidden
              >
                {t.icon}
              </span>
            </div>

            {active && (
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Filtering · click to clear
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
