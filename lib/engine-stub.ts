import { 
  EngineConfig, EngineParticipant, GenerateSlotsResult, 
  TimeWindow, SelectionInput, SelectionCandidate, SelectionResult 
} from "./contracts";

export function generateSlots(
  config: EngineConfig,
  participants: EngineParticipant[]
): GenerateSlotsResult {
  // Use the window start date to create fixed slots at 10:00, 14:00, 16:00 UTC
  const baseDate = new Date(config.window.start);
  baseDate.setUTCHours(0, 0, 0, 0);
  
  const createSlot = (hour: number) => {
    const start = new Date(baseDate);
    start.setUTCHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setUTCMinutes(end.getUTCMinutes() + config.durationMin);
    return { start: start.toISOString(), end: end.toISOString() };
  };

  // NOTE (Role A, mechanical fix only — not a design change to this stub):
  // GeneratedSlot picked up interviewerIds/interviewerNames as part of pool-based
  // scheduling (see docs/12_CONTRACT_DIFF_POOL_BASED_SCHEDULING.md). Filled with
  // an empty assignment here so the stub keeps compiling; update to something
  // more realistic if you want the stub to exercise the "who's assigned" UI too.
  return {
    slots: [
      { ...createSlot(10), score: 100, rank: 1, reasons: ["Optimal slot"], interviewerIds: [], interviewerNames: [] },
      { ...createSlot(14), score: 80, rank: 2, reasons: ["Afternoon slot"], interviewerIds: [], interviewerNames: [] },
      { ...createSlot(16), score: 60, rank: 3, reasons: ["Late afternoon slot"], interviewerIds: [], interviewerNames: [] }
    ],
    rejections: []
  };
}

export function validateSlot(
  slot: TimeWindow,
  config: EngineConfig,
  participants: EngineParticipant[]
): { valid: boolean; reasons: string[] } {
  return { valid: true, reasons: ["Slot looks good"] };
}

export function pickPanel(
  input: SelectionInput,
  pool: SelectionCandidate[]
): SelectionResult {
  const available = pool.filter(c => !input.excludeIds?.includes(c.id));
  const selected = available.slice(0, input.panelSize).map(c => ({
    id: c.id,
    name: c.name,
    reason: "Mock panel selection"
  }));

  const rejected = available.slice(input.panelSize).map(c => ({
    id: c.id,
    name: c.name,
    reason: "Sufficient panel size reached"
  }));

  // NOTE (Role A, mechanical fix only): SelectionResult.pool is new — see
  // docs/12_CONTRACT_DIFF_POOL_BASED_SCHEDULING.md. Set to the same full
  // qualified list `selected` was drawn from, since that's what "pool" means
  // for the real implementation too.
  const resultPool = available.map(c => ({
    id: c.id,
    name: c.name,
    reason: "Mock pool membership",
    currentLoad: c.currentLoad,
    dailyLimit: c.dailyLimit,
  }));

  return {
    selected,
    pool: resultPool,
    rejected,
    insufficient: resultPool.length < input.panelSize
  };
}
