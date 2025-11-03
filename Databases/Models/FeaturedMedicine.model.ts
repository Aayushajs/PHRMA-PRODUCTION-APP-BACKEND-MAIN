import {featuredMedicineSchema} from '../Schema/featuredMedicine';
import { IFeaturedMedicine } from '../Entities/featuredMedicine.interface';
import { model } from 'mongoose';
import { FeaturedMedicineLogger } from '../../Middlewares/LogMedillewares/featuredMedicineLog';


// log middleware
FeaturedMedicineLogger(featuredMedicineSchema);
const FeaturedMedicine = model<IFeaturedMedicine>("FeaturedMedicine", featuredMedicineSchema);
export default FeaturedMedicine;                                                    