/*
┌───────────────────────────────────────────────────────────────────────┐
│  Aggregated Result Schema - Precomputed query-ready OCR aggregation.  │
│  Optimized for fast filter/search operations without recomputation.    │
└───────────────────────────────────────────────────────────────────────┘
*/

import { IAggregatedResult } from "../Entities/aggregatedResult.interface";
import { Schema, Document } from "mongoose";

export const aggregatedResultSchema = new Schema<IAggregatedResult & Document>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    prescriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Prescription",
      required: true,
    },
    prescriptionHash: {
      type: String,
      index: true,
    },
    medicines: [
      {
        name: { type: String, required: true },
        stores: [
          {
            storeId: {
              type: Schema.Types.ObjectId,
              required: true,
            },
            storeName: { type: String, required: true },
            price: { type: Number, default: 0 },
            availability: {
              type: String,
              enum: ["in_stock", "out_of_stock", "limited", "pre_order"],
              default: "out_of_stock",
            },
            distance: { type: Number },
            brand: { type: String },
            genericName: { type: String },
            rating: { type: Number },
            _id: false,
          },
        ],
        _id: false,
      },
    ],
    stores: [
      {
        storeId: {
          type: Schema.Types.ObjectId,
          required: true,
          index: true,
        },
        storeName: { type: String, required: true },
        distance: { type: Number },
        availableMedicines: [
          {
            medicineId: {
              type: Schema.Types.ObjectId,
            },
            medicineName: { type: String, required: true },
            price: { type: Number, default: 0 },
            availability: {
              type: String,
              enum: ["in_stock", "out_of_stock", "limited", "pre_order"],
              default: "out_of_stock",
            },
            distance: { type: Number },
            brand: { type: String },
            quantity: { type: Number, default: 1 },
            _id: false,
          },
        ],
        missingMedicines: [String],
        totalAvailable: { type: Number, default: 0 },
        totalRequired: { type: Number, default: 0 },
        totalCostEstimate: { type: Number, default: 0 },
        rating: { type: Number },
        location: {
          type: {
            type: String,
            enum: ["Point"],
            default: "Point",
          },
          coordinates: {
            type: [Number],
            default: undefined,
          },
        },
        _id: false,
      },
    ],
    geoIndex: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: undefined,
      },
    },
    summary: {
      totalMedicines: { type: Number, default: 0 },
      totalStores: { type: Number, default: 0 },
      totalAvailableMedicines: { type: Number, default: 0 },
      totalMissingMedicines: { type: Number, default: 0 },
      estimatedCost: { type: Number, default: 0 },
      _id: false,
    },
    filtersApplied: {
      radiusKm: { type: Number },
      priceRange: { type: [Number] },
      availability: { type: [String] },
      brands: { type: [String] },
      _id: false,
    },
    buildStatus: {
      type: String,
      enum: ["building", "ready", "failed"],
      default: "building",
      index: true,
    },
    cacheKey: {
      type: String,
      index: true,
    },
    cacheStatus: {
      type: String,
      enum: ["fresh", "stale", "expired"],
      default: "fresh",
      index: true,
    },
    cacheExpiresAt: {
      type: Date,
      index: true,
    },
    lastRefreshedAt: {
      type: Date,
      default: () => new Date(),
    },
    ttl: {
      type: Number,
      default: 1800, // 30 minutes in seconds
      description: "Time-to-live for aggregation cache",
    },
  },
  { timestamps: true }
);

aggregatedResultSchema.index({ prescriptionId: 1 });
aggregatedResultSchema.index({ userId: 1 });
aggregatedResultSchema.index({ geoIndex: "2dsphere" });
aggregatedResultSchema.index({ userId: 1, prescriptionHash: 1 }, { unique: false });
