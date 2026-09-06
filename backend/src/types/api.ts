// Mirrors the response envelope defined in smart-interview-scheduler-architecture.md Section 7.11.

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ApiEnvelope<T> {
  data: T | null;
  error: ApiError | null;
  meta: { request_id: string };
}

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public retryable = false
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Central catalogue of error codes referenced across services — keeps client-facing codes
// consistent instead of ad-hoc strings scattered through the codebase.
export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  SLOT_ALREADY_BOOKED: "SLOT_ALREADY_BOOKED",
  SLOT_EXPIRED: "SLOT_EXPIRED",
  LOOP_SLOT_EXPIRED: "LOOP_SLOT_EXPIRED",
  SKILL_IN_USE: "SKILL_IN_USE",
  RATE_LIMITED: "RATE_LIMITED",
} as const;
