"use client";

/**
 * Role C — one pipeline row (docs/09 §3, docs/03 page 2).
 * Candidate + job/round, status pill, right-aligned actions, and — the part
 * that must be impossible to miss — the amber blockedReason line.
 *
 * The whole row is a click target for "View"; the buttons sit above it.
 */

import Link from "next/link";
import { Button, StatusPill, cx } from "@/components/ui";
import { ROUND_LABEL, avatarTone, fmtInstant, initials } from "@/components/staff/format";
import type { RequestListItemDTO } from "@/lib/contracts";

const ROUND_TONE: Record<string, string> = {
  SCREENING: "bg-sky-50 text-sky-700 ring-sky-200",
  TECHNICAL: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  MANAGERIAL: "bg-violet-50 text-violet-700 ring-violet-200",
  HR: "bg-teal-50 text-teal-700 ring-teal-200",
};

export function RequestRow({ row, viewerTz }: { row: RequestListItemDTO; viewerTz: string }) {
  const secondaryAction =
    row.status === "READY_TO_SCHEDULE"
      ? { label: "Schedule now", href: `/requests/${row.id}#slots` }
      : row.status === "RESCHEDULE_REQUIRED"
        ? { label: "Send new options", href: `/requests/${row.id}#slots` }
        : row.status === "AWAITING_AVAILABILITY"
          ? { label: "Availability", href: `/requests/${row.id}#availability` }
          : null;

  const tone = avatarTone(row.candidate.name);

  return (
    <li className="group relative px-4 py-4 transition duration-150 hover:bg-indigo-50/30 sm:px-5">
      {/* Full-row click target — sits under the buttons, above nothing else. */}
      <Link
        href={`/requests/${row.id}`}
        className="absolute inset-0 z-0"
        aria-label={`Open ${row.candidate.name}'s interview request`}
      />

      <div className="pointer-events-none relative z-10 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <span
          className={cx(
            "hidden h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold ring-1 lg:grid",
            tone
          )}
          aria-hidden
        >
          {initials(row.candidate.name)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[15px] font-semibold text-zinc-900 transition group-hover:text-indigo-700">
              {row.candidate.name}
            </span>
            <span className="truncate text-xs text-zinc-400">{row.candidate.email}</span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="truncate text-[13px] font-medium text-zinc-700">{row.jobTitle}</span>
            <span
              className={cx(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                ROUND_TONE[row.roundType] ?? "bg-zinc-100 text-zinc-600 ring-zinc-200"
              )}
            >
              {ROUND_LABEL[row.roundType]}
            </span>
            <span className="text-[12px] text-zinc-400">{row.durationMin} min</span>
          </div>

          {row.booking && row.booking.status === "CONFIRMED" && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              {fmtInstant(row.booking.startUtc, viewerTz)} · your time
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 lg:justify-end">
          <StatusPill status={row.status} />
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <Link href={`/requests/${row.id}`}>
            <Button variant="secondary" size="sm">
              View
            </Button>
          </Link>
          {secondaryAction && (
            <Link href={secondaryAction.href}>
              <Button variant="primary" size="sm">
                {secondaryAction.label}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {row.blockedReason && (
        <p className="pointer-events-none relative z-10 mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200 lg:ml-14">
          <span aria-hidden>⚠</span>
          <span>{row.blockedReason}</span>
        </p>
      )}
    </li>
  );
}
