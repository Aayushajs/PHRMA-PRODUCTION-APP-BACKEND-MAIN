/*
┌───────────────────────────────────────────────────────────────────────┐
│  Defines the schema for storing logs related to Advertisement CRUD    │
│  operations. Tracks created, updated, and deleted advertisement data, │
│  including who performed the action and when.                         │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose, { Schema } from "mongoose";
import { IAdvertisementLog } from "../Entities/advertisementLog.interface";

export const advertisementLogSchema = new Schema<IAdvertisementLog>(
  {
    advertisementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Advertisement", 
      required: true,
    },
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE"],
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    oldData: {
      type: Object,
    },
    newData: {
      type: Object,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);