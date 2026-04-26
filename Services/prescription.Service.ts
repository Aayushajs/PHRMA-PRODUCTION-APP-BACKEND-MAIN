/*
┌───────────────────────────────────────────────────────────────────────┐
│  Prescription Service - Handle prescription uploads and processing.   │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from "express";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import { ApiError } from "../Utils/ApiError";
import { MedicineDetails, preprocessText, extractMedicinesWithRegex, extractMedicinesFallback } from "./ocr.Service";

interface EnrichedMedicine extends MedicineDetails {
  price: number;
  availability: boolean;
}

export default class PrescriptionService {
  public static extractFromPrescription = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      if (!req.file) {
        return next(new ApiError(400, "No prescription image provided"));
      }

      const ocrError = (req as any).ocrError;
      if (ocrError) {
        return next(new ApiError(502, ocrError.message || "Failed to extract text from image"));
      }

      const ocrResult = (req as any).ocrResult;
      const rawText = ocrResult?.full_text || "";

      // Post-process the text to extract medicines
      const preprocessedText = preprocessText(rawText);
      let extractedMedicines = extractMedicinesWithRegex(preprocessedText);
      if (extractedMedicines.length === 0) {
         extractedMedicines = extractMedicinesFallback(preprocessedText);
      }


      const enriched: EnrichedMedicine[] = extractedMedicines.map((m) => ({
        ...m,
        price: inferPrice(m) ?? 99.0,
        availability: true,
      }));

      const response = {
        text: rawText,
        medicines: enriched,
        meta: {
          detectedCount: enriched.length,
          enriched: true,
        },
      };

      return res.json(response);
    }
  );
}

function inferPrice(m: MedicineDetails): number | null {
  const mgMatch = m.dosage.match(/(\d+\.?\d*)\s*mg/i);
  if (mgMatch && mgMatch[1]) {
    const mg = parseFloat(mgMatch[1]);
    if (!isNaN(mg)) return Math.round((mg * 0.2 + 20) * 100) / 100;
  }
  return null;
}
