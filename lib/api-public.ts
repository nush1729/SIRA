import type {
  ApiResponse,
  BookingDTO,
  GenerateSlotsResult,
  PublicRequestDTO,
  TimeWindow,
} from "@/lib/contracts";
import {
  candidateFixtures,
  getMockState,
} from "@/mocks/candidate-fixtures";

export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_API === "true";
}

// In-memory conflict trigger flag for testing SLOT_NO_LONGER_VALID
const conflictTriggers = new Set<string>();

export function triggerConflictOnNextBooking(token: string) {
  conflictTriggers.add(token);
}

/**
 * GET /api/public/[token]
 */
export async function getPublicRequest(token: string): Promise<ApiResponse<PublicRequestDTO>> {
  if (isMockMode()) {
    if (token === "demo-expired") {
      return {
        ok: false,
        error: {
          code: "TOKEN_EXPIRED",
          message: "This link has expired — please contact your recruiter.",
        },
      };
    }

    const base = candidateFixtures.byToken[token];
    if (!base) {
      return {
        ok: false,
        error: {
          code: "INVALID_TOKEN",
          message: "This link is invalid or has expired — please contact your recruiter.",
        },
      };
    }

    const state = getMockState();
    const activeBooking = state.booked[token];
    const data: PublicRequestDTO = {
      ...base,
      status: activeBooking ? "SCHEDULED" : (state.availabilitySubmitted[token] ? "READY_TO_SCHEDULE" : base.status),
      booking: activeBooking
        ? {
            startUtc: activeBooking.startUtc,
            endUtc: activeBooking.endUtc,
            meetLink: activeBooking.meetLink,
            interviewerNames: base.booking?.interviewerNames ?? ["Priya Sharma"],
          }
        : base.booking,
    };

    return { ok: true, data };
  }

  try {
    const res = await fetch(`/api/public/${encodeURIComponent(token)}`);
    const data: ApiResponse<PublicRequestDTO> = await res.json();
    return data;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: err instanceof Error ? err.message : "Network error fetching request",
      },
    };
  }
}

/**
 * POST /api/public/[token]/availability
 */
export async function submitAvailability(
  token: string,
  windows: TimeWindow[]
): Promise<ApiResponse<Record<string, never>>> {
  if (isMockMode()) {
    if (token === "demo-expired") {
      return {
        ok: false,
        error: { code: "TOKEN_EXPIRED", message: "This link has expired." },
      };
    }

    const state = getMockState();
    state.availabilitySubmitted[token] = windows;
    return { ok: true, data: {} };
  }

  try {
    const res = await fetch(`/api/public/${encodeURIComponent(token)}/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windows }),
    });
    const data: ApiResponse<Record<string, never>> = await res.json();
    return data;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: err instanceof Error ? err.message : "Failed to submit availability",
      },
    };
  }
}

/**
 * GET /api/public/[token]/slots
 */
export async function getPublicSlots(token: string): Promise<ApiResponse<GenerateSlotsResult>> {
  if (isMockMode()) {
    if (token === "demo-expired") {
      return {
        ok: false,
        error: { code: "TOKEN_EXPIRED", message: "This link has expired." },
      };
    }

    const slotsResult =
      candidateFixtures.slotsByToken[token] ?? candidateFixtures.slotsByToken["demo-dev"];
    return { ok: true, data: slotsResult };
  }

  try {
    const res = await fetch(`/api/public/${encodeURIComponent(token)}/slots`);
    const data: ApiResponse<GenerateSlotsResult> = await res.json();
    return data;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: err instanceof Error ? err.message : "Failed to load slots",
      },
    };
  }
}

/**
 * POST /api/public/[token]/book
 */
export async function bookPublicSlot(
  token: string,
  startUtc: string,
  endUtc: string
): Promise<ApiResponse<BookingDTO>> {
  if (isMockMode()) {
    if (token === "demo-expired") {
      return {
        ok: false,
        error: { code: "TOKEN_EXPIRED", message: "This link has expired." },
      };
    }

    // Check if simulate conflict is triggered for this token
    if (conflictTriggers.has(token)) {
      conflictTriggers.delete(token);
      return {
        ok: false,
        error: {
          code: "SLOT_NO_LONGER_VALID",
          message: "That time was just taken. Please choose another.",
        },
      };
    }

    const booking: BookingDTO = {
      id: `booking-${Date.now()}`,
      startUtc,
      endUtc,
      status: "CONFIRMED",
      meetLink: `https://meet.google.com/mock-${token}`,
    };

    const state = getMockState();
    state.booked[token] = booking;

    return { ok: true, data: booking };
  }

  try {
    const res = await fetch(`/api/public/${encodeURIComponent(token)}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startUtc, endUtc }),
    });
    const data: ApiResponse<BookingDTO> = await res.json();
    return data;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "SLOT_NO_LONGER_VALID",
        message: err instanceof Error ? err.message : "Failed to book slot",
      },
    };
  }
}

/**
 * GET /api/public/[token]/reschedule-slots
 */
export async function getRescheduleSlots(
  token: string
): Promise<ApiResponse<GenerateSlotsResult>> {
  if (isMockMode()) {
    if (token === "demo-expired") {
      return {
        ok: false,
        error: { code: "TOKEN_EXPIRED", message: "This link has expired." },
      };
    }

    const slotsResult =
      candidateFixtures.rescheduleSlotsByToken[token] ?? { slots: [], rejections: [] };
    return { ok: true, data: slotsResult };
  }

  try {
    const res = await fetch(`/api/public/${encodeURIComponent(token)}/reschedule-slots`);
    const data: ApiResponse<GenerateSlotsResult> = await res.json();
    return data;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: err instanceof Error ? err.message : "Failed to load reschedule options",
      },
    };
  }
}
