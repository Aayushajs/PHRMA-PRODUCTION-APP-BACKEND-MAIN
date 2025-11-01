import { redis } from "../config/redis";
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
    const cached = await redis.get(key);
    if (!cached) return null;

    const payload: CachePayload<T> = JSON.parse(cached);
    return payload.data;
  } catch (error) {
    console.error(` Redis getCache error (${key}):`, error);
    return null;
  }
};


export const setCache = async <T>(key: string, value: T, ttl = 3000): Promise<void> => {
  try {
    const payload: CachePayload<T> = {
      data: value,
      checksum: generateChecksum(value),
      cachedAt: Date.now(),
    };

    await redis.set(key, JSON.stringify(payload), { EX: ttl });
  } catch (error) {
    console.error(` Redis setCache error (${key}):`, error);
  }
};


export const deleteCache = async (key: string): Promise<void> => {
  try {
    await redis.del(key);
  } catch (error) {
    console.error(` Redis deleteCache error (${key}):`, error);
  }
};


export const clearAllCache = async (): Promise<void> => {
  try {
    await redis.flushAll();
    console.log(" All Redis cache cleared!");
  } catch (error) {
    console.error(" Failed to clear Redis cache:", error);
  }
};
