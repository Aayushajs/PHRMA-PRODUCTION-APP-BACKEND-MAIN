import mongoose from "mongoose";
import { getCache, setCache } from "../Utils/cache";
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
}

const DEFAULT_RADIUS_KM = 10;
const CACHE_TTL_SECONDS = 60 * 30;

export default class AggregationService {
  static buildMedicineHash = buildMedicineHash;

  static async buildAggregation(input: AggregationInput): Promise<IAggregatedResult> {
    const userId = toObjectId(input.userId);
    const prescriptionId = toObjectId(input.prescriptionId);
    const medicines = input.medicines.filter((medicine) => medicine.name?.trim().length > 0);
    const prescriptionHash = input.prescriptionHash || buildMedicineHash(medicines);
    const radiusKm = input.radiusKm ?? DEFAULT_RADIUS_KM;
    const cacheKey = `aggregation:${userId.toString()}:${prescriptionHash}`;

    const cachedResult = await getCache<IAggregatedResult>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    const storeAvailability = await getStoreAvailability({
      medicines: medicines.map((medicine) => medicine.name),
      latitude: input.geoLocation?.latitude,
      longitude: input.geoLocation?.longitude,
      radiusKm,
    });

    const storeDocs = storeAvailability.stores || [];

    // medicineCentric will be derived after we build the store-centric view
    // to ensure medicines[].stores and stores[].availableMedicines remain consistent.
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

    // Build medicine-centric view from the finalized store-centric data so both
    // representations are aligned and reflect the same availability information.
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
    };

    const saved = await AggregatedResultModel.findOneAndUpdate(
      { userId, prescriptionId },
      { $set: aggregatedPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean().select("-__v -cacheKey");

    const finalResult = (saved || aggregatedPayload) as IAggregatedResult;
    await setCache(cacheKey, finalResult, CACHE_TTL_SECONDS);

    return finalResult;
  }

  static async scheduleAggregation(input: AggregationInput): Promise<void> {
    setImmediate(() => {
      void this.buildAggregation(input).catch((error) => {
        console.error("[AggregationService] Async aggregation failed:", error);
      });
    });
  }
}
