import { generateCandidateSlots } from "./generateSlots";
import { filterHardConstraints } from "./hardConstraints";
import { EngineConfig, Participant, TimeWindow, ConflictBottleneck } from "./types";
import { diagnoseConflict } from "./conflictRecovery";

export interface LoopRoundSpec {
  roundId: string;
  durationMinutes: number;
  participants: Participant[]; // this round's own required/optional participants
}

export interface DaySkeleton {
  blocks: { roundId: string; slot: TimeWindow }[];
  score: number;
}

export interface GenerateLoopResult {
  skeletons: DaySkeleton[]; // ranked, best first
  conflict: ConflictBottleneck | null; // populated only when skeletons is empty; names the blocking round
}

/**
 * Interview Loop Builder pipeline (architecture doc Section 8.1): solves every bundled round as
 * ONE constraint problem instead of running the single-round pipeline per round, which is
 * exactly the bug class that produces "interviewer double-booked across two panels in the same
 * loop." This is a small, deliberately simple implementation for the hackathon scope — it
 * generates skeletons for the first round, then tries to place each subsequent round back-to-back
 * (skeleton-building via a greedy sequential search, not a full combinatorial search over every
 * possible skeleton — sufficient at 2-6 round loop sizes, and it's the correctness boundary
 * that matters for the demo, not exhaustiveness).
 */
export function generateLoopSkeletons(
  rounds: LoopRoundSpec[],
  config: Pick<EngineConfig, "bufferMinutes" | "workingHoursStart" | "workingHoursEnd" | "dateRange">
): GenerateLoopResult {
  if (rounds.length < 2) {
    throw new Error("A loop requires at least 2 rounds — otherwise use the single-round pipeline.");
  }

  const skeletons: DaySkeleton[] = [];

  function tryBuild(roundIndex: number, cursorAfter: Date | null, blocksSoFar: DaySkeleton["blocks"]) {
    if (roundIndex === rounds.length) {
      skeletons.push({ blocks: blocksSoFar, score: 0 }); // scoring layered on top by the caller, same soft-preference module
      return;
    }

    const round = rounds[roundIndex];
    const searchStart = cursorAfter
      ? new Date(cursorAfter.getTime() + config.bufferMinutes * 60_000)
      : config.dateRange.start;
    const searchRange: TimeWindow = { start: searchStart, end: config.dateRange.end };

    const candidateSlots = generateCandidateSlots(searchRange, round.durationMinutes);
    const valid = filterHardConstraints(candidateSlots, round.participants, config);

    // Cross-round conflict check: reject any candidate slot that overlaps a block already
    // placed for a participant who also appears in this round (e.g. the candidate, or an
    // interviewer double-booked across two panels in the same loop).
    const alreadyBookedParticipantIds = new Set(
      blocksSoFar.flatMap((b) => rounds.find((r) => r.roundId === b.roundId)?.participants.map((p) => p.id) ?? [])
    );
    const thisRoundParticipantIds = new Set(round.participants.map((p) => p.id));
    const sharedParticipants = [...alreadyBookedParticipantIds].some((id) => thisRoundParticipantIds.has(id));

    for (const { slot } of valid) {
      if (sharedParticipants) {
        const overlapsPriorBlock = blocksSoFar.some(
          (b) => slot.start < b.slot.end && b.slot.start < slot.end
        );
        if (overlapsPriorBlock) continue;
      }

      tryBuild(roundIndex + 1, slot.end, [...blocksSoFar, { roundId: round.roundId, slot }]);
      // Limit branching for hackathon-scale performance — take the first few valid continuations
      // per round rather than exhaustively searching every branch.
      if (skeletons.length > 20) return;
    }
  }

  tryBuild(0, null, []);

  if (skeletons.length === 0) {
    // Surface the diagnosis for round 0 as a reasonable default; a fuller implementation would
    // identify exactly which round in the sequence first ran out of options.
    const firstRound = rounds[0];
    const conflict = diagnoseConflict(
      generateCandidateSlots(config.dateRange, firstRound.durationMinutes),
      firstRound.participants,
      config
    );
    return { skeletons: [], conflict };
  }

  return { skeletons, conflict: null };
}
