/*
┌───────────────────────────────────────────────────────────────────────┐
│  TTL Checker - Validates cache freshness and expiration.              │
│  Determines if data needs refresh based on TTL configuration.         │
└───────────────────────────────────────────────────────────────────────┘
*/

import { IAggregatedResult } from "../Databases/Entities/aggregatedResult.interface";

/**
 * Default TTL configurations (in seconds)
 */
export const TTL_CONFIG = {
  AGGREGATION_DEFAULT: 1800, // 30 minutes
  AGGREGATION_MIN: 300, // 5 minutes (minimum refresh interval)
  AGGREGATION_MAX: 3600, // 1 hour (maximum cache lifetime)
  CACHE_CHECK_INTERVAL: 60, // Check freshness every 60 seconds
} as const;

/**
 * Cache status determination
 */
export enum CacheStatus {
  FRESH = "fresh",
  STALE = "stale",
  EXPIRED = "expired",
}

/**
 * Calculates cache expiration time based on creation and TTL
 */
export const calculateCacheExpiration = (createdAt: Date, ttlSeconds: number): Date => {
  const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
  return expiresAt;
};

/**
 * Checks if a timestamp is within the TTL window
 */
export const isWithinTTL = (
  createdAt: Date,
  ttlSeconds: number,
  now: Date = new Date()
): boolean => {
  const expiration = calculateCacheExpiration(createdAt, ttlSeconds);
  return now < expiration;
};

/**
 * Determines cache status: fresh | stale | expired
 * 
 * Fresh: Cache age < 75% of TTL
 * Stale: Cache age 75%-100% of TTL (should trigger background refresh)
 * Expired: Cache age > 100% of TTL (must rebuild)
 */
export const determineCacheStatus = (
  createdAt: Date,
  ttlSeconds: number,
  now: Date = new Date()
): CacheStatus => {
  const ageSeconds = (now.getTime() - createdAt.getTime()) / 1000;
  const freshThreshold = ttlSeconds * 0.75;
  const expiredThreshold = ttlSeconds;

  if (ageSeconds > expiredThreshold) {
    return CacheStatus.EXPIRED;
  } else if (ageSeconds > freshThreshold) {
    return CacheStatus.STALE;
  } else {
    return CacheStatus.FRESH;
  }
};

/**
 * Get remaining time in cache (in seconds)
 * Returns negative value if already expired
 */
export const getRemainingTTL = (
  createdAt: Date,
  ttlSeconds: number,
  now: Date = new Date()
): number => {
  const ageSeconds = (now.getTime() - createdAt.getTime()) / 1000;
  return ttlSeconds - ageSeconds;
};

/**
 * Check if aggregation needs refresh
 * Returns true if cache is stale or expired
 */
export const aggregationNeedsRefresh = (
  aggregation: IAggregatedResult,
  now: Date = new Date()
): boolean => {
  if (!aggregation.updatedAt || !aggregation.ttl) {
    return true; // Missing metadata, needs refresh
  }

  const status = determineCacheStatus(aggregation.updatedAt, aggregation.ttl, now);
  return status === CacheStatus.STALE || status === CacheStatus.EXPIRED;
};

/**
 * Check if aggregation should be served from cache despite being stale
 * Useful for graceful degradation when gRPC is down
 */
export const canServeStaleCache = (
  aggregation: IAggregatedResult,
  maxStaleAgeSeconds: number = TTL_CONFIG.AGGREGATION_MAX * 2, // 2x normal TTL
  now: Date = new Date()
): boolean => {
  if (!aggregation.updatedAt) return false;

  const ageSeconds = (now.getTime() - aggregation.updatedAt.getTime()) / 1000;
  return ageSeconds < maxStaleAgeSeconds;
};

/**
 * Suggest refresh interval based on current age
 * Returns time in ms before next check
 */
export const getRefreshIntervalMs = (
  createdAt: Date,
  ttlSeconds: number,
  checkIntervalSeconds: number = TTL_CONFIG.CACHE_CHECK_INTERVAL,
  now: Date = new Date()
): number => {
  const status = determineCacheStatus(createdAt, ttlSeconds, now);
  
  switch (status) {
    case CacheStatus.FRESH:
      // Check again in full interval
      return checkIntervalSeconds * 1000;
    case CacheStatus.STALE:
      // Check more frequently
      return Math.max(checkIntervalSeconds / 2, 10) * 1000;
    case CacheStatus.EXPIRED:
      // Immediate refresh needed
      return 0;
    default:
      return checkIntervalSeconds * 1000;
  }
};

/**
 * Get TTL from config with validation
 */
export const getConfiguredTTL = (customTTL?: number): number => {
  if (!customTTL) return TTL_CONFIG.AGGREGATION_DEFAULT;

  // Ensure TTL is within safe bounds
  if (customTTL < TTL_CONFIG.AGGREGATION_MIN) {
    console.warn(
      `[TTLChecker] TTL ${customTTL}s below minimum ${TTL_CONFIG.AGGREGATION_MIN}s, using minimum`
    );
    return TTL_CONFIG.AGGREGATION_MIN;
  }

  if (customTTL > TTL_CONFIG.AGGREGATION_MAX) {
    console.warn(
      `[TTLChecker] TTL ${customTTL}s exceeds maximum ${TTL_CONFIG.AGGREGATION_MAX}s, using maximum`
    );
    return TTL_CONFIG.AGGREGATION_MAX;
  }

  return customTTL;
};

/**
 * Build a cache metadata object for logging/tracking
 */
export const buildCacheMetadata = (
  aggregation: IAggregatedResult,
  fromCache: boolean,
  now: Date = new Date()
) => {
  const ttl = aggregation.ttl || TTL_CONFIG.AGGREGATION_DEFAULT;
  const status = determineCacheStatus(aggregation.updatedAt || now, ttl, now);
  const remainingTTL = getRemainingTTL(aggregation.updatedAt || now, ttl, now);

  return {
    fromCache,
    cacheStatus: status,
    ttl,
    remainingTTLSeconds: Math.max(0, remainingTTL),
    needsRefresh: aggregationNeedsRefresh(aggregation, now),
    lastUpdated: aggregation.updatedAt?.toISOString() || null,
  };
};
