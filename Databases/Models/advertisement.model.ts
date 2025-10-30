import {advertisementSchema} from '../Schema/advertisement.schema';
import { IAdvertisement } from '../Entities/advertisement.interface';
import { model } from 'mongoose';
import { attachAdvertisementLogs } from '../../Middlewares/LogMedillewares/advertisementLogger';

attachAdvertisementLogs(advertisementSchema);

const Advertisement = model<IAdvertisement>("Advertisement", advertisementSchema);
export default Advertisement;