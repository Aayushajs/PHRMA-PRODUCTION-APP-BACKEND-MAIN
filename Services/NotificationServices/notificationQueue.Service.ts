/*
┌───────────────────────────────────────────────────────────────────────┐
│  SHARED Notification Queue Service - Service 1                        │
│  FIFO Queue for all notifications with retry mechanism                │
│  Uses Redis for persistent queue storage                              │
│  SHARED WITH SERVICE 2 - Both services write, Service 1 processes     │
└───────────────────────────────────────────────────────────────────────┘
*/

import { redis } from '@config/redis';
import { sendPushNotification, sendBulkNotifications } from '@utils/notification';

// ============================================================================
// TYPES
// ============================================================================

export interface QueuedNotification {
  id: string;
  userId?: string;      // For single user notification
  fcmToken?: string;    // For single FCM token notification
  userIds?: string[];   // For bulk user notifications
  title: string;
  body: string;
  data?: Record<string, any>;
  type: 'single' | 'bulk' | 'user' | 'users';
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  lastAttemptAt?: string;
  error?: string;
}

// ============================================================================
// NOTIFICATION QUEUE CLASS
// ============================================================================

class NotificationQueue {
  // SHARED QUEUE KEYS - Must match Service 2 exactly
  private readonly QUEUE_KEY = 'notification:queue';
  private readonly PROCESSING_KEY = 'notification:processing';
  private readonly FAILED_KEY = 'notification:failed';
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private isProcessing = false;

  /**
   * Add notification to shared queue
   * Called by both Service 1 and Service 2
   */
  async enqueue(notification: Omit<QueuedNotification, 'id' | 'attempts' | 'createdAt'>): Promise<string> {
    try {
      const queuedNotification: QueuedNotification = {
        ...notification,
        id: this.generateId(),
        attempts: 0,
        createdAt: new Date().toISOString(),
      };

      await redis.rPush(this.QUEUE_KEY, JSON.stringify(queuedNotification));
      console.log(`📥 Notification queued: ${queuedNotification.id} (type: ${queuedNotification.type})`);

      return queuedNotification.id;
    } catch (error) {
      console.error('❌ Failed to enqueue notification:', error);
      throw error;
    }
  }

  /**
   * Process notifications from shared queue
   * ONLY Service 1 should call this (it has Firebase credentials)
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      console.log('⏭️  Queue processor already running, skipping...');
      return;
    }

    this.isProcessing = true;
    console.log('🔄 Processing notification queue...');

    try {
      while (true) {
        // Move notification from queue to processing
        const item = await redis.lMove(
          this.QUEUE_KEY,
          this.PROCESSING_KEY,
          'LEFT',
          'RIGHT'
        );

        if (!item) {
          // Queue is empty
          break;
        }

        const notification: QueuedNotification = JSON.parse(item);
        console.log(`🔄 Processing notification ${notification.id} (attempt ${notification.attempts + 1}/${notification.maxAttempts})`);

        // Process notification
        const success = await this.processNotification(notification);

        if (success) {
          // Remove from processing queue on success
          await redis.lRem(this.PROCESSING_KEY, 1, item);
          console.log(`✅ Notification ${notification.id} sent successfully`);
        } else {
          // Handle failure
          notification.attempts += 1;
          notification.lastAttemptAt = new Date().toISOString();

          // Remove from processing
          await redis.lRem(this.PROCESSING_KEY, 1, item);

          if (notification.attempts >= notification.maxAttempts) {
            // Max retries exceeded, move to failed queue
            await redis.rPush(this.FAILED_KEY, JSON.stringify(notification));
            console.error(`❌ Notification ${notification.id} failed after ${notification.maxAttempts} attempts`);
          } else {
            // Re-queue for retry
            await redis.rPush(this.QUEUE_KEY, JSON.stringify(notification));
            console.log(`🔄 Notification ${notification.id} re-queued for retry (attempt ${notification.attempts}/${notification.maxAttempts})`);
          }
        }

        // Small delay between processing to prevent overwhelming Firebase
        await this.sleep(100);
      }

      console.log('✅ Queue processing complete');
    } catch (error) {
      console.error('❌ Queue processing error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single notification - Send to Firebase
   */
  private async processNotification(notification: QueuedNotification): Promise<boolean> {
    try {
      switch (notification.type) {
        case 'single':
          return await this.processSingleNotification(notification);
        case 'user':
          return await this.processUserNotification(notification);
        case 'users':
          return await this.processUsersNotification(notification);
        case 'bulk':
          return await this.processBulkNotification(notification);
        default:
          console.error(`❌ Unknown notification type: ${notification.type}`);
          return false;
      }
    } catch (error) {
      console.error(`❌ Error processing notification ${notification.id}:`, error);
      notification.error = error instanceof Error ? error.message : 'Unknown error';
      return false;
    }
  }

  /**
   * Process single FCM token notification
   */
  private async processSingleNotification(notification: QueuedNotification): Promise<boolean> {
    if (!notification.fcmToken) {
      console.error('❌ Missing fcmToken for single notification');
      return false;
    }

    const result = await sendPushNotification(
      notification.fcmToken,
      notification.title,
      notification.body,
      notification.data || {}
    );

    return result.success;
  }

  /**
   * Process user notification - Fetch FCM token from DB
   */
  private async processUserNotification(notification: QueuedNotification): Promise<boolean> {
    if (!notification.userId) {
      console.error('❌ Missing userId for user notification');
      return false;
    }

    try {
      const UserModel = (await import('@models/user.Models')).default;
      const user = await UserModel.findById(notification.userId).select('fcmToken');

      if (!user || !user.fcmToken) {
        console.error(`❌ User ${notification.userId} not found or has no FCM token`);
        return false;
      }

      const result = await sendPushNotification(
        user.fcmToken,
        notification.title,
        notification.body,
        notification.data || {}
      );

      return result.success;
    } catch (error) {
      console.error(`❌ Error fetching user ${notification.userId}:`, error);
      return false;
    }
  }

  /**
   * Process multiple users notification - Fetch FCM tokens from DB
   */
  private async processUsersNotification(notification: QueuedNotification): Promise<boolean> {
    if (!notification.userIds || notification.userIds.length === 0) {
      console.error('❌ Missing or empty userIds for users notification');
      return false;
    }

    try {
      const UserModel = (await import('@models/user.Models')).default;
      const users = await UserModel.find({
        _id: { $in: notification.userIds },
        fcmToken: { $exists: true, $ne: null }
      }).select('fcmToken');

      if (users.length === 0) {
        console.error('❌ No users found with valid FCM tokens');
        return false;
      }

      const fcmTokens = users.map(user => user.fcmToken as string);
      const result = await sendBulkNotifications(
        fcmTokens,
        notification.title,
        notification.body,
        notification.data || {}
      );

      console.log(`📊 Bulk sent: ${result.successCount} success, ${result.failureCount} failed`);
      
      // Consider it successful if at least one notification was sent
      return result.successCount > 0;
    } catch (error) {
      console.error('❌ Error fetching users:', error);
      return false;
    }
  }

  /**
   * Process bulk notification - Same as users
   */
  private async processBulkNotification(notification: QueuedNotification): Promise<boolean> {
    return this.processUsersNotification(notification);
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    waiting: number;
    processing: number;
    failed: number;
  }> {
    try {
      const [waiting, processing, failed] = await Promise.all([
        redis.lLen(this.QUEUE_KEY),
        redis.lLen(this.PROCESSING_KEY),
        redis.lLen(this.FAILED_KEY),
      ]);

      return { waiting, processing, failed };
    } catch (error) {
      console.error('❌ Failed to get queue stats:', error);
      return { waiting: 0, processing: 0, failed: 0 };
    }
  }

  /**
   * Retry failed notifications
   */
  async retryFailed(limit: number = 10): Promise<number> {
    try {
      let retried = 0;
      for (let i = 0; i < limit; i++) {
        const item = await redis.lMove(this.FAILED_KEY, this.QUEUE_KEY, 'LEFT', 'RIGHT');
        if (!item) break;
        
        const notification: QueuedNotification = JSON.parse(item);
        notification.attempts = 0; // Reset attempts
        await redis.rPush(this.QUEUE_KEY, JSON.stringify(notification));
        retried++;
      }
      
      console.log(`🔄 Retried ${retried} failed notifications`);
      return retried;
    } catch (error) {
      console.error('❌ Failed to retry notifications:', error);
      return 0;
    }
  }

  /**
   * Clear all queues (for testing/maintenance)
   */
  async clearAll(): Promise<void> {
    await redis.del(this.QUEUE_KEY);
    await redis.del(this.PROCESSING_KEY);
    await redis.del(this.FAILED_KEY);
    console.log('🗑️  All queues cleared');
  }

  // Helper methods
  private generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================

export const notificationQueue = new NotificationQueue();
