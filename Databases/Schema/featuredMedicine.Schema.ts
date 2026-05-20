/*
┌───────────────────────────────────────────────────────────────────────┐
│  Defines the structure for storing highlighted medicines in           │
│  the e-pharmacy app. Includes fields like title, category, stock,     │
│  discount, image, and ratings. Supports timestamps and references.    │
└───────────────────────────────────────────────────────────────────────┘
*/

import { IFeaturedMedicine } from "../Entities/featuredMedicine.interface";
import mongoose, { Schema, Document } from "mongoose";

export const featuredMedicineSchema = new Schema<IFeaturedMedicine & Document>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    discount: {
      type: Number,
      min: [0, "Discount cannot be negative"],
      max: [100, "Discount cannot exceed 100%"],
      default: 0,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    ratings: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    remarks: {
      type: [
        {
          type: String,
          trim: true,
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// PERF-AUDIT-2026-05: Section 4.5 — featuredmedicines collection indexes
featuredMedicineSchema.index({ featured: 1, createdAt: -1 }); // 4.5 #1
featuredMedicineSchema.index({ category: 1 });                // 4.5 #2
featuredMedicineSchema.index({ title: 1 });                   // 4.5 #3 — uniqueness check

