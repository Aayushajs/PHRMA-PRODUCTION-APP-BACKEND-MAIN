/*
┌───────────────────────────────────────────────────────────────────────┐                                                                      │
│  Defines the structure for brand and product advertisements shown     │
│  across the e-pharmacy app.                                           │
│  Supports fields for title, type (Product/Brand/Offer/Event),         │
│  image banner, offer text, target URL, start/end dates, and status.   │
│  Includes references to Product (FeaturedMedicine) and User models.   │
└───────────────────────────────────────────────────────────────────────┘
*/

import { IAdvertisement } from "../Entities/advertisement.interface";
import mongoose, { Schema, Document } from "mongoose";

export const advertisementSchema = new Schema<IAdvertisement & Document>(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["Product", "Brand", "Offer", "Event"],
      required: true,
    },
    brand: {
      type: String,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    offerText: {
      type: String,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    adClickTracking: {
      type: [
        {
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          timestamp: {
            type: Date,
            default: Date.now,
          },
        },
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);


