/*
┌───────────────────────────────────────────────────────────────────────┐
│  Prescription Routes - API endpoints for prescription uploads.        │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from "express";
import PrescriptionService from "../../Services/prescription.Service";
import { customersMiddleware } from "../../Middlewares/CheckLoginMiddleware";
import uploadImage from "../../config/multer";
// @ts-ignore - The package might not have type definitions
import { ocrMiddleware, ocrStreamHandler } from "@development-team/bg-remover";

const prescriptionRouter = Router();
const OCR_WS_URL = process.env.OCR_WS_URL;
const OCR_WS_TIMEOUT_MS = Number(process.env.OCR_WS_TIMEOUT_MS || 30000);
const OCR_WS_DEBUG = String(process.env.OCR_WS_DEBUG || "true").toLowerCase() === "true";

// Standard JSON Upload (Waits for OCR to finish and returns structured medicines)
prescriptionRouter.post(
  "/upload",
  customersMiddleware,
  uploadImage.single("prescription"),
  ocrMiddleware({
    wsUrl: OCR_WS_URL,
    timeout: OCR_WS_TIMEOUT_MS,
    retries: 1,
    debug: OCR_WS_DEBUG
  }),
  PrescriptionService.extractFromPrescription
);

// Live Streaming Upload (Pipes WebSocket real-time updates directly to frontend via SSE)
prescriptionRouter.post(
  "/upload-stream",
  // customersMiddleware,
  uploadImage.single("prescription"),
  ocrStreamHandler({
    wsUrl: OCR_WS_URL,
    timeout: OCR_WS_TIMEOUT_MS,
    debug: OCR_WS_DEBUG
  })
);

export default prescriptionRouter;
