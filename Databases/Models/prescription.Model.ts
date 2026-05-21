/*
┌───────────────────────────────────────────────────────────────────────┐
│  Prescription Model - Mongoose model for prescriptions.               │
│  Connects Prescription Schema to the 'Prescription' collection.       │
└───────────────────────────────────────────────────────────────────────┘
*/

import { prescriptionSchema } from "../Schema/prescription.Schema";
import { IPrescription } from "../Entities/prescription.interface";
import mongoose, { Model } from "mongoose";

export const PrescriptionModel =
  (mongoose.models.Prescription as Model<IPrescription>) ||
  mongoose.model<IPrescription>("Prescription", prescriptionSchema);

export default PrescriptionModel;
