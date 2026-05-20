/*
┌───────────────────────────────────────────────────────────────────────┐
│  Redis Config - Connection setup for Redis caching.                   │
│                                                                       │
│  Hardened to keep the backend running when Redis is fully DOWN:       │
│  - circuit breaker + per-method fallbacks                             │
│  - command-level timeout                                              │
│  - key length / value size guards                                     │
│  - automatic default TTL injection on set()                           │
│  - REDIS_KEY_PREFIX to isolate local vs prod (and to namespace svc1)  │
│  - safe public Proxy (flushAll is intentionally NOT proxied)          │
└───────────────────────────────────────────────────────────────────────┘
*/

import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config({ path: "./config/.env" });

// ─── ENV / CONSTANTS ───────────────────────────────────────────────────
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const REDIS_CACHE_ENABLED = process.env.REDIS_CACHE_ENABLED !== "false";
const REDIS_COMMAND_TIMEOUT_MS = Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 250);
const REDIS_CIRCUIT_BREAKER_MS = Number(process.env.REDIS_CIRCUIT_BREAKER_MS || 60000);
const REDIS_QUOTA_DISABLE_MS = Number(process.env.REDIS_QUOTA_DISABLE_MS || 6 * 60 * 60 * 1000);
const REDIS_SCAN_COUNT = Number(process.env.REDIS_SCAN_COUNT || 200);
const REDIS_MAX_KEYS_FETCH = Number(process.env.REDIS_MAX_KEYS_FETCH || 2000);
const REDIS_RECONNECT_INTERVAL_MS = Number(process.env.REDIS_RECONNECT_INTERVAL_MS || 15000);

// Key/value safety guards
export const MAX_CACHE_KEY_LENGTH = Number(process.env.REDIS_MAX_KEY_LENGTH || 256);
export const MAX_CACHE_VALUE_BYTES = Number(
  process.env.REDIS_MAX_VALUE_BYTES || 512 * 1024 // 512 KB
);
export const REDIS_DEFAULT_TTL_SECONDS = Number(
  process.env.REDIS_DEFAULT_TTL_SECONDS || 3600
);

// Optional prefix to isolate environments. Examples:
//   REDIS_KEY_PREFIX=svc1:local:   (docker-compose local dev)
//   REDIS_KEY_PREFIX=svc1:prod:    (managed prod Redis)
// Empty string means "no prefix" (back-compat).
const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || "";

// ─── CLIENT ────────────────────────────────────────────────────────────
export const rawRedis = createClient({
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

// NOTE: `flushAll` is deliberately NOT in this set — it must not be available
// via the proxied public `redis` export. Use `rawRedis.flushAll()` only from
// explicit operator code (and gate it behind env / ops tooling).
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
  "sAdd",
  "sRem",
  "sMembers",
  "sIsMember",
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
  sAdd: 0,
  sRem: 0,
  sMembers: [],
  sIsMember: 0,
};

// Methods whose FIRST positional arg is a single key string (we'll auto-prefix)
const SINGLE_KEY_METHODS = new Set([
  "get",
  "set",
  "setEx",
  "exists",
  "ttl",
  "expire",
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
  "sAdd",
  "sRem",
  "sMembers",
  "sIsMember",
]);

const REDIS_ERROR_LOG_THROTTLE_MS = 30000;
let lastRedisErrorLogAt = 0;
let redisDisabledUntil = 0;
let redisHardDisabled = false;
let redisDisableReason = "";
let reconnectTicker: NodeJS.Timeout | null = null;
let connectInFlight: Promise<void> | null = null;
let warnedAboutMissingTtl = false;

// ─── ERROR CLASSIFICATION ──────────────────────────────────────────────
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
    (msg.includes("usage:") && msg.includes("limit:"))
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

/**
 * Voluntarily trip the breaker. Callers can use this when they detect a
 * problem with cached data (e.g. JSON.parse failure, unexpected schema)
 * and want to fall back to source-of-truth for a while.
 */
export const markRedisDegraded = (reason: string, error?: unknown) => {
  openCircuit(reason || "manual_degrade", error ?? new Error(reason || "manual_degrade"));
};

// ─── KEY / VALUE GUARDS ────────────────────────────────────────────────
const applyPrefix = (key: string): string => {
  if (!REDIS_KEY_PREFIX) return key;
  if (key.startsWith(REDIS_KEY_PREFIX)) return key;
  return `${REDIS_KEY_PREFIX}${key}`;
};

const isKeyTooLong = (key: string): boolean => key.length > MAX_CACHE_KEY_LENGTH;

const valueByteLength = (value: unknown): number => {
  if (value == null) return 0;
  if (typeof value === "string") {
    // Buffer.byteLength is precise but allocates; lengthcap is good enough here
    return Buffer.byteLength(value, "utf8");
  }
  if (value instanceof Buffer) return value.length;
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
};

/**
 * Normalize set() / setEx() arguments:
 * - Reject if key is too long.
 * - Reject if value exceeds MAX_CACHE_VALUE_BYTES.
 * - Inject a default TTL on `set(key, value)` calls that don't specify EX/PX.
 *
 * Returns either the original args (possibly augmented), or `null` to mean
 * "skip this call and return the fallback".
 */
const guardSetArgs = (
  method: "set" | "setEx",
  args: any[]
): any[] | null => {
  const [key, ...rest] = args;

  if (typeof key !== "string" || isKeyTooLong(key)) {
    logRedisErrorThrottled(
      method,
      new Error(`key too long or invalid (len=${typeof key === "string" ? key.length : "n/a"})`)
    );
    return null;
  }

  if (method === "setEx") {
    // setEx(key, seconds, value)
    const value = rest[1];
    if (valueByteLength(value) > MAX_CACHE_VALUE_BYTES) {
      logRedisErrorThrottled(method, new Error(`value too large for key ${key}`));
      return null;
    }
    return args;
  }

  // method === "set"
  // node-redis v4+ signature: set(key, value, opts?)
  const value = rest[0];
  let opts: any = rest[1];

  if (valueByteLength(value) > MAX_CACHE_VALUE_BYTES) {
    logRedisErrorThrottled(method, new Error(`value too large for key ${key}`));
    return null;
  }

  const hasTtl =
    opts &&
    typeof opts === "object" &&
    (typeof opts.EX === "number" ||
      typeof opts.PX === "number" ||
      typeof opts.EXAT === "number" ||
      typeof opts.PXAT === "number" ||
      opts.KEEPTTL === true);

  if (!hasTtl) {
    opts = { ...(opts && typeof opts === "object" ? opts : {}), EX: REDIS_DEFAULT_TTL_SECONDS };
    if (!warnedAboutMissingTtl) {
      warnedAboutMissingTtl = true;
      console.warn(
        `[redis] set() called without TTL for key="${key}". ` +
          `Injecting default TTL=${REDIS_DEFAULT_TTL_SECONDS}s. ` +
          `This warning fires only once per process.`
      );
    }
    return [key, value, opts];
  }

  return args;
};

// ─── CORE SAFE EXECUTOR ────────────────────────────────────────────────
const executeRedisSafely = async (
  methodName: string,
  method: (...args: any[]) => unknown,
  args: any[]
): Promise<unknown> => {
  if (!isRedisAvailable()) {
    return getFallbackValue(methodName);
  }

  // --- key / value guards & default-TTL injection ---
  let effectiveArgs = args;

  if (methodName === "set" || methodName === "setEx") {
    const guarded = guardSetArgs(methodName as "set" | "setEx", args);
    if (!guarded) return getFallbackValue(methodName);
    effectiveArgs = guarded;
  }

  // --- automatic prefix on single-key methods ---
  if (REDIS_KEY_PREFIX && SINGLE_KEY_METHODS.has(methodName)) {
    const first = effectiveArgs[0];
    if (typeof first === "string") {
      if (isKeyTooLong(first)) {
        logRedisErrorThrottled(methodName, new Error(`key too long for ${methodName}`));
        return getFallbackValue(methodName);
      }
      effectiveArgs = [applyPrefix(first), ...effectiveArgs.slice(1)];
    }
  }

  // --- prefix-aware handling for `keys` (pattern) and `del` (str | str[]) ---
  if (methodName === "keys" && typeof effectiveArgs[0] === "string") {
    const pattern = REDIS_KEY_PREFIX ? applyPrefix(effectiveArgs[0]) : effectiveArgs[0];
    try {
      return await listKeysByScan(pattern);
    } catch (error) {
      if (isQuotaExceeded(error)) hardDisableRedis(`keys:quota_exceeded`, error);
      else if (isAuthFailure(error)) openCircuit(`keys:auth_failure`, error);
      else openCircuit("keys", error);
      return getFallbackValue("keys");
    }
  }

  if (methodName === "del" && REDIS_KEY_PREFIX) {
    const k = effectiveArgs[0];
    if (typeof k === "string") {
      effectiveArgs = [applyPrefix(k), ...effectiveArgs.slice(1)];
    } else if (Array.isArray(k)) {
      effectiveArgs = [k.map((x) => (typeof x === "string" ? applyPrefix(x) : x)), ...effectiveArgs.slice(1)];
    }
  }

  try {
    return await withTimeout(
      Promise.resolve(method.apply(rawRedis, effectiveArgs)) as Promise<unknown>,
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

// ─── PUBLIC PROXY ──────────────────────────────────────────────────────
export const redis = new Proxy(rawRedis, {
  get(target, prop, receiver) {
    const original = Reflect.get(target, prop, receiver);

    if (typeof prop !== "string" || typeof original !== "function") {
      return original;
    }

    // Explicitly hide flushAll behind the proxy — too dangerous to expose
    // as a normal-looking method on `redis`. Operators must use `rawRedis`.
    if (prop === "flushAll" || prop === "flushDb") {
      return () => {
        console.warn(
          `[redis] ${prop}() blocked on proxied client. Use rawRedis directly from an operator script if intentional.`
        );
        return Promise.resolve("BLOCKED");
      };
    }

    if (!REDIS_SAFE_METHODS.has(prop)) {
      return original.bind(target);
    }

    return (...args: any[]) => executeRedisSafely(prop, original, args);
  },
}) as typeof rawRedis;

// ─── EVENTS ────────────────────────────────────────────────────────────
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

// ─── LIFECYCLE ─────────────────────────────────────────────────────────
/**
 * Idempotent connect. Safe to call any number of times — concurrent calls
 * share a single in-flight promise; subsequent calls after a successful
 * connect are no-ops.
 */
export const connectRedis = async (): Promise<void> => {
  if (!REDIS_CACHE_ENABLED) {
    isRedisConnected = false;
    return;
  }

  if (redisHardDisabled && Date.now() < redisDisabledUntil) return;
  if (redisHardDisabled && Date.now() >= redisDisabledUntil) {
    redisHardDisabled = false;
    redisDisableReason = "";
  }
  if (Date.now() < redisDisabledUntil) return;

  // already connected
  if (rawRedis.isOpen && isRedisConnected) return;

  // de-dupe concurrent connect() calls
  if (connectInFlight) return connectInFlight;

  connectInFlight = (async () => {
    try {
      if (!rawRedis.isOpen) {
        await rawRedis.connect();
        isRedisConnected = true;
        redisDisabledUntil = 0;
      } else {
        isRedisConnected = true;
      }
    } catch (err) {
      openCircuit("connect", err);
    } finally {
      connectInFlight = null;
    }
  })();

  return connectInFlight;
};

export const isRedisAvailable = (): boolean => {
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

/**
 * Lightweight ops snapshot — safe to expose on an internal /health endpoint.
 */
export const getRedisStats = () => ({
  enabled: REDIS_CACHE_ENABLED,
  connected: isRedisConnected && rawRedis.isOpen,
  prefix: REDIS_KEY_PREFIX || null,
  defaultTtlSeconds: REDIS_DEFAULT_TTL_SECONDS,
  maxValueBytes: MAX_CACHE_VALUE_BYTES,
  maxKeyLength: MAX_CACHE_KEY_LENGTH,
  hardDisabled: redisHardDisabled && Date.now() < redisDisabledUntil,
  disableReason: redisDisableReason || null,
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
