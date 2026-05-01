/*
┌───────────────────────────────────────────────────────────────────────┐
│  OCR History Interface - TypeScript definitions for OCR operations.   │
│  Stores historical records of OCR processing including extracted data,│
│  processing metadata, and status information.                         │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";

export interface IOcrHistory {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId; // Reference to user who performed OCR
  medicinesHash?: string; // Deduplication hash for medicine list
  imageUrl: string; // URL of the original image processed
  imageName?: string; // Name of the uploaded image
  imageSize?: number; // Size of image in bytes
  imageFormat?: string; // Format: jpg, png, etc.
  extractedText: string; // Raw text extracted by OCR
  medicines: Array<{
    medicineName: string;
    dosage?: string;
    frequency?: string;
    quantity?: number;
    duration?: string;
    sideEffects?: string;
    confidence?: number; // Confidence score for this medicine extraction
  }>;
  processingTime: number; // Time taken to process in milliseconds
  accuracy: number; // OCR confidence/accuracy percentage (0-100)
  ocrEngine?: string; // Which OCR engine used (e.g., Tesseract, Google Vision, etc.)
  status: "success" | "failed" | "partial" | "processing";
  errorMessage?: string; // Error message if status is failed
  errorCode?: string; // Error code for debugging
  retryCount?: number; // Number of retry attempts
  processedDate: Date; // Date when OCR was processed
  prescriptionDetails?: {
    doctorName?: string;
    clinicName?: string;
    prescriptionDate?: Date;
    patientName?: string;
  };
  tags?: string[]; // Custom tags for organization
  isVerified?: boolean; // Whether OCR result was manually verified
  verifiedBy?: mongoose.Types.ObjectId; // User who verified the OCR
  verifiedDate?: Date;
  notes?: string; // Additional notes about OCR
  metadata?: {
    language?: string;
    imageQuality?: "high" | "medium" | "low";
    pageCount?: number;
    containsHandwriting?: boolean;
  };
  createdAt?: Date;
  updatedAt?: Date;
}
