import { NextFunction, Request, Response } from "express";
import { v4 as uuid } from "uuid";
import { logger } from "../lib/logger";
import { AppError } from "../types/api";

// Standard envelope for every response, success or failure — see architecture doc 7.11.
export function attachRequestId(req: Request, res: Response, next: NextFunction) {
  res.locals.requestId = uuid();
  next();
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    data: null,
    error: { code: "NOT_FOUND", message: "No such route.", retryable: false },
    meta: { request_id: res.locals.requestId },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = res.locals.requestId ?? "unknown";

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, "Unhandled application error");
    }
    return res.status(err.statusCode).json({
      data: null,
      error: { code: err.code, message: err.message, retryable: err.retryable },
      meta: { request_id: requestId },
    });
  }

  logger.error({ err, requestId }, "Unexpected error");
  res.status(500).json({
    data: null,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", retryable: true },
    meta: { request_id: requestId },
  });
}
