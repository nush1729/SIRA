import { generateCandidateSlots } from "./generateSlots";
import { filterHardConstraints } from "./hardConstraints";
import { ConflictBottleneck, EngineConfig, Participant, TimeWindow } from "./types";

/**
 * Conflict Recovery Engine (architecture doc Section 3, #2): when zero slots pass, names the
 * specific bottleneck and proposes the minimal relaxation — computed by deterministically
 * dropping one constraint at a time and re-running the filter, never by asking an LLM to guess
 * at the diagnosis. AI, if used at all downstream, only rephrases this into friendlier prose.
 */
export function diagnoseConflict(
  candidateSlots: TimeWindow[],
  participants: Participant[],
  config: Pick<EngineConfig, "bufferMinutes" | "workingHoursStart" | "workingHoursEnd">
): ConflictBottleneck {
  const requiredParticipants = participants.filter((p) => p.isRequired);

  // 1. Try dropping each required participant one at a time — whichever removal unblocks the
  //    most slots is the primary bottleneck.
  let worstOffenderId: string | null = null;
  let bestUnblockedCount = 0;

  for (const candidate of requiredParticipants) {
    const withoutCandidate = participants.filter((p) => p.id !== candidate.id);
    const unblocked = filterHardConstraints(candidateSlots, withoutCandidate, config);
    if (unblocked.length > bestUnblockedCount) {
      bestUnblockedCount = unblocked.length;
      worstOffenderId = candidate.id;
    }
  }

  const suggestedRelaxations: ConflictBottleneck["suggestedRelaxations"] = [];

  if (worstOffenderId) {
    const offender = requiredParticipants.find((p) => p.id === worstOffenderId);
    if (offender?.role === "interviewer") {
      suggestedRelaxations.push({
        type: "alternate_interviewer",
        description: `Consider an alternate qualified interviewer instead of ${worstOffenderId}.`,
      });
    }
  }

  // 2. Try zero buffer — if that unblocks slots, offer "reduce buffer" as a relaxation.
  const noBufferResult = filterHardConstraints(candidateSlots, participants, { ...config, bufferMinutes: 0 });
  if (noBufferResult.length > 0) {
    suggestedRelaxations.push({
      type: "reduce_buffer",
      description: `Reducing the buffer from ${config.bufferMinutes}min would open up ${noBufferResult.length} slot(s).`,
    });
  }

  // 3. Always offer extending the date range as a fallback relaxation.
  suggestedRelaxations.push({
    type: "extend_date_range",
    description: "Extending the requested date range may reveal additional valid slots.",
  });

  return {
    blockingParticipantId: worstOffenderId ?? "unknown",
    reason: worstOffenderId
      ? `No common slot exists primarily because required participant ${worstOffenderId} has no overlapping availability with the rest of the panel.`
      : "No common slot exists across all required participants within the given constraints.",
    suggestedRelaxations,
  };
}
