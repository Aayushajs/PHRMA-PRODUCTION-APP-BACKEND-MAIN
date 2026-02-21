/*
┌───────────────────────────────────────────────────────────────────────┐
│  Notification Service - Service 1                                      │
│  Handles Firebase push notification logic with queue-first architecture│
│  All business logic centralized here, routes only handle routing       │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from 'express';
import { notificationQueue } from './notificationQueue.Service';
import { ApiError } from '@utils/ApiError';
import { handleResponse } from '@utils/handleResponse';
import { catchAsyncErrors } from '@utils/catchAsyncErrors';
import UserModel from '@models/user.Models';
import { sendPushNotification, sendBulkNotifications } from '@utils/notification';

// Check if queue is enabled (default: true)
const ENABLE_QUEUE = process.env.ENABLE_NOTIFICATION_QUEUE !== 'false';

export default class NotificationService {
  /**
   * Send notification to authenticated user
   * Fetches FCM token from database using req.user._id from middleware
   * @route POST /api/v1/notification-service/send-to-user
   * @middleware authenticatedUserMiddleware
   */
  public static sendToUser = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { title, body, data } = req.body;
      const userId = req.user?._id;

      // Validation
      if (!userId) {
        throw new ApiError(401, 'Unauthorized: User authentication required');
      }

      if (!title || !body) {
        throw new ApiError(400, 'Missing required fields: title, body');
      }

      // Fetch user's FCM token from database
      const user = await UserModel.findById(userId).select('fcmToken');

      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      if (!user.fcmToken) {
        throw new ApiError(400, 'User does not have an FCM token registered');
      }

      // QUEUE-FIRST: Add to shared queue with FCM token
      if (ENABLE_QUEUE) {
        const notificationId = await notificationQueue.enqueue({
          type: 'single',
          fcmToken: user.fcmToken,
          title,
          body,
          data: data || {},
          maxAttempts: 3,
        });

        return handleResponse(req, res, 202, 'Notification queued successfully', {
          notificationId,
          userId,
          queued: true,
          queuedAt: new Date().toISOString(),
        });
      }

      // FALLBACK: Direct send when queue is disabled
      const result = await sendPushNotification(user.fcmToken, title, body, data || {});

      if (!result.success) {
        throw new ApiError(400, result.error || 'Failed to send notification');
      }

      return handleResponse(req, res, 200, 'Notification sent to user successfully', {
        userId,
        messageId: result.messageId,
        sentAt: new Date().toISOString(),
      });
    }
  );

  /**
   * Send notification to multiple users
   * @route POST /api/v1/notification/sendToUsers
   */
  public static sendToUsers = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      let { userIds, userId, title, body, data } = req.body;

      // Support both single userId and userIds array for backward compatibility
      if (userId && !userIds) {
        userIds = [userId];
      }

      // Validation
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        throw new ApiError(400, 'userIds must be a non-empty array or provide userId');
      }

      if (!title || !body) {
        throw new ApiError(400, 'Missing required fields: title, body');
      }

      // QUEUE-FIRST: Add to shared queue
      if (ENABLE_QUEUE) {
        const notificationId = await notificationQueue.enqueue({
          type: 'users',
          userIds,
          title,
          body,
          data: data || {},
          maxAttempts: 3,
        });

        return handleResponse(req, res, 202, `Notification queued successfully for ${userIds.length} users`, {
          notificationId,
          totalUsers: userIds.length,
          queued: true,
          queuedAt: new Date().toISOString(),
        });
      }

      // FALLBACK: Direct send when queue is disabled
      const users = await UserModel.find({
        _id: { $in: userIds },
        fcmToken: { $exists: true, $ne: null }
      }).select('fcmToken');

      if (users.length === 0) {
        throw new ApiError(400, 'No users found with valid FCM tokens');
      }

      const fcmTokens = users.map((user: any) => user.fcmToken as string);
      const result = await sendBulkNotifications(fcmTokens, title, body, data || {});

      return handleResponse(req, res, 200, 'Bulk notifications sent to users', {
        totalUsers: userIds.length,
        usersWithTokens: fcmTokens.length,
        successCount: result.successCount,
        failureCount: result.failureCount,
        sentAt: new Date().toISOString(),
      });
    }
  );

  /**
   * Send bulk notifications
   * @route POST /api/v1/notification/sendBulk
   */
  public static sendBulk = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { userIds, title, body, data } = req.body;

      // Validation
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        throw new ApiError(400, 'userIds must be a non-empty array');
      }

      if (!title || !body) {
        throw new ApiError(400, 'Missing required fields: title, body');
      }

      // QUEUE-FIRST: Add to shared queue
      if (ENABLE_QUEUE) {
        const notificationId = await notificationQueue.enqueue({
          type: 'bulk',
          userIds,
          title,
          body,
          data: data || {},
          maxAttempts: 3,
        });

        return handleResponse(req, res, 202, `Bulk notification queued successfully for ${userIds.length} users`, {
          notificationId,
          totalUsers: userIds.length,
          queued: true,
          queuedAt: new Date().toISOString(),
        });
      }

      // FALLBACK: Direct send when queue is disabled
      const users = await UserModel.find({
        _id: { $in: userIds },
        fcmToken: { $exists: true, $ne: null }
      }).select('fcmToken');

      if (users.length === 0) {
        throw new ApiError(400, 'No users found with valid FCM tokens');
      }

      const fcmTokens = users.map((user: any) => user.fcmToken as string);
      const result = await sendBulkNotifications(fcmTokens, title, body, data || {});

      return handleResponse(req, res, 200, 'Bulk notifications sent successfully', {
        totalUsersRequested: userIds.length,
        usersWithValidTokens: fcmTokens.length,
        successCount: result.successCount,
        failureCount: result.failureCount,
        sentAt: new Date().toISOString(),
      });
    }
  );

  /**
   * Send notification via FCM token directly
   * @route POST /api/v1/notification/send
   */
  public static send = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { fcmToken, title, body, data } = req.body;

      // Validation
      if (!fcmToken || !title || !body) {
        throw new ApiError(400, 'Missing required fields: fcmToken, title, body');
      }

      // QUEUE-FIRST: Add to shared queue
      if (ENABLE_QUEUE) {
        const notificationId = await notificationQueue.enqueue({
          type: 'single',
          fcmToken,
          title,
          body,
          data: data || {},
          maxAttempts: 3,
        });

        return handleResponse(req, res, 202, 'Notification queued successfully', {
          notificationId,
          queued: true,
          queuedAt: new Date().toISOString(),
        });
      }

      // FALLBACK: Direct send when queue is disabled
      const result = await sendPushNotification(fcmToken, title, body, data || {});

      if (!result.success) {
        throw new ApiError(400, result.error || 'Failed to send notification');
      }

      return handleResponse(req, res, 200, 'Notification sent successfully', {
        messageId: result.messageId,
        sentAt: new Date().toISOString(),
      });
    }
  );

  /**
   * Health check endpoint
   * @route GET /api/v1/notification/health
   */
  public static health = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      return handleResponse(req, res, 200, 'Notification service is healthy', {
        service: 'notification-service',
        status: 'healthy',
        firebaseConfigured: !!process.env.FIREBASE_STRING,
        queueEnabled: ENABLE_QUEUE,
        timestamp: new Date().toISOString(),
      });
    }
  );

  /**
   * Get queue statistics
   * @route GET /api/v1/notification/queue-stats
   */
  public static queueStats = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const stats = await notificationQueue.getStats();

      return handleResponse(req, res, 200, 'Queue statistics retrieved successfully', {
        waiting: stats.waiting,
        processing: stats.processing,
        failed: stats.failed,
        total: stats.waiting + stats.processing + stats.failed,
        queueEnabled: ENABLE_QUEUE,
        timestamp: new Date().toISOString(),
      });
    }
  );
}
