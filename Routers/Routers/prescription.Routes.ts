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

// Standard JSON Upload (Waits for OCR to finish and returns structured medicines)
prescriptionRouter.post(
  "/upload",
  customersMiddleware,
  uploadImage.single("prescription"),
  ocrMiddleware({ retries: 1 }),
  PrescriptionService.extractFromPrescription
);

// Live Streaming Upload (Pipes WebSocket real-time updates directly to frontend via SSE)
prescriptionRouter.post(
  "/upload-stream",
  // customersMiddleware,
  uploadImage.single("prescription"),
  ocrStreamHandler({ retries: 1 })
);

export default prescriptionRouter;
