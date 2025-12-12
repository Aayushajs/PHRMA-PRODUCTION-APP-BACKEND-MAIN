/*
┌───────────────────────────────────────────────────────────────────────┐
│  Featured Medicine Model - Mongoose model for highlighted items.      │
│  Connects the FeaturedMedicine Schema to the DB collection.           │
│  Includes logging middleware for tracking changes.                    │
└───────────────────────────────────────────────────────────────────────┘
*/
import { featuredMedicineSchema } from '../Schema/featuredMedicine.Schema';
import { model } from 'mongoose';
import { FeaturedMedicineLogger } from '../../Middlewares/LogMedillewares/featuredMedicineLog';
// log middleware
FeaturedMedicineLogger(featuredMedicineSchema);
const FeaturedMedicine = model("FeaturedMedicine", featuredMedicineSchema);
export default FeaturedMedicine;
