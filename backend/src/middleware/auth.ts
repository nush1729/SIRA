import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError, ErrorCodes } from "../types/api";
import { AuthenticatedUser } from "../types/auth";

/**
 * Verifies the access JWT and attaches the resolved (userId, organizationId, roles) to the
 * request. Every downstream RBAC check reads from req.user — never from a client-sent claim
 * that bypassed this middleware. See architecture doc Section 11 (Security).
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(ErrorCodes.UNAUTHORIZED, "Missing or malformed Authorization header", 401));
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthenticatedUser & { exp: number };
    req.user = {
      userId: payload.userId,
      organizationId: payload.organizationId,
      roles: payload.roles,
    };
    next();
  } catch {
    next(new AppError(ErrorCodes.UNAUTHORIZED, "Invalid or expired access token", 401));
  }
}
