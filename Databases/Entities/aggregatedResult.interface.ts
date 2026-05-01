/*
┌───────────────────────────────────────────────────────────────────────┐
│  Aggregated Result Interface - Precomputed OCR/search read model.     │
│  Stores medicine-centric and store-centric aggregation results.       │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";

export interface IAggregatedMedicineStore {
  storeId: mongoose.Types.ObjectId;
  storeName: string;
  price: number;
  availability: "in_stock" | "out_of_stock" | "limited" | "pre_order";
  distance?: number;
  brand?: string;
  genericName?: string;
  rating?: number;
}

export interface IAggregatedStoreMedicine {
  medicineId?: mongoose.Types.ObjectId;
  medicineName: string;
  price?: number;
  availability: "in_stock" | "out_of_stock" | "limited" | "pre_order";
  distance?: number;
  brand?: string;
  quantity?: number;
}

export interface IAggregatedResultStore {
  storeId: mongoose.Types.ObjectId;
  storeName: string;
  distance?: number;
  availableMedicines: IAggregatedStoreMedicine[];
  missingMedicines: string[];
  totalAvailable: number;
  totalRequired: number;
  totalCostEstimate: number;
  rating?: number;
  location?: {
    type: "Point";
    coordinates: [number, number];
  };
}

export interface IAggregatedResult {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  prescriptionId: mongoose.Types.ObjectId;
  prescriptionHash?: string;
  medicines: Array<{
    name: string;
    stores: IAggregatedMedicineStore[];
  }>;
  stores: IAggregatedResultStore[];
  geoIndex?: {
    type: "Point";
    coordinates: [number, number];
  };
  summary?: {
    totalMedicines: number;
    totalStores: number;
    totalAvailableMedicines: number;
    totalMissingMedicines: number;
    estimatedCost: number;
  };
  filtersApplied?: {
    radiusKm?: number;
    priceRange?: [number, number];
    availability?: string[];
    brands?: string[];
  };
  buildStatus?: "building" | "ready" | "failed";
  cacheKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
