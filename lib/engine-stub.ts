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

  return {
    slots: [
      { ...createSlot(10), score: 100, rank: 1, reasons: ["Optimal slot"] },
      { ...createSlot(14), score: 80, rank: 2, reasons: ["Afternoon slot"] },
      { ...createSlot(16), score: 60, rank: 3, reasons: ["Late afternoon slot"] }
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

  return {
    selected,
    rejected,
    insufficient: selected.length < input.panelSize
  };
}
