import mongoose from "mongoose";
import { redisSafeGet, redisSafeSet, redisSafeDelete } from "../Utils/redisSafeWrapper";
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
} from "../Utils/aggregationUtils";
import {
  determineCacheStatus,
  aggregationNeedsRefresh,
  getConfiguredTTL,
  buildCacheMetadata,
  TTL_CONFIG,
  CacheStatus,
} from "../Utils/ttlChecker";

export interface AggregationMedicineInput {
  name: string;
  quantity?: number;
  dosage?: string;
}

export interface AggregationInput {
  userId: string | mongoose.Types.ObjectId;
  prescriptionId: string | mongoose.Types.ObjectId;
  medicines: AggregationMedicineInput[];
  prescriptionHash?: string;
  geoLocation?: {
    longitude: number;
    latitude: number;
  };
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

const DEFAULT_RADIUS_KM = 10;
const CACHE_TTL_SECONDS = TTL_CONFIG.AGGREGATION_DEFAULT;

export default class AggregationService {
  static buildMedicineHash = buildMedicineHash;

  /**
   * Main entry point: Get or refresh aggregation based on TTL strategy
   * 
   * Flow:
   * 1. Try Redis cache first (100ms timeout)
   * 2. If found and fresh → return immediately
   * 3. If found but stale → return but trigger async refresh
   * 4. If not found or expired → fetch from DB or rebuild
   * 
   * @returns Aggregation with cache metadata
   */
  static async getOrRefreshAggregation(
    input: AggregationInput,
    options: AggregationRefreshOptions = {}
  ): Promise<{ data: IAggregatedResult; meta: AggregationCacheMetadata }> {
    const userId = toObjectId(input.userId);
    const prescriptionId = toObjectId(input.prescriptionId);
    const medicines = input.medicines.filter((medicine) => medicine.name?.trim().length > 0);
    const prescriptionHash = input.prescriptionHash || buildMedicineHash(medicines);
    const cacheKey = `aggregation:${userId.toString()}:${prescriptionHash}`;
    const ttl = getConfiguredTTL(options.ttl || input.customTTL);

    // ========== STEP 1: Try Redis cache first (with timeout) ==========
    if (!options.forceRefresh) {
      console.debug(`[Aggregation] Checking Redis cache: ${cacheKey}`);
      const cachedResult = await redisSafeGet<IAggregatedResult>(cacheKey);

      if (cachedResult) {
        const status = determineCacheStatus(cachedResult.updatedAt || new Date(), ttl);

        // Cache is fresh → return immediately
        if (status === CacheStatus.FRESH) {
          console.log(`[Aggregation] Cache HIT (FRESH): ${cacheKey}`);
          return {
            data: cachedResult,
            meta: {
              fromCache: true,
              refreshed: false,
              cacheStatus: "fresh",
              ttlSeconds: ttl,
              remainingTTLSeconds: Math.max(
                0,
                ttl - ((Date.now() - (cachedResult.updatedAt?.getTime() || 0)) / 1000)
              ),
            },
          };
        }

        // Cache is stale but still usable → return + trigger async refresh
        if (status === CacheStatus.STALE) {
          console.log(`[Aggregation] Cache HIT (STALE): ${cacheKey}, triggering async refresh`);

          // Trigger background refresh if not already in progress
          this.scheduleAsyncRefresh(input, options);

          return {
            data: cachedResult,
            meta: {
              fromCache: true,
              refreshed: false,
              cacheStatus: "stale",
              ttlSeconds: ttl,
              remainingTTLSeconds: Math.max(
                0,
                ttl - ((Date.now() - (cachedResult.updatedAt?.getTime() || 0)) / 1000)
              ),
            },
          };
        }

        // Cache is expired → fall through to rebuild
        console.log(`[Aggregation] Cache EXPIRED: ${cacheKey}, rebuilding`);
      }
    }

    // ========== STEP 2: Try DB if not in Redis ==========
    console.debug(`[Aggregation] Checking database: ${cacheKey}`);
    const dbResult = await AggregatedResultModel.findOne({ userId, prescriptionId }).lean();

    if (dbResult && !options.forceRefresh) {
      const status = determineCacheStatus(dbResult.updatedAt || new Date(), ttl);

      if (status === CacheStatus.FRESH || status === CacheStatus.STALE) {
        console.log(`[Aggregation] Database HIT: ${cacheKey}, syncing to Redis`);

        // Sync back to Redis for next request
        await redisSafeSet<IAggregatedResult>(cacheKey, dbResult, ttl);

        // Trigger async refresh if stale
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
            remainingTTLSeconds: Math.max(
              0,
              ttl - ((Date.now() - (dbResult.updatedAt?.getTime() || 0)) / 1000)
            ),
          },
        };
      }
    }

    // ========== STEP 3: Rebuild aggregation (sync or async) ==========
    console.log(`[Aggregation] Cache MISS, rebuilding: ${cacheKey}`);

    if (options.asyncRefresh) {
      // Async rebuild - return placeholder, refresh in background
      this.scheduleAsyncRefresh(input, options);
      
      // Return stale DB result as placeholder if available
      if (dbResult) {
        return {
          data: dbResult,
          meta: {
            fromCache: false,
            refreshed: false,
            cacheStatus: "expired",
            ttlSeconds: ttl,
            remainingTTLSeconds: 0,
          },
        };
      }

      // No DB result, return error
      throw new Error(`No aggregation data available, refresh queued`);
    }

    // Sync rebuild
    const rebuiltData = await this.buildAggregation(input, ttl);
    return {
      data: rebuiltData,
      meta: {
        fromCache: false,
        refreshed: true,
        cacheStatus: "fresh",
        ttlSeconds: ttl,
        remainingTTLSeconds: ttl,
      },
    };
  }

  /**
   * Refresh aggregation (explicit refresh)
   * Always rebuilds from gRPC, updates DB and Redis
   */
  static async refreshAggregation(input: AggregationInput): Promise<IAggregatedResult> {
    console.log(`[Aggregation] Explicit refresh requested`);
    const ttl = getConfiguredTTL(input.customTTL);
    return await this.buildAggregation(input, ttl);
  }

  /**
   * Build aggregation from scratch
   * Calls gRPC service, aggregates data, saves to DB and Redis
   */
  static async buildAggregation(input: AggregationInput, customTtl?: number): Promise<IAggregatedResult> {
    const userId = toObjectId(input.userId);
    const prescriptionId = toObjectId(input.prescriptionId);
    const medicines = input.medicines.filter((medicine) => medicine.name?.trim().length > 0);
    const prescriptionHash = input.prescriptionHash || buildMedicineHash(medicines);
    const radiusKm = input.radiusKm ?? DEFAULT_RADIUS_KM;
    const cacheKey = `aggregation:${userId.toString()}:${prescriptionHash}`;
    const ttl = getConfiguredTTL(customTtl || input.customTTL);

    try {
      // Call gRPC service
      console.debug(`[Aggregation] Calling gRPC service for stores`);
      const storeAvailability = await getStoreAvailability({
        medicines: medicines.map((medicine) => medicine.name),
        latitude: input.geoLocation?.latitude,
        longitude: input.geoLocation?.longitude,
        radiusKm,
      });

      const storeDocs = storeAvailability.stores || [];

      // Build store-centric view
      let medicineCentric: Array<{ name: string; stores: any[] }> = [];

      const storeMap = new Map<
        string,
        {
          storeId: string;
          storeName: string;
          distance?: number;
          availableMedicines: Array<{
            medicineName: string;
            price: number;
            availability: "in_stock" | "out_of_stock" | "limited" | "pre_order";
            distance?: number;
            quantity: number;
          }>;
          missingMedicines: string[];
          matchedMedicines: Set<string>;
          totalAvailable: number;
          totalRequired: number;
          totalCostEstimate: number;
        }
      >();

      for (const store of storeDocs) {
        const key = String(store.storeId);
        if (!storeMap.has(key)) {
          storeMap.set(key, {
            storeId: store.storeId,
            storeName: store.storeName,
            distance: store.distance,
            availableMedicines: [],
            missingMedicines: [],
            matchedMedicines: new Set<string>(),
            totalAvailable: 0,
            totalRequired: medicines.length,
            totalCostEstimate: 0,
          });
        }

        const bucket = storeMap.get(key)!;
        const matchedMedicine = medicines.find((medicine) => matchesMedicine(medicine.name, store));
        if (matchedMedicine) {
          const quantity = matchedMedicine.quantity ?? 1;
          const price = Number(store.price || 0);
          const normalizedMedicine = normalizeMedicineName(matchedMedicine.name);
          bucket.matchedMedicines.add(normalizedMedicine);
          bucket.availableMedicines.push({
            medicineName: matchedMedicine.name,
            price,
            availability: normalizeAvailability(store.availability),
            distance: store.distance,
            quantity,
          });
        }
      }

      const storeCentric = Array.from(storeMap.values()).map((store: any) => {
        const availableMedicines = store.availableMedicines;
        const missingMedicines = medicines
          .filter((medicine) => !store.matchedMedicines.has(normalizeMedicineName(medicine.name)))
          .map((medicine) => medicine.name);
        const totalCostEstimate = availableMedicines.reduce(
          (total: number, medicine: any) => total + Number(medicine.price || 0) * Number(medicine.quantity || 1),
          0,
        );

        return {
          storeId: store.storeId,
          storeName: store.storeName,
          distance: store.distance,
          availableMedicines,
          missingMedicines,
          totalAvailable: availableMedicines.length,
          totalRequired: medicines.length,
          totalCostEstimate,
        };
      });

      // Build medicine-centric view
      medicineCentric = medicines.map((medicine) => {
        const storesForMedicine = storeCentric
          .flatMap((store: any) => {
            const matching = (store.availableMedicines || []).filter((am: any) =>
              matchesMedicine(medicine.name, am),
            );
            return matching.map((am: any) => ({
              storeId: store.storeId,
              storeName: store.storeName,
              price: Number(am.price || 0),
              availability: normalizeAvailability(am.availability),
              distance: typeof store.distance === "number" ? store.distance : undefined,
              brand: am.brand,
              genericName: am.genericName,
            }));
          })
          .filter((s: any) => normalize(s.storeName || "").length > 0);

        return {
          name: medicine.name,
          stores: storesForMedicine,
        };
      });

      const summary = {
        totalMedicines: medicines.length,
        totalStores: storeCentric.length,
        totalAvailableMedicines: storeCentric.reduce((total, store) => total + store.totalAvailable, 0),
        totalMissingMedicines: storeCentric.reduce((total, store) => total + store.missingMedicines.length, 0),
        estimatedCost: storeCentric.reduce((total, store) => total + store.totalCostEstimate, 0),
      };

      const geoIndex = input.geoLocation
        ? {
            type: "Point" as const,
            coordinates: [input.geoLocation.longitude, input.geoLocation.latitude] as [number, number],
          }
        : undefined;

      const now = new Date();
      const aggregatedPayload: IAggregatedResult = {
        userId,
        prescriptionId,
        prescriptionHash,
        medicines: medicineCentric as any,
        stores: storeCentric as any,
        geoIndex,
        summary,
        filtersApplied: {
          radiusKm,
        },
        buildStatus: "ready",
        cacheStatus: "fresh",
        cacheExpiresAt: new Date(now.getTime() + ttl * 1000),
        lastRefreshedAt: now,
        ttl,
      };

      // Save to DB
      console.debug(`[Aggregation] Saving to database`);
      const saved = await AggregatedResultModel.findOneAndUpdate(
        { userId, prescriptionId },
        {
          $set: aggregatedPayload,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean().select("-__v -cacheKey");

      const finalResult = (saved || aggregatedPayload) as IAggregatedResult;

      // Save to Redis cache
      console.debug(`[Aggregation] Caching to Redis (TTL: ${ttl}s)`);
      await redisSafeSet<IAggregatedResult>(cacheKey, finalResult, ttl);

      return finalResult;
    } catch (error) {
      console.error(`[Aggregation] Build failed:`, error);
      throw error;
    }
  }

  /**
   * Schedule async aggregation refresh
   * Runs in background without blocking the request
   */
  static async scheduleAsyncRefresh(
    input: AggregationInput,
    options: AggregationRefreshOptions = {}
  ): Promise<void> {
    setImmediate(async () => {
      try {
        console.log(`[Aggregation] Background refresh started`);
        await this.buildAggregation(input, options.ttl);
        console.log(`[Aggregation] Background refresh completed`);
      } catch (error) {
        console.error(`[Aggregation] Background refresh failed:`, error);
      }
    });
  }

  /**
   * Legacy: Schedule aggregation (kept for backward compatibility)
   */
  static async scheduleAggregation(input: AggregationInput): Promise<void> {
    return this.scheduleAsyncRefresh(input);
  }
}
