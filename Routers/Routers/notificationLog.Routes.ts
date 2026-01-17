/*
┌───────────────────────────────────────────────────────────────────────┐
│  Notification API Routes - Production Ready                           │
│  Handles notification logs, FCM token management, and notifications   │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router, Request, Response } from 'express';
import NotificationLogService from '../../Services/notificationLog.Service';
import NotificationService from '../../Middlewares/LogMedillewares/notificationLogger';
import { authenticatedUserMiddleware } from '../../Middlewares/CheckLoginMiddleware';
import { handleResponse } from '../../Utils/handleResponse';
import { ApiError } from '../../Utils/ApiError';

const notification = Router();

// ============================================================================
// NOTIFICATION LOG ENDPOINTS
// ============================================================================
notification.get('/active-logs', NotificationLogService.getActiveLogs);
notification.get('/myNotification', authenticatedUserMiddleware, NotificationLogService.getUserLogs);
notification.get('/log/:id', NotificationLogService.getLogById);
notification.get('/stats', authenticatedUserMiddleware, NotificationLogService.getUserStats);
notification.patch('/mark-read/:id', authenticatedUserMiddleware, NotificationLogService.markAsRead);

notification.patch('/mark-multiple-read', authenticatedUserMiddleware, async (req: Request, res: Response) => {
  try {
    const { logIds } = req.body;
    const userId = (req as any).user?._id;

    if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
      throw new ApiError(400, 'logIds array is required');
    }

    const result = await NotificationService.markMultipleAsRead(logIds, userId);

    if (!result) {
      throw new ApiError(500, 'Failed to mark notifications as read');
    }

    return handleResponse(req, res, 200, `${result.modifiedCount} notifications marked as read`, {
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount
    });

  } catch (error: any) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
});

// ============================================================================
// FCM TOKEN MANAGEMENT
// ============================================================================

notification.post('/register-token', authenticatedUserMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const { token } = req.body;

    // Validate token
    if (!token || typeof token !== 'string' || token.trim() === '') {
      throw new ApiError(400, 'Valid FCM token is required');
    }

    // Reject Expo tokens
    if (token.startsWith('ExponentPushToken')) {
      throw new ApiError(400, 'Expo Push Token not supported. Please use FCM token.');
    }

    // Update user's FCM token
    const UserModel = (await import('../../Databases/Models/user.Models')).default;
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { fcmToken: token.trim() },
      { new: true }
    );

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    return handleResponse(req, res, 200, 'FCM token registered successfully', {
      userId: user._id,
      tokenRegistered: true
    });

  } catch (error: any) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to register FCM token'
    });
  }
});

// ============================================================================
// TESTING ENDPOINT (Development/Testing only)
// ============================================================================

notification.post('/send-test', authenticatedUserMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id;
    const fcmToken = (req as any).user?.fcmToken;
    const { title, body, type = 'OTHER' } = req.body;

    // Validate FCM token exists
    if (!fcmToken) {
      throw new ApiError(400, 'FCM token not found. Please login from mobile app.');
    }

    // Reject Expo tokens
    if (fcmToken.startsWith('ExponentPushToken')) {
      throw new ApiError(400, 'Expo Push Token detected. Please login again to get FCM token.');
    }

    // Send notification with log
    const result = await NotificationService.sendNotificationWithLog(
      userId,
      fcmToken,
      title || 'Test Notification',
      body || 'This is a test notification',
      {
        type: type,
        payload: {
          source: 'api_test',
          timestamp: new Date().toISOString()
        }
      }
    );

    return handleResponse(req, res, 200, 'Test notification sent successfully', result);

  } catch (error: any) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to send test notification'
    });
  }
});

export default notification;