/*
┌───────────────────────────────────────────────────────────────────────┐
│  Advertisement Log Interface - Type definitions for ad logs.          │
│  Structural definition for auditing ad creation/updates.              │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose, { Document } from "mongoose";

export interface IAdvertisementLog extends Document {
  advertisementId: mongoose.Types.ObjectId;
  action: "CREATE" | "UPDATE" | "DELETE";
  performedBy?: mongoose.Types.ObjectId | null;
  oldData?: any;
  newData?: any;
  timestamp: Date;
}