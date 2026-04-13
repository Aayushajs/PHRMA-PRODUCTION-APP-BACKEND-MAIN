/*
┌───────────────────────────────────────────────────────────────────────┐
│  Advertisement Log Model - Mongoose model for ad operation logs.      │
│  Connects AdvertisementLog Schema to the 'AdvertisementLog' collection.│
└───────────────────────────────────────────────────────────────────────┘
*/

import { IAdvertisementLog } from "../Entities/advertisementLog.interface";
import mongoose, { Model } from "mongoose";
import { advertisementLogSchema } from "../Schema/advertisementLog.Schema";


export const AdvertisementLogModel = (mongoose.models.AdvertisementLog as Model<IAdvertisementLog>) || mongoose.model<IAdvertisementLog>("AdvertisementLog", advertisementLogSchema);
export default AdvertisementLogModel;
