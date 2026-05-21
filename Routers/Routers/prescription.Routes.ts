/*
┌───────────────────────────────────────────────────────────────────────┐
│  Prescription Routes - API endpoints for prescription uploads.        │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router, Request, Response, NextFunction } from "express";
import PrescriptionService from "../../Services/PrescriptionService/prescription.Service";
import { customersMiddleware } from "../../Middlewares/CheckLoginMiddleware";
import uploadImage from "../../config/multer";
import { ocrMiddleware } from "@development-team/bg-remover";
import sharp from "sharp";
import { validateRequest } from "../../Middlewares/validateRequest";
import { uploadPrescriptionBodySchema } from "../../Utils/lib/validators/prescription.Validator";
import { apiLimiter } from "../../Middlewares/rateLimiter";

const prescriptionRouter = Router();

/**
 * Image optimization middleware — runs Sharp before OCR.
 * Resizes to max 1200px width and compresses to JPEG 82%.
 * Smaller image = OCR processes ~50% faster, less data to transfer.
 */
const optimizeImageForOcr = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  if (!req.file?.buffer) return next();
  try {
    const metadata = await sharp(req.file.buffer).metadata();
    const width = metadata.width ?? 0;

    // Only resize if image is larger than 1200px
    const pipeline = sharp(req.file.buffer);
    if (width > 1200) pipeline.resize({ width: 1200, withoutEnlargement: true });

    req.file.buffer = await pipeline
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    req.file.mimetype = "image/jpeg";
  } catch {
    // If Sharp fails, proceed with original image
  }
  next();
};

// Standard JSON Upload (Waits for OCR to finish and returns structured medicines)
prescriptionRouter.post(
  "/upload",
  apiLimiter,
  customersMiddleware,
  uploadImage.single("prescription"),
  validateRequest({ body: uploadPrescriptionBodySchema }),
  optimizeImageForOcr,
  ocrMiddleware({
    stream: false,
    timeout: 20000,
    retries: 1,
  }),
  PrescriptionService.executeFallbackOcr,
);

// Live Streaming Upload (Pipes real-time updates via SSE + Socket.io)
prescriptionRouter.post(
  "/upload-stream",
  apiLimiter,
  customersMiddleware,
  uploadImage.single("prescription"),
  validateRequest({ body: uploadPrescriptionBodySchema }),
  optimizeImageForOcr,
  PrescriptionService.streamInterceptorMiddleware,
  ocrMiddleware({
    stream: true,
    timeout: 30000,
  }),
  ocrMiddleware({
    stream: false,
    timeout: 20000,
    retries: 1,
  }),
  PrescriptionService.executeFallbackOcr,
);

export default prescriptionRouter;
