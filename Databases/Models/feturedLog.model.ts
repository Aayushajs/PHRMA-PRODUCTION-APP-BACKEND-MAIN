/*
┌───────────────────────────────────────────────────────────────────────┐
│  Featured Medicine Log Model - Mongoose model for operation logs.     │
│  Connects FeaturedMedicineLog Schema to the DB collection.            │
│  Used for auditing changes to featured medicines.                     │
└───────────────────────────────────────────────────────────────────────┘
*/

import { FeaturedMedicineLog } from "../Schema/featuredLog.Schema";
import { IFeaturedMedicineLog } from "../Entities/featuredLog.Interface";
import { model } from "mongoose";
const FeaturedLog = model<IFeaturedMedicineLog>("FeaturedMedicineLog", FeaturedMedicineLog);
export default FeaturedLog;