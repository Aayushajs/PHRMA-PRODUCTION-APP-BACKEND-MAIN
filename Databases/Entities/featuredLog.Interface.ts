/*
┌───────────────────────────────────────────────────────────────────────┐
│  Featured Medicine Log Interface - Type definitions for logs.         │
│  Defines payload for tracking featured medicine changes.              │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";

export interface IDataChange {
    fieldName: string;
    oldValue?: any;
    newValue?: any;
    changedAt?: Date;
}

export interface IFeaturedMedicineLog {
    medicineId: mongoose.Types.ObjectId;
    operation: string;
    action: "CREATE" | "UPDATE" | "DELETE";
    performedBy?: mongoose.Types.ObjectId;
    oldData?: IDataChange[];  // Array of field changes
    newData?: IDataChange[];  // Array of field changes
    summary?: string;         // Summary of changes
    timestamp?: Date;
}