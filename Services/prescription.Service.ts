/*
┌───────────────────────────────────────────────────────────────────────┐
│  Prescription Service - Handle prescription uploads and processing.   │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from "express";
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import { ApiError } from "../Utils/ApiError";
import { processPrescriptionBuffer, MedicineDetails } from "./ocr.Service";

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

      const result = await processPrescriptionBuffer((req.file as Express.Multer.File).buffer);

      const enriched: EnrichedMedicine[] = (result.medicines || []).map((m) => ({
        ...m,
        price: inferPrice(m) ?? 99.0,
        availability: true,
      }));

      const response = {
        text: result.text,
        medicines: enriched,
        meta: {
          detectedCount: result.meta?.detectedCount ?? 0,
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
