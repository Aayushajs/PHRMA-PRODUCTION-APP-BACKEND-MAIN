import { Schema, Document } from "mongoose";
import { IChildUnit } from "../Entities/childUnit.interface";

export const childUnitSchema = new Schema<IChildUnit & Document>(
  {
    parentUnitId: {
      type: Schema.Types.ObjectId,
      ref: "ParentUnit",
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    description: {
      type: String,
      trim: true
    },
    weight: {
      type: Number,
      min: 1
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);