import {FeaturedMedicineLog} from "../Schema/featuredLog.Schema";
import {IFeaturedMedicineLog} from "../Entities/featuredLog.Interface";
import {model} from "mongoose";
const FeaturedLog = model<IFeaturedMedicineLog>("FeaturedMedicineLog", FeaturedMedicineLog);
export default FeaturedLog;