/*
┌───────────────────────────────────────────────────────────────────────┐
│  FeatureFlag Service - Business logic for feature flag management.    │
│  Implements Redis caching with MongoDB fallback for high performance. │
│ Cache Strategy: Read from Redis → Fallback to MongoDB → Update Cache │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Response, Request, NextFunction } from "express";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import { ApiError } from "../Utils/ApiError";
import FeatureFlagModel from "../Databases/Models/featureFlag.Models";
import { redis, isRedisAvailable } from "../config/redis";
import { IFeatureFlag } from "../Databases/Entities/featureFlag.Interface";
import RoleIndex from "../Utils/Roles.enum";

// Redis cache configuration
const CACHE_PREFIX = "feature_flag:";
const CACHE_TTL = 3600; // 1 hour
const ALL_FLAGS_CACHE_KEY = "feature_flag:all";

export default class FeatureFlagService {
  
  // ============================================================
  // CACHE UTILITIES
  // ============================================================

  /**
   * Get feature flag from cache
   * @param key - Feature flag key
   * @returns Cached flag or null
   */
  private static async getFromCache(key: string): Promise<IFeatureFlag | null> {
    if (!isRedisAvailable()) return null;
    
    try {
      const cached = await redis.get(`${CACHE_PREFIX}${key}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error(`Cache read error for ${key}:`, error);
    }
    return null;
  }

  /**
   * Set feature flag in cache
   * @param key - Feature flag key
   * @param flag - Feature flag data
   */
  private static async setCache(key: string, flag: IFeatureFlag): Promise<void> {
    if (!isRedisAvailable()) return;
    
    try {
      await redis.setEx(
        `${CACHE_PREFIX}${key}`,
        CACHE_TTL,
        JSON.stringify(flag)
      );
    } catch (error) {
      console.error(`Cache write error for ${key}:`, error);
    }
  }

  /**
   * Invalidate specific feature flag cache
   * @param key - Feature flag key
   */
  private static async invalidateCache(key: string): Promise<void> {
    if (!isRedisAvailable()) return;
    
    try {
      await redis.del(`${CACHE_PREFIX}${key}`);
      await redis.del(ALL_FLAGS_CACHE_KEY); // Also invalidate "all flags" cache
    } catch (error) {
      console.error(`Cache invalidation error for ${key}:`, error);
    }
  }

  /**
   * Invalidate all feature flags cache
   */
  private static async invalidateAllCache(): Promise<void> {
    if (!isRedisAvailable()) return;
    
    try {
      const keys = await redis.keys(`${CACHE_PREFIX}*`);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    } catch (error) {
      console.error("Cache invalidation error:", error);
    }
  }

  // ============================================================
  // FEATURE FLAG EVALUATION LOGIC
  // ============================================================

  /**
   * Check if feature is enabled for a specific user
   * Core business logic for feature flag evaluation
   * 
   * @param featureKey - Feature flag key (e.g., "ONLINE_PAYMENT")
   * @param userId - User ID to check
   * @param userRole - User role (ADMIN, CUSTOMER, etc.)
   * @returns boolean - Whether feature is enabled for this user
   */
  public static async isFeatureEnabled(
    featureKey: string,
    userId: string,
    userRole: RoleIndex
  ): Promise<boolean> {
    try {
      // Step 1: Try to get from cache
      let flag = await this.getFromCache(featureKey);

      // Step 2: If not in cache, fetch from MongoDB
      if (!flag) {
        const dbFlag = await FeatureFlagModel.findOne({ key: featureKey.toUpperCase() });
        if (!dbFlag) {
          return false; // Feature flag doesn't exist
        }
        
        flag = dbFlag.toObject();
        
        // Step 3: Populate cache for next time
        await this.setCache(featureKey, flag);
      }

      // Step 4: Check if globally disabled
      if (!flag.enabled) {
        return false;
      }

      // Step 5: Check if user is in whitelist (highest priority)
      if (flag.allowedUserIds && flag.allowedUserIds.length > 0) {
        const isWhitelisted = flag.allowedUserIds.some(
          (id) => id.toString() === userId
        );
        if (isWhitelisted) {
          return true; // Whitelist bypasses all other checks
        }
      }

      // Step 6: Check role-based access
      if (flag.allowedRoles && flag.allowedRoles.length > 0) {
        if (!flag.allowedRoles.includes(userRole)) {
          return false; // User role not allowed
        }
      }

      // Step 7: Apply rollout percentage
      if (flag.rolloutPercentage < 100) {
        // Use deterministic hash for consistent rollout
        const hash = this.hashUserId(userId);
        const userPercentile = hash % 100;
        
        if (userPercentile >= flag.rolloutPercentage) {
          return false; // User not in rollout percentage
        }
      }

      return true; // All checks passed

    } catch (error) {
      console.error(`Feature flag evaluation error for ${featureKey}:`, error);
      return false; // Fail closed (disable feature on error)
    }
  }

  /**
   * Simple hash function for consistent user rollout
   * Same user always gets same percentage bucket
   */
  private static hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // ============================================================
  // ADMIN CRUD OPERATIONS
  //============================================================

  /**
   * Create a new feature flag
   */
  public static createFeatureFlag = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const {
        key,
        name,
        description,
        enabled,
        allowedRoles,
        allowedUserIds,
        rolloutPercentage,
      } = req.body;

      // Validation
      if (!key || !name) {
        return next(new ApiError(400, "Key and name are required"));
      }

      // Check if feature flag already exists
      const existing = await FeatureFlagModel.findOne({ key: key.toUpperCase() });
      if (existing) {
        return next(new ApiError(400, `Feature flag '${key}' already exists`));
      }

      // Create new feature flag
      const newFlag = await FeatureFlagModel.create({
        key: key.toUpperCase(),
        name,
        description: description || "",
        enabled: enabled !== undefined ? enabled : false,
        allowedRoles: allowedRoles || [],
        allowedUserIds: allowedUserIds || [],
        rolloutPercentage: rolloutPercentage !== undefined ? rolloutPercentage : 0,
      });

      // Cache the new flag
      await this.setCache(newFlag.key, newFlag.toObject());

      res.status(201).json({
        success: true,
        message: "Feature flag created successfully",
        data: newFlag
      });
    }
  );

  /**
   * Get all feature flags (Admin only)
   */
  public static getAllFeatureFlags = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      // Try cache first
      if (isRedisAvailable()) {
        try {
          const cached = await redis.get(ALL_FLAGS_CACHE_KEY);
          if (cached) {
            const flags = JSON.parse(cached);
            return res.status(200).json({
              success: true,
              message: "Feature flags retrieved from cache",
              data: flags
            });
          }
        } catch (error) {
          console.error("Cache read error:", error);
        }
      }

      // Fetch from database
      const flags = await FeatureFlagModel.find().sort({ createdAt: -1 });

      // Cache the result
      if (isRedisAvailable()) {
        try {
          await redis.setEx(ALL_FLAGS_CACHE_KEY, CACHE_TTL, JSON.stringify(flags));
        } catch (error) {
          console.error("Cache write error:", error);
        }
      }

      res.status(200).json({
        success: true,
        message: "Feature flags retrieved successfully",
        data: flags
      });
    }
  );

  /**
   * Get single feature flag by key (Admin only)
   */
  public static getFeatureFlagByKey = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { key } = req.params;

      if (!key) {
        return next(new ApiError(400, "Feature key is required"));
      }

      // Try cache first
      let flag = await this.getFromCache(key.toUpperCase());

      // Fallback to database
      if (!flag) {
        const dbFlag = await FeatureFlagModel.findOne({ key: key.toUpperCase() });
        if (!dbFlag) {
          return next(new ApiError(404, `Feature flag '${key}' not found`));
        }
        flag = dbFlag.toObject();
        await this.setCache(key.toUpperCase(), flag);
      }

      res.status(200).json({
        success: true,
        message: "Feature flag retrieved successfully",
        data: flag
      });
    }
  );

  /**
   * Update a feature flag
   */
  public static updateFeatureFlag = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { key } = req.params;
      const updates = req.body;

      if (!key) {
        return next(new ApiError(400, "Feature key is required"));
      }

      // Find and update
      const updatedFlag = await FeatureFlagModel.findOneAndUpdate(
        { key: key.toUpperCase() },
        updates,
        { new: true, runValidators: true }
      );

      if (!updatedFlag) {
        return next(new ApiError(404, `Feature flag '${key}' not found`));
      }

      // Invalidate cache to force refresh
      await this.invalidateCache(key.toUpperCase());

      res.status(200).json({
        success: true,
        message: "Feature flag updated successfully",
        data: updatedFlag
      });
    }
  );

  /**
   * Delete a feature flag
   */
  public static deleteFeatureFlag = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { key } = req.params;

      if (!key) {
        return next(new ApiError(400, "Feature key is required"));
      }

      const deletedFlag = await FeatureFlagModel.findOneAndDelete({
        key: key.toUpperCase(),
      });

      if (!deletedFlag) {
        return next(new ApiError(404, `Feature flag '${key}' not found`));
      }

      // Invalidate cache
      await this.invalidateCache(key.toUpperCase());

      res.status(200).json({
        success: true,
        message: "Feature flag deleted successfully",
        data: { key: deletedFlag.key }
      });
    }
  );

  /**
   * Bulk update multiple feature flags
   */
  public static bulkUpdateFeatureFlags = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { updates } = req.body; // Array of { key, enabled }

      if (!Array.isArray(updates) || updates.length === 0) {
        return next(new ApiError(400, "Updates array is required"));
      }

      const results = [];

      for (const update of updates) {
        const { key, enabled } = update;
        if (!key) continue;

        const updatedFlag = await FeatureFlagModel.findOneAndUpdate(
          { key: key.toUpperCase() },
          { enabled },
          { new: true }
        );

        if (updatedFlag) {
          await this.invalidateCache(key.toUpperCase());
          results.push(updatedFlag);
        }
      }

      res.status(200).json({
        success: true,
        message: `${results.length} feature flags updated successfully`,
        data: results
      });
    }
  );

  // ============================================================
  // PUBLIC API FOR FRONTEND
  // ============================================================

  /**
   * Get all enabled features for current user
   * Returns: { "ONLINE_PAYMENT": true, "AI_CHATBOT": false, ... }
   */
  /**
   * GET /api/v1/features
   * Get all feature flags for the authenticated user
   * Filters by user role and returns boolean map
   */
  public static getUserFeatures = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user?._id;
      const userRole = req.user?.role as RoleIndex;

      if (!userId || !userRole) {
        return next(new ApiError(401, "Unauthorized: User not authenticated"));
      }

      console.log(`[FeatureFlags] Fetching features for User: ${userId}, Role: ${userRole}`);

      // Get all feature flags
      const flags = await FeatureFlagModel.find();

      // Evaluate each flag for this user
      const userFeatures: Record<string, boolean> = {};

      for (const flag of flags) {
        const isEnabled = await this.isFeatureEnabled(
          flag.key,
          userId,
          userRole
        );
        userFeatures[flag.key] = isEnabled;
        
        // Log role-based filtering for debugging
        if (flag.allowedRoles && flag.allowedRoles.length > 0) {
          const hasRole = flag.allowedRoles.includes(userRole);
          console.log(`[FeatureFlag] ${flag.key}: enabled=${flag.enabled}, allowedRoles=[${flag.allowedRoles.join(',')}], userRole=${userRole}, hasRole=${hasRole}, result=${isEnabled}`);
        }
      }

      console.log(`[FeatureFlags] Returning ${Object.keys(userFeatures).length} features for ${userRole}`);

      res.status(200).json({
        success: true,
        message: "User features retrieved successfully",
        data: userFeatures
      });
    }
  );

  /**
   * Clear all feature flag cache (Admin only - for debugging)
   */
  public static clearCache = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      await this.invalidateAllCache();
      res.status(200).json({
        success: true,
        message: "Feature flag cache cleared successfully",
        data: null
      });
    }
  );
}
