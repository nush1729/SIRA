/**
 * ============================================================================
 *  HOUR-ZERO CONTRACT — copy to `lib/contracts.ts` before anyone starts coding.
 *  FROZEN. Nobody edits this alone. Changing it requires all four people to agree,
 *  because every workstream is written against it.
 *
 *  This file is what makes 4-way parallel work possible: A, B, C and D never need
 *  to see each other's code, only these types.
 * ============================================================================
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. DOMAIN ENUMS (mirrored exactly in prisma/schema.prisma — B keeps them in sync)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Three roles only.
 *   ADMIN       — schedules everything; the only role that can create requests
 *                 or book slots.
 *   INTERVIEWER — sits on panels, accepts/declines, sees their own calendar.
 *   candidate   — has no account and therefore no Role: they act through a
 *                 scoped token link (`PublicRequestDTO`). Listed here as a
 *                 comment so nobody adds it back as a login role.
 */
export type Role = "ADMIN" | "INTERVIEWER";
export type RoundType = "SCREENING" | "TECHNICAL" | "MANAGERIAL" | "HR";
export type ReqStatus =
  | "DRAFT"
  | "AWAITING_AVAILABILITY"
  | "READY_TO_SCHEDULE"
  | "SCHEDULED"
  | "RESCHEDULE_REQUIRED"
  | "CANCELLED";
export type PanelStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "REPLACED";
export type BookStatus = "CONFIRMED" | "CANCELLED" | "SUPERSEDED";

export const WORKING_HOURS_START = "09:00";
export const WORKING_HOURS_END = "18:00";
export const BUFFER_MIN = 15;
export const SLOT_STEP_MIN = 15;

// ─────────────────────────────────────────────────────────────────────────────
// 2. ENGINE CONTRACT  →  owned by PERSON A. B and C consume it.
//    Pure functions: no DB, no network, no Date.now() side effects.
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeWindow {
  /** ISO-8601 UTC string, e.g. "2026-03-09T14:30:00.000Z" */
  start: string;
  end: string;
}

export interface EngineParticipant {
  id: string;
  name: string;
  role: "candidate" | "interviewer";
  /** IANA zone, e.g. "Asia/Kolkata" */
  timezone: string;
  /** Candidate-submitted windows, or interviewer working availability. UTC. */
  availability: TimeWindow[];
  /** Existing calendar events (busy). UTC. */
  busy: TimeWindow[];
  /** interviewer only */
  dailyLimit?: number;
  /** interviewer only — bookings already held, used for daily-cap + load checks */
  existingBookings?: TimeWindow[];
  /**
   * Must this person attend, or are they one of several interchangeable
   * options? Defaults to TRUE (everyone required) so existing behaviour is
   * unchanged. Set false for pool members that the engine may swap between.
   * The candidate is always treated as required regardless of this flag.
   */
  isRequired?: boolean;
  /** interviewer only — current load, used to prefer the least-busy option when
   *  several pool members could equally cover a slot. */
  currentLoad?: number;
}

export interface EngineConfig {
  durationMin: number;
  bufferMin: number;
  workingHoursStart: string; // "09:00"
  workingHoursEnd: string; // "18:00"
  window: TimeWindow;
  stepMin?: number;
}

export interface GeneratedSlot {
  start: string; // UTC ISO
  end: string;
  score: number;
  rank: number;
  /** Human-readable strings shown directly in the UI. e.g.
   *  "Priya Sharma available 3:00 PM IST", "15-min buffer respected" */
  reasons: string[];
  /**
   * WHO would actually run the interview at this slot.
   *
   * With pool-based assignment the panel is not fixed when the request is
   * created — different slots can be covered by different interviewers, and
   * the assignment is only settled when a slot is booked. These fields carry
   * the engine's proposed assignment for THIS slot (required participants
   * first, then the least-loaded free pool members).
   *
   * Empty only for legacy fixed-panel calls to `generateSlots`, where the
   * panel was already decided by the caller.
   */
  interviewerIds: string[];
  interviewerNames: string[];
}

export interface RejectionReason {
  participantId: string;
  participantName: string;
  reason: string; // "conflicts with existing event (incl. 15min buffer)"
  count: number; // how many candidate slots this killed
}

export interface GenerateSlotsResult {
  slots: GeneratedSlot[]; // ranked, best first. Empty ⇒ see rejections
  rejections: RejectionReason[]; // aggregated, top reasons first
}

/** A.1 — fixed-panel generation: EVERY participant given is required. */
export declare function generateSlots(
  config: EngineConfig,
  participants: EngineParticipant[]
): GenerateSlotsResult;

/**
 * A.1b — POOL-BASED generation. This is the one the product actually uses.
 *
 * Interviewers are pooled by round-type label (a TECHNICAL round draws on the
 * TECHNICAL pool). A slot is valid when the candidate, every REQUIRED
 * participant, and at least `panelSize` members of the interchangeable pool are
 * all free. The engine then assigns the least-loaded free pool members to that
 * specific slot — so different slots may be covered by different people, and
 * one interviewer being busy no longer kills a time that a colleague could take.
 *
 * @param candidate  the candidate participant (their submitted windows are the
 *                   only source of candidate slots)
 * @param pool       interchangeable, equally-qualified interviewers
 * @param panelSize  how many of the pool must attend
 * @param required   participants who must ALWAYS attend (e.g. the hiring
 *                   manager), over and above the pool
 */
export declare function generateSlotsFromPool(
  config: EngineConfig,
  candidate: EngineParticipant,
  pool: EngineParticipant[],
  panelSize: number,
  required?: EngineParticipant[]
): GenerateSlotsResult;

export interface FeasibleDaysResult {
  /** Local day keys ("2026-03-09") IN THE CANDIDATE'S TIMEZONE, for days where
   *  the panel could actually cover an interview. */
  days: string[];
  /** The timezone those day keys are expressed in — the UI must not re-interpret them. */
  timezone: string;
  /** Days inside the window that were checked and found unusable, with why.
   *  Lets the UI explain a greyed-out day instead of just disabling it. */
  blocked: { day: string; reason: string }[];
}

/**
 * A.4 — which days can the candidate safely be offered?
 *
 * Runs before the candidate picks anything, so the booking UI can grey out days
 * where no valid interview could be scheduled no matter what time they choose.
 * A day qualifies when at least `panelSize` pool members (plus every required
 * participant) have a duration-sized opening that day.
 */
export declare function computeFeasibleDays(
  config: EngineConfig,
  candidateTimezone: string,
  pool: EngineParticipant[],
  panelSize: number,
  required?: EngineParticipant[]
): FeasibleDaysResult;

/** A.2 — re-check a single slot immediately before booking (logic doc §7 step 2) */
export declare function validateSlot(
  slot: TimeWindow,
  config: EngineConfig,
  participants: EngineParticipant[]
): { valid: boolean; reasons: string[] };

// ── Interviewer selection (#18) + load balancing (#20) ──

export interface SelectionCandidate {
  id: string;
  name: string;
  timezone: string;
  labels: RoundType[];
  skills: string[];
  dailyLimit: number;
  currentLoad: number;
  availability: TimeWindow[];
  busy: TimeWindow[];
}

export interface SelectionInput {
  roundType: RoundType;
  requiredSkills: string[];
  panelSize: number;
  window: TimeWindow;
  durationMin: number;
  excludeIds?: string[]; // used when replacing a decliner
}

export interface SelectionResult {
  /** The top `panelSize` of the pool — a PREVIEW of who would most likely run
   *  this interview, shown to the recruiter at request-creation time. It is NOT
   *  a binding assignment: the real assignment is made per-slot at booking time
   *  (see `generateSlotsFromPool`). */
  selected: { id: string; name: string; reason: string }[];
  /**
   * THE POOL — every interviewer qualified for this round (correct label +
   * required skills + some availability + under their cap), ranked
   * least-loaded first. This is what slot generation draws on; any one of these
   * people can cover the interview, so one being busy doesn't block a time.
   */
  pool: { id: string; name: string; reason: string; currentLoad: number; dailyLimit: number }[];
  /** everyone considered and why they lost — drives the UI's explainability panel */
  rejected: { id: string; name: string; reason: string }[];
  /** true when the POOL is smaller than panelSize — i.e. this round cannot be
   *  staffed at all, not merely that a particular time is awkward. */
  insufficient: boolean;
}

/** A.3 */
export declare function pickPanel(
  input: SelectionInput,
  pool: SelectionCandidate[]
): SelectionResult;

// ─────────────────────────────────────────────────────────────────────────────
// 3. API CONTRACT  →  B implements. C and D call.
//    Every response uses this envelope.
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiErr {
  ok: false;
  error: { code: ApiErrorCode; message: string };
}
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "SLOT_NO_LONGER_VALID"
  | "ALREADY_BOOKED"
  | "NO_ELIGIBLE_INTERVIEWERS";

// ── DTOs returned by the API (C and D render exactly these) ──

export interface SessionDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  timezone: string;
}

export interface CandidateDTO {
  id: string;
  name: string;
  email: string;
  timezone: string;
}

export interface PanelMemberDTO {
  assignmentId: string;
  interviewerId: string;
  name: string;
  labels: RoundType[];
  skills: string[];
  load: string; // "2/3"
  status: PanelStatus;
  reason: string | null; // why this person was picked
}

export interface BookingDTO {
  id: string;
  startUtc: string;
  endUtc: string;
  status: BookStatus;
  meetLink: string | null;
}

/** Where an interviewer's calendar is being read from. */
export type CalendarSource = "mock" | "google";

export interface CalendarEventDTO {
  id: string;
  title: string;
  startUtc: string;
  endUtc: string;
  /** BUSY = an existing block scheduling must avoid. INTERVIEW = a SIRA booking. */
  kind: "BUSY" | "INTERVIEW";
}

export interface CalendarDTO {
  source: CalendarSource;
  /** false ⇒ render the connect prompt, not an empty week. */
  connected: boolean;
  /** e.g. "priya_tech@group.calendar.google.com", or null when not connected. */
  accountLabel: string | null;
  /** IANA zone the events should be rendered in — the viewer's own. */
  timezone: string;
  events: CalendarEventDTO[];
}

export interface NotificationDTO {
  id: string;
  toEmail: string;
  subject: string;
  template: string;
  status: string;
  createdAt: string;
}

export interface RequestListItemDTO {
  id: string;
  candidate: CandidateDTO;
  jobTitle: string;
  roundType: RoundType;
  durationMin: number;
  status: ReqStatus;
  blockedReason: string | null;
  booking: BookingDTO | null;
}

export interface RequestDetailDTO extends RequestListItemDTO {
  requiredSkills: string[];
  panelSize: number;
  window: TimeWindow;
  candidateWindows: TimeWindow[];
  panel: PanelMemberDTO[];
  notifications: NotificationDTO[];
  candidateLink: string; // /s/<token>
}

/** Candidate-facing view — deliberately minimal, no internal data leaks. */
export interface PublicRequestDTO {
  candidateName: string;
  candidateTimezone: string;
  jobTitle: string;
  roundType: RoundType;
  durationMin: number;
  status: ReqStatus;
  recruiterName: string;
  booking: { startUtc: string; endUtc: string; meetLink: string | null; interviewerNames: string[] } | null;
}

// ── Endpoint map (path → request body → response data) ──
//
//  STAFF (cookie auth)
//  POST /api/auth/login              {email,password}                → SessionDTO
//  POST /api/auth/logout             {}                              → {}
//  GET  /api/auth/me                                                 → SessionDTO
//  GET  /api/requests                ?status=&q=                     → RequestListItemDTO[]
//  POST /api/requests                CreateRequestBody               → RequestDetailDTO
//  GET  /api/requests/:id                                            → RequestDetailDTO
//  POST /api/requests/preview-panel  PreviewPanelBody                → SelectionResult
//  POST /api/requests/:id/availability-request  {}                   → {candidateLink}
//  GET  /api/requests/:id/slots                                      → GenerateSlotsResult
//  POST /api/requests/:id/book       {startUtc,endUtc}               → BookingDTO
//  POST /api/requests/:id/cancel     {reason?}                       → {}
//  POST /api/requests/:id/reschedule {reason?}                       → RescheduleOutcome
//  GET  /api/assignments/mine                                        → AssignmentDTO[]
//  GET  /api/calendar/mine           ?source=mock|google             → CalendarDTO
//  POST /api/assignments/:id/respond {action:"ACCEPT"|"DECLINE", reason?} → RescheduleOutcome
//
//  CANDIDATE (token in path, no auth)
//  GET  /api/public/:token                                           → PublicRequestDTO
//  GET  /api/public/:token/feasible-days                             → FeasibleDaysResult
//  POST /api/public/:token/availability {windows:TimeWindow[]}       → {}
//  GET  /api/public/:token/slots                                     → GenerateSlotsResult
//  POST /api/public/:token/book      {startUtc,endUtc}               → BookingDTO
//  GET  /api/public/:token/reschedule-slots                          → GenerateSlotsResult
//
//  DEV
//  POST /api/dev/seed                                                → SeedSummary

export interface CreateRequestBody {
  candidateId?: string;
  newCandidate?: { name: string; email: string; timezone: string };
  jobTitle: string;
  roundType: RoundType;
  durationMin: number;
  requiredSkills: string[];
  panelSize: number;
  window: TimeWindow;
  sendAvailabilityRequest: boolean;
}

export interface PreviewPanelBody {
  roundType: RoundType;
  requiredSkills: string[];
  panelSize: number;
  window: TimeWindow;
  durationMin: number;
}

export interface AssignmentDTO {
  assignmentId: string;
  requestId: string;
  candidateName: string;
  jobTitle: string;
  roundType: RoundType;
  status: PanelStatus;
  startUtc: string | null;
  endUtc: string | null;
  viewerTimezone: string;
}

/** What the UI shows after a decline / reschedule attempt (logic doc §6). */
export interface RescheduleOutcome {
  outcome:
    | "REPLACED_SAME_TIME" // new interviewer, time unchanged
    | "REBOOKED_NEW_TIME" // new time auto-chosen from candidate's windows
    | "RESCHEDULE_REQUIRED"; // nothing worked, pushed back to recruiter pipeline
  message: string; // human sentence for the UI banner
  newInterviewerName?: string;
  newStartUtc?: string;
  newEndUtc?: string;
}

export interface SeedSummary {
  ok: boolean;
  counts: Record<string, number>;
  candidateLinks: { name: string; scenario: string; url: string }[];
  logins: { email: string; role: Role; password: string }[];
}
