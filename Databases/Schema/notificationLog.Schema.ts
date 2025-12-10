/*
┌───────────────────────────────────────────────────────────────────────┐
│  Logs system notifications sent to users.                             │
│  Tracks notification type, content, recipient, related entities,      │
│  status (SENT/FAILED), and read receipts.                             │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Schema, Document } from 'mongoose';
import { INotificationLog } from '../Entities/notificationLog.interface';

export const notificationLogSchema = new Schema<INotificationLog & Document>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    type: {
      type: String,
      enum: ['CATEGORY_CREATED', 'CATEGORY_UPDATED', 'AD_CREATED', 'AD_UPDATED', 'AD_CLICKED', 'FEATURED_CREATED', 'FEATURED_UPDATED', 'OTHER'],
      required: true,
      index: true
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },

    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },

    relatedEntityId: {
      type: Schema.Types.ObjectId,
      required: false,
      index: true
    },

    relatedEntityType: {
      type: String,
      enum: ['Category', 'Advertisement', 'FeaturedMedicine', 'User', 'Other'],
      required: false,
      index: true
    },

    status: {
      type: String,
      enum: ['SENT', 'FAILED', 'PENDING'],
      default: 'SENT',
      index: true
    },

    payload: {
      type: Schema.Types.Mixed,
      default: {}
    },

    fcmToken: {
      type: String,
      required: false
    },

    sentAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    readAt: {
      type: Date,
      required: false
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound indexes for efficient queries
notificationLogSchema.index({ userId: 1, sentAt: -1 });
notificationLogSchema.index({ relatedEntityId: 1, relatedEntityType: 1 });
notificationLogSchema.index({ type: 1, sentAt: -1 });
notificationLogSchema.index({ userId: 1, isRead: 1, sentAt: -1 });

export default notificationLogSchema;