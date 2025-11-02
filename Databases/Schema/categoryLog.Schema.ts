import mongoose, { Schema, Document } from "mongoose";
import { ICategoryLog, IDataChange } from "../Entities/categoryLog.interface";

/*───────────────────────────────────────────────────────
  Category Log Schema — Store every operation log
───────────────────────────────────────────────────────*/

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

export const CategoryLog = new Schema<ICategoryLog & Document>(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
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