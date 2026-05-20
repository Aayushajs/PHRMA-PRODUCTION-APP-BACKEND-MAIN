/*
┌───────────────────────────────────────────────────────────────────────┐
│  Redis Safe Wrapper - Fail-safe Redis operations with timeout.        │
│  If Redis fails → returns null/false, never throws to client.         │
│  Includes timeout handling for slow Redis connections.                │
└───────────────────────────────────────────────────────────────────────┘
*/

import { redis, isRedisAvailable } from "../config/redis";
import crypto from "crypto";

interface CachePayload<T> {
  data: T;
  checksum: string;
  cachedAt: number;
}

/**
 * Redis operation timeout: 100ms max
 * If Redis doesn't respond, fallback gracefully
 */
const REDIS_OPERATION_TIMEOUT_MS = 100;

/**
 * Generate checksum for cache integrity verification
 */
const generateChecksum = (data: any): string => {
  try {
    return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
  } catch {
    return "";
  }
};

/**
 * Execute a Redis operation with timeout
 * If operation exceeds timeout or fails, returns null/false gracefully
 */
const executeWithTimeout = async <T>(
  operation: () => Promise<T>,
  timeoutMs: number = REDIS_OPERATION_TIMEOUT_MS,
): Promise<T | null> => {
  try {
    return await Promise.race([
      operation(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Redis operation timeout")), timeoutMs)
      ),
    ]);
  } catch (error) {
    console.warn(`[Redis] Operation timeout or failed:`, error instanceof Error ? error.message : error);
    return null;
  }
};

/**
 * Safe GET from Redis with timeout
 * Returns null if key doesn't exist, fails, or times out
 */
export const redisSafeGet = async <T>(key: string): Promise<T | null> => {
  try {
    if (!isRedisAvailable()) {
      console.debug(`[Redis] Cache disabled, skipping GET: ${key}`);
      return null;
    }

    const result = await executeWithTimeout(async () => {
      const cached = await redis.get(key);
      if (!cached) return null;

      const payload: CachePayload<T> = JSON.parse(cached);
      return payload.data;
    });

    if (result) {
      console.debug(`[Redis] Cache HIT: ${key}`);
    }
    return result;
  } catch (error) {
    console.warn(`[Redis] GET failed (${key}):`, error instanceof Error ? error.message : error);
    return null;
  }
};

/**
 * Safe SET to Redis with TTL and timeout
 * Silently fails if Redis is unavailable or times out
 */
export const redisSafeSet = async <T>(
  key: string,
  value: T,
  ttlSeconds: number = 1800, // 30 minutes default
): Promise<boolean> => {
  try {
    if (!isRedisAvailable()) {
      console.debug(`[Redis] Cache disabled, skipping SET: ${key}`);
      return false;
    }

    const success = await executeWithTimeout(async () => {
      const payload: CachePayload<T> = {
        data: value,
        checksum: generateChecksum(value),
        cachedAt: Date.now(),
      };

      await redis.set(key, JSON.stringify(payload), { EX: ttlSeconds });
      return true;
    });

    if (success) {
      console.debug(`[Redis] Cache SET: ${key} (TTL: ${ttlSeconds}s)`);
    }
    return success || false;
  } catch (error) {
    console.warn(`[Redis] SET failed (${key}):`, error instanceof Error ? error.message : error);
    return false;
  }
};

/**
 * Safe DELETE from Redis with timeout
 * Supports pattern-based deletion (e.g., "user:123:*")
 * Returns number of keys deleted
 */
export const redisSafeDelete = async (key: string): Promise<number> => {
  try {
    if (!isRedisAvailable()) {
      console.debug(`[Redis] Cache disabled, skipping DELETE: ${key}`);
      return 0;
    }

    const deletedCount = await executeWithTimeout(async () => {
      if (key.includes("*")) {
        const keys = await redis.keys(key);
        if (keys.length === 0) return 0;
        await redis.del(keys);
        return keys.length;
      } else {
        const result = await redis.del(key);
        return typeof result === "number" ? result : 0;
      }
    });

    if (deletedCount && deletedCount > 0) {
      console.debug(`[Redis] Cache DELETED: ${key} (${deletedCount} keys)`);
    }
    return deletedCount || 0;
  } catch (error) {
    console.warn(`[Redis] DELETE failed (${key}):`, error instanceof Error ? error.message : error);
    return 0;
  }
};

/**
 * Safe check if key EXISTS in Redis with timeout
 * Returns false if Redis is unavailable or times out
 */
export const redisSafeExists = async (key: string): Promise<boolean> => {
  try {
    if (!isRedisAvailable()) {
      return false;
    }

    const exists = await executeWithTimeout(async () => {
      const result = await redis.exists(key);
      return result > 0;
    });

    return exists || false;
  } catch (error) {
    console.warn(`[Redis] EXISTS check failed (${key}):`, error instanceof Error ? error.message : error);
    return false;
  }
};

/**
 * Safe GET TTL of a key with timeout
 * Returns -1 if key doesn't exist, -2 if expired, or positive TTL in seconds
 */
export const redisSafeTtl = async (key: string): Promise<number> => {
  try {
    if (!isRedisAvailable()) {
      return -1;
    }

    const ttl = await executeWithTimeout(async () => {
      return await redis.ttl(key);
    });

    return ttl !== null ? ttl : -1;
  } catch (error) {
    console.warn(`[Redis] TTL check failed (${key}):`, error instanceof Error ? error.message : error);
    return -1;
  }
};

/**
 * Safe EXPIRE operation (set expiration on a key)
 * Returns true if expiration was set, false otherwise
 */
export const redisSafeExpire = async (key: string, seconds: number): Promise<boolean> => {
  try {
    if (!isRedisAvailable()) {
      return false;
    }

    const success = await executeWithTimeout(async () => {
      const result = await redis.expire(key, seconds);
      return result > 0;
    });

    if (success) {
      console.debug(`[Redis] Cache expiration set: ${key} (${seconds}s)`);
    }
    return success || false;
  } catch (error) {
    console.warn(`[Redis] EXPIRE failed (${key}):`, error instanceof Error ? error.message : error);
    return false;
  }
};

/**
 * Safe INCR operation (increment a key)
 * Returns the new value or -1 if operation failed
 */
export const redisSafeIncr = async (key: string): Promise<number> => {
  try {
    if (!isRedisAvailable()) {
      return -1;
    }

    const result = await executeWithTimeout(async () => {
      return await redis.incr(key);
    });

    return typeof result === "number" ? result : -1;
  } catch (error) {
    console.warn(`[Redis] INCR failed (${key}):`, error instanceof Error ? error.message : error);
    return -1;
  }
};

/**
 * Flush entire Redis cache (use with caution!)
 * Returns true if flush was successful
 */
export const redisSafeFlushAll = async (): Promise<boolean> => {
  try {
    if (!isRedisAvailable()) {
      return false;
    }

    const success = await executeWithTimeout(async () => {
      await redis.flushAll();
      return true;
    });

    console.warn(`[Redis] FLUSH ALL executed`);
    return success || false;
  } catch (error) {
    console.warn(`[Redis] FLUSH ALL failed:`, error instanceof Error ? error.message : error);
    return false;
  }
};
