/*
┌───────────────────────────────────────────────────────────────────────┐
│  Cache Utility - Thin, safe wrapper around the Redis proxy.           │
│                                                                       │
│  Contract:                                                            │
│  - Any Redis problem is swallowed → callers MUST treat null / 0 /     │
│    void as cache-miss and fall back to source-of-truth.               │
│  - JSON parse failures auto-degrade Redis (likely poisoned data),     │
│    so subsequent reads skip Redis until the breaker closes.           │
│  - Function signatures are PRESERVED for back-compat with existing    │
│    Services/* callers.                                                │
└───────────────────────────────────────────────────────────────────────┘
*/

import { redis, isRedisAvailable, markRedisDegraded, MAX_CACHE_VALUE_BYTES, MAX_CACHE_KEY_LENGTH, REDIS_DEFAULT_TTL_SECONDS } from "../../config/redis";
import crypto from "crypto";

interface CachePayload<T> {
  data: T;
  checksum: string;
  cachedAt: number;
}

const generateChecksum = (data: any): string => {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
};

const isUsableKey = (key: unknown): key is string =>
  typeof key === "string" && key.length > 0 && key.length <= MAX_CACHE_KEY_LENGTH;

export const getCache = async <T>(key: string): Promise<T | null> => {
  try {
    if (!isRedisAvailable()) return null;
    if (!isUsableKey(key)) return null;

    const cached = await redis.get(key);
    if (!cached) return null;

    let payload: CachePayload<T>;
    try {
      payload = JSON.parse(cached as string);
    } catch (parseErr) {
      // Corrupt entry — trip the breaker briefly so we stop reading bad data,
      // and best-effort drop the poisoned key.
      markRedisDegraded("cache_parse_error", parseErr);
      try { await redis.del(key); } catch { /* swallow */ }
      return null;
    }

    if (!payload || typeof payload !== "object" || !("data" in payload)) {
      // Legacy / non-wrapped value — return as-is.
      return cached as unknown as T;
    }

    return payload.data;
  } catch (error) {
    console.error(`Redis getCache error (${key}):`, error);
    return null;
  }
};

export const setCache = async <T>(key: string, value: T, ttl = 3000): Promise<void> => {
  try {
    if (!isRedisAvailable()) return;
    if (!isUsableKey(key)) {
      console.warn(`[cache] setCache skipped — invalid/too-long key`);
      return;
    }

    const payload: CachePayload<T> = {
      data: value,
      checksum: generateChecksum(value),
      cachedAt: Date.now(),
    };

    const serialized = JSON.stringify(payload);

    // The proxy layer also enforces this, but checking here lets us avoid
    // serializing-then-rejecting and produce a more actionable log.
    if (Buffer.byteLength(serialized, "utf8") > MAX_CACHE_VALUE_BYTES) {
      console.warn(`[cache] setCache skipped — value too large for key="${key}"`);
      return;
    }

    const effectiveTtl = ttl > 0 ? ttl : REDIS_DEFAULT_TTL_SECONDS;
    await redis.set(key, serialized, { EX: effectiveTtl });
  } catch (error) {
    console.error(`Redis setCache error (${key}):`, error);
  }
};


export const deleteCache = async (key: string): Promise<void> => {
  try {
    if (!isRedisAvailable()) return;
    if (!isUsableKey(key)) return;

    if (key.includes('*')) {
      const keys = await redis.keys(key);
      if (keys.length > 0) {
        await redis.del(keys);
      }
    } else {
      await redis.del(key);
    }
  } catch (error) {
    console.error(`Redis deleteCache error (${key}):`, error);
  }
};


export const deleteCachePattern = async (pattern: string): Promise<number> => {
  try {
    if (!isRedisAvailable()) return 0;
    if (typeof pattern !== "string" || !pattern.length) return 0;

    const keys = await redis.keys(pattern);
    if (keys.length === 0) return 0;

    await redis.del(keys);
    console.log(` Cleared ${keys.length} cache keys matching pattern: ${pattern}`);
    return keys.length;
  } catch (error) {
    console.error(`Redis deleteCachePattern error (${pattern}):`, error);
    return 0;
  }
};

/**
 * DANGER: full-cache wipe. Now a no-op against the proxy (the proxy blocks
 * flushAll). Operators must call `rawRedis.flushAll()` explicitly from an
 * ops script if a wipe is truly intended.
 *
 * Signature preserved for back-compat with callers that may import it.
 */
export const clearAllCache = async (): Promise<void> => {
  console.warn(
    "[cache] clearAllCache() is disabled in app code. " +
      "Use the documented operator runbook (docs/REDIS_OPS.md) to flush Redis."
  );
};
