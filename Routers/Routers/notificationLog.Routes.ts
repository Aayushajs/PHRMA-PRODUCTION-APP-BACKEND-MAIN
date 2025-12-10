/*
┌───────────────────────────────────────────────────────────────────────┐
│  Notification Log Routes - API endpoints for notification logs.       │
│  Routes for viewing, filtering, and marking notifications as read.    │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from 'express';
import NotificationLogService from '../../Services/notificationLog.Service';
import NotificationService from '../../Middlewares/LogMedillewares/notificationLogger';
import { authenticatedUserMiddleware } from '../../Middlewares/CheckLoginMiddleware';

const router = Router();
const r = router;

// Get all active notification logs (filters out deleted/inactive entities)
r.get('/active-logs', NotificationLogService.getActiveLogs);

// Get notification logs for a specific user
r.get('/myNotification', authenticatedUserMiddleware, NotificationLogService.getUserLogs);

// Get a specific notification log by ID
r.get('/log/:id', NotificationLogService.getLogById);

// Get user notification statistics
r.get('/stats', authenticatedUserMiddleware, NotificationLogService.getUserStats);

// Mark notification as read (requires authentication)
r.patch('/mark-read/:id', authenticatedUserMiddleware, NotificationLogService.markAsRead);

// Mark multiple notifications as read (requires authentication)
r.patch('/mark-multiple-read', authenticatedUserMiddleware, async (req, res, next) => {
  try {
    const { logIds } = req.body;
    const userId = (req as any).user?._id;

    if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'logIds array is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    const result = await NotificationService.markMultipleAsRead(logIds, userId);

    if (!result) {
      return res.status(500).json({
        success: false,
        message: 'Failed to mark notifications as read'
      });
    }

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      data: {
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount
      }
    });

  } catch (error: any) {
    console.error('Mark multiple as read error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;