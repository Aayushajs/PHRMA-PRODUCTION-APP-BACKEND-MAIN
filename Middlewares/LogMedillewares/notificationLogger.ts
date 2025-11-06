import { sendPushNotification } from '../../Utils/notification';
import NotificationLogModel from '../../Databases/Models/notificationLog.model';
import { INotificationLogCreate } from '../../Databases/Entities/notificationLog.interface';
import mongoose from 'mongoose';

export class NotificationService {

  public static async sendNotificationWithLog(
    userId: string | mongoose.Types.ObjectId,
    fcmToken: string,
    title: string,
    body: string,
    options: {
      type: 'CATEGORY_CREATED' | 'CATEGORY_UPDATED' | 'AD_CREATED' | 'AD_UPDATED' | 'AD_CLICKED' | 'FEATURED_CREATED' | 'FEATURED_UPDATED' | 'OTHER';
      relatedEntityId?: string | mongoose.Types.ObjectId;
      relatedEntityType?: 'Category' | 'Advertisement' | 'FeaturedMedicine' | 'User' | 'Other';
      payload?: Record<string, any>;
    }
  ) {
    let status: 'SENT' | 'FAILED' = 'SENT';
    
    try {
      // Send the actual notification
      await sendPushNotification(fcmToken, title, body, options.payload || {});
    } catch (error) {
      console.error('Failed to send notification:', error);
      status = 'FAILED';
    }

    // Create log entry regardless of notification success/failure
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
    } catch (logError) {
      console.error('Failed to create notification log:', logError);
    }

    return { status, sent: status === 'SENT' };
  }


  public static async sendNotificationToMultipleUsers(
    users: Array<{ _id: string; fcmToken: string; name?: string }>,
    title: string,
    body: string,
    options: {
      type: 'CATEGORY_CREATED' | 'CATEGORY_UPDATED' | 'AD_CREATED' | 'AD_UPDATED' | 'AD_CLICKED' | 'FEATURED_CREATED' | 'FEATURED_UPDATED' | 'OTHER';
      relatedEntityId?: string | mongoose.Types.ObjectId;
      relatedEntityType?: 'Category' | 'Advertisement' | 'FeaturedMedicine' | 'User' | 'Other';
      payload?: Record<string, any>;
    }
  ) {
    const results = [];
    
    for (const user of users) {
      if (!user.fcmToken) continue;
      
      const result = await this.sendNotificationWithLog(
        user._id,
        user.fcmToken,
        title,
        body,
        options
      );

      results.push({
        userId: user._id,
        status: result.status,
        sent: result.sent
      });
    }

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
        { 
          _id: logId,
          userId: userId
        },
        { 
          isRead: true,
          readAt: new Date()
        },
        { new: true }
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      return null;
    }
  }

  public static async markMultipleAsRead(logIds: string[], userId: string) {
    try {
      return await NotificationLogModel.updateMany(
        { 
          _id: { $in: logIds },
          userId: userId
        },
        { 
          isRead: true,
          readAt: new Date()
        }
      );
    } catch (error) {
      console.error('Failed to mark multiple notifications as read:', error);
      return null;
    }
  }
}

export default NotificationService;