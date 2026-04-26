/*
┌───────────────────────────────────────────────────────────────────────┐
│  Redis Config - Connection setup for Redis caching.                   │
└───────────────────────────────────────────────────────────────────────┘
*/

import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config({ path: "./config/.env" });

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REDIS_CACHE_ENABLED = process.env.REDIS_CACHE_ENABLED !== "false";
const REDIS_COMMAND_TIMEOUT_MS = Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 250);
const REDIS_CIRCUIT_BREAKER_MS = Number(process.env.REDIS_CIRCUIT_BREAKER_MS || 60000);
const REDIS_QUOTA_DISABLE_MS = Number(process.env.REDIS_QUOTA_DISABLE_MS || 6 * 60 * 60 * 1000);
const REDIS_SCAN_COUNT = Number(process.env.REDIS_SCAN_COUNT || 200);
const REDIS_MAX_KEYS_FETCH = Number(process.env.REDIS_MAX_KEYS_FETCH || 2000);
const REDIS_RECONNECT_INTERVAL_MS = Number(process.env.REDIS_RECONNECT_INTERVAL_MS || 15000);

const rawRedis = createClient({
  url: REDIS_URL,
  socket: {
    connectTimeout: 5000,
    reconnectStrategy: (retries) => {
      if (retries > 5) return false;
      return Math.min(retries * 1000, 5000);
    },
  },
});

let isRedisConnected = false;

const REDIS_SAFE_METHODS = new Set([
  "get",
  "set",
  "setEx",
  "del",
  "keys",
  "scan",
  "exists",
  "ttl",
  "expire",
  "flushAll",
  "hGet",
  "hSet",
  "hGetAll",
  "lPush",
  "rPush",
  "lPop",
  "rPop",
  "lLen",
  "lRange",
  "lTrim",
  "lRem",
  "lMove",
]);

const METHOD_FALLBACKS: Record<string, unknown> = {
  get: null,
  set: "SKIPPED",
  setEx: "SKIPPED",
  del: 0,
  keys: [],
  scan: { cursor: "0", keys: [] },
  exists: 0,
  ttl: -2,
  expire: 0,
  flushAll: "SKIPPED",
  hGet: null,
  hSet: 0,
  hGetAll: {},
  lPush: 0,
  rPush: 0,
  lPop: null,
  rPop: null,
  lLen: 0,
  lRange: [],
  lTrim: "SKIPPED",
  lRem: 0,
  lMove: null,
};

const REDIS_ERROR_LOG_THROTTLE_MS = 30000;
let lastRedisErrorLogAt = 0;
let redisDisabledUntil = 0;
let redisHardDisabled = false;
let redisDisableReason = "";
let reconnectTicker: NodeJS.Timeout | null = null;

const isAuthFailure = (error: unknown): boolean => {
  const msg = String((error as any)?.message || error || "").toLowerCase();
  return (
    msg.includes("noauth") ||
    msg.includes("wrongpass") ||
    msg.includes("invalid username-password") ||
    msg.includes("authentication")
  );
};

const isQuotaExceeded = (error: unknown): boolean => {
  const msg = String((error as any)?.message || error || "").toLowerCase();
  return (
    msg.includes("max requests limit exceeded") ||
    msg.includes("usage:") && msg.includes("limit:")
  );
};

const withTimeout = async <T>(promise: Promise<T>, methodName: string): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Redis ${methodName} timeout after ${REDIS_COMMAND_TIMEOUT_MS}ms`));
    }, REDIS_COMMAND_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const listKeysByScan = async (pattern: string): Promise<string[]> => {
  let cursor = "0";
  const allKeys: string[] = [];

  do {
    const result = await withTimeout(
      rawRedis.scan(cursor, { MATCH: pattern, COUNT: REDIS_SCAN_COUNT }),
      "scan"
    );

    cursor = result.cursor;
    if (result.keys?.length) {
      allKeys.push(...result.keys);
    }

    if (allKeys.length >= REDIS_MAX_KEYS_FETCH) {
      return allKeys.slice(0, REDIS_MAX_KEYS_FETCH);
    }
  } while (cursor !== "0");

  return allKeys;
};

const getFallbackValue = (method: string): unknown => {
  if (Object.prototype.hasOwnProperty.call(METHOD_FALLBACKS, method)) {
    return METHOD_FALLBACKS[method];
  }
  return null;
};

const logRedisErrorThrottled = (method: string, error: unknown) => {
  const now = Date.now();
  if (now - lastRedisErrorLogAt >= REDIS_ERROR_LOG_THROTTLE_MS) {
    console.error(`Redis ${method} failed. Falling back without cache:`, error);
    lastRedisErrorLogAt = now;
  }
};

const openCircuit = (reason: string, error: unknown) => {
  redisDisabledUntil = Date.now() + REDIS_CIRCUIT_BREAKER_MS;
  isRedisConnected = false;
  redisDisableReason = reason;
  logRedisErrorThrottled(reason, error);
};

const hardDisableRedis = (reason: string, error: unknown) => {
  redisHardDisabled = true;
  redisDisableReason = reason;
  redisDisabledUntil = Date.now() + REDIS_QUOTA_DISABLE_MS;
  isRedisConnected = false;
  logRedisErrorThrottled(reason, error);
};

const executeRedisSafely = async (
  methodName: string,
  method: (...args: any[]) => unknown,
  args: any[]
): Promise<unknown> => {
  if (!isRedisAvailable()) {
    return getFallbackValue(methodName);
  }

  try {
    if (methodName === "keys" && typeof args[0] === "string") {
      return await listKeysByScan(args[0]);
    }

    return await withTimeout(
      Promise.resolve(method.apply(rawRedis, args)) as Promise<unknown>,
      methodName
    );
  } catch (error) {
    if (isQuotaExceeded(error)) {
      hardDisableRedis(`${methodName}:quota_exceeded`, error);
    } else if (isAuthFailure(error)) {
      openCircuit(`${methodName}:auth_failure`, error);
    } else {
      openCircuit(methodName, error);
    }
    return getFallbackValue(methodName);
  }
};

export const redis = new Proxy(rawRedis, {
  get(target, prop, receiver) {
    const original = Reflect.get(target, prop, receiver);

    if (typeof prop !== "string" || typeof original !== "function") {
      return original;
    }

    if (!REDIS_SAFE_METHODS.has(prop)) {
      return original.bind(target);
    }

    return (...args: any[]) => executeRedisSafely(prop, original, args);
  },
}) as typeof rawRedis;

rawRedis.on("error", (err) => {
  openCircuit("client_error", err);
});

rawRedis.on("connect", () => {
  console.log("✅ Connected to Redis");
  isRedisConnected = true;
  redisDisabledUntil = 0;
});

rawRedis.on("end", () => {
  console.warn("Redis connection closed");
  isRedisConnected = false;
});

export const connectRedis = async () => {
  if (!REDIS_CACHE_ENABLED) {
    isRedisConnected = false;
    return;
  }

  if (redisHardDisabled && Date.now() < redisDisabledUntil) {
    return;
  }

  if (redisHardDisabled && Date.now() >= redisDisabledUntil) {
    redisHardDisabled = false;
    redisDisableReason = "";
  }

  if (Date.now() < redisDisabledUntil) {
    return;
  }

  try {
    if (!rawRedis.isOpen) {
      await rawRedis.connect();
      isRedisConnected = true;
      redisDisabledUntil = 0;
    }
  } catch (err) {
    openCircuit("connect", err);
  }
};

export const isRedisAvailable = () => {
  if (!REDIS_CACHE_ENABLED) return false;
  if (redisHardDisabled && Date.now() < redisDisabledUntil) return false;
  if (Date.now() < redisDisabledUntil) return false;
  return isRedisConnected && rawRedis.isOpen;
};

export const getRedisHealth = () => ({
  enabled: REDIS_CACHE_ENABLED,
  connected: isRedisConnected,
  isOpen: rawRedis.isOpen,
  hardDisabled: redisHardDisabled && Date.now() < redisDisabledUntil,
  disableReason: redisDisableReason || null,
  degraded: Date.now() < redisDisabledUntil,
  retryInMs: Math.max(0, redisDisabledUntil - Date.now()),
});

export const startRedisAutoReconnect = () => {
  if (!REDIS_CACHE_ENABLED || reconnectTicker) {
    return;
  }

  reconnectTicker = setInterval(() => {
    if (isRedisAvailable()) {
      return;
    }

    connectRedis().catch((err) => {
      logRedisErrorThrottled("auto_reconnect", err);
    });
  }, REDIS_RECONNECT_INTERVAL_MS);

  reconnectTicker.unref();
};
