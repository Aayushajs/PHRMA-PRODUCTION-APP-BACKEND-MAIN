/*
┌───────────────────────────────────────────────────────────────────────┐
│  Defines the structure for storing highlighted medicines in           │
│  the e-pharmacy app. Includes fields like title, category, stock,     │
│  discount, image, and ratings. Supports timestamps and references.    │
└───────────────────────────────────────────────────────────────────────┘
*/
import mongoose, { Schema } from "mongoose";
export const featuredMedicineSchema = new Schema({
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
}, {
    timestamps: true,
});
