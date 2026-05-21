/**
 * Service-Level Authorization Middleware
 * Supports 2 authentication modes:
 * 1. Gateway Mode: User info from headers (x-user-id, x-user-role, x-user-email)
 * 2. Direct Mode: Token from Authorization header or Cookie
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  DRY Design: all exported middlewares are thin wrappers around the   │
 * │  single roleMiddleware() factory — no duplicated try/catch blocks.   │
 * └──────────────────────────────────────────────────────────────────────┘
 */

import { Request, Response, NextFunction } from "express";
import { ApiError } from "../Utils/errors/ApiError";
import RoleIndex from "../Utils/auth/Roles.enum";
import { verifyAccessToken } from "../Utils/auth/jwtToken";
import dotenv from "dotenv";

dotenv.config({ path: "./config/.env" });

// ─── Type augmentation ────────────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        role: string;
        email: string;
      };
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isValidInternalServiceRequest = (req: Request): boolean => {
  const expectedKey = process.env.INTERNAL_SERVICE_API_KEY;
  const providedKey = req.headers["x-internal-api-key"];
  return Boolean(expectedKey && providedKey && providedKey === expectedKey);
};

/** Extract user from trusted Gateway headers (only when x-internal-api-key matches). */
const extractUserFromHeaders = (req: Request) => {
  if (!isValidInternalServiceRequest(req)) return null;

  const userId    = req.headers["x-user-id"]    as string;
  const userRole  = req.headers["x-user-role"]  as string;
  const userEmail = req.headers["x-user-email"] as string;

  if (!userId || !userRole) return null;

  return { _id: userId, role: userRole, email: userEmail || "" };
};

/** Extract and verify user from a JWT (Bearer header → accessToken cookie → legacy userToken cookie). */
const extractUserFromToken = (req: Request) => {
  try {
    let token = req.headers.authorization?.split(" ")[1];

    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token && req.cookies?.userToken) {
      // Legacy fallback — old frontend builds still send userToken.
      token = req.cookies.userToken;
    }

    if (!token) return null;

    // Verify with pinned HS256 algorithm (rejects RS256/HS512/alg:none attacks).
    const decoded = verifyAccessToken(token) as any;
    return {
      _id:   decoded._id,
      role:  decoded.role,
      email: decoded.email,
    };
  } catch {
    return null;
  }
};

/** Gateway headers take priority; falls back to JWT token. */
const getUserInfo = (req: Request) =>
  extractUserFromHeaders(req) ?? extractUserFromToken(req);

// ─── Core factory ─────────────────────────────────────────────────────────────

/**
 * Role-based middleware factory.
 *
 * - Pass no roles  → any authenticated user is allowed  (authenticatedUserMiddleware)
 * - Pass one role  → only that role is allowed           (adminMiddleware / customersMiddleware)
 * - Pass N roles   → any of those roles is allowed       (userMiddleware)
 *
 * Usage:
 *   router.get('/admin-only', roleMiddleware(RoleIndex.ADMIN), handler);
 *   router.get('/users',      roleMiddleware(RoleIndex.ADMIN, RoleIndex.CUSTOMER), handler);
 *   router.get('/me',         roleMiddleware(), handler);  // any auth
 */
export const roleMiddleware = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = getUserInfo(req);

      if (!user) {
        next(new ApiError(401, "Unauthorized: Please login first"));
        return;
      }

      if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        const who = allowedRoles.join(", ");
        next(new ApiError(403, `Forbidden: Only ${who} can access this`));
        return;
      }

      req.user = user;
      next();
    } catch {
      next(new ApiError(500, "Internal server error"));
    }
  };
};

// ─── Named convenience exports (backward-compatible) ─────────────────────────

/** Allow only CUSTOMER role. */
export const customersMiddleware = roleMiddleware(RoleIndex.CUSTOMER);

/** Allow only ADMIN role. */
export const adminMiddleware = roleMiddleware(RoleIndex.ADMIN);

/** Allow CUSTOMER or ADMIN. */
export const userMiddleware = roleMiddleware(RoleIndex.CUSTOMER, RoleIndex.ADMIN);

/** Allow any authenticated user (any role). */
export const authenticatedUserMiddleware = roleMiddleware();
