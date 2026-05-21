/*
┌───────────────────────────────────────────────────────────────────────┐
│  OCR History Model - Mongoose model for OCR operations.               │
│  Connects OCR History Schema to the 'OcrHistory' collection.          │
└───────────────────────────────────────────────────────────────────────┘
*/

import { ocrHistorySchema } from "../Schema/ocrHistory.Schema";
import { IOcrHistory } from "../Entities/ocrHistory.interface";
import mongoose, { Model } from "mongoose";

export const OcrHistoryModel =
  (mongoose.models.OcrHistory as Model<IOcrHistory>) ||
  mongoose.model<IOcrHistory>("OcrHistory", ocrHistorySchema);

export default OcrHistoryModel;
