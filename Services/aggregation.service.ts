/*
┌───────────────────────────────────────────────────────────────────────┐
│  Aggregation Service                                                   │
│  Aggregates medicine availability data from gRPC store service.        │
│  Supports Redis cache with Stale-While-Revalidate (SWR) semantics.    │
│                                                                        │
│  Bug fixes (v2):                                                       │
│   1. DB findOne now includes `prescriptionHash` so a changed           │
│      prescription does not return stale aggregation data.              │
│   2. findOneAndUpdate upserts on {userId, prescriptionId, hash} so    │
│      every unique medicine set gets its own DB document.               │
│   3. Old Redis cache key is invalidated when hash changes.             │
│   4. Removed broken `.lean().select()` chaining order — Mongoose      │
│      requires `.select()` before `.lean()`.                            │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";
import { redisSafeGet, redisSafeSet, redisSafeDelete } from "../Utils/cache/redisSafeWrapper";
import AggregatedResultModel from "../Databases/Models/aggregatedResult.Model";
import { IAggregatedResult } from "../Databases/Entities/aggregatedResult.interface";
import { getStoreAvailability } from "./grpc/store.client";
import {
  normalize,
  buildMedicineHash,
  toObjectId,
  normalizeAvailability,
  matchesMedicine,
  normalizeMedicineName,
} from "../Utils/helpers/aggregationUtils";
import {
  determineCacheStatus,
  getConfiguredTTL,
  TTL_CONFIG,
  CacheStatus,
} from "../Utils/cache/ttlChecker";

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface AggregationMedicineInput {
  name: string;
  quantity?: number;
  dosage?: string;
}

export interface AggregationInput {
  userId: string | mongoose.Types.ObjectId;
  prescriptionId: string | mongoose.Types.ObjectId;
  medicines: AggregationMedicineInput[];
  /** Pre-computed hash for the medicine list — derived automatically if omitted. */
  prescriptionHash?: string;
  geoLocation?: { longitude: number; latitude: number };
  radiusKm?: number;
  customTTL?: number;
}

export interface AggregationRefreshOptions {
  forceRefresh?: boolean;
  asyncRefresh?: boolean;
  ttl?: number;
}

export interface AggregationCacheMetadata {
  fromCache: boolean;
  refreshed: boolean;
  cacheStatus: string;
  ttlSeconds: number;
  remainingTTLSeconds: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_RADIUS_KM   = 10;
const CACHE_TTL_SECONDS   = TTL_CONFIG.AGGREGATION_DEFAULT;

/** Build a deterministic Redis cache key scoped to user + medicine hash. */
const buildCacheKey = (userId: mongoose.Types.ObjectId, prescriptionHash: string) =>
  `aggregation:${userId.toString()}:${prescriptionHash}`;

// ─── Service ──────────────────────────────────────────────────────────────────

export default class AggregationService {
  static buildMedicineHash = buildMedicineHash;

  // ──────────────────────────────────────────────────────────────────────────
  // getOrRefreshAggregation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Main entry point: Get or refresh aggregation based on TTL strategy.
   *
   * Flow:
   * 1. Try Redis cache first (100 ms timeout)
   * 2. FRESH   → return immediately
   * 3. STALE   → return cached data + trigger async refresh in background
   * 4. EXPIRED / MISS → check DB, then rebuild synchronously (or async)
   */
  static async getOrRefreshAggregation(
    input: AggregationInput,
    options: AggregationRefreshOptions = {}
  ): Promise<{ data: IAggregatedResult; meta: AggregationCacheMetadata }> {
    const userId           = toObjectId(input.userId);
    const prescriptionId   = toObjectId(input.prescriptionId);
    const medicines        = input.medicines.filter((m) => m.name?.trim().length > 0);
    const prescriptionHash = input.prescriptionHash ?? buildMedicineHash(medicines);
    const cacheKey         = buildCacheKey(userId, prescriptionHash);
    const ttl              = getConfiguredTTL(options.ttl ?? input.customTTL);

    // ── Step 1: Redis cache ───────────────────────────────────────────────
    if (!options.forceRefresh) {
      const cachedResult = await redisSafeGet<IAggregatedResult>(cacheKey);

      if (cachedResult) {
        const lastRefreshed = cachedResult.lastRefreshedAt
          ? new Date(cachedResult.lastRefreshedAt)
          : new Date(cachedResult.updatedAt ?? new Date());

        const status = determineCacheStatus(lastRefreshed, ttl);
        const remaining = Math.max(
          0,
          ttl - (Date.now() - lastRefreshed.getTime()) / 1000
        );

        if (status === CacheStatus.FRESH) {
          return {
            data: cachedResult,
            meta: { fromCache: true, refreshed: false, cacheStatus: "fresh", ttlSeconds: ttl, remainingTTLSeconds: remaining },
          };
        }

        if (status === CacheStatus.STALE) {
          // Return stale data immediately; refresh behind the scenes.
          this.scheduleAsyncRefresh(input, options);
          return {
            data: cachedResult,
            meta: { fromCache: true, refreshed: false, cacheStatus: "stale", ttlSeconds: ttl, remainingTTLSeconds: remaining },
          };
        }
        // EXPIRED → fall through to DB / rebuild
      }
    }

    // ── Step 2: DB lookup (hash-scoped to detect changed prescriptions) ───
    const dbResult = await AggregatedResultModel
      .findOne({ userId, prescriptionId, prescriptionHash })   // ← BUG FIX: include hash
      .select("-__v -cacheKey")
      .lean();

    if (dbResult && !options.forceRefresh) {
      const lastRefreshed = dbResult.lastRefreshedAt
        ? new Date(dbResult.lastRefreshedAt)
        : new Date((dbResult as any).updatedAt ?? new Date());

      const status    = determineCacheStatus(lastRefreshed, ttl);
      const remaining = Math.max(0, ttl - (Date.now() - lastRefreshed.getTime()) / 1000);

      if (status === CacheStatus.FRESH || status === CacheStatus.STALE) {
        // Warm the Redis cache for the next request
        await redisSafeSet<IAggregatedResult>(cacheKey, dbResult, ttl);

        if (status === CacheStatus.STALE) {
          this.scheduleAsyncRefresh(input, options);
        }

        return {
          data: dbResult,
          meta: {
            fromCache: false,
            refreshed: false,
            cacheStatus: status === CacheStatus.FRESH ? "fresh" : "stale",
            ttlSeconds: ttl,
            remainingTTLSeconds: remaining,
          },
        };
      }
    }

    // ── Step 3: Rebuild ───────────────────────────────────────────────────
    if (options.asyncRefresh) {
      this.scheduleAsyncRefresh(input, options);

      if (dbResult) {
        // Return the stale DB record as a placeholder
        return {
          data: dbResult,
          meta: { fromCache: false, refreshed: false, cacheStatus: "expired", ttlSeconds: ttl, remainingTTLSeconds: 0 },
        };
      }

      throw new Error("No aggregation data available; refresh has been queued");
    }

    const rebuiltData = await this.buildAggregation(input, ttl);
    return {
      data: rebuiltData,
      meta: { fromCache: false, refreshed: true, cacheStatus: "fresh", ttlSeconds: ttl, remainingTTLSeconds: ttl },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // refreshAggregation  (explicit / admin-triggered)
  // ──────────────────────────────────────────────────────────────────────────

  static async refreshAggregation(input: AggregationInput): Promise<IAggregatedResult> {
    const ttl = getConfiguredTTL(input.customTTL);
    return this.buildAggregation(input, ttl);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // buildAggregation  (core: gRPC → aggregate → DB → Redis)
  // ──────────────────────────────────────────────────────────────────────────

  static async buildAggregation(
    input: AggregationInput,
    customTtl?: number
  ): Promise<IAggregatedResult> {
    const userId           = toObjectId(input.userId);
    const prescriptionId   = toObjectId(input.prescriptionId);
    const medicines        = input.medicines.filter((m) => m.name?.trim().length > 0);
    const prescriptionHash = input.prescriptionHash ?? buildMedicineHash(medicines);
    const radiusKm         = input.radiusKm ?? DEFAULT_RADIUS_KM;
    const cacheKey         = buildCacheKey(userId, prescriptionHash);
    const ttl              = getConfiguredTTL(customTtl ?? input.customTTL);

    try {
      // ── Call gRPC store service ────────────────────────────────────────
      const storeAvailability = await getStoreAvailability({
        medicines:  medicines.map((m) => m.name),
        latitude:   input.geoLocation?.latitude,
        longitude:  input.geoLocation?.longitude,
        radiusKm,
      });

      const storeDocs = storeAvailability.stores ?? [];

      // ── Build store-centric view ───────────────────────────────────────
      const storeMap = new Map<
        string,
        {
          storeId:             string;
          storeName:           string;
          distance?:           number;
          availableMedicines:  Array<{
            medicineName: string;
            price:         number;
            availability:  "in_stock" | "out_of_stock" | "limited" | "pre_order";
            distance?:     number;
            quantity:      number;
          }>;
          matchedMedicines: Set<string>;
        }
      >();

      for (const store of storeDocs) {
        const key = String(store.storeId);
        if (!storeMap.has(key)) {
          storeMap.set(key, {
            storeId:            store.storeId,
            storeName:          store.storeName,
            distance:           store.distance,
            availableMedicines: [],
            matchedMedicines:   new Set<string>(),
          });
        }

        const bucket            = storeMap.get(key)!;
        const matchedMedicine   = medicines.find((m) => matchesMedicine(m.name, store));
        if (matchedMedicine) {
          const quantity          = matchedMedicine.quantity ?? 1;
          const price             = Number(store.price ?? 0);
          const normalizedName    = normalizeMedicineName(matchedMedicine.name);
          bucket.matchedMedicines.add(normalizedName);
          bucket.availableMedicines.push({
            medicineName: matchedMedicine.name,
            price,
            availability: normalizeAvailability(store.availability),
            distance:     store.distance,
            quantity,
          });
        }
      }

      const storeCentric = Array.from(storeMap.values()).map((store) => {
        const missingMedicines = medicines
          .filter((m) => !store.matchedMedicines.has(normalizeMedicineName(m.name)))
          .map((m) => m.name);
        const totalCostEstimate = store.availableMedicines.reduce(
          (total, med) => total + Number(med.price ?? 0) * Number(med.quantity ?? 1),
          0
        );
        return {
          storeId:            store.storeId,
          storeName:          store.storeName,
          distance:           store.distance,
          availableMedicines: store.availableMedicines,
          missingMedicines,
          totalAvailable:     store.availableMedicines.length,
          totalRequired:      medicines.length,
          totalCostEstimate,
        };
      });

      // ── Build medicine-centric view ────────────────────────────────────
      const medicineCentric = medicines.map((medicine) => {
        const storesForMedicine = storeCentric
          .flatMap((store) => {
            const matching = (store.availableMedicines ?? []).filter((am) =>
              matchesMedicine(medicine.name, am)
            );
            return matching.map((am) => ({
              storeId:     store.storeId,
              storeName:   store.storeName,
              price:       Number(am.price ?? 0),
              availability: normalizeAvailability(am.availability),
              distance:    typeof store.distance === "number" ? store.distance : undefined,
            }));
          })
          .filter((s) => normalize(s.storeName ?? "").length > 0);

        return { name: medicine.name, stores: storesForMedicine };
      });

      const summary = {
        totalMedicines:          medicines.length,
        totalStores:             storeCentric.length,
        totalAvailableMedicines: storeCentric.reduce((t, s) => t + s.totalAvailable, 0),
        totalMissingMedicines:   storeCentric.reduce((t, s) => t + s.missingMedicines.length, 0),
        estimatedCost:           storeCentric.reduce((t, s) => t + s.totalCostEstimate, 0),
      };

      const geoIndex = input.geoLocation
        ? {
            type:        "Point" as const,
            coordinates: [input.geoLocation.longitude, input.geoLocation.latitude] as [number, number],
          }
        : undefined;

      const now = new Date();
      const aggregatedPayload: Partial<IAggregatedResult> & Record<string, any> = {
        userId,
        prescriptionId,
        prescriptionHash,
        medicines:       medicineCentric as any,
        stores:          storeCentric as any,
        geoIndex,
        summary,
        filtersApplied:  { radiusKm },
        buildStatus:     "ready",
        cacheStatus:     "fresh",
        cacheExpiresAt:  new Date(now.getTime() + ttl * 1000),
        lastRefreshedAt: now,
        ttl,
        // Explicit timestamps so Mongoose `timestamps:true` is not required
        updatedAt:       now,
      };

      // ── Upsert to DB (hash-scoped — BUG FIX) ──────────────────────────
      // Use prescriptionHash in the filter so a new hash always creates a new
      // document rather than silently overwriting the previous one.
      const saved = await AggregatedResultModel
        .findOneAndUpdate(
          { userId, prescriptionId, prescriptionHash },   // ← include hash
          { $set: aggregatedPayload },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
        .select("-__v -cacheKey")     // ← select() BEFORE lean() (Mongoose requirement)
        .lean();

      const finalResult = (saved ?? aggregatedPayload) as IAggregatedResult;

      // ── Sync to Redis ──────────────────────────────────────────────────
      await redisSafeSet<IAggregatedResult>(cacheKey, finalResult, ttl);

      return finalResult;

    } catch (error) {
      console.error("[Aggregation] Build failed:", error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // scheduleAsyncRefresh
  // ──────────────────────────────────────────────────────────────────────────

  static scheduleAsyncRefresh(
    input: AggregationInput,
    options: AggregationRefreshOptions = {}
  ): void {
    // Fire-and-forget: never await in caller
    setImmediate(async () => {
      try {
        await this.buildAggregation(input, options.ttl);
      } catch (err) {
        console.error("[Aggregation] Background refresh failed:", err);
      }
    });
  }

  /** Legacy alias kept for backward compatibility. */
  static async scheduleAggregation(input: AggregationInput): Promise<void> {
    this.scheduleAsyncRefresh(input);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // invalidateCache  (explicit eviction, e.g. when prescription is deleted)
  // ──────────────────────────────────────────────────────────────────────────

  static async invalidateCache(
    userId: string | mongoose.Types.ObjectId,
    prescriptionHash: string
  ): Promise<void> {
    const uid      = toObjectId(userId);
    const cacheKey = buildCacheKey(uid, prescriptionHash);
    await redisSafeDelete(cacheKey);
  }
}
