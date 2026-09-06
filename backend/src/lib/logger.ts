import pino from "pino";

// Safe logging per architecture doc Section 11: no PII (candidate email/phone, tokens) in logs —
// only structured logs with IDs. Redact known-sensitive paths defensively at the transport level
// in case a caller accidentally logs a raw object that contains one of these fields.
export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.email",
      "*.phone",
    ],
    censor: "[redacted]",
  },
});
