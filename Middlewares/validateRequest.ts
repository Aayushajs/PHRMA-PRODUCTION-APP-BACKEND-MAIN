/*
┌───────────────────────────────────────────────────────────────────────┐
│  validateRequest - Higher-order Zod validation middleware.            │
│  Parses & sanitizes req.body / req.query / req.params and forwards    │
│  to the project's standard error envelope on failure.                 │
└───────────────────────────────────────────────────────────────────────┘
*/

import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { ApiError } from "../Utils/errors/ApiError";

export interface ValidationSchemas {
    body?: ZodTypeAny;
    query?: ZodTypeAny;
    params?: ZodTypeAny;
}

/**
 * Format the first zod issue into a single human-friendly message.
 * Mirrors the legacy services' message style ("X is required").
 */
const formatIssue = (
    section: "body" | "query" | "params",
    issue: { path: ReadonlyArray<PropertyKey>; message: string }
): string => {
    const pathStr =
        issue.path.length > 0
            ? issue.path.map((p) => String(p)).join(".")
            : section;
    return `${pathStr}: ${issue.message}`;
};

export const validateRequest = (schemas: ValidationSchemas): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction) => {
        // body
        if (schemas.body) {
            const parsed = schemas.body.safeParse(req.body ?? {});
            if (!parsed.success) {
                const firstIssue = parsed.error.issues[0];
                const msg = firstIssue ? formatIssue("body", firstIssue) : "Invalid request body";
                return next(new ApiError(400, msg));
            }
            // Mutate req.body to the parsed (cleaned/coerced) value so the
            // downstream service receives sanitized input.
            (req as any).body = parsed.data;
        }

        // query — Express 5 may make req.query a getter; assign defensively.
        if (schemas.query) {
            const parsed = schemas.query.safeParse(req.query ?? {});
            if (!parsed.success) {
                const firstIssue = parsed.error.issues[0];
                const msg = firstIssue ? formatIssue("query", firstIssue) : "Invalid query parameters";
                return next(new ApiError(400, msg));
            }
            try {
                (req as any).query = parsed.data;
            } catch {
                // If query is non-writable, attach a parsed snapshot the
                // service can use (services here read req.query directly, so
                // we deliberately don't fail — original req.query is still
                // valid and shape-compatible).
                Object.defineProperty(req, "validatedQuery", {
                    value: parsed.data,
                    writable: true,
                    configurable: true,
                });
            }
        }

        // params
        if (schemas.params) {
            const parsed = schemas.params.safeParse(req.params ?? {});
            if (!parsed.success) {
                const firstIssue = parsed.error.issues[0];
                const msg = firstIssue ? formatIssue("params", firstIssue) : "Invalid path parameters";
                return next(new ApiError(400, msg));
            }
            (req as any).params = parsed.data;
        }

        return next();
    };
};

export default validateRequest;
