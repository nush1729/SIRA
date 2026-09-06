import { ConstraintCheck, Participant, TimeWindow } from "./types";

export interface SoftScoreResult {
  slot: TimeWindow;
  hardConstraintChecks: ConstraintCheck[];
  score: number;
  breakdown: { name: string; contribution: number }[];
}

// Weights are simple, tunable constants — deliberately not ML-learned (that's explicitly P3,
// "Advanced ranking," in the feature inventory). Transparent weights are part of the Explainable
// Scheduling promise: nothing here is a black box.
const WEIGHTS = {
  PREFERRED_WINDOW_MATCH: 20, // per participant whose preferred window contains the slot
  EARLIEST_IN_RANGE: 10, // scaled by how early the slot is within the full candidate range
  WORKLOAD_BALANCE: 15, // rewards lower recentInterviewCount among required interviewers
  AVOID_EDGE_HOURS: -8, // penalty if slot starts before 9am or after 5pm local, for any participant
} as const;

function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Step 3 of the pipeline: score every hard-constraint-valid slot on soft preferences only.
 * Never used to reject a slot — only to rank among slots that already passed every hard
 * constraint (architecture doc Section 21/22: hard constraints are never negotiable by ranking).
 */
export function scoreSoftPreferences(
  validSlots: { slot: TimeWindow; checks: ConstraintCheck[] }[],
  participants: Participant[],
  fullRange: TimeWindow
): SoftScoreResult[] {
  const requiredParticipants = participants.filter((p) => p.isRequired);
  const rangeMs = fullRange.end.getTime() - fullRange.start.getTime();

  return validSlots.map(({ slot, checks }) => {
    const breakdown: { name: string; contribution: number }[] = [];

    // Preferred-window match, per participant that specified one.
    let preferredMatches = 0;
    for (const participant of requiredParticipants) {
      if (participant.preferredWindows?.some((w) => overlaps(slot, w))) {
        preferredMatches += 1;
      }
    }
    if (preferredMatches > 0) {
      const contribution = preferredMatches * WEIGHTS.PREFERRED_WINDOW_MATCH;
      breakdown.push({ name: "preferred_window_match", contribution });
    }

    // Earlier-in-range is worth more, linearly scaled.
    const positionInRange = rangeMs > 0 ? (slot.start.getTime() - fullRange.start.getTime()) / rangeMs : 0;
    const earliestContribution = Math.round((1 - positionInRange) * WEIGHTS.EARLIEST_IN_RANGE);
    breakdown.push({ name: "earliest_in_range", contribution: earliestContribution });

    // Workload balance: reward slots involving interviewers with fewer recent interviews.
    const interviewers = requiredParticipants.filter((p) => p.role === "interviewer");
    if (interviewers.length > 0) {
      const avgLoad =
        interviewers.reduce((sum, p) => sum + (p.recentInterviewCount ?? 0), 0) / interviewers.length;
      const workloadContribution = Math.round(WEIGHTS.WORKLOAD_BALANCE / (1 + avgLoad));
      breakdown.push({ name: "workload_balance", contribution: workloadContribution });
    }

    const score = breakdown.reduce((sum, b) => sum + b.contribution, 0);

    return { slot, hardConstraintChecks: checks, score, breakdown };
  });
}
