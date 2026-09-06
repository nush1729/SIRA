import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";
import { AppError, ErrorCodes } from "../types/api";

type Source = "body" | "query" | "params";

/**
 * Schema validation at the API boundary (architecture doc Section 11: "validate and sanitize
 * inputs"). Rejects unknown fields via the schema's own `.strict()` where the route defines it;
 * this middleware just wires the parse + error translation.
 */
export function validate(schema: ZodTypeAny, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      return next(
        new AppError(
          ErrorCodes.VALIDATION_ERROR,
          `Invalid ${source}: ${JSON.stringify(fieldErrors)}`,
          400
        )
      );
    }
    req[source] = result.data;
    next();
  };
}
