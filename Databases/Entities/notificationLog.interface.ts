import { Document, ObjectId } from 'mongoose';

export interface INotificationLog extends Document {
  _id: ObjectId;
  
  // User who received the notification
  userId: ObjectId;
  
  type: 'CATEGORY_CREATED' | 'CATEGORY_UPDATED' | 'AD_CREATED' | 'AD_UPDATED' | 'AD_CLICKED' | 'FEATURED_CREATED' | 'FEATURED_UPDATED' | 'OTHER';
  title: string;
  body: string;
  
  relatedEntityId?: ObjectId;
  relatedEntityType?: 'Category' | 'Advertisement' | 'FeaturedMedicine' | 'User' | 'Other';
  
  status: 'SENT' | 'FAILED' | 'PENDING';
  
  payload?: Record<string, any>;
  fcmToken?: string;
  
  sentAt: Date;
  readAt?: Date;
  
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationLogCreate {
  userId: ObjectId;
  type: INotificationLog['type'];
  title: string;
  body: string;
  relatedEntityId?: ObjectId;
  relatedEntityType?: INotificationLog['relatedEntityType'];
  status?: INotificationLog['status'];
  payload?: Record<string, any>;
  fcmToken?: string;
  sentAt?: Date;
}