/**
 * ============================================================================
 *  Role C — the single door to the network.
 *
 *  Every staff screen calls these functions and nothing else. No component
 *  anywhere may call `fetch` directly (docs/09): at integration we flip
 *  NEXT_PUBLIC_MOCK_API to "false" and not one component changes.
 *
 *  Returned shapes are the DTOs from lib/contracts.ts, unrenamed.
 * ============================================================================
 */

import type {
  ApiErrorCode,
  ApiResponse,
  AssignmentDTO,
  BookingDTO,
  CalendarDTO,
  CalendarEventDTO,
  CalendarSource,
  PanelMemberDTO,
  CandidateDTO,
  CreateRequestBody,
  GenerateSlotsResult,
  PanelStatus,
  PreviewPanelBody,
  RequestDetailDTO,
  RequestListItemDTO,
  RescheduleOutcome,
  RoundType,
  SeedSummary,
  SelectionResult,
  SessionDTO,
} from "@/lib/contracts";

import {
  buildCalendar,
  contestedSlotStarts,
  rescheduleSlotsByRequest,
  DEMO_PASSWORD,
  assignmentsByUser,
  declineOutcomes,
  defaultDeclineOutcome,
  previewPanelFixture,
  requestDetails as fixtureDetails,
  requestOrder,
  seedSummary,
  seededBusy,
  sessions,
  slotsByRequest as fixtureSlots,
} from "@/mocks/staff-fixtures";

export const MOCK = process.env.NEXT_PUBLIC_MOCK_API === "true";

/* ---------------------------------------------------------------------------
 * Errors
 * ------------------------------------------------------------------------ */

export class ApiError extends Error {
  code: ApiErrorCode;
  constructor(error: { code: ApiErrorCode; message: string }) {
    super(error.message);
    this.name = "ApiError";
    this.code = error.code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let json: ApiResponse<T>;
  try {
    const res = await fetch(path, {
      credentials: "include",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      ...init,
    });
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError({ code: "VALIDATION_ERROR", message: "Could not reach the server. Check your connection and try again." });
  }
  if (!json.ok) throw new ApiError(json.error);
  return json.data;
}

/* ---------------------------------------------------------------------------
 * Mock state — a mutable clone of the fixtures so the demo can actually
 * change things (book a slot, decline, cancel) and see the result persist
 * for the life of the tab.
 * ------------------------------------------------------------------------ */

const SESSION_KEY = "sira.mock.session";
const LATENCY_MS = 260;

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type MockState = {
  details: Record<string, RequestDetailDTO>;
  slots: Record<string, GenerateSlotsResult>;
  assignments: Record<string, AssignmentDTO[]>;
  contested: Set<string>;
  notifSeq: number;
};

let state: MockState | null = null;

function mock(): MockState {
  if (!state) {
    state = {
      details: clone(fixtureDetails),
      slots: clone(fixtureSlots),
      assignments: clone(assignmentsByUser),
      contested: new Set(contestedSlotStarts),
      notifSeq: 1000,
    };
  }
  return state;
}

function resetMockState() {
  state = null;
  mock();
}

function pushNotification(requestId: string, toEmail: string, subject: string, template: string) {
  const s = mock();
  s.details[requestId]?.notifications.unshift({
    id: `n_${++s.notifSeq}`,
    toEmail,
    subject,
    template,
    status: "SENT",
    createdAt: new Date().toISOString(),
  });
}

/**
 * An interviewer's calendar is never stored — it is derived from what is booked
 * right now. Book something and it appears; decline, cancel or move it and it
 * disappears from the old owner's week, with no separate bookkeeping to drift.
 */
function interviewEventsFor(userId: string): CalendarEventDTO[] {
  const s = mock();
  const events: CalendarEventDTO[] = [];

  for (const id of Object.keys(s.details)) {
    const d = s.details[id];
    if (!d.booking || d.booking.status !== "CONFIRMED") continue;
    // A declined or replaced panelist is no longer expected to attend.
    const onPanel = d.panel.some(
      (p) => p.interviewerId === userId && p.status !== "DECLINED" && p.status !== "REPLACED"
    );
    if (!onPanel) continue;
    events.push({
      id: `cal_int_${d.booking.id}`,
      title: `Interview · ${d.candidate.name} (${d.jobTitle})`,
      startUtc: d.booking.startUtc,
      endUtc: d.booking.endUtc,
      kind: "INTERVIEW",
    });
  }
  return events;
}

/** Keep each interviewer's console row in step with the request's booking. */
function syncAssignmentRows(requestId: string) {
  const s = mock();
  const d = s.details[requestId];
  if (!d) return;
  const live = d.booking && d.booking.status === "CONFIRMED" ? d.booking : null;

  for (const userId of Object.keys(s.assignments)) {
    for (const row of s.assignments[userId]) {
      if (row.requestId !== requestId) continue;
      const member = d.panel.find((p) => p.assignmentId === row.assignmentId);
      if (member) row.status = member.status;
      const attending = member && member.status !== "DECLINED" && member.status !== "REPLACED";
      row.startUtc = attending && live ? live.startUtc : null;
      row.endUtc = attending && live ? live.endUtc : null;
    }
  }
}

/** Put a replacement interviewer on the panel and in their own console. */
function addReplacement(requestId: string, name: string, reason: string): PanelMemberDTO | null {
  const s = mock();
  const d = s.details[requestId];
  const user = sessions.find((u) => u.name === name);
  if (!d || !user) return null;

  let member = d.panel.find((p) => p.interviewerId === user.id);
  if (member) {
    member.status = "PENDING";
    member.reason = reason;
  } else {
    member = {
      assignmentId: `a_${requestId}_${user.id}`,
      interviewerId: user.id,
      name: user.name,
      labels: d.roundType ? [d.roundType] : [],
      skills: d.requiredSkills,
      load: "1/3",
      status: "PENDING",
      reason,
    };
    d.panel.push(member);
  }

  const rows = (s.assignments[user.id] ??= []);
  if (!rows.some((r) => r.assignmentId === member!.assignmentId)) {
    rows.unshift({
      assignmentId: member.assignmentId,
      requestId,
      candidateName: d.candidate.name,
      jobTitle: d.jobTitle,
      roundType: d.roundType,
      status: "PENDING",
      startUtc: d.booking?.startUtc ?? null,
      endUtc: d.booking?.endUtc ?? null,
      viewerTimezone: user.timezone,
    });
  }
  return member;
}

/** Options to offer after a booking falls through. */
function restoreSlots(requestId: string) {
  const s = mock();
  s.slots[requestId] = clone(
    rescheduleSlotsByRequest[requestId] ?? fixtureSlots[requestId] ?? { slots: [], rejections: [] }
  );
}

function readStoredSession(): SessionDTO | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionDTO) : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * Auth
 * ------------------------------------------------------------------------ */

export async function login(email: string, password: string): Promise<SessionDTO> {
  if (MOCK) {
    await sleep(LATENCY_MS);
    const found = sessions.find((s) => s.email.toLowerCase() === email.trim().toLowerCase());
    if (!found || password !== DEMO_PASSWORD) {
      throw new ApiError({ code: "UNAUTHORIZED", message: "Incorrect email or password" });
    }
    const { password: _pw, ...session } = found;
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }
  return request<SessionDTO>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  if (MOCK) {
    await sleep(120);
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  await request<Record<string, never>>("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
}

export async function getMe(): Promise<SessionDTO> {
  if (MOCK) {
    await sleep(140);
    const s = readStoredSession();
    if (!s) throw new ApiError({ code: "UNAUTHORIZED", message: "Not signed in" });
    return s;
  }
  return request<SessionDTO>("/api/auth/me");
}

/* ---------------------------------------------------------------------------
 * Requests
 * ------------------------------------------------------------------------ */

export async function getRequests(params: { status?: string; q?: string } = {}): Promise<RequestListItemDTO[]> {
  if (MOCK) {
    await sleep(LATENCY_MS);
    const s = mock();
    let rows = requestOrder
      .map((id) => s.details[id])
      .filter(Boolean)
      .map<RequestListItemDTO>((d) => ({
        id: d.id,
        candidate: d.candidate,
        jobTitle: d.jobTitle,
        roundType: d.roundType,
        durationMin: d.durationMin,
        status: d.status,
        blockedReason: d.blockedReason,
        booking: d.booking,
      }));
    if (params.status && params.status !== "ALL") rows = rows.filter((r) => r.status === params.status);
    if (params.q) {
      const q = params.q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.candidate.name.toLowerCase().includes(q) ||
          r.candidate.email.toLowerCase().includes(q) ||
          r.jobTitle.toLowerCase().includes(q)
      );
    }
    return rows;
  }
  const qs = new URLSearchParams();
  if (params.status && params.status !== "ALL") qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<RequestListItemDTO[]>(`/api/requests${suffix}`);
}

export async function getRequest(id: string): Promise<RequestDetailDTO> {
  if (MOCK) {
    await sleep(LATENCY_MS);
    const d = mock().details[id];
    if (!d) throw new ApiError({ code: "NOT_FOUND", message: "That interview request no longer exists." });
    return clone(d);
  }
  return request<RequestDetailDTO>(`/api/requests/${id}`);
}

export async function createRequest(body: CreateRequestBody): Promise<RequestDetailDTO> {
  if (MOCK) {
    await sleep(520);
    const s = mock();
    const id = `r_new_${Object.keys(s.details).length}`;
    const selection = previewPanelFixture({
      roundType: body.roundType,
      requiredSkills: body.requiredSkills,
      panelSize: body.panelSize,
    });
    const candidate: CandidateDTO = body.newCandidate
      ? {
          id: `c_new_${id}`,
          name: body.newCandidate.name,
          email: body.newCandidate.email,
          timezone: body.newCandidate.timezone,
        }
      : (Object.values(s.details).find((d) => d.candidate.id === body.candidateId)?.candidate ?? {
          id: body.candidateId ?? "c_unknown",
          name: "Unknown candidate",
          email: "unknown@sira.app",
          timezone: "Asia/Kolkata",
        });

    const detail: RequestDetailDTO = {
      id,
      candidate,
      jobTitle: body.jobTitle,
      roundType: body.roundType,
      durationMin: body.durationMin,
      status: body.sendAvailabilityRequest ? "AWAITING_AVAILABILITY" : "DRAFT",
      blockedReason: null,
      booking: null,
      requiredSkills: body.requiredSkills,
      panelSize: body.panelSize,
      window: body.window,
      candidateWindows: [],
      panel: selection.selected.map((p, i) => ({
        assignmentId: `a_${id}_${p.id}`,
        interviewerId: p.id,
        name: p.name,
        labels: [body.roundType],
        skills: body.requiredSkills,
        load: p.reason.replace(/^.*load /, ""),
        status: "PENDING" as PanelStatus,
        reason: p.reason,
      })),
      notifications: body.sendAvailabilityRequest
        ? [
            {
              id: `n_${++s.notifSeq}`,
              toEmail: candidate.email,
              subject: `Share your availability — ${body.jobTitle}`,
              template: "availability_request",
              status: "SENT",
              createdAt: new Date().toISOString(),
            },
          ]
        : [],
      candidateLink: `/s/demo-${candidate.name.split(" ")[0].toLowerCase()}`,
    };

    s.details[id] = detail;
    s.slots[id] = { slots: [], rejections: [] };
    requestOrder.unshift(id);
    return clone(detail);
  }
  return request<RequestDetailDTO>("/api/requests", { method: "POST", body: JSON.stringify(body) });
}

export async function previewPanel(body: PreviewPanelBody): Promise<SelectionResult> {
  if (MOCK) {
    await sleep(220);
    return previewPanelFixture(body);
  }
  return request<SelectionResult>("/api/requests/preview-panel", { method: "POST", body: JSON.stringify(body) });
}

export async function sendAvailabilityRequest(id: string): Promise<{ candidateLink: string }> {
  if (MOCK) {
    await sleep(LATENCY_MS);
    const d = mock().details[id];
    if (!d) throw new ApiError({ code: "NOT_FOUND", message: "That interview request no longer exists." });
    d.status = "AWAITING_AVAILABILITY";
    pushNotification(id, d.candidate.email, `Share your availability — ${d.jobTitle}`, "availability_request");
    return { candidateLink: d.candidateLink };
  }
  return request<{ candidateLink: string }>(`/api/requests/${id}/availability-request`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getSlots(id: string): Promise<GenerateSlotsResult> {
  if (MOCK) {
    await sleep(380);
    return clone(mock().slots[id] ?? { slots: [], rejections: [] });
  }
  return request<GenerateSlotsResult>(`/api/requests/${id}/slots`);
}

export async function bookSlot(id: string, slot: { startUtc: string; endUtc: string }): Promise<BookingDTO> {
  if (MOCK) {
    await sleep(480);
    const s = mock();
    const d = s.details[id];
    if (!d) throw new ApiError({ code: "NOT_FOUND", message: "That interview request no longer exists." });

    // Simulated race: this slot was taken between generation and confirmation.
    if (s.contested.has(slot.startUtc)) {
      s.contested.delete(slot.startUtc);
      const list = s.slots[id];
      if (list) {
        list.slots = list.slots.filter((x) => x.start !== slot.startUtc).map((x, i) => ({ ...x, rank: i + 1 }));
      }
      throw new ApiError({
        code: "SLOT_NO_LONGER_VALID",
        message: "That slot was just taken. We've refreshed the options below.",
      });
    }

    const booking: BookingDTO = {
      id: `b_${id}_${Date.now()}`,
      startUtc: slot.startUtc,
      endUtc: slot.endUtc,
      status: "CONFIRMED",
      meetLink: `https://meet.google.com/sira-${id.slice(-3)}-bkd`,
    };
    d.booking = booking;
    d.status = "SCHEDULED";
    d.blockedReason = null;
    s.slots[id] = { slots: [], rejections: [] };
    // Console rows (and therefore calendars) pick the new time up immediately.
    syncAssignmentRows(id);
    pushNotification(id, d.candidate.email, "Your interview is confirmed", "booking_confirmed");
    d.panel.forEach((p) => {
      const email = sessions.find((u) => u.id === p.interviewerId)?.email ?? "interviewer@sira.app";
      pushNotification(id, email, `Interview scheduled — ${d.candidate.name}`, "interviewer_booked");
    });
    return booking;
  }
  return request<BookingDTO>(`/api/requests/${id}/book`, { method: "POST", body: JSON.stringify(slot) });
}

export async function cancelRequest(id: string, reason?: string): Promise<void> {
  if (MOCK) {
    await sleep(LATENCY_MS);
    const s = mock();
    const d = s.details[id];
    if (!d) throw new ApiError({ code: "NOT_FOUND", message: "That interview request no longer exists." });
    d.status = "CANCELLED";
    if (d.booking) d.booking = { ...d.booking, status: "CANCELLED" };
    s.slots[id] = { slots: [], rejections: [] };
    syncAssignmentRows(id);
    pushNotification(id, d.candidate.email, "Your interview has been cancelled", "booking_cancelled");
    return;
  }
  await request<Record<string, never>>(`/api/requests/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function rescheduleRequest(id: string, reason?: string): Promise<RescheduleOutcome> {
  if (MOCK) {
    await sleep(520);
    const s = mock();
    const d = s.details[id];
    if (!d) throw new ApiError({ code: "NOT_FOUND", message: "That interview request no longer exists." });

    // Drop the booking: it leaves every panelist's calendar and the admin's
    // Scheduled view, and the row moves to "needs attention" in the pipeline.
    d.booking = null;
    // Panelists are being asked again, so nobody stays "accepted" for a time
    // that no longer exists.
    d.panel.forEach((p) => {
      if (p.status === "ACCEPTED") p.status = "PENDING";
    });
    restoreSlots(id);
    const hasOptions = (s.slots[id]?.slots.length ?? 0) > 0;
    d.status = hasOptions ? "READY_TO_SCHEDULE" : "RESCHEDULE_REQUIRED";
    // The amber marker means "blocked", so it only earns its place when there
    // is genuinely nothing left to pick.
    d.blockedReason = hasOptions
      ? null
      : `Admin asked for a new time${reason?.trim() ? ` (${reason.trim()})` : ""} — none of ${
          d.candidate.name.split(" ")[0]
        }'s earlier windows still work.`;
    syncAssignmentRows(id);
    pushNotification(id, d.candidate.email, "We need to find a new time for your interview", "reschedule_required_candidate");
    d.panel.forEach((p) => {
      const email = sessions.find((u) => u.id === p.interviewerId)?.email ?? "interviewer@sira.app";
      pushNotification(id, email, `Interview being rescheduled — ${d.candidate.name}`, "interviewer_reschedule");
    });

    return {
      outcome: "RESCHEDULE_REQUIRED",
      message: hasOptions
        ? "The booking is released and fresh options are ready below."
        : "No options are left from the candidate's windows — they've been asked for new availability.",
    };
  }
  return request<RescheduleOutcome>(`/api/requests/${id}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/* ---------------------------------------------------------------------------
 * Assignments (interviewer console)
 * ------------------------------------------------------------------------ */

export async function getMyAssignments(): Promise<AssignmentDTO[]> {
  if (MOCK) {
    await sleep(LATENCY_MS);
    const me = readStoredSession();
    if (!me) throw new ApiError({ code: "UNAUTHORIZED", message: "Not signed in" });
    return clone(mock().assignments[me.id] ?? []);
  }
  return request<AssignmentDTO[]>("/api/assignments/mine");
}

export async function respondToAssignment(
  assignmentId: string,
  action: "ACCEPT" | "DECLINE",
  reason?: string
): Promise<RescheduleOutcome> {
  if (MOCK) {
    await sleep(460);
    const s = mock();
    const me = readStoredSession();

    // Find the request this assignment belongs to, whoever is signed in.
    const requestId = Object.keys(s.details).find((id) =>
      s.details[id].panel.some((p) => p.assignmentId === assignmentId)
    );
    const detail = requestId ? s.details[requestId] : undefined;
    const member = detail?.panel.find((p) => p.assignmentId === assignmentId);

    if (!detail || !member || !requestId) {
      throw new ApiError({ code: "NOT_FOUND", message: "That assignment no longer exists." });
    }

    /* -- accept: nothing moves, the calendar entry just becomes confirmed -- */
    if (action === "ACCEPT") {
      member.status = "ACCEPTED";
      syncAssignmentRows(requestId);
      pushNotification(
        requestId,
        detail.candidate.email,
        `${member.name} confirmed your interview`,
        "interviewer_accepted"
      );
      return { outcome: "REPLACED_SAME_TIME", message: "Accepted — the candidate has been told you're confirmed." };
    }

    /* -- decline: logic doc §6A, three branches ---------------------------- */
    const outcome = declineOutcomes[assignmentId] ?? defaultDeclineOutcome;
    const decliner = member.name;

    pushNotification(
      requestId,
      sessions.find((u) => u.id === member.interviewerId)?.email ?? "interviewer@sira.app",
      `You declined — ${detail.candidate.name}`,
      "interviewer_declined"
    );

    if (outcome.outcome === "REPLACED_SAME_TIME" && outcome.newInterviewerName) {
      // Someone free at the same time takes over. The decliner is REPLACED, so
      // the event leaves their calendar and appears on the replacement's —
      // the booking itself never moves, so the candidate sees no change.
      member.status = "REPLACED";
      addReplacement(
        requestId,
        outcome.newInterviewerName,
        `Replacement for ${decliner} · free at the same time, so the candidate's slot is untouched`
      );
      syncAssignmentRows(requestId);
      pushNotification(
        requestId,
        detail.candidate.email,
        `Your interviewer has changed to ${outcome.newInterviewerName}`,
        "interviewer_swapped"
      );
      return outcome;
    }

    if (outcome.outcome === "REBOOKED_NEW_TIME" && outcome.newStartUtc && outcome.newEndUtc) {
      // No same-time cover, so the engine re-books inside the candidate's own
      // windows. Old time off every calendar, new time onto the new panel's.
      member.status = "REPLACED";
      if (outcome.newInterviewerName) {
        addReplacement(
          requestId,
          outcome.newInterviewerName,
          `Replacement for ${decliner} · free in the candidate's existing window at the new time`
        );
      }
      detail.booking = {
        id: detail.booking?.id ?? `b_${requestId}_${Date.now()}`,
        startUtc: outcome.newStartUtc,
        endUtc: outcome.newEndUtc,
        status: "CONFIRMED",
        meetLink: detail.booking?.meetLink ?? `https://meet.google.com/sira-${requestId.slice(-3)}-mvd`,
      };
      detail.status = "SCHEDULED";
      detail.blockedReason = null;
      syncAssignmentRows(requestId);
      pushNotification(requestId, detail.candidate.email, "Your interview has moved", "interview_moved");
      return outcome;
    }

    // §6B — nothing worked. Release the booking and push it back to the admin.
    member.status = "DECLINED";
    detail.booking = null;
    restoreSlots(requestId);
    const stillHasOptions = (s.slots[requestId]?.slots.length ?? 0) > 0;
    detail.status = stillHasOptions ? "READY_TO_SCHEDULE" : "RESCHEDULE_REQUIRED";
    detail.blockedReason = stillHasOptions
      ? null
      : `${decliner} declined${
          reason?.trim() ? ` (${reason.trim()})` : ""
        } and no eligible interviewer is free — this needs a new time.`;
    syncAssignmentRows(requestId);
    pushNotification(
      requestId,
      detail.candidate.email,
      "We need to find a new time for your interview",
      "reschedule_required_candidate"
    );
    pushNotification(
      requestId,
      sessions.find((u) => u.role === "ADMIN")?.email ?? "admin@sira.app",
      `Action needed — ${detail.candidate.name} has no interviewer`,
      "reschedule_required_admin"
    );
    void me;
    return outcome;
  }
  return request<RescheduleOutcome>(`/api/assignments/${assignmentId}/respond`, {
    method: "POST",
    body: JSON.stringify({ action, reason }),
  });
}

/* ---------------------------------------------------------------------------
 * Calendar (interviewer console)
 * ------------------------------------------------------------------------ */

export async function getMyCalendar(source: CalendarSource): Promise<CalendarDTO> {
  if (MOCK) {
    await sleep(source === "google" ? 520 : 240);
    const me = readStoredSession();
    if (!me) throw new ApiError({ code: "UNAUTHORIZED", message: "Not signed in" });
    return buildCalendar(me.id, me.timezone, source, interviewEventsFor(me.id));
  }
  return request<CalendarDTO>(`/api/calendar/mine?source=${source}`);
}

/* ---------------------------------------------------------------------------
 * Dev / demo
 * ------------------------------------------------------------------------ */

export async function resetDemoData(): Promise<SeedSummary> {
  if (MOCK) {
    await sleep(700);
    resetMockState();
    return seedSummary;
  }
  return request<SeedSummary>("/api/dev/seed", { method: "POST", body: JSON.stringify({}) });
}

/** A candidate plus the role they applied to — see `listKnownCandidates`. */
export type KnownCandidate = CandidateDTO & {
  /** Job title from their most recent request, "" if they have none yet. */
  appliedFor: string;
  /** The round that request was for, so the form can default sensibly. */
  lastRoundType: RoundType | null;
};

/**
 * The candidate picker on /requests/new. There is no GET /api/candidates in the
 * contract, so this derives the list from the requests the viewer can already
 * see — which keeps working unchanged once MOCK is off, and gives us the job
 * each candidate applied to without adding a field to CandidateDTO.
 */
export async function listKnownCandidates(): Promise<KnownCandidate[]> {
  const rows = await getRequests();
  const seen = new Map<string, KnownCandidate>();
  // Later rows win, so a candidate's most recent application is the one shown.
  rows.forEach((r) => {
    seen.set(r.candidate.id, {
      ...r.candidate,
      appliedFor: r.jobTitle,
      lastRoundType: r.roundType,
    });
  });
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every interview that has a confirmed booking — the admin's scheduled view. */
export async function getScheduledInterviews(): Promise<RequestListItemDTO[]> {
  const rows = await getRequests({ status: "SCHEDULED" });
  return rows.sort((a, b) => {
    const x = a.booking?.startUtc ?? "";
    const y = b.booking?.startUtc ?? "";
    return x.localeCompare(y);
  });
}
