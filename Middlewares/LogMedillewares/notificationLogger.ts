/*
┌───────────────────────────────────────────────────────────────────────┐
│  Notification Logger Service - Production Ready                       │
│  Handles FCM push notifications with automatic logging                │
└───────────────────────────────────────────────────────────────────────┘
*/

import { sendPushNotification, sendBulkNotifications } from '../../Utils/notification';
import NotificationLogModel from '../../Databases/Models/notificationLog.model';
import { INotificationLogCreate } from '../../Databases/Entities/notificationLog.interface';
import mongoose from 'mongoose';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type NotificationType = 
  | 'CATEGORY_CREATED' 
  | 'CATEGORY_UPDATED' 
  | 'AD_CREATED' 
  | 'AD_UPDATED' 
  | 'AD_CLICKED' 
  | 'FEATURED_CREATED' 
  | 'FEATURED_UPDATED' 
  | 'OTHER';

type EntityType = 'Category' | 'Advertisement' | 'FeaturedMedicine' | 'User' | 'Other';

interface NotificationOptions {
  type: NotificationType;
  relatedEntityId?: string | mongoose.Types.ObjectId;
  relatedEntityType?: EntityType;
  payload?: Record<string, any>;
}

interface User {
  _id: string;
  fcmToken: string;
  name?: string;
}

interface SendResult {
  status: 'SENT' | 'FAILED';
  sent: boolean;
  error?: string;
}

interface BulkSendResult {
  total: number;
  sent: number;
  failed: number;
  results: Array<{
    userId: string;
    status: 'SENT' | 'FAILED';
    sent: boolean;
  }>;
}

// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================

export class NotificationService {

  public static async sendNotificationWithLog(
    userId: string | mongoose.Types.ObjectId,
    fcmToken: string,
    title: string,
    body: string,
    options: NotificationOptions
  ): Promise<SendResult> {
    let status: 'SENT' | 'FAILED' = 'SENT';
    let errorMessage: string | undefined;

    // Send notification
    try {
      await sendPushNotification(fcmToken, title, body, options.payload || {});
    } catch (error: any) {
      status = 'FAILED';
      errorMessage = error.message || 'Unknown error';
    }

    // Create log entry
    try {
      const logData: INotificationLogCreate = {
        userId: userId as any,
        type: options.type,
        title,
        body,
        relatedEntityId: options.relatedEntityId as any,
        relatedEntityType: options.relatedEntityType,
        status,
        payload: options.payload,
        fcmToken,
        sentAt: new Date()
      };

      await NotificationLogModel.create(logData);
    } catch (logError: any) {
      // Log creation failed, but don't throw - notification still sent/failed
      errorMessage = errorMessage || `Log creation failed: ${logError.message}`;
    }

    return { 
      status, 
      sent: status === 'SENT',
      ...(errorMessage && { error: errorMessage })
    };
  }

  public static async sendNotificationToMultipleUsers(
    users: User[],
    title: string,
    body: string,
    options: NotificationOptions
  ): Promise<BulkSendResult> {
    // Filter users with valid FCM tokens
    const validUsers = users.filter(user => user.fcmToken && user.fcmToken.length > 0);
    
    if (validUsers.length === 0) {
      return {
        total: users.length,
        sent: 0,
        failed: 0,
        results: []
      };
    }

    // Extract tokens
    const tokens = validUsers.map(user => user.fcmToken);

    // Send bulk notifications
    const bulkResults = await sendBulkNotifications(tokens, title, body, options.payload || {});

    // Create log entries and collect results
    const results = await Promise.all(
      validUsers.map(async (user, index) => {
        const result = bulkResults.results[index];
        if (!result) {
          return {
            userId: user._id,
            status: 'FAILED' as 'SENT' | 'FAILED',
            sent: false
          };
        }
        
        const status: 'SENT' | 'FAILED' = result.success ? 'SENT' : 'FAILED';

        // Create log entry
        try {
          const logData: INotificationLogCreate = {
            userId: user._id as any,
            type: options.type,
            title,
            body,
            relatedEntityId: options.relatedEntityId as any,
            relatedEntityType: options.relatedEntityType,
            status,
            payload: options.payload,
            fcmToken: user.fcmToken,
            sentAt: new Date()
          };

          await NotificationLogModel.create(logData);
        } catch (logError) {
          // Log error but don't fail the operation
        }

        return {
          userId: user._id,
          status,
          sent: result.success
        };
      })
    );

    return {
      total: users.length,
      sent: results.filter(r => r.sent).length,
      failed: results.filter(r => !r.sent).length,
      results
    };
  }

  public static async markAsRead(logId: string, userId: string) {
    try {
      return await NotificationLogModel.findOneAndUpdate(
        { _id: logId, userId: userId },
        { isRead: true, readAt: new Date() },
        { new: true }
      );
    } catch (error) {
      return null;
    }
  }

  public static async markMultipleAsRead(logIds: string[], userId: string) {
    try {
      return await NotificationLogModel.updateMany(
        { _id: { $in: logIds }, userId: userId },
        { isRead: true, readAt: new Date() }
      );
    } catch (error) {
      return null;
    }
  }
}

export default NotificationService;