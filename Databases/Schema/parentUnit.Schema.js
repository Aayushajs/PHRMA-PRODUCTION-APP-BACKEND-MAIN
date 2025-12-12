/*
┌───────────────────────────────────────────────────────────────────────┐
│  Defines the structure for Parent Units (e.g., Boxes, Cases).         │
│  Linked to Child Units for stock management and unit conversion.      │
└───────────────────────────────────────────────────────────────────────┘
*/
import { Schema } from "mongoose";
export const parentUnitSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true
    },
    childUnitId: {
        type: Schema.Types.ObjectId,
        ref: "ChildUnit"
    },
    description: {
        type: String,
        trim: true
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
