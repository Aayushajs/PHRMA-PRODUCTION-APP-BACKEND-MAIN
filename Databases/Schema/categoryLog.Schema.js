import mongoose, { Schema } from "mongoose";
/*
┌───────────────────────────────────────────────────────────────────────┐
│  Category Log Schema — Store every operation log                      │
│                                                                       │
│  Tracks changes to category data, including old/new values, action    │
│  type (CREATE, UPDATE, DELETE), and the user who performed it.        │
└───────────────────────────────────────────────────────────────────────┘
*/
const DataChangeSchema = new Schema({
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
}, { _id: false });
export const CategoryLog = new Schema({
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
}, { timestamps: true });
