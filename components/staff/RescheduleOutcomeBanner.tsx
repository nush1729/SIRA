"use client";

/**
 * Role C — one component, three messages (docs/09 §6 / logic doc §6A):
 *   REPLACED_SAME_TIME   green  — someone else took it, the time is unchanged
 *   REBOOKED_NEW_TIME    blue   — a new time was found from the candidate's windows
 *   RESCHEDULE_REQUIRED  amber  — nothing worked, the recruiter has it now
 *
 * The `message` string comes from the API; this only decides the dressing.
 */

import { fmtInstant } from "@/components/staff/format";
import type { RescheduleOutcome } from "@/lib/contracts";

const TONE = {
  REPLACED_SAME_TIME: {
    wrap: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: "✓",
    title: "Covered — the time hasn't changed",
  },
  REBOOKED_NEW_TIME: {
    wrap: "border-indigo-200 bg-indigo-50 text-indigo-900",
    icon: "↻",
    title: "Moved to a new time",
  },
  RESCHEDULE_REQUIRED: {
    wrap: "border-amber-200 bg-amber-50 text-amber-900",
    icon: "⚠",
    title: "Back in the admin's pipeline",
  },
} as const;

export function RescheduleOutcomeBanner({
  outcome,
  viewerTz,
  onDismiss,
}: {
  outcome: RescheduleOutcome;
  viewerTz: string;
  onDismiss?: () => void;
}) {
  const tone = TONE[outcome.outcome];

  return (
    <div className={`animate-fade-in rounded-lg border p-4 ${tone.wrap}`} role="status">
      <div className="flex items-start gap-3">
        <span className="text-base leading-6" aria-hidden>
          {tone.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{tone.title}</p>
          <p className="mt-0.5 text-[13px]">{outcome.message}</p>

          {outcome.newInterviewerName && (
            <p className="mt-1.5 text-[13px] opacity-90">New interviewer: {outcome.newInterviewerName}</p>
          )}
          {outcome.newStartUtc && outcome.newEndUtc && (
            <p className="mt-1.5 text-[13px] opacity-90">
              New time: {fmtInstant(outcome.newStartUtc, viewerTz)} (your time)
            </p>
          )}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
            &times;
          </button>
        )}
      </div>
    </div>
  );
}
