// Pure data types for the scheduling engine. Everything here is plain data — no Prisma types,
// no I/O — so the engine (this whole directory) stays a pure, unit-testable module with zero
// dependency on the database or network. See architecture doc Section 5.2 and Section 8.

export interface TimeWindow {
  start: Date; // always UTC
  end: Date; // always UTC
}

export interface Participant {
  id: string;
  role: "candidate" | "interviewer" | "hiring_manager";
  timezone: string; // IANA tz name, e.g. "Asia/Kolkata"
  isRequired: boolean;
  availability: TimeWindow[]; // windows the participant explicitly said they're free
  busy: TimeWindow[]; // existing confirmed calendar events (from CalendarProvider.getBusyPeriods)
  preferredWindows?: TimeWindow[]; // soft preference input
  recentInterviewCount?: number; // for workload-balancing soft preference
}

export interface EngineConfig {
  durationMinutes: number;
  bufferMinutes: number;
  workingHoursStart: string; // "09:00", interpreted in each participant's own timezone
  workingHoursEnd: string; // "18:00"
  dateRange: TimeWindow;
  slotStepMinutes?: number; // candidate-slot generation granularity, default 15
}

export interface ConstraintCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface ScoredSlot {
  slot: TimeWindow;
  score: number;
  rank: number;
  hardConstraintChecks: ConstraintCheck[]; // every check that passed (all must pass to reach this stage)
  softPreferenceBreakdown: { name: string; contribution: number }[]; // feeds the explanation UI directly
}

export interface ConflictBottleneck {
  blockingParticipantId: string;
  reason: string;
  suggestedRelaxations: { type: "alternate_interviewer" | "extend_date_range" | "reduce_buffer"; description: string }[];
}
