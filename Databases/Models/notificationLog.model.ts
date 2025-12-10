/*
┌───────────────────────────────────────────────────────────────────────┐
│  Notification Log Model - Mongoose model for notification logs.       │
│  Connects NotificationLog Schema to the 'NotificationLog' collection. │
│  Tracks system notifications.                                         │
└───────────────────────────────────────────────────────────────────────┘
*/

import { model } from 'mongoose';
import { INotificationLog } from '../Entities/notificationLog.interface';
import notificationLogSchema from '../Schema/notificationLog.Schema';

const NotificationLogModel = model<INotificationLog>('NotificationLog', notificationLogSchema);

export default NotificationLogModel;