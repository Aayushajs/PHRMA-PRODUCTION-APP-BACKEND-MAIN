/*
┌───────────────────────────────────────────────────────────────────────┐
│  Prescription Service - Handle prescription uploads and processing.   │
└───────────────────────────────────────────────────────────────────────┘
*/
import { catchAsyncErrors } from "../Utils/catchAsyncErrors";
import { ApiError } from "../Utils/ApiError";
import { processPrescriptionBuffer } from "./ocrService";
export default class PrescriptionService {
    static extractFromPrescription = catchAsyncErrors(async (req, res, next) => {
        if (!req.file) {
            return next(new ApiError(400, "No prescription image provided"));
        }
        const result = await processPrescriptionBuffer(req.file.buffer);
        const enriched = (result.medicines || []).map((m) => ({
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
    });
}
function inferPrice(m) {
    const mgMatch = m.dosage.match(/(\d+\.?\d*)\s*mg/i);
    if (mgMatch && mgMatch[1]) {
        const mg = parseFloat(mgMatch[1]);
        if (!isNaN(mg))
            return Math.round((mg * 0.2 + 20) * 100) / 100;
    }
    return null;
}
