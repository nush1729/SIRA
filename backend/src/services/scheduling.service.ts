import { prisma } from "../lib/prisma";
import { calendarProvider } from "../adapters/calendar";
import { generateRankedSlots, evaluateAutoConfirm, Participant, EngineConfig } from "../scheduling-engine";
import { BookingService } from "./booking.service";
import { AuditService } from "./audit.service";

/**
 * Bridges the pure scheduling-engine module to the database and calendar adapter — this is the
 * ONLY place that does so. Everything inside scheduling-engine/ stays free of I/O, per
 * architecture doc Section 5.2.
 */
export const SchedulingService = {
  async generateSlotsForRound(roundId: string, actorId: string) {
    const round = await prisma.interviewRound.findUniqueOrThrow({
      where: { id: roundId },
      include: {
        request: { include: { candidate: { include: { user: true } }, job: true } },
        panelAssignments: { include: { interviewer: { include: { user: true } } } },
        availabilityWindows: true,
      },
    });

    const policy = await prisma.schedulingPolicy.findUnique({ where: { organizationId: round.request.job.organizationId } });

    const config: EngineConfig = {
      durationMinutes: round.durationMinutes,
      bufferMinutes: policy?.bufferMinutes ?? 15,
      workingHoursStart: policy?.workingHoursStart ?? "09:00",
      workingHoursEnd: policy?.workingHoursEnd ?? "18:00",
      dateRange: { start: round.dateRangeStart, end: round.dateRangeEnd },
    };

    const candidateUser = round.request.candidate.user;
    const candidateBusy = await calendarProvider.getBusyPeriods(candidateUser.email, config.dateRange.start, config.dateRange.end);

    const participants: Participant[] = [
      {
        id: candidateUser.id,
        role: "candidate",
        timezone: candidateUser.timezone,
        isRequired: true,
        availability: round.availabilityWindows
          .filter((w) => w.ownerId === candidateUser.id)
          .map((w) => ({ start: w.startUtc, end: w.endUtc })),
        busy: candidateBusy,
      },
    ];

    for (const assignment of round.panelAssignments) {
      const interviewerUser = assignment.interviewer.user;
      const busy = await calendarProvider.getBusyPeriods(interviewerUser.email, config.dateRange.start, config.dateRange.end);
      participants.push({
        id: interviewerUser.id,
        role: "interviewer",
        timezone: interviewerUser.timezone,
        isRequired: assignment.isRequired,
        availability: round.availabilityWindows
          .filter((w) => w.ownerId === interviewerUser.id)
          .map((w) => ({ start: w.startUtc, end: w.endUtc })),
        busy,
      });
    }

    const { rankedSlots, conflict } = generateRankedSlots(config, participants);

    if (rankedSlots.length === 0) {
      return { rankedSlots: [], conflict, autoConfirmed: false };
    }

    const persisted = await prisma.$transaction(
      rankedSlots.map((s) =>
        prisma.slotRecommendation.create({
          data: {
            roundId,
            startUtc: s.slot.start,
            endUtc: s.slot.end,
            score: s.score,
            rank: s.rank,
            explanationJson: { hardConstraintChecks: s.hardConstraintChecks, softPreferenceBreakdown: s.softPreferenceBreakdown },
          },
        })
      )
    );

    await AuditService.record({
      roundId,
      entityType: "InterviewRound",
      entityId: roundId,
      action: "slots_generated",
      actorId,
      afterState: { count: persisted.length },
    });

    // Zero-Click Auto-Confirm gate (architecture doc Section 8.2) — reuses the exact booking
    // transaction; only decides WHO clicks confirm, never what counts as valid.
    if (policy?.autoConfirmEnabled) {
      const decision = evaluateAutoConfirm(rankedSlots, round.roundType, {
        enabled: policy.autoConfirmEnabled,
        minScoreGap: policy.autoConfirmMinScoreGap,
        eligibleRoundTypes: policy.autoConfirmEligibleRoundTypes,
      });

      if (decision.shouldAutoConfirm) {
        const topSlotRecord = persisted[0];
        const booking = await BookingService.confirmSlot({
          slotRecommendationId: topSlotRecord.id,
          idempotencyKey: `auto-${topSlotRecord.id}`,
          confirmationMode: "AUTO",
          actorId,
        });
        return { rankedSlots: persisted, conflict: null, autoConfirmed: true, booking };
      }
    }

    return { rankedSlots: persisted, conflict: null, autoConfirmed: false };
  },
};
