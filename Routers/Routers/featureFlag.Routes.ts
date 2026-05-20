/*
┌───────────────────────────────────────────────────────────────────────┐
│  FeatureFlag Routes - API endpoints for feature flag management.      │
│  Admin routes for CRUD operations + Public route for frontend.        │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from "express";
import FeatureFlagService from "../../Services/featureFlag.Service";
import { adminMiddleware } from "../../Middlewares/CheckLoginMiddleware";
import { catchAsyncErrors } from "../../Utils/catchAsyncErrors";
import { validateRequest } from "../../Middlewares/validateRequest";
import {
  createFeatureFlagSchema,
  updateFeatureFlagBodySchema,
  featureFlagKeyParamsSchema,
  bulkUpdateFeatureFlagsSchema,
} from "../../Validators/featureFlag.Validator";

const featureFlagRouter = Router();

// ============================================================
// ADMIN ROUTES - Feature Flag Management
// ============================================================

/**
 * POST /api/feature-flags
 * Create a new feature flag
 * Access: Admin only
 */
featureFlagRouter.post(
  "/create",
  adminMiddleware,
  validateRequest({ body: createFeatureFlagSchema }),
  FeatureFlagService.createFeatureFlag
);

/**
 * GET /api/feature-flags
 * Get all feature flags (detailed view for admin)
 * Access: Admin only
 */
featureFlagRouter.get(
  "/",
  adminMiddleware,
  FeatureFlagService.getAllFeatureFlags
);

/**
 * GET /api/feature-flags/:key
 * Get a specific feature flag by key
 * Access: Admin only
 */
featureFlagRouter.get(
  "/:key",
  adminMiddleware,
  validateRequest({ params: featureFlagKeyParamsSchema }),
  FeatureFlagService.getFeatureFlagByKey
);

/**
 * PUT /api/feature-flags/:key
 * Update a feature flag
 * Access: Admin only
 */
featureFlagRouter.put(
  "/:key",
  adminMiddleware,
  validateRequest({ params: featureFlagKeyParamsSchema, body: updateFeatureFlagBodySchema }),
  FeatureFlagService.updateFeatureFlag
);

/**
 * DELETE /api/feature-flags/:key
 * Delete a feature flag
 * Access: Admin only
 */
featureFlagRouter.delete(
  "/:key",
  adminMiddleware,
  validateRequest({ params: featureFlagKeyParamsSchema }),
  FeatureFlagService.deleteFeatureFlag
);

/**
 * POST /api/feature-flags/bulk-update
 * Bulk update multiple feature flags (e.g., enable/disable many at once)
 * Access: Admin only
 */
featureFlagRouter.post(
  "/bulk-update",
  adminMiddleware,
  validateRequest({ body: bulkUpdateFeatureFlagsSchema }),
  FeatureFlagService.bulkUpdateFeatureFlags
);

/**
 * DELETE /api/feature-flags/cache/clear
 * Clear all feature flag cache (debugging/admin utility)
 * Access: Admin only
 */
featureFlagRouter.delete(
  "/cache/clear",
  adminMiddleware,
  FeatureFlagService.clearCache
);

export default featureFlagRouter;
