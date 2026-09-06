"use client";

/**
 * Role C — /interviewer (docs/09 §6), role-aware.
 *
 *   INTERVIEWER → "My interviews": their assignments in their timezone, with
 *                 Accept · Decline · Request reschedule, plus their calendar.
 *   ADMIN       → "Scheduled interviews": every booked interview across the
 *                 org. Admins don't sit on panels, so they have no assignments
 *                 of their own to show here.
 *
 * After a decline, the RescheduleOutcome banner shows what the system did —
 * that's logic doc §6A made visible.
 */

import * as React from "react";
import Link from "next/link";
import { Button, Card, Dialog, EmptyState, ErrorState, Input, Skeleton, StatusPill, cx } from "@/components/ui";
import { CalendarPanel } from "@/components/staff/CalendarPanel";
import { RescheduleOutcomeBanner } from "@/components/staff/RescheduleOutcomeBanner";
import { ToastHost, useToasts } from "@/components/staff/ToastHost";
import { useAsync } from "@/components/staff/useAsync";
import { useStaffSession } from "@/components/staff/session";
import {
  ROUND_LABEL,
  avatarTone,
  fmtDay,
  fmtTimeRange,
  initials,
  zoneCity,
} from "@/components/staff/format";
import { ApiError, getMyAssignments, getScheduledInterviews, respondToAssignment } from "@/lib/api-client";
import type { AssignmentDTO, RequestListItemDTO, RescheduleOutcome } from "@/lib/contracts";

export default function InterviewerPage() {
  const me = useStaffSession();
  return me.role === "ADMIN" ? <ScheduledInterviews /> : <MyInterviews />;
}

/* ===========================================================================
 *  ADMIN — every scheduled interview
 * ======================================================================== */

function ScheduledInterviews() {
  const me = useStaffSession();
  const { data, loading, error, reload } = useAsync<RequestListItemDTO[]>(() => getScheduledInterviews(), []);
  const rows = data ?? [];

  const byDay = React.useMemo(() => {
    const map = new Map<string, RequestListItemDTO[]>();
    rows.forEach((r) => {
      if (!r.booking) return;
      const key = fmtDay(r.booking.startUtc, me.timezone);
      map.set(key, [...(map.get(key) ?? []), r]);
    });
    return [...map.entries()];
  }, [rows, me.timezone]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600">Admin</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Scheduled interviews</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {loading
            ? "Loading the schedule…"
            : `${rows.length} confirmed interview${rows.length === 1 ? "" : "s"} · all times in ${zoneCity(me.timezone)}`}
        </p>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🗓"
          title="Nothing is booked yet"
          body="Interviews appear here the moment a slot is confirmed."
          action={
            <Link href="/dashboard">
              <Button variant="primary">Go to the pipeline</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {byDay.map(([day, list]) => (
            <section key={day}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-400">{day}</p>
              <ul className="space-y-3">
                {list.map((r) => (
                  <li key={r.id}>
                    <Card className="relative overflow-hidden">
                      <span className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden />
                      <div className="flex flex-wrap items-start justify-between gap-4 pl-1">
                        <div className="flex min-w-0 gap-3">
                          <span
                            className={cx(
                              "hidden h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold ring-1 sm:grid",
                              avatarTone(r.candidate.name)
                            )}
                            aria-hidden
                          >
                            {initials(r.candidate.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <p className="text-[15px] font-semibold text-zinc-900">{r.candidate.name}</p>
                              <StatusPill status={r.status} />
                            </div>
                            <p className="mt-1 text-[13px] text-zinc-600">
                              {r.jobTitle} · {ROUND_LABEL[r.roundType]} · {r.durationMin} min
                            </p>
                            {r.booking && (
                              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-900">
                                <span aria-hidden>🗓</span>
                                {fmtTimeRange(r.booking.startUtc, r.booking.endUtc, me.timezone)}
                                <span className="font-normal text-zinc-400">
                                  · candidate in {zoneCity(r.candidate.timezone)}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {r.booking?.meetLink && (
                            <a
                              href={r.booking.meetLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-[13px] font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700"
                            >
                              <span aria-hidden>▶</span> Join
                            </a>
                          )}
                          <Link href={`/requests/${r.id}`}>
                            <Button variant="secondary" size="sm">
                              Manage
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
 *  INTERVIEWER — my assignments + my calendar
 * ======================================================================== */

type PendingAction = { assignment: AssignmentDTO; action: "DECLINE" | "RESCHEDULE" } | null;

/** A one-glance colour for the row: accepted, waiting on me, or settled. */
const STATUS_STRIPE: Record<string, string> = {
  PENDING: "bg-amber-400",
  ACCEPTED: "bg-emerald-500",
  DECLINED: "bg-rose-400",
  REPLACED: "bg-zinc-300",
};

function MyInterviews() {
  const me = useStaffSession();
  const { toasts, push, dismiss } = useToasts();
  const { data, loading, error, reload } = useAsync<AssignmentDTO[]>(() => getMyAssignments(), []);

  const [pending, setPending] = React.useState<PendingAction>(null);
  const [reason, setReason] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [outcomes, setOutcomes] = React.useState<Record<string, RescheduleOutcome>>({});
  /** Every response changes what's booked, so the calendar has to re-read. */
  const [calendarKey, setCalendarKey] = React.useState(0);

  const rows = data ?? [];

  async function accept(a: AssignmentDTO) {
    setBusyId(a.assignmentId);
    try {
      await respondToAssignment(a.assignmentId, "ACCEPT");
      push(`Accepted — ${a.candidateName}'s interview is confirmed on your calendar.`, "success");
      reload();
      setCalendarKey((k) => k + 1);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Could not record your response.", "danger");
    } finally {
      setBusyId(null);
    }
  }

  async function submitDecline() {
    if (!pending) return;
    const a = pending.assignment;
    setBusyId(a.assignmentId);
    try {
      const outcome = await respondToAssignment(a.assignmentId, "DECLINE", reason.trim() || undefined);
      setOutcomes((o) => ({ ...o, [a.assignmentId]: outcome }));
      setPending(null);
      setReason("");
      reload();
      setCalendarKey((k) => k + 1);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Could not record your response.", "danger");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600">Interviewer console</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">My interviews</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {loading
            ? "Loading your assignments…"
            : `${rows.length} assignment${rows.length === 1 ? "" : "s"} · all times in ${zoneCity(me.timezone)}`}
        </p>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="Nothing on your plate"
          body="When an admin puts you on a panel, it will show up here."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => {
            const outcome = outcomes[a.assignmentId];
            const busy = busyId === a.assignmentId;
            const settled = a.status === "DECLINED" || a.status === "REPLACED";

            return (
              <li key={a.assignmentId}>
                <Card className="relative overflow-hidden">
                  <span
                    className={cx("absolute inset-y-0 left-0 w-1", STATUS_STRIPE[a.status] ?? "bg-zinc-200")}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-start justify-between gap-4 pl-1">
                    <div className="flex min-w-0 gap-3">
                      <span
                        className={cx(
                          "hidden h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold ring-1 sm:grid",
                          avatarTone(a.candidateName)
                        )}
                        aria-hidden
                      >
                        {initials(a.candidateName)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <p className="text-[15px] font-semibold text-zinc-900">{a.candidateName}</p>
                          <StatusPill status={a.status} />
                        </div>
                        <p className="mt-1 text-[13px] text-zinc-600">
                          {a.jobTitle} · {ROUND_LABEL[a.roundType]}
                        </p>
                        <p className="mt-1.5 text-[13px]">
                          {a.startUtc && a.endUtc ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-zinc-900">
                              <span aria-hidden>🗓</span>
                              {fmtDay(a.startUtc, a.viewerTimezone)} ·{" "}
                              {fmtTimeRange(a.startUtc, a.endUtc, a.viewerTimezone)}
                            </span>
                          ) : (
                            <span className="text-zinc-500">
                              Not booked yet — waiting on the candidate&apos;s availability
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!settled && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            loading={busy}
                            disabled={a.status === "ACCEPTED" || busy}
                            onClick={() => accept(a)}
                          >
                            {a.status === "ACCEPTED" ? "Accepted" : "Accept"}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy}
                            onClick={() => setPending({ assignment: a, action: "DECLINE" })}
                          >
                            Decline
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy}
                            onClick={() => setPending({ assignment: a, action: "RESCHEDULE" })}
                          >
                            Request reschedule
                          </Button>
                        </>
                      )}
                      <Link href={`/requests/${a.requestId}`}>
                        <Button variant="ghost" size="sm">
                          Details
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {outcome && (
                    <div className="mt-4">
                      <RescheduleOutcomeBanner
                        outcome={outcome}
                        viewerTz={a.viewerTimezone}
                        onDismiss={() =>
                          setOutcomes((o) => {
                            const next = { ...o };
                            delete next[a.assignmentId];
                            return next;
                          })
                        }
                      />
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* The calendar SIRA schedules around — feature 5 made visible. */}
      <CalendarPanel timezone={me.timezone} refreshKey={calendarKey} />

      <Dialog
        open={!!pending}
        title={pending?.action === "RESCHEDULE" ? "Request a different time?" : "Decline this interview?"}
        description={
          pending?.action === "RESCHEDULE"
            ? "SIRA will look for another time inside the availability the candidate already gave."
            : "SIRA will first try to find someone who can cover the same slot, so the candidate's plans don't move."
        }
        onClose={() => {
          setPending(null);
          setReason("");
        }}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setPending(null);
                setReason("");
              }}
              disabled={!!busyId}
            >
              Never mind
            </Button>
            <Button variant="primary" loading={!!busyId} onClick={submitDecline}>
              {pending?.action === "RESCHEDULE" ? "Request reschedule" : "Decline"}
            </Button>
          </>
        }
      >
        <Input
          placeholder="Reason (optional — the candidate never sees this)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reason"
        />
      </Dialog>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
