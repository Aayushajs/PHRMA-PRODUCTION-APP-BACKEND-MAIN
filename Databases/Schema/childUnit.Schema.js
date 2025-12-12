/*
┌───────────────────────────────────────────────────────────────────────┐
│  Defines the structure for Child Units (e.g., strips, bottles).       │
│  Includes code, weight, and description. Linked to Parent Units       │
│  for inventory unit conversions.                                      │
└───────────────────────────────────────────────────────────────────────┘
*/
import { Schema } from "mongoose";
export const childUnitSchema = new Schema({
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
        ref: "User"
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });
