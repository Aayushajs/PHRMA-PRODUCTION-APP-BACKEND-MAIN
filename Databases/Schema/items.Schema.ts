/*
┌───────────────────────────────────────────────────────────────────────┐
│  Defines the structure for Items/Medicines in the inventory.          │
│  Includes pricing, expiry, stock info, GST links, formulation,        │
│  and parent/child unit relations. Tracks audits and view counts.      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Iitem } from '../Entities/item.Interface';
import mongoose, { Schema, Document } from "mongoose";

export const itemSchema = new Schema<Iitem & Document>(
    {
        itemName: {
            type: String,
            required: true,
            trim: true,
        },
        itemDescription: {
            type: String,
            trim: true,
        },
        itemInitialPrice: {
            type: Number,
            required: true,
        },
        itemFinalPrice: {
            type: Number,
            required: true,
        },
        itemParentUnit: {
            type: Schema.Types.ObjectId,
            ref: "ParentUnit"
        },
        itemChildUnit: {
            type: Schema.Types.ObjectId,
            ref: "ChildUnit",
            required: true,
        },
        itemCategory: {
            type: Schema.Types.ObjectId,
            ref: "Category",
            required: true,
        },
        itemMfgDate: {
            type: Date,
            required: true,
        },
        itemExpiryDate: {
            type: Date,
            required: true,
        },
        itemImages: {
            type: [String],
            default: [],
        },
        itemCompany: {
            type: String,
            trim: true,
        },
        itemBatchNumber: {
            type: String,
            trim: true,
        },
        itemGST: {
            type: mongoose.Types.ObjectId,
            ref: "Gst",
            trim: true
        },
        itemDiscount: {
            type: Number,
            default: 0,
        },
        otherInformation: {
            keyFeatures: {
                type: [String],
                default: []
            },
            benefits: {
                type: [String],
                default: []
            },
            precautions: {
                type: [String],
                default: []
            },
            allergyInfo: {
                type: [String],
                default: []
            },
            sideEffects: {
                type: [String],
                default: []
            },
            howToUse: { type: String, trim: true },
            safetyAdvice: {
                type: [String],
                default: []
            },
            ingredients: {
                type: [String],
                default: []
            },
        },
        itemRatings: {
            type: Number,
            default: 2.5,
        },
        code: {
            type: String,
            trim: true,
        },
        HSNCode: {
            type: String,
            trim: true,
        },
        formula: {
            type: String,
            trim: true,
        },
        views: {
            type: Number,
            default: 0,
        },
        changeLog: {
            type: [
                {
                    date: {
                        type: Date,
                        default: Date.now,
                    },
                    by: {
                        name: String,
                        userId: {
                            type: Schema.Types.ObjectId,
                            ref: "User",
                        },
                    },
                },
            ],
            default: [],
        },
        weight: {
            type: String,
        },
        // stockAisleIds: {
        //     type: [mongoose.Schema.Types.ObjectId],
        //     ref: "Aisle",
        //     default: [],
        // },
        isTrending: {
            type: Boolean,
            default: false, // optional field
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        updatedBy: {
            type: Schema.Types.ObjectId,
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
        deletedBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        deletedAt: {
            type: Date,
        },
    },
)