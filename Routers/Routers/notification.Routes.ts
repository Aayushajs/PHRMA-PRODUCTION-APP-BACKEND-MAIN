/*
┌───────────────────────────────────────────────────────────────────────┐
│  Notification Routes - Service 1                                       │
│  Handles routing for Firebase push notifications                       │
│  All business logic delegated to NotificationService                   │
│  QUEUE-FIRST ARCHITECTURE: All notifications routed through Redis      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from 'express';
import NotificationService from '@services/notification.Service';
import { authenticatedUserMiddleware } from '@middlewares/CheckLoginMiddleware';
import { internalServiceAuth } from '@middlewares/internalServiceAuth';

const notificationRouter = Router();

/*
┌─────────────────────────────────────────────────────────────────┐
│  PUBLIC ROUTES (No Authentication)                              │
└─────────────────────────────────────────────────────────────────┘
*/

/**
 * Health check endpoint
 * @route GET /api/v1/notification/health
 * @returns 200 - Service health status
 */
notificationRouter.get('/health', NotificationService.health);

/**
 * Get queue statistics
 * @route GET /api/v1/notification/queue-stats
 * @returns 200 - Queue statistics
 */
notificationRouter.get('/queue-stats', NotificationService.queueStats);

/*
┌─────────────────────────────────────────────────────────────────┐
│  AUTHENTICATED USER ROUTES (JWT Token Required)                 │
│  Fetches FCM token from authenticated user (req.user._id)       │
└─────────────────────────────────────────────────────────────────┘
*/

/**
 * Send notification to authenticated user
 * @route POST /api/v1/notification/sendToUser
 * @middleware authenticatedUserMiddleware - Requires JWT token
 * @body { title, body, data }
 * @returns 202 - Notification queued successfully
 * @returns 400 - Bad request (missing fields or no FCM token)
 * @returns 401 - Unauthorized
 */
notificationRouter.post(
  '/sendToUser',
  authenticatedUserMiddleware,
  NotificationService.sendToUser
);

/*
┌─────────────────────────────────────────────────────────────────┐
│  INTERNAL API ROUTES (Internal API Key Required)                │
│  For service-to-service communication                            │
└─────────────────────────────────────────────────────────────────┘
*/

/**
 * Send notification using FCM token directly
 * @route POST /api/v1/notification/send
 * @middleware internalServiceAuth - Requires x-internal-api-key header
 * @body { fcmToken, title, body, data }
 * @returns 202 - Notification queued successfully
 * @returns 400 - Bad request (missing fields or send failure)
 * @returns 401 - Unauthorized (invalid API key)
 */
notificationRouter.post('/send', internalServiceAuth, NotificationService.send);

/**
 * Send notification to a user by userId (fetches FCM token from DB)
 * @route POST /api/v1/notification/send-to-user
 * @middleware internalServiceAuth - Requires x-internal-api-key header
 * @body { userId, title, body, data }
 * @returns 202 - Notification queued successfully
 * @returns 400 - Bad request (missing fields)
 * @returns 404 - User not found
 * @returns 401 - Unauthorized (invalid API key)
 * @note Kept for backward compatibility, use /sendToUsers for consistency
 */
notificationRouter.post('/send-to-user', internalServiceAuth, NotificationService.sendToUsers);

/**
 * Send notifications to multiple users by userIds
 * @route POST /api/v1/notification/sendToUsers
 * @middleware internalServiceAuth - Requires x-internal-api-key header
 * @body { userIds: string[], title, body, data }
 * @returns 202 - Notification queued successfully
 * @returns 400 - Bad request (missing fields, no valid users)
 * @returns 401 - Unauthorized (invalid API key)
 */
notificationRouter.post('/sendToUsers', internalServiceAuth, NotificationService.sendToUsers);

/**
 * Send notifications to multiple users by userIds (alias for /sendToUsers)
 * @route POST /api/v1/notification/send-to-users
 * @middleware internalServiceAuth - Requires x-internal-api-key header
 * @body { userIds: string[], title, body, data }
 * @returns 202 - Notification queued successfully
 * @note Kept for backward compatibility
 */
notificationRouter.post('/send-to-users', internalServiceAuth, NotificationService.sendToUsers);

/**
 * Send bulk notifications (same as sendToUsers)
 * @route POST /api/v1/notification/sendBulk
 * @middleware internalServiceAuth - Requires x-internal-api-key header
 * @body { userIds: string[], title, body, data }
 * @returns 202 - Notification queued successfully
 * @note Kept for backward compatibility
 */
notificationRouter.post('/sendBulk', internalServiceAuth, NotificationService.sendBulk);

/**
 * Send bulk notifications (alias)
 * @route POST /api/v1/notification/send-bulk
 * @middleware internalServiceAuth - Requires x-internal-api-key header
 * @body { userIds: string[], title, body, data }
 * @returns 202 - Notification queued successfully
 * @note Kept for backward compatibility
 */
notificationRouter.post('/send-bulk', internalServiceAuth, NotificationService.sendBulk);

export default notificationRouter;
