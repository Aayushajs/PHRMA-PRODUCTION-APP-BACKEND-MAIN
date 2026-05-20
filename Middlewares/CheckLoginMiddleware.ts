/**
 * Service-Level Authorization Middleware
 * Supports 2 authentication modes:
 * 1. Gateway Mode: User info from headers (x-user-id, x-user-role, x-user-email)
 * 2. Direct Mode: Token from Authorization header or Cookie
 */

import { Request, Response, NextFunction } from "express";
import { ApiError } from "../Utils/ApiError";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import RoleIndex from "../Utils/Roles.enum";
import { verifyAccessToken } from "../Utils/jwtToken";
import dotenv from "dotenv";

dotenv.config({ path: "./config/.env" });

const isValidInternalServiceRequest = (req: Request): boolean => {
  const expectedKey = process.env.INTERNAL_SERVICE_API_KEY;
  const providedKey = req.headers["x-internal-api-key"];

  return Boolean(expectedKey && providedKey && providedKey === expectedKey);
};

// Extend Express Request to include user object
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

// Extract user info from request headers (Gateway mode)
const extractUserFromHeaders = (req: Request) => {
  if (!isValidInternalServiceRequest(req)) {
    return null;
  }

  const userId = req.headers["x-user-id"] as string;
  const userRole = req.headers["x-user-role"] as string;
  const userEmail = req.headers["x-user-email"] as string;

  if (!userId || !userRole) {
    return null;
  }

  return {
    _id: userId,
    role: userRole,
    email: userEmail || "",
  };
};

// Extract and verify user from JWT token (Direct mode)
const extractUserFromToken = (req: Request) => {
  try {
    // Priority: Authorization Bearer → accessToken cookie → legacy userToken cookie.
    let token = req.headers.authorization?.split(" ")[1];

    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token && req.cookies?.userToken) {
      // Legacy fallback — old frontend builds still send userToken.
      token = req.cookies.userToken;
    }

    if (!token) {
      return null;
    }

    // Verify token signature with pinned HS256 algorithm.
    const decoded = verifyAccessToken(token) as any;
    return {
      _id: decoded._id,
      role: decoded.role,
      email: decoded.email,
    };
  } catch (error) {
    return null;
  }
};

// Get user info using multiple fallback methods
const getUserInfo = (req: Request) => {
  // First try getting user from Gateway headers
  let user = extractUserFromHeaders(req);
  
  // Fall back to token-based authentication
  if (!user) {
    user = extractUserFromToken(req);
  }

  return user;
};

// Middleware: Allow only CUSTOMER role users
export const customersMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = getUserInfo(req);

    if (!user) {
      return next(new ApiError(401, "Unauthorized: Please login first"));
    }

    if (user.role !== RoleIndex.CUSTOMER) {
      return next(new ApiError(403, "Forbidden: Customer access required"));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new ApiError(500, "Internal server error"));
  }
};

// Middleware: Allow only ADMIN role users
export const adminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = getUserInfo(req);

    if (!user) {
      return next(new ApiError(401, "Unauthorized: Please login first"));
    }

    if (user.role !== RoleIndex.ADMIN) {
      return next(new ApiError(403, "Forbidden: Admin access required"));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new ApiError(500, "Internal server error"));
  }
};

// Middleware: Allow both CUSTOMER and ADMIN users
export const userMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = getUserInfo(req);

    if (!user) {
      return next(new ApiError(401, "Unauthorized: Please login first"));
    }

    const allowedRoles = [RoleIndex.CUSTOMER, RoleIndex.ADMIN];
    if (!allowedRoles.includes(user.role as any)) {
      return next(new ApiError(403, "Forbidden: Access denied"));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new ApiError(500, "Internal server error"));
  }
};

// Middleware: Allow any authenticated user (any role)
export const authenticatedUserMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = getUserInfo(req);

    if (!user) {
      return next(new ApiError(401, "Unauthorized: Please login first"));
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new ApiError(500, "Internal server error"));
  }
};

// Flexible role middleware - allow specific roles
// Usage: roleMiddleware(RoleIndex.ADMIN, RoleIndex.VENDOR)
export const roleMiddleware = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getUserInfo(req);

      if (!user) {
        return next(new ApiError(401, "Unauthorized: Please login first"));
      }

      if (!allowedRoles.includes(user.role)) {
        return next(
          new ApiError(
            403,
            `Forbidden: Only ${allowedRoles.join(", ")} can access this`
          )
        );
      }

      req.user = user;
      next();
    } catch (error) {
      return next(new ApiError(500, "Internal server error"));
    }
  };
};
