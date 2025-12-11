import mongoose, { Schema, Document } from "mongoose";
import { IFeaturedMedicineLog, IDataChange } from "../Entities/featuredLog.Interface";
/*
┌───────────────────────────────────────────────────────────────────────┐
│  Featured Medicine Log Schema — Store every operation log             │
│                                                                       │
│  Tracks changes to featured medicines, recording the operation type,  │
│  data changes, summary, and the user responsible.                     │
└───────────────────────────────────────────────────────────────────────┘
*/

const DataChangeSchema = new Schema<IDataChange>(
  {
    fieldName: {
      type: String,
    },
    oldValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
    newValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

export const FeaturedMedicineLog = new Schema<IFeaturedMedicineLog & Document>(
  {
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeaturedMedicine",
      required: true,
      index: true,
    },
    operation: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE"],
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
      index: true,
    },
    oldData: {
      type: [DataChangeSchema],
      default: [],
    },
    newData: {
      type: [DataChangeSchema],
      default: [],
    },
    summary: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);