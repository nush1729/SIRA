"use client";

/**
 * Role C — /requests/[id] (docs/09 §5).
 *
 * Header (both timezones when booked) + four stacked sections:
 * Panel · Candidate availability · Recommended slots · Emails sent.
 * Booking: confirm dialog -> pending -> on 409 SLOT_NO_LONGER_VALID, toast and
 * refetch the slots rather than dead-ending.
 */

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card, Dialog, EmptyState, ErrorState, Input, Skeleton, StatusPill, cx } from "@/components/staff/kit";
import { PanelCard } from "@/components/staff/PanelCard";
import { SlotCard } from "@/components/staff/SlotCard";
import { RejectionsPanel } from "@/components/staff/RejectionsPanel";
import { EmailsTable } from "@/components/staff/EmailsTable";
import { RescheduleOutcomeBanner } from "@/components/staff/RescheduleOutcomeBanner";
import { ToastHost, useToasts } from "@/components/staff/ToastHost";
import { useAsync } from "@/components/staff/useAsync";
import { useStaffSession } from "@/components/staff/session";
import { useIsAdmin } from "@/components/staff/AdminOnly";
import { ROUND_LABEL, avatarTone, fmtDay, fmtTimeRange, initials, zoneCity } from "@/components/staff/format";
import {
  ApiError,
  bookSlot,
  cancelRequest,
  getRequest,
  getSlots,
  rescheduleRequest,
  sendAvailabilityRequest,
} from "@/lib/api-client";
import type { GeneratedSlot, RequestDetailDTO, RescheduleOutcome } from "@/lib/contracts";

export default function RequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const me = useStaffSession();
  // Interviewers may read a request they're on; only admins can act on it.
  const isAdmin = useIsAdmin();
  const { toasts, push, dismiss } = useToasts();

  const { data: detail, loading, error, reload, setData } = useAsync<RequestDetailDTO>(() => getRequest(id), [id]);

  const [slotsNonce, setSlotsNonce] = React.useState(0);
  const {
    data: slotResult,
    loading: slotsLoading,
    error: slotsError,
    reload: reloadSlots,
  } = useAsync(() => getSlots(id), [id, slotsNonce]);

  const [pendingSlot, setPendingSlot] = React.useState<GeneratedSlot | null>(null);
  const [booking, setBooking] = React.useState(false);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [rescheduleOpen, setRescheduleOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [acting, setActing] = React.useState(false);
  const [outcome, setOutcome] = React.useState<RescheduleOutcome | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  if (loading) return <DetailSkeleton />;
  if (error || !detail) return <ErrorState message={error ?? "Request not found."} onRetry={reload} />;

  const candidateTz = detail.candidate.timezone;
  const sameZone = candidateTz === me.timezone;
  const isOpen = detail.status !== "CANCELLED";

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
      push(`${label} copied to clipboard.`, "success");
    } catch {
      push("Could not copy — select the text and copy manually.", "warn");
    }
  }

  async function confirmBooking() {
    if (!pendingSlot || !detail) return;
    setBooking(true);
    try {
      await bookSlot(detail.id, { startUtc: pendingSlot.start, endUtc: pendingSlot.end });
      setPendingSlot(null);
      push("Booked. Calendar invites and emails are on their way.", "success");
      reload();
      setSlotsNonce((n) => n + 1);
    } catch (e) {
      setPendingSlot(null);
      if (e instanceof ApiError && e.code === "SLOT_NO_LONGER_VALID") {
        push(e.message, "warn");
        setSlotsNonce((n) => n + 1); // refetch, don't just fail
      } else {
        push(e instanceof ApiError ? e.message : "Could not book that slot.", "danger");
      }
    } finally {
      setBooking(false);
    }
  }

  async function doCancel() {
    if (!detail) return;
    setActing(true);
    try {
      await cancelRequest(detail.id, reason.trim() || undefined);
      setConfirmCancel(false);
      setReason("");
      push("Interview cancelled. Everyone has been notified.", "success");
      reload();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Could not cancel the interview.", "danger");
    } finally {
      setActing(false);
    }
  }

  async function doReschedule() {
    if (!detail) return;
    setActing(true);
    try {
      const r = await rescheduleRequest(detail.id, reason.trim() || undefined);
      setRescheduleOpen(false);
      setReason("");
      setOutcome(r);
      reload();
      setSlotsNonce((n) => n + 1);
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Could not start a reschedule.", "danger");
    } finally {
      setActing(false);
    }
  }

  async function resendAvailability() {
    if (!detail) return;
    setActing(true);
    try {
      const { candidateLink } = await sendAvailabilityRequest(detail.id);
      push(`Availability request sent — link ${candidateLink}`, "success");
      reload();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Could not send the availability request.", "danger");
    } finally {
      setActing(false);
    }
  }

  const slots = slotResult?.slots ?? [];
  const rejections = slotResult?.rejections ?? [];
  // Someone who declined or was replaced no longer occupies a seat.
  const activePanel = detail.panel.filter((p) => p.status !== "DECLINED" && p.status !== "REPLACED").length;

  return (
    <div className="space-y-6">
      <Link
        href={isAdmin ? "/dashboard" : "/interviewer"}
        className="inline-block text-sm text-zinc-500 hover:text-zinc-800"
      >
        ← Back to {isAdmin ? "pipeline" : "my interviews"}
      </Link>

      {/* -- header ---------------------------------------------------------- */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 gap-4">
            <span
              className={cx(
                "hidden h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-semibold ring-1 sm:grid",
                avatarTone(detail.candidate.name)
              )}
              aria-hidden
            >
              {initials(detail.candidate.name)}
            </span>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{detail.candidate.name}</h1>
                <StatusPill status={detail.status} />
              </div>
              <p className="mt-1 text-sm text-zinc-600">
                {detail.jobTitle} · {ROUND_LABEL[detail.roundType]} · {detail.durationMin} min
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500">
                <span>{detail.candidate.email}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600">
                  🌐 {zoneCity(candidateTz)}
                </span>
                {detail.requiredSkills.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600">
                    {detail.requiredSkills.join(" · ")}
                  </span>
                )}
              </div>
            </div>
          </div>

          {isOpen && isAdmin && (
            <div className="flex flex-wrap gap-2">
              {detail.status === "AWAITING_AVAILABILITY" && (
                <Button variant="secondary" loading={acting} onClick={resendAvailability}>
                  Resend availability request
                </Button>
              )}
              <Button variant="secondary" onClick={() => setRescheduleOpen(true)} disabled={acting}>
                Reschedule
              </Button>
              <Button variant="danger" onClick={() => setConfirmCancel(true)} disabled={acting}>
                Cancel interview
              </Button>
            </div>
          )}
        </div>

        {detail.blockedReason && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
            <span aria-hidden>⚠</span>
            <span>{detail.blockedReason}</span>
          </p>
        )}

        {detail.booking && detail.booking.status === "CONFIRMED" && (
          <div className="mt-5 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-50/40 p-4 ring-1 ring-emerald-200">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Confirmed
            </p>
            <p className="mt-1 text-sm font-semibold text-emerald-900">
              {fmtDay(detail.booking.startUtc, candidateTz)} ·{" "}
              {fmtTimeRange(detail.booking.startUtc, detail.booking.endUtc, candidateTz)}
              <span className="font-normal text-emerald-800"> — {detail.candidate.name.split(" ")[0]}&apos;s time</span>
            </p>
            <p className="mt-0.5 text-[13px] text-emerald-800">
              {sameZone ? (
                <>Same timezone as you ({zoneCity(me.timezone)})</>
              ) : (
                <>
                  {fmtDay(detail.booking.startUtc, me.timezone)} ·{" "}
                  {fmtTimeRange(detail.booking.startUtc, detail.booking.endUtc, me.timezone)} — your time
                </>
              )}
            </p>

            {detail.booking.meetLink && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={detail.booking.meetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-[13px] font-medium text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700"
                >
                  <span aria-hidden>▶</span> Join meeting
                </a>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copy(detail.booking!.meetLink!, "Meet link")}
                >
                  {copied === "Meet link" ? "Copied ✓" : "Copy link"}
                </Button>
              </div>
            )}
          </div>
        )}

        {!isAdmin && isOpen && (
          <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-[13px] text-zinc-600 ring-1 ring-inset ring-zinc-200">
            Scheduling actions are handled by an admin. You can accept, decline or ask for a new time from{" "}
            <Link href="/interviewer" className="font-medium text-indigo-700 hover:underline">
              My interviews
            </Link>
            .
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
          <span className="text-[13px] text-zinc-500">Candidate link</span>
          <code className="truncate rounded bg-zinc-100 px-2 py-1 text-[12px] text-zinc-700">{detail.candidateLink}</code>
          <Button variant="ghost" size="sm" onClick={() => copy(detail.candidateLink, "Candidate link")}>
            {copied === "Candidate link" ? "Copied ✓" : "Copy"}
          </Button>
        </div>
      </Card>

      {outcome && (
        <RescheduleOutcomeBanner outcome={outcome} viewerTz={me.timezone} onDismiss={() => setOutcome(null)} />
      )}

      {/* -- 1. Panel -------------------------------------------------------- */}
      <Card
        title="Panel"
        subtitle={`${activePanel} of ${detail.panelSize} seat${
          detail.panelSize === 1 ? "" : "s"
        } filled · why each person was picked`}
      >
        {detail.panel.length === 0 ? (
          <EmptyState
            icon="👥"
            title="No panel selected yet"
            body="No interviewer passed the label and skill filters for this round."
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {detail.panel.map((m) => (
              <PanelCard key={m.assignmentId} member={m} />
            ))}
          </ul>
        )}
      </Card>

      {/* -- 2. Candidate availability --------------------------------------- */}
      <Card
        id="availability"
        title="Candidate availability"
        subtitle={`Submitted in ${zoneCity(candidateTz)}${sameZone ? "" : " — your time shown underneath"}`}
      >
        {detail.candidateWindows.length === 0 ? (
          <EmptyState
            icon="🕒"
            title="No availability submitted yet"
            body="The candidate hasn't opened their link, or hasn't picked times."
            action={
              isOpen && isAdmin ? (
                <Button variant="secondary" loading={acting} onClick={resendAvailability}>
                  Resend availability request
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {detail.candidateWindows.map((w, i) => (
              <li key={i} className="rounded-md border border-zinc-200 px-3 py-2.5">
                <p className="text-[13px] font-semibold text-zinc-900">
                  {fmtDay(w.start, candidateTz)} · {fmtTimeRange(w.start, w.end, candidateTz)}
                </p>
                {!sameZone && (
                  <p className="mt-0.5 text-[12px] text-zinc-500">
                    = {fmtDay(w.start, me.timezone)} · {fmtTimeRange(w.start, w.end, me.timezone)} your time
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* -- 3. Recommended slots -------------------------------------------- */}
      <Card
        id="slots"
        title="Recommended slots"
        subtitle="Ranked by the engine — every reason it gives is a constraint it actually checked"
        actions={
          <Button variant="ghost" size="sm" onClick={reloadSlots} disabled={slotsLoading}>
            Refresh
          </Button>
        }
      >
        {slotsLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : slotsError ? (
          <ErrorState message={slotsError} onRetry={reloadSlots} />
        ) : detail.status === "SCHEDULED" ? (
          <EmptyState
            icon="✅"
            title="This interview is booked"
            body="Cancel it or start a reschedule to generate new options."
          />
        ) : detail.status === "CANCELLED" ? (
          <EmptyState icon="🚫" title="This interview was cancelled" body="No further slots will be generated." />
        ) : slots.length === 0 ? (
          <RejectionsPanel rejections={rejections} />
        ) : (
          <>
            <ul className="grid gap-3">
              {slots.map((s) => (
                <SlotCard
                  key={s.start}
                  slot={s}
                  candidateTz={candidateTz}
                  viewerTz={me.timezone}
                  candidateName={detail.candidate.name}
                  onBook={() => setPendingSlot(s)}
                  booking={booking && pendingSlot?.start === s.start}
                  disabled={booking}
                  canBook={isAdmin}
                />
              ))}
            </ul>
            {rejections.length > 0 && (
              <details className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
                <summary className="cursor-pointer text-[13px] font-medium text-zinc-700">
                  Who was ruled out, and why ({rejections.length})
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {rejections.map((r) => (
                    <li key={`${r.participantId}-${r.reason}`} className="text-[13px] text-zinc-600">
                      <span className="font-medium text-zinc-800">{r.participantName}</span> — {r.reason}
                      {r.count > 0 && <span className="text-zinc-400"> · {r.count} slots</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </Card>

      {/* -- 4. Emails sent --------------------------------------------------- */}
      <Card title="Emails sent" subtitle="Every message SIRA sent about this interview">
        <EmailsTable notifications={detail.notifications} viewerTz={me.timezone} />
      </Card>

      {/* -- dialogs ---------------------------------------------------------- */}
      <Dialog
        open={!!pendingSlot}
        title="Book this slot?"
        description={
          pendingSlot ? (
            <>
              <span className="block font-medium text-zinc-900">
                {fmtDay(pendingSlot.start, candidateTz)} ·{" "}
                {fmtTimeRange(pendingSlot.start, pendingSlot.end, candidateTz)} — {detail.candidate.name.split(" ")[0]}
                &apos;s time
              </span>
              {!sameZone && (
                <span className="mt-1 block text-zinc-600">
                  {fmtDay(pendingSlot.start, me.timezone)} ·{" "}
                  {fmtTimeRange(pendingSlot.start, pendingSlot.end, me.timezone)} — your time
                </span>
              )}
              <span className="mt-2 block text-zinc-600">
                Calendar invites and confirmation emails go out immediately.
              </span>
            </>
          ) : null
        }
        onClose={() => !booking && setPendingSlot(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingSlot(null)} disabled={booking}>
              Cancel
            </Button>
            <Button variant="primary" loading={booking} onClick={confirmBooking}>
              Confirm booking
            </Button>
          </>
        }
      />

      <Dialog
        open={confirmCancel}
        title="Cancel this interview?"
        description="The calendar event is deleted and the candidate and panel are notified. This can't be undone."
        onClose={() => !acting && setConfirmCancel(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)} disabled={acting}>
              Keep it
            </Button>
            <Button variant="primary" loading={acting} onClick={doCancel}>
              Cancel interview
            </Button>
          </>
        }
      >
        <Input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Cancellation reason"
        />
      </Dialog>

      <Dialog
        open={rescheduleOpen}
        title="Find a new time?"
        description="SIRA will look again using the availability the candidate already gave, and email them fresh options."
        onClose={() => !acting && setRescheduleOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRescheduleOpen(false)} disabled={acting}>
              Never mind
            </Button>
            <Button variant="primary" loading={acting} onClick={doReschedule}>
              Start reschedule
            </Button>
          </>
        }
      >
        <Input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-label="Reschedule reason"
        />
      </Dialog>

      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
