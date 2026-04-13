/*
┌───────────────────────────────────────────────────────────────────────┐
│  Cache Utility - Redis caching helper functions.                      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { redis, isRedisAvailable } from "../config/redis";
import crypto from "crypto";

interface CachePayload<T> {
  data: T;
  checksum: string;
  cachedAt: number;
}

const generateChecksum = (data: any): string => {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
};

export const getCache = async <T>(key: string): Promise<T | null> => {
  try {
    if (!isRedisAvailable()) return null;

    const cached = await redis.get(key);
    if (!cached) return null;

    const payload: CachePayload<T> = JSON.parse(cached);
    return payload.data;
  } catch (error) {
    console.error(`Redis getCache error (${key}):`, error);
    return null;
  }
};

export const setCache = async <T>(key: string, value: T, ttl = 3000): Promise<void> => {
  try {
    if (!isRedisAvailable()) return;

    const payload: CachePayload<T> = {
      data: value,
      checksum: generateChecksum(value),
      cachedAt: Date.now(),
    };

    await redis.set(key, JSON.stringify(payload), { EX: ttl });
  } catch (error) {
    console.error(`Redis setCache error (${key}):`, error);
  }
};


export const deleteCache = async (key: string): Promise<void> => {
  try {
    if (!isRedisAvailable()) return;

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

export const clearAllCache = async (): Promise<void> => {
  try {
    if (!isRedisAvailable()) return;

    await redis.flushAll();
    console.log(" All Redis cache cleared!");
  } catch (error) {
    console.error(" Failed to clear Redis cache:", error);
  }
};
