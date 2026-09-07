/**
 * ============================================================================
 *  §6 reschedule flow — an interviewer declines, or an admin forces a redo.
 *
 *  Rewritten to go through the same pool-based machinery as the primary
 *  booking path (docs/12, lib/scheduling-context.ts) instead of a hand-rolled
 *  fixed-panel copy. The old version built its own candidate pool with
 *  `busy: []` and `currentLoad: 0` hardcoded, which meant:
 *    - same-time replacement picked a "free" person with zero calendar data,
 *    - auto-rebook could confirm a booking with zero interviewers if the
 *      declining panelist was the only one, since fixed-panel `generateSlots`
 *      has nothing to reject an empty interviewer list against.
 *  Both are structurally impossible now: `findSameTimeReplacement` filters on
 *  real `busy`, and `generateSlotsFromPool` rejects any slot where fewer than
 *  `panelSize` pool members are free.
 * ============================================================================
 */
import prisma from '@/lib/db';
import { getCalendarAdapter } from '@/lib/adapters/calendar';
import { refineWindowsFromPool, findSameTimeReplacement } from '@/lib/engine';
import { buildSchedulingContext, buildReplacementCandidates } from '@/lib/scheduling-context';
import { sendNotification } from '@/lib/notify';
import {
  releaseInterviewers,
  reserveInterviewers,
  replaceInterviewerAssignment,
  syncPanelToBooking,
  SlotTakenError,
} from '@/lib/booking';
import { RescheduleOutcome, RoundType } from '@/lib/contracts';
import { interviewerAssigned, interviewerChanged, interviewMoved, rescheduleRequired } from '@/lib/email-templates';

const csv = (v: string | null | undefined): string[] =>
  v ? v.split(',').map((x) => x.trim()).filter(Boolean) : [];

export async function processReschedule(requestId: string, declinerId?: string): Promise<RescheduleOutcome> {
  const request = await prisma.interviewRequest.findUnique({
    where: { id: requestId },
    include: { candidate: true, windows: true, panel: { include: { interviewer: true } } },
  });
  if (!request) throw new Error('Request not found');

  const booking = await prisma.booking.findFirst({ where: { requestId, status: 'CONFIRMED' } });
  const adapter = getCalendarAdapter();
  const baseUrl = process.env.APP_URL || 'http://localhost:3000';
  const consoleLink = `${baseUrl}/interviewer`;
  // The calendar the OLD event was created on — same active (non-declined,
  // non-replaced) panel member's calendar createEvent() targeted originally.
  // Read from `request.panel` fetched above, before any mutation below.
  // Decline case: the caller already flipped the decliner's own
  // PanelAssignment to DECLINED before calling this function, so filtering
  // that status out here would exclude exactly the person whose calendar
  // holds the stale event — match by declinerId instead, regardless of
  // status. Admin-forced reschedule (no declinerId): fall back to whoever's
  // still actively assigned.
  const oldInterviewerCalendarId =
    (declinerId
      ? request.panel.find((p) => p.interviewerId === declinerId)?.interviewer.calendarId
      : request.panel.find((p) => p.status !== 'DECLINED' && p.status !== 'REPLACED')?.interviewer.calendarId) ??
    undefined;

  /* -- Branch 1: Same-Time Replacement (§6A step 1) ------------------------
   * The booked time is protected; only WHO runs it changes. Uses the exact,
   * buffer-aware instant check (`findSameTimeReplacement`), not a coarse
   * window scan — this is one specific slot, not a pool to screen. */
  if (booking && declinerId) {
    const candidatePool = await buildReplacementCandidates(request);
    const selection = findSameTimeReplacement(
      { start: booking.startUtc.toISOString(), end: booking.endUtc.toISOString() },
      candidatePool,
      {
        roundType: request.roundType as RoundType,
        requiredSkills: csv(request.requiredSkills),
        panelSize: 1,
        window: { start: booking.startUtc.toISOString(), end: booking.endUtc.toISOString() },
        durationMin: request.durationMin,
      }
    );

    if (!selection.insufficient && selection.selected.length > 0) {
      const replacement = selection.selected[0];

      try {
        await prisma.$transaction(async (tx) => {
          await tx.panelAssignment.deleteMany({ where: { requestId, interviewerId: declinerId } });
          await tx.panelAssignment.create({
            data: { requestId, interviewerId: replacement.id, status: 'PENDING', reason: 'Same-time replacement' },
          });
          // Release the decliner's lock on this booking and lock the
          // replacement's time instead — a plain `releaseInterviewers` would
          // wrongly free every co-panelist's lock on a panelSize>1 booking.
          await replaceInterviewerAssignment(tx, {
            bookingId: booking.id,
            oldInterviewerId: declinerId,
            newInterviewerId: replacement.id,
            startUtc: booking.startUtc,
            endUtc: booking.endUtc,
          });
          await tx.eventLog.create({
            data: { requestId, actor: 'system', action: 'REPLACED_SAME_TIME', detail: `Replaced with ${replacement.name}` },
          });
        });

        const replacementUser = await prisma.user.findUnique({ where: { id: replacement.id } });

        // Move the real Calendar event to the replacement's own calendar (the
        // one getBusy() reads) and swap the attendee off the decliner — the
        // booked time isn't changing, only who's actually running it.
        if (booking?.eventId) {
          const declinerCalendarId = request.panel.find((p) => p.interviewerId === declinerId)?.interviewer.calendarId ?? undefined;
          const newCalendarId = replacementUser?.calendarId ?? undefined;
          await adapter.moveEvent(booking.eventId, declinerCalendarId, newCalendarId);
          if (replacementUser) {
            await adapter.updateEvent(
              booking.eventId,
              { attendees: [request.candidate.email, replacementUser.email] },
              newCalendarId
            );
          }
        }

        if (replacementUser) {
          await sendNotification({
            requestId,
            toEmail: replacementUser.email,
            ...interviewerAssigned({
              interviewerName: replacementUser.name,
              candidateName: request.candidate.name,
              jobTitle: request.jobTitle,
              roundType: request.roundType,
              startUtc: booking.startUtc.toISOString(),
              endUtc: booking.endUtc.toISOString(),
              timezone: replacementUser.timezone,
              meetLink: booking.meetLink,
              consoleLink,
            }),
          });
        }

        await sendNotification({
          requestId,
          toEmail: request.candidate.email,
          ...interviewerChanged({
            candidateName: request.candidate.name,
            newInterviewerName: replacement.name,
            startUtc: booking.startUtc.toISOString(),
            endUtc: booking.endUtc.toISOString(),
            timezone: request.candidate.timezone,
          }),
        });

        return {
          outcome: 'REPLACED_SAME_TIME',
          message: `Successfully replaced interviewer with ${replacement.name} at the exact same time.`,
          newInterviewerName: replacement.name,
        };
      } catch (err) {
        // Someone else's booking grabbed the replacement's time between the
        // check above and this transaction — fall through to auto-rebook
        // rather than silently leaving the request stuck.
        if (!(err instanceof SlotTakenError)) throw err;
      }
    }
  }

  /* -- Branch 2: Auto-Rebook (§6A step 2), pool-based ----------------------
   * Re-run scheduling against the candidate's ALREADY-SUBMITTED windows and
   * the whole qualified pool (not just the original panel) — a decline
   * shouldn't fail the interview just because that one person is unavailable
   * when a qualified, free colleague exists. */
  if (request.windows.length > 0) {
    const { config, candidate, pool } = await buildSchedulingContext(request);
    const slotResult = refineWindowsFromPool(candidate.availability, config, candidate, pool, request.panelSize);

    const validNewSlots = slotResult.slots.filter((s) => {
      if (!booking) return true;
      return s.start !== booking.startUtc.toISOString() || s.end !== booking.endUtc.toISOString();
    });

    if (validNewSlots.length > 0) {
      const bestSlot = validNewSlots[0];

      try {
        const newBooking = await prisma.$transaction(async (tx) => {
          if (booking) {
            await tx.booking.update({ where: { id: booking.id }, data: { status: 'SUPERSEDED', activeKey: null } });
            // Free the old cells before locking the new ones, so the interviewer
            // is never held at two times at once.
            await releaseInterviewers(tx, booking.id);
          }

          const nb = await tx.booking.create({
            data: {
              requestId,
              startUtc: new Date(bestSlot.start),
              endUtc: new Date(bestSlot.end),
              status: 'CONFIRMED',
              activeKey: requestId,
            },
          });

          if (bestSlot.interviewerIds?.length) {
            await reserveInterviewers(tx, {
              bookingId: nb.id,
              interviewerIds: bestSlot.interviewerIds,
              startUtc: new Date(bestSlot.start),
              endUtc: new Date(bestSlot.end),
            });
            await syncPanelToBooking(tx, {
              requestId,
              interviewerIds: bestSlot.interviewerIds,
              reason: 'Auto-rebooked to a new time',
            });
          }

          await tx.eventLog.create({
            data: { requestId, actor: 'system', action: 'REBOOKED_NEW_TIME', detail: `Auto-rebooked to ${bestSlot.start}` },
          });

          return nb;
        });

        // Delete old calendar event AFTER transaction commits (external I/O)
        if (booking?.eventId) await adapter.deleteEvent(booking.eventId, oldInterviewerCalendarId);

        const newInterviewers = await prisma.user.findMany({ where: { id: { in: bestSlot.interviewerIds ?? [] } } });
        const attendees = [request.candidate.email, ...newInterviewers.map((u) => u.email)];
        const event = await adapter.createEvent({
          requestId,
          startUtc: new Date(bestSlot.start),
          endUtc: new Date(bestSlot.end),
          attendees,
          summary: `Interview (Rescheduled): ${request.jobTitle}`,
          description: 'Interview via SIRA.',
          calendarId: newInterviewers[0]?.calendarId ?? undefined,
        });

        await prisma.booking.update({
          where: { id: newBooking.id },
          data: { eventId: event.eventId, meetLink: event.meetLink },
        });

        await sendNotification({
          requestId,
          toEmail: request.candidate.email,
          ...interviewMoved({
            candidateName: request.candidate.name,
            startUtc: bestSlot.start,
            endUtc: bestSlot.end,
            timezone: request.candidate.timezone,
            meetLink: event.meetLink,
          }),
        });

        for (const person of newInterviewers) {
          await sendNotification({
            requestId,
            toEmail: person.email,
            ...interviewerAssigned({
              interviewerName: person.name,
              candidateName: request.candidate.name,
              jobTitle: request.jobTitle,
              roundType: request.roundType,
              startUtc: bestSlot.start,
              endUtc: bestSlot.end,
              timezone: person.timezone,
              meetLink: event.meetLink,
              consoleLink,
            }),
          });
        }

        return {
          outcome: 'REBOOKED_NEW_TIME',
          message: "Auto-rebooked to a new time based on candidate's original availability.",
          newStartUtc: bestSlot.start,
          newEndUtc: bestSlot.end,
        };
      } catch (err) {
        // Lost a last-second race for the new slot too — fall through to
        // RESCHEDULE_REQUIRED rather than throwing past the caller.
        if (!(err instanceof SlotTakenError)) throw err;
      }
    }
  }

  /* -- Branch 3: Complete Failure -> RESCHEDULE_REQUIRED ------------------- */
  await prisma.$transaction(async (tx) => {
    if (booking) {
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'SUPERSEDED', activeKey: null } });
      await releaseInterviewers(tx, booking.id);
    }

    await tx.interviewRequest.update({
      where: { id: requestId },
      data: { status: 'RESCHEDULE_REQUIRED', blockedReason: 'No alternative slots available.' },
    });

    await tx.eventLog.create({
      data: { requestId, actor: 'system', action: 'RESCHEDULE_REQUIRED', detail: 'Could not automatically reschedule.' },
    });
  });

  // Delete old calendar event AFTER transaction commits (external I/O)
  if (booking?.eventId) await adapter.deleteEvent(booking.eventId, oldInterviewerCalendarId);

  await sendNotification({
    requestId,
    toEmail: request.candidate.email,
    ...rescheduleRequired({
      candidateName: request.candidate.name,
      jobTitle: request.jobTitle,
      link: `${baseUrl}/s/${request.token}`,
    }),
  });

  return {
    outcome: 'RESCHEDULE_REQUIRED',
    message: 'Could not automatically replace or rebook. Request sent back to candidate for new availability.',
  };
}
