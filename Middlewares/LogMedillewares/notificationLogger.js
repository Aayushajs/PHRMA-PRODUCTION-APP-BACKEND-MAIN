/*
┌───────────────────────────────────────────────────────────────────────┐
│  Notification Logger Service - Production Ready                       │
│  Handles FCM push notifications with automatic logging                │
└───────────────────────────────────────────────────────────────────────┘
*/
import { sendPushNotification, sendBulkNotifications } from '../../Utils/notification';
import NotificationLogModel from '../../Databases/Models/notificationLog.model';
// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================
export class NotificationService {
    static async sendNotificationWithLog(userId, fcmToken, title, body, options) {
        let status = 'SENT';
        let errorMessage;
        // Send notification
        try {
            await sendPushNotification(fcmToken, title, body, options.payload || {});
        }
        catch (error) {
            status = 'FAILED';
            errorMessage = error.message || 'Unknown error';
        }
        // Create log entry
        try {
            const logData = {
                userId: userId,
                type: options.type,
                title,
                body,
                relatedEntityId: options.relatedEntityId,
                relatedEntityType: options.relatedEntityType,
                status,
                payload: options.payload,
                fcmToken,
                sentAt: new Date()
            };
            await NotificationLogModel.create(logData);
        }
        catch (logError) {
            // Log creation failed, but don't throw - notification still sent/failed
            errorMessage = errorMessage || `Log creation failed: ${logError.message}`;
        }
        return {
            status,
            sent: status === 'SENT',
            ...(errorMessage && { error: errorMessage })
        };
    }
    static async sendNotificationToMultipleUsers(users, title, body, options) {
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
        const results = await Promise.all(validUsers.map(async (user, index) => {
            const result = bulkResults.results[index];
            if (!result) {
                return {
                    userId: user._id,
                    status: 'FAILED',
                    sent: false
                };
            }
            const status = result.success ? 'SENT' : 'FAILED';
            // Create log entry
            try {
                const logData = {
                    userId: user._id,
                    type: options.type,
                    title,
                    body,
                    relatedEntityId: options.relatedEntityId,
                    relatedEntityType: options.relatedEntityType,
                    status,
                    payload: options.payload,
                    fcmToken: user.fcmToken,
                    sentAt: new Date()
                };
                await NotificationLogModel.create(logData);
            }
            catch (logError) {
                // Log error but don't fail the operation
            }
            return {
                userId: user._id,
                status,
                sent: result.success
            };
        }));
        return {
            total: users.length,
            sent: results.filter(r => r.sent).length,
            failed: results.filter(r => !r.sent).length,
            results
        };
    }
    static async markAsRead(logId, userId) {
        try {
            return await NotificationLogModel.findOneAndUpdate({ _id: logId, userId: userId }, { isRead: true, readAt: new Date() }, { new: true });
        }
        catch (error) {
            return null;
        }
    }
    static async markMultipleAsRead(logIds, userId) {
        try {
            return await NotificationLogModel.updateMany({ _id: { $in: logIds }, userId: userId }, { isRead: true, readAt: new Date() });
        }
        catch (error) {
            return null;
        }
    }
}
export default NotificationService;
