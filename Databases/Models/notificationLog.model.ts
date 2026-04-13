/*
┌───────────────────────────────────────────────────────────────────────┐
│  Notification Log Model - Mongoose model for notification logs.       │
│  Connects NotificationLog Schema to the 'NotificationLog' collection. │
│  Tracks system notifications.                                         │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose, { Model } from 'mongoose';
import { INotificationLog } from '../Entities/notificationLog.interface';
import notificationLogSchema from '../Schema/notificationLog.Schema';

const NotificationLogModel = (mongoose.models.NotificationLog as Model<INotificationLog>) || mongoose.model<INotificationLog>('NotificationLog', notificationLogSchema);

export default NotificationLogModel;