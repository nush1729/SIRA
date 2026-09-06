import { Role } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { AppError, ErrorCodes } from "../types/api";

/**
 * Server-side RBAC gate. This is the only place a route decides "is this role allowed here" —
 * never inferred client-side. Per architecture doc Section 11: role is resolved from the
 * RoleAssignment table via the JWT claims set at login, not trusted from any request body.
 */
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const roles = req.user?.roles ?? [];
    const hasRole = roles.some((role) => allowed.includes(role));
    if (!hasRole) {
      return next(new AppError(ErrorCodes.FORBIDDEN, "You do not have permission to perform this action", 403));
    }
    next();
  };
}

/**
 * Use for "self OR one of these roles" checks (e.g. a user editing their own profile, or an
 * Admin editing anyone's). `getResourceOwnerId` extracts the owning user id from the request
 * (e.g. req.params.id) so this doesn't need per-route boilerplate.
 */
export function requireSelfOrRole(getResourceOwnerId: (req: Request) => string, ...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const roles = req.user?.roles ?? [];
    const isSelf = req.user?.userId === getResourceOwnerId(req);
    const hasRole = roles.some((role) => allowed.includes(role));
    if (!isSelf && !hasRole) {
      return next(new AppError(ErrorCodes.FORBIDDEN, "You do not have permission to perform this action", 403));
    }
    next();
  };
}
