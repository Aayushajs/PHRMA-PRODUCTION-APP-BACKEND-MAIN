/*
┌───────────────────────────────────────────────────────────────────────┐
│  Featured Medicine Log Model - Mongoose model for operation logs.     │
│  Connects FeaturedMedicineLog Schema to the DB collection.            │
│  Used for auditing changes to featured medicines.                     │
└───────────────────────────────────────────────────────────────────────┘
*/
import { FeaturedMedicineLog } from "../Schema/featuredLog.Schema";
import { model } from "mongoose";
const FeaturedLog = model("FeaturedMedicineLog", FeaturedMedicineLog);
export default FeaturedLog;
