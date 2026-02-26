/*
┌───────────────────────────────────────────────────────────────────────┐
│  Feature Flag Middleware - Protect routes with feature flags.         │
│  Use requireFeature("FEATURE_KEY") to guard routes dynamically.        │
│  Returns 403 Forbidden if feature is disabled for the user.           │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from "express";
import { ApiError } from "../Utils/ApiError";
import FeatureFlagService from "../Services/featureFlag.Service";
import RoleIndex from "../Utils/Roles.enum";

/**
 * Middleware factory to protect routes with feature flags
 * 
 * Usage in routes:
 * ```typescript
 * router.get('/featured', requireFeature('FEATURED_MEDICINES'), getFeaturedItems);
 * router.post('/payment', requireFeature('ONLINE_PAYMENT'), processPayment);
 * ```
 * 
 * @param featureKey - The feature flag key to check
 * @returns Express middleware function
 */
export const requireFeature = (featureKey: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extract user info from request (set by CheckLoginMiddleware)
      const userId = req.user?._id;
      const userRole = req.user?.role as RoleIndex;

      // If no user info, deny access
      if (!userId || !userRole) {
        return next(
          new ApiError(
            401,
            "Unauthorized: Please login to access this feature"
          )
        );
      }

      // Check if feature is enabled for this user
      const isEnabled = await FeatureFlagService.isFeatureEnabled(
        featureKey,
        userId,
        userRole
      );

      if (!isEnabled) {
        return next(
          new ApiError(
            403,
            `Feature '${featureKey}' is not available for your account`
          )
        );
      }

      // Feature is enabled, proceed to next middleware/controller
      next();
    } catch (error) {
      console.error(`Feature flag middleware error for ${featureKey}:`, error);
      
      // Fail closed: deny access on error
      return next(
        new ApiError(
          500,
          "Unable to verify feature access. Please try again later."
        )
      );
    }
  };
};

/**
 * Optional middleware to attach feature flags to request object
 * Useful for conditional logic in controllers without hard-coded checks
 * 
 * Usage:
 * ```typescript
 * router.use(attachUserFeatures);
 * router.get('/dashboard', (req, res) => {
 *   if (req.features?.ONLINE_PAYMENT) {
 *     // Show payment button
 *   }
 * });
 * ```
 */
export const attachUserFeatures = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;
    const userRole = req.user?.role as RoleIndex;

    if (!userId || !userRole) {
      // No user logged in, attach empty features
      (req as any).features = {};
      return next();
    }

    // This could be optimized by caching per user
    // For now, we'll skip attaching features to avoid performance overhead
    // Controllers should use FeatureFlagService.isFeatureEnabled() directly if needed
    
    (req as any).features = {}; // Placeholder
    next();
  } catch (error) {
    console.error("Error attaching user features:", error);
    (req as any).features = {};
    next();
  }
};
