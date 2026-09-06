import { NextFunction, Request, Response } from "express";
import { redis } from "../lib/redis";
import { AppError, ErrorCodes } from "../types/api";

/**
 * Fixed-window rate limiter backed by Redis, applied specifically to the auth and
 * booking-confirmation endpoints (architecture doc Section 12: rapid-click / retry-storm
 * protection is an explicit edge case, not a generic global limiter on everything).
 */
export function rateLimit({ windowSeconds, max }: { windowSeconds: number; max: number }) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const identity = req.user?.userId ?? req.ip ?? "anonymous";
    const key = `ratelimit:${req.baseUrl}${req.path}:${identity}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (count > max) {
      return next(
        new AppError(ErrorCodes.RATE_LIMITED, "Too many requests — please slow down and try again shortly.", 429, true)
      );
    }
    next();
  };
}
