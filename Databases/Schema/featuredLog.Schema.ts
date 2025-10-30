import mongoose, { Schema, Document } from "mongoose";
import { IFeaturedMedicineLog } from "../Entities/featuredLog.Interface";

/*───────────────────────────────────────────────────────
  Featured Medicine Log Schema — Store every operation log
───────────────────────────────────────────────────────*/
export const FeaturedMedicineLog = new Schema<IFeaturedMedicineLog & Document>(
  {
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeaturedMedicine",
      required: true,
    },
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE"],
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    oldData: {
      type: Object,
    },
    newData: {
      type: Object,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);