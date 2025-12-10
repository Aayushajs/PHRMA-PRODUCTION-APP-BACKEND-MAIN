/*
┌───────────────────────────────────────────────────────────────────────┐
│  Advertisement Model - Mongoose model for managing ads.               │
│  Connects Advertisement Schema to the 'Advertisement' collection.     │
│  Includes middleware for logging ad-related activities.               │
└───────────────────────────────────────────────────────────────────────┘
*/

import { advertisementSchema } from '../Schema/advertisement.schema';
import { IAdvertisement } from '../Entities/advertisement.interface';
import { model } from 'mongoose';
import { attachAdvertisementLogs } from '../../Middlewares/LogMedillewares/advertisementLogger';

attachAdvertisementLogs(advertisementSchema);

const Advertisement = model<IAdvertisement>("Advertisement", advertisementSchema);
export default Advertisement;