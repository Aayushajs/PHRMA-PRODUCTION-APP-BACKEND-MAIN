/*
┌───────────────────────────────────────────────────────────────────────┐
│  Advertisement Log Model - Mongoose model for ad operation logs.      │
│  Connects AdvertisementLog Schema to the 'AdvertisementLog' collection.│
└───────────────────────────────────────────────────────────────────────┘
*/

import { IAdvertisementLog } from "../Entities/advertisementLog.interface";
import { model } from "mongoose";
import { advertisementLogSchema } from "../Schema/advertisementLog.Schema";


export const AdvertisementLogModel = model<IAdvertisementLog>("AdvertisementLog", advertisementLogSchema);
export default AdvertisementLogModel;
