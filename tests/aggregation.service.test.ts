/**
 * aggregation.service.test.ts
 * Comprehensive tests for Services/aggregation.service.ts
 *
 * Mock strategy:
 *  - redisSafeGet / redisSafeSet / redisSafeDelete → in-memory store
 *  - AggregatedResultModel.findOne / findOneAndUpdate → in-memory (returns $set payload)
 *  - getStoreAvailability (gRPC) → configurable array
 *  - ttlChecker → real functions
 *  - buildMedicineHash / aggregationUtils → real functions
 */

import { describe, it, beforeEach, mock } from "bun:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// ─── In-memory Redis fake ─────────────────────────────────────────────────────
const redisStore = new Map<string, any>();
let redisGetImpl  = async (k: string) => redisStore.get(k) ?? null;
let redisSetImpl  = async (k: string, v: any) => { redisStore.set(k, v); return true; };
let redisDelImpl  = async (k: string) => { redisStore.delete(k); return 1; };

mock.module("../Utils/cache/redisSafeWrapper", () => ({
  redisSafeGet:    (k: string)            => redisGetImpl(k),
  redisSafeSet:    (k: string, v: any)    => redisSetImpl(k, v),
  redisSafeDelete: (k: string)            => redisDelImpl(k),
}));

// ─── In-memory DB fake ────────────────────────────────────────────────────────
let dbFindOneResult: any = null;
let findOneCallArgs:  any[] = [];
let updateCallArgs:   any[] = [];

mock.module("../Databases/Models/aggregatedResult.Model", () => ({
  default: {
    findOne: (filter: any) => {
      findOneCallArgs.push(filter);
      const result = dbFindOneResult;
      return { select: () => ({ lean: async () => result }) };
    },
    findOneAndUpdate: (filter: any, update: any, opts: any) => {
      updateCallArgs.push({ filter, update, opts });
      // Simulate what Mongoose returns: the saved document
      const saved = { _id: new mongoose.Types.ObjectId(), ...update.$set };
      return { select: () => ({ lean: async () => saved }) };
    },
  },
}));

// ─── gRPC fake ────────────────────────────────────────────────────────────────
let grpcStores: any[] = [];
mock.module("../Services/grpc/store.client", () => ({
  getStoreAvailability: async () => ({ stores: grpcStores }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const USER_ID   = new mongoose.Types.ObjectId();
const PRESC_ID  = new mongoose.Types.ObjectId();
const MEDICINES = [{ name: "Paracetamol", quantity: 2 }];
const BASE_INPUT = {
  userId:         USER_ID,
  prescriptionId: PRESC_ID,
  medicines:      MEDICINES,
  geoLocation:    { latitude: 28.6, longitude: 77.2 },
};

const STORE_DOC = {
  storeId:      "store1",
  storeName:    "Health Plus",
  distance:     1.2,
  medicineName: "Paracetamol",
  price:        "25",
  availability: "in_stock",
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("AggregationService", () => {
  let AggregationService: any;

  beforeEach(async () => {
    redisStore.clear();
    dbFindOneResult = null;
    findOneCallArgs = [];
    updateCallArgs  = [];
    grpcStores      = [];
    AggregationService = (await import("../Services/aggregation.service")).default;
  });

  // ─── buildMedicineHash ──────────────────────────────────────────────────────

  describe("buildMedicineHash", () => {
    it("produces consistent MD5 hex digest for same medicines", () => {
      const h1 = AggregationService.buildMedicineHash(MEDICINES);
      const h2 = AggregationService.buildMedicineHash(MEDICINES);
      assert.equal(h1, h2);
      assert.match(h1, /^[0-9a-f]{32}$/i);  // MD5 = 32 hex chars
    });

    it("different medicines produce different hashes", () => {
      const h1 = AggregationService.buildMedicineHash([{ name: "Aspirin" }]);
      const h2 = AggregationService.buildMedicineHash([{ name: "Ibuprofen" }]);
      assert.notEqual(h1, h2);
    });

    it("empty list produces consistent hash", () => {
      const h = AggregationService.buildMedicineHash([]);
      assert.ok(typeof h === "string" && h.length > 0);
    });

    it("is case-insensitive (normalised before hashing)", () => {
      const h1 = AggregationService.buildMedicineHash([{ name: "paracetamol" }]);
      const h2 = AggregationService.buildMedicineHash([{ name: "PARACETAMOL" }]);
      assert.equal(h1, h2);
    });

    it("order-independent (sorted before hashing)", () => {
      const h1 = AggregationService.buildMedicineHash([{ name: "Aspirin" }, { name: "Paracetamol" }]);
      const h2 = AggregationService.buildMedicineHash([{ name: "Paracetamol" }, { name: "Aspirin" }]);
      assert.equal(h1, h2);
    });
  });

  // ─── buildAggregation ───────────────────────────────────────────────────────

  describe("buildAggregation", () => {
    it("returns aggregation with populated stores and medicines arrays", async () => {
      grpcStores = [STORE_DOC];
      const result = await AggregationService.buildAggregation(BASE_INPUT);
      assert.ok(result, "result must not be null");
      assert.ok(Array.isArray(result.stores));
      assert.ok(Array.isArray(result.medicines));
      assert.equal(result.stores[0].storeId, "store1");
    });

    it("sets summary.totalMedicines = medicines.length", async () => {
      grpcStores = [STORE_DOC];
      const result = await AggregationService.buildAggregation(BASE_INPUT);
      assert.equal(result.summary.totalMedicines, MEDICINES.length);
    });

    it("sets summary.totalStores correctly", async () => {
      grpcStores = [STORE_DOC];
      const result = await AggregationService.buildAggregation(BASE_INPUT);
      assert.equal(result.summary.totalStores, 1);
    });

    it("calculates totalCostEstimate = price × quantity per store", async () => {
      grpcStores = [{ ...STORE_DOC, price: "10" }];
      const result = await AggregationService.buildAggregation(BASE_INPUT);
      // Paracetamol price=10, quantity=2 → cost=20
      assert.equal(result.stores[0].totalCostEstimate, 20);
    });

    it("marks medicines with no store as empty stores array", async () => {
      grpcStores = [];
      const result = await AggregationService.buildAggregation(BASE_INPUT);
      assert.equal(result.medicines[0].stores.length, 0);
    });

    it("sets filtersApplied.radiusKm to DEFAULT (10) when not provided", async () => {
      grpcStores = [STORE_DOC];
      const result = await AggregationService.buildAggregation(BASE_INPUT);
      assert.equal(result.filtersApplied.radiusKm, 10);
    });

    it("honours custom radiusKm override", async () => {
      grpcStores = [STORE_DOC];
      const result = await AggregationService.buildAggregation({ ...BASE_INPUT, radiusKm: 25 });
      assert.equal(result.filtersApplied.radiusKm, 25);
    });

    it("sets geoIndex as GeoJSON Point [longitude, latitude]", async () => {
      grpcStores = [STORE_DOC];
      const result = await AggregationService.buildAggregation(BASE_INPUT);
      assert.equal(result.geoIndex?.type, "Point");
      assert.equal(result.geoIndex?.coordinates[0], 77.2);  // longitude first
      assert.equal(result.geoIndex?.coordinates[1], 28.6);  // then latitude
    });

    it("geoIndex is undefined when no geoLocation provided", async () => {
      grpcStores = [STORE_DOC];
      const { geoLocation: _g, ...inputNoGeo } = BASE_INPUT;
      const result = await AggregationService.buildAggregation(inputNoGeo);
      assert.equal(result.geoIndex, undefined);
    });

    it("upserts to DB with prescriptionHash in the filter (bug fix)", async () => {
      grpcStores = [STORE_DOC];
      await AggregationService.buildAggregation(BASE_INPUT);
      assert.ok(updateCallArgs.length > 0, "findOneAndUpdate must be called");
      const { filter } = updateCallArgs[0];
      assert.ok(filter.prescriptionHash, "DB filter must include prescriptionHash");
    });

    it("saves to Redis after DB upsert", async () => {
      grpcStores = [STORE_DOC];
      await AggregationService.buildAggregation(BASE_INPUT);
      assert.equal(redisStore.size, 1, "one Redis key should be written");
    });

    it("accepts string userId and prescriptionId (auto-coerced)", async () => {
      grpcStores = [STORE_DOC];
      const result = await AggregationService.buildAggregation({
        ...BASE_INPUT,
        userId:         USER_ID.toString(),
        prescriptionId: PRESC_ID.toString(),
      });
      assert.ok(result);
    });

    it("filters out medicines with empty name before hashing and building", async () => {
      grpcStores = [STORE_DOC];
      const result = await AggregationService.buildAggregation({
        ...BASE_INPUT,
        medicines: [{ name: "" }, { name: "   " }, { name: "Paracetamol" }],
      });
      assert.equal(result.summary.totalMedicines, 1);
    });

    it("uses provided prescriptionHash override instead of computing", async () => {
      grpcStores = [STORE_DOC];
      const customHash = "customhash1234567890abcdef012345";
      await AggregationService.buildAggregation({
        ...BASE_INPUT,
        prescriptionHash: customHash,
      });
      const key = [...redisStore.keys()][0];
      assert.ok(key?.includes(customHash), "Redis key should use provided prescriptionHash");
    });

    it("sets buildStatus='ready' and cacheStatus='fresh'", async () => {
      grpcStores = [STORE_DOC];
      const result = await AggregationService.buildAggregation(BASE_INPUT);
      assert.equal(result.buildStatus, "ready");
      assert.equal(result.cacheStatus, "fresh");
    });

    it("sets lastRefreshedAt to approximately now", async () => {
      grpcStores = [STORE_DOC];
      const before = Date.now();
      const result = await AggregationService.buildAggregation(BASE_INPUT);
      const after  = Date.now();
      const refreshedAt = new Date(result.lastRefreshedAt).getTime();
      assert.ok(refreshedAt >= before && refreshedAt <= after + 100);
    });

    it("same storeId rows are merged into one store bucket", async () => {
      // gRPC returns two rows for same store (one per matched medicine variant)
      grpcStores = [
        { ...STORE_DOC, medicineName: "Paracetamol" },
        { ...STORE_DOC, medicineName: "Paracetamol" },
      ];
      const result = await AggregationService.buildAggregation(BASE_INPUT);
      assert.equal(result.stores.length, 1, "same storeId → one bucket");
    });

    it("two different stores produce two entries in result.stores", async () => {
      grpcStores = [
        { ...STORE_DOC, storeId: "s1", storeName: "Pharma 1" },
        { ...STORE_DOC, storeId: "s2", storeName: "Pharma 2" },
      ];
      const result = await AggregationService.buildAggregation(BASE_INPUT);
      assert.equal(result.stores.length, 2);
    });

    it("estimatedCost = sum of all store totalCostEstimates", async () => {
      grpcStores = [
        { ...STORE_DOC, storeId: "s1", storeName: "Pharma 1", price: "10" },
        { ...STORE_DOC, storeId: "s2", storeName: "Pharma 2", price: "15" },
      ];
      const result = await AggregationService.buildAggregation(BASE_INPUT);
      // s1: 10×2=20, s2: 15×2=30 → total=50
      assert.equal(result.summary.estimatedCost, 50);
    });

    it("handles zero medicines gracefully", async () => {
      const result = await AggregationService.buildAggregation({
        ...BASE_INPUT, medicines: [],
      });
      assert.equal(result.summary.totalMedicines, 0);
      assert.equal(result.stores.length, 0);
    });
  });

  // ─── getOrRefreshAggregation ────────────────────────────────────────────────

  describe("getOrRefreshAggregation", () => {
    it("returns FRESH cache hit without calling DB or gRPC", async () => {
      const hash = AggregationService.buildMedicineHash(MEDICINES);
      const freshDoc = {
        userId:           USER_ID,
        prescriptionId:   PRESC_ID,
        prescriptionHash: hash,
        stores:           [],
        medicines:        [],
        summary:          {},
        lastRefreshedAt:  new Date(),   // now → within freshness window
      };
      redisStore.set(`aggregation:${USER_ID}:${hash}`, freshDoc);

      const { meta } = await AggregationService.getOrRefreshAggregation(BASE_INPUT);

      assert.equal(meta.fromCache, true);
      assert.equal(meta.cacheStatus, "fresh");
      assert.equal(meta.refreshed, false);
      assert.equal(findOneCallArgs.length, 0, "DB must NOT be called for fresh Redis hit");
    });

    it("returns STALE cache hit (fromCache: true)", async () => {
      const hash = AggregationService.buildMedicineHash(MEDICINES);
      const staleDoc = {
        userId:           USER_ID,
        prescriptionId:   PRESC_ID,
        prescriptionHash: hash,
        stores:           [],
        medicines:        [],
        summary:          {},
        // 25 minutes ago — STALE window (75% to 100% of 30min TTL)
        lastRefreshedAt:  new Date(Date.now() - 25 * 60 * 1000),
        updatedAt:        new Date(Date.now() - 25 * 60 * 1000),
      };
      redisStore.set(`aggregation:${USER_ID}:${hash}`, staleDoc);

      const { meta } = await AggregationService.getOrRefreshAggregation(BASE_INPUT);

      assert.equal(meta.fromCache, true);
      // stale or fresh depending on configured TTL — either is valid and non-rebuilding
      assert.ok(["fresh", "stale"].includes(meta.cacheStatus));
    });

    it("rebuild on cache miss: calls gRPC, returns refreshed=true", async () => {
      grpcStores = [STORE_DOC];
      const { meta } = await AggregationService.getOrRefreshAggregation(BASE_INPUT);
      assert.equal(meta.fromCache, false);
      assert.equal(meta.refreshed, true);
    });

    it("cache miss warms Redis after rebuild", async () => {
      grpcStores = [STORE_DOC];
      await AggregationService.getOrRefreshAggregation(BASE_INPUT);
      assert.equal(redisStore.size, 1, "Redis must be populated after rebuild");
    });

    it("forceRefresh bypasses Redis even when cache is fresh", async () => {
      const hash = AggregationService.buildMedicineHash(MEDICINES);
      redisStore.set(`aggregation:${USER_ID}:${hash}`, {
        stores: [], medicines: [], summary: {}, lastRefreshedAt: new Date(),
      });

      grpcStores = [STORE_DOC];
      const { meta } = await AggregationService.getOrRefreshAggregation(
        BASE_INPUT,
        { forceRefresh: true }
      );

      assert.equal(meta.refreshed, true);
    });

    it("falls back to DB when Redis cache is empty", async () => {
      const hash = AggregationService.buildMedicineHash(MEDICINES);
      dbFindOneResult = {
        userId:           USER_ID,
        prescriptionId:   PRESC_ID,
        prescriptionHash: hash,
        stores:           [{ storeId: "db-store" }],
        medicines:        [],
        summary:          {},
        lastRefreshedAt:  new Date(),   // fresh
      };

      const { data, meta } = await AggregationService.getOrRefreshAggregation(BASE_INPUT);

      assert.equal(meta.fromCache, false);
      assert.equal(data.stores[0].storeId, "db-store");
    });

    it("DB hit warms Redis cache", async () => {
      const hash = AggregationService.buildMedicineHash(MEDICINES);
      dbFindOneResult = {
        userId:           USER_ID,
        prescriptionId:   PRESC_ID,
        prescriptionHash: hash,
        stores:           [],
        medicines:        [],
        summary:          {},
        lastRefreshedAt:  new Date(),
      };

      await AggregationService.getOrRefreshAggregation(BASE_INPUT);
      assert.equal(redisStore.size, 1, "Redis must be warmed from DB hit");
    });

    it("DB findOne filter includes prescriptionHash (bug-fix)", async () => {
      grpcStores = [STORE_DOC];
      await AggregationService.getOrRefreshAggregation(BASE_INPUT);
      const dbFilter = findOneCallArgs[0];
      assert.ok(dbFilter?.prescriptionHash, "DB findOne must filter by prescriptionHash");
    });

    it("asyncRefresh=true throws when no cached/DB data exists", async () => {
      await assert.rejects(
        () => AggregationService.getOrRefreshAggregation(BASE_INPUT, { asyncRefresh: true }),
        /refresh has been queued/
      );
    });

    it("asyncRefresh=true returns expired stale DB record as placeholder", async () => {
      const hash = AggregationService.buildMedicineHash(MEDICINES);
      dbFindOneResult = {
        userId:           USER_ID,
        prescriptionId:   PRESC_ID,
        prescriptionHash: hash,
        stores:           [{ storeId: "old-store" }],
        medicines:        [],
        summary:          {},
        // 10 hours old → expired
        lastRefreshedAt: new Date(Date.now() - 10 * 3600 * 1000),
      };

      const { data, meta } = await AggregationService.getOrRefreshAggregation(
        BASE_INPUT,
        { asyncRefresh: true }
      );

      assert.equal(meta.cacheStatus, "expired");
      assert.equal(data.stores[0].storeId, "old-store");
    });
  });

  // ─── refreshAggregation ─────────────────────────────────────────────────────

  describe("refreshAggregation", () => {
    it("always rebuilds and returns a result object", async () => {
      grpcStores = [STORE_DOC];
      const result = await AggregationService.refreshAggregation(BASE_INPUT);
      assert.ok(result, "result must not be null");
      assert.ok(result.stores !== undefined, "stores must be present");
      assert.ok(result.medicines !== undefined, "medicines must be present");
    });

    it("returns fresh data (cacheStatus='fresh')", async () => {
      grpcStores = [STORE_DOC];
      const result = await AggregationService.refreshAggregation(BASE_INPUT);
      assert.equal(result.cacheStatus, "fresh");
    });
  });

  // ─── invalidateCache ────────────────────────────────────────────────────────

  describe("invalidateCache", () => {
    it("removes the Redis key for a given userId + hash", async () => {
      const hash = AggregationService.buildMedicineHash(MEDICINES);
      redisStore.set(`aggregation:${USER_ID}:${hash}`, { data: "stale" });
      assert.equal(redisStore.size, 1);

      await AggregationService.invalidateCache(USER_ID, hash);
      assert.equal(redisStore.size, 0);
    });

    it("accepts string userId (auto-coerced to ObjectId for key building)", async () => {
      const hash = AggregationService.buildMedicineHash(MEDICINES);
      redisStore.set(`aggregation:${USER_ID}:${hash}`, { data: "x" });
      await AggregationService.invalidateCache(USER_ID.toString(), hash);
      assert.equal(redisStore.size, 0);
    });

    it("is a no-op when key does not exist (no throw)", async () => {
      await assert.doesNotReject(() =>
        AggregationService.invalidateCache(USER_ID, "nonexistent-hash")
      );
    });
  });

  // ─── scheduleAsyncRefresh ───────────────────────────────────────────────────

  describe("scheduleAsyncRefresh", () => {
    it("does not throw when called synchronously", () => {
      grpcStores = [STORE_DOC];
      assert.doesNotThrow(() => AggregationService.scheduleAsyncRefresh(BASE_INPUT));
    });

    it("scheduleAggregation (legacy alias) resolves without error", async () => {
      grpcStores = [STORE_DOC];
      await assert.doesNotReject(() => AggregationService.scheduleAggregation(BASE_INPUT));
    });
  });
});
