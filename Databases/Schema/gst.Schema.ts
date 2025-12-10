/*
┌───────────────────────────────────────────────────────────────────────┐
│  Defines GST (Goods and Services Tax) configurations.                 │
│  Stores GST rates (CGST, SGST, IGST), applicability dates, and        │
│  descriptions for tax calculations on items.                          │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Igst } from '../Entities/gst.interface';
import { Schema, Document } from "mongoose";

export const gstSchema = new Schema<Igst & Document>(
    {
        gstName: {
            type: String,
            required: true,
            trim: true,
        },
        gstRate: {
            type: Number,
            required: true,
        },
        gstDescription: {
            type: String,
            trim: true,
        },
        cgstRate: {
            type: Number,
        },
        sgstRate: {
            type: Number,
        },
        igstRate: {
            type: Number,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        applicableFrom: {
            type: Date,
        },
        applicableTo: {
            type: Date,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
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
    }
);