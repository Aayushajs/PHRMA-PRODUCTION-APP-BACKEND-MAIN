import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import AggregatedResultModel from "../Databases/Models/aggregatedResult.Model";
import { searchElastic, indexDocument, ensureElasticIndex } from "../config/elasticsearch";
import { handleResponse } from "../Utils/responses/handleResponse";
import { ApiError } from "../Utils/errors/ApiError";

export interface SearchFilters {
  priceRange?: [number, number];
  distance?: number;
  availability?: string[];
  brands?: string[];
}

export interface GlobalSearchInput {
  query: string;
  lat?: number;
  lng?: number;
  limit?: number;
  skipReturn?: boolean;
}

const MEDICINES_INDEX = "medicines_index";
const STORES_INDEX = "stores_index";

const medicineIndexMapping = {
  mappings: {
    properties: {
      name: { type: "text" },
      genericName: { type: "text" },
      brand: { type: "text" },
      synonyms: { type: "text" },
      popularityScore: { type: "rank_feature" },
      itemId: { type: "keyword" },
    },
  },
};

const storeIndexMapping = {
  mappings: {
    properties: {
      storeName: { type: "text" },
      location: { type: "geo_point" },
      availableMedicines: { type: "text" },
      rating: { type: "float" },
      storeId: { type: "keyword" },
    },
  },
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");

export default class SearchService {
  static async ensureSearchIndexes(): Promise<void> {
    await ensureElasticIndex(MEDICINES_INDEX, medicineIndexMapping);
    await ensureElasticIndex(STORES_INDEX, storeIndexMapping);
  }

  static async syncMedicineDocument(document: {
    itemId: string | mongoose.Types.ObjectId;
    name: string;
    genericName?: string;
    brand?: string;
    synonyms?: string[];
    popularityScore?: number;
  }): Promise<void> {
    await indexDocument(MEDICINES_INDEX, String(document.itemId), {
      ...document,
      name: normalize(document.name),
      genericName: document.genericName ? normalize(document.genericName) : undefined,
      brand: document.brand ? normalize(document.brand) : undefined,
      synonyms: document.synonyms?.map((synonym) => normalize(synonym)),
    });
  }

  static async syncStoreDocument(document: {
    storeId: string | mongoose.Types.ObjectId;
    storeName: string;
    location: { type: "Point"; coordinates: [number, number] };
    availableMedicines: string[];
    rating?: number;
  }): Promise<void> {
    await indexDocument(STORES_INDEX, String(document.storeId), {
      ...document,
      storeName: normalize(document.storeName),
      availableMedicines: document.availableMedicines.map((item) => normalize(item)),
    });
  }

  static async filterAggregatedResult(params: {
    prescriptionId: string | mongoose.Types.ObjectId;
    userId?: string | mongoose.Types.ObjectId;
    filters?: SearchFilters;
  }) {
    const query: Record<string, any> = {
      prescriptionId: params.prescriptionId instanceof mongoose.Types.ObjectId ? params.prescriptionId : new mongoose.Types.ObjectId(params.prescriptionId),
    };

    if (params.userId) {
      query.userId = params.userId instanceof mongoose.Types.ObjectId ? params.userId : new mongoose.Types.ObjectId(params.userId);
    }

    const result = await AggregatedResultModel.findOne(query).lean();
    if (!result) {
      return null;
    }

    const filters = params.filters || {};
    const priceRange = filters.priceRange;
    const distanceLimit = filters.distance;
    const allowedAvailability = filters.availability?.length ? new Set(filters.availability) : null;
    const allowedBrands = filters.brands?.length ? new Set(filters.brands.map((brand) => normalize(brand))) : null;

    const filteredStores = (result.stores || []).filter((store: any) => {
      if (typeof distanceLimit === "number" && typeof store.distance === "number" && store.distance > distanceLimit) {
        return false;
      }

      const medicineMatches = (store.availableMedicines || []).filter((medicine: any) => {
        if (priceRange && typeof medicine.price === "number") {
          if (medicine.price < priceRange[0] || medicine.price > priceRange[1]) {
            return false;
          }
        }

        if (allowedAvailability && !allowedAvailability.has(String(medicine.availability))) {
          return false;
        }

        if (allowedBrands && medicine.brand && !allowedBrands.has(normalize(medicine.brand))) {
          return false;
        }

        return true;
      });

      return medicineMatches.length > 0 || (store.missingMedicines || []).length > 0;
    });

    const filteredMedicines = (result.medicines || []).map((medicine: any) => {
      const stores = (medicine.stores || []).filter((store: any) => {
        if (typeof distanceLimit === "number" && typeof store.distance === "number" && store.distance > distanceLimit) {
          return false;
        }

        if (priceRange && typeof store.price === "number") {
          if (store.price < priceRange[0] || store.price > priceRange[1]) {
            return false;
          }
        }

        if (allowedAvailability && !allowedAvailability.has(String(store.availability))) {
          return false;
        }

        if (allowedBrands && store.brand && !allowedBrands.has(normalize(store.brand))) {
          return false;
        }

        return true;
      });

      return {
        ...medicine,
        stores,
      };
    });

    return {
      ...result,
      stores: filteredStores,
      medicines: filteredMedicines,
    };
  }

  static async globalSearch(input: GlobalSearchInput) {
    const query = input.query.trim();
    if (!query) {
      return {
        medicines: [],
        stores: [],
      };
    }

    const limit = input.limit ?? 10;

    const medicineQuery = {
      size: limit,
      query: {
        bool: {
          should: [
            {
              multi_match: {
                query,
                fields: ["name^4", "genericName^3", "brand^2", "synonyms"],
                fuzziness: "AUTO",
                prefix_length: 1,
              },
            },
            {
              match_phrase_prefix: {
                name: {
                  query,
                  max_expansions: 10,
                },
              },
            },
          ],
        },
      },
    };

    const storeQuery: any = {
      size: limit,
      query: {
        bool: {
          should: [
            {
              multi_match: {
                query,
                fields: ["storeName^4", "availableMedicines^2"],
                fuzziness: "AUTO",
              },
            },
            {
              match_phrase_prefix: {
                storeName: {
                  query,
                  max_expansions: 10,
                },
              },
            },
          ],
        },
      },
      sort: [],
    };

    if (typeof input.lat === "number" && typeof input.lng === "number") {
      storeQuery.sort.push({
        _geo_distance: {
          location: {
            lat: input.lat,
            lon: input.lng,
          },
          order: "asc",
          unit: "km",
        },
      });
    }

    const [medicineResult, storeResult] = await Promise.all([
      searchElastic(MEDICINES_INDEX, medicineQuery),
      searchElastic(STORES_INDEX, storeQuery),
    ]);

    const medicines = (medicineResult?.hits?.hits || []).map((hit: any) => hit._source);
    const stores = (storeResult?.hits?.hits || []).map((hit: any) => hit._source);

    const payload = { medicines, stores };
    if (input.skipReturn) {
      return payload;
    }

    return payload;
  }

  static async handleSearch(req: Request, res: Response, next: NextFunction): Promise<any> {
    try {
      const { prescriptionId, filters = {}, userLocation } = req.body;
      if (!prescriptionId) {
        throw new ApiError(400, "prescriptionId is required");
      }

      const result = await this.filterAggregatedResult({
        prescriptionId,
        userId: (req as any).user?._id,
        filters,
      });

      if (!result) {
        throw new ApiError(404, "Aggregated result not found");
      }

      return handleResponse(req, res, 200, "Search results retrieved successfully", {
        ...result,
        userLocation: userLocation || null,
      });
    } catch (error) {
      return next(error);
    }
  }

  static async handleGlobalSearch(req: Request, res: Response, next: NextFunction): Promise<any> {
    try {
      const q = String(req.query.q || "").trim();
      const lat = req.query.lat ? Number(req.query.lat) : undefined;
      const lng = req.query.lng ? Number(req.query.lng) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 10;

      const result = await this.globalSearch({
        query: q,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
        limit,
      });

      return handleResponse(req, res, 200, "Global search completed successfully", result);
    } catch (error) {
      return next(error);
    }
  }
}

SearchService.ensureSearchIndexes().catch((error) => {
  console.error("[SearchService] Failed to initialize Elasticsearch indexes:", error);
});
