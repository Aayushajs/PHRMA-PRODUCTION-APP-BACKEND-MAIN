/*
┌───────────────────────────────────────────────────────────────────────┐
│  OCR History Schema - Stores OCR processing records and extracted     │
│  medicine information. Tracks processing metrics, status, and results │
│  for audit and analysis purposes.                                     │
└───────────────────────────────────────────────────────────────────────┘
*/

import { IOcrHistory } from "../Entities/ocrHistory.interface";
import { Schema, Document } from "mongoose";

export const ocrHistorySchema = new Schema<IOcrHistory & Document>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    medicinesHash: {
      type: String,
      index: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    imageName: {
      type: String,
    },
    imageSize: {
      type: Number, // in bytes
    },
    imageFormat: {
      type: String,
      enum: ["jpg", "jpeg", "png", "gif", "webp", "pdf"],
    },
    extractedText: {
      type: String,
      required: true,
    },
    medicines: [
      {
        medicineName: {
          type: String,
          required: true,
        },
        dosage: {
          type: String,
        },
        frequency: {
          type: String,
        },
        quantity: {
          type: Number,
        },
        duration: {
          type: String,
        },
        sideEffects: {
          type: String,
        },
        confidence: {
          type: Number,
          min: 0,
          max: 100,
        },
        _id: false,
      },
    ],
    processingTime: {
      type: Number, // milliseconds
      required: true,
    },
    accuracy: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    ocrEngine: {
      type: String,
      default: "paddle-ocr",
    },
    status: {
      type: String,
      enum: ["success", "failed", "partial", "processing"],
      default: "processing",
      required: true,
    },
    errorMessage: {
      type: String,
    },
    errorCode: {
      type: String,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    processedDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    prescriptionDetails: {
      doctorName: {
        type: String,
      },
      clinicName: {
        type: String,
      },
      prescriptionDate: {
        type: Date,
      },
      patientName: {
        type: String,
      },
      _id: false,
    },
    tags: [
      {
        type: String,
      },
    ],
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    verifiedDate: {
      type: Date,
    },
    notes: {
      type: String,
    },
    metadata: {
      language: {
        type: String,
        default: "en",
      },
      imageQuality: {
        type: String,
        enum: ["high", "medium", "low"],
      },
      pageCount: {
        type: Number,
      },
      containsHandwriting: {
        type: Boolean,
        default: false,
      },
      _id: false,
    },
  },
  { timestamps: true }
);

// Index for faster queries
ocrHistorySchema.index({ userId: 1, createdAt: -1 });
ocrHistorySchema.index({ userId: 1, medicinesHash: 1 }, { unique: false });
ocrHistorySchema.index({ status: 1 });
ocrHistorySchema.index({ "medicines.medicineName": 1 });
