/*
┌───────────────────────────────────────────────────────────────────────┐
│  Prescription Routes - API endpoints for prescription uploads.        │
└───────────────────────────────────────────────────────────────────────┘
*/
import { Router } from "express";
import PrescriptionService from "../../Services/prescription.Service";
import { customersMiddleware } from "../../Middlewares/CheckLoginMiddleware";
import uploadImage from "../../config/multer";
const prescriptionRouter = Router();
// Upload prescription image and extract data
prescriptionRouter.post("/upload", customersMiddleware, uploadImage.single("prescription"), PrescriptionService.extractFromPrescription);
export default prescriptionRouter;
