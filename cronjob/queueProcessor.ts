/*
┌───────────────────────────────────────────────────────────────────────┐
│  Notification Queue Processor - Service 1                             │
│  Continuously processes notifications from shared Redis queue          │
│  Sends notifications to Firebase Cloud Messaging                      │
│  Runs as background worker with automatic restart on failure          │
└───────────────────────────────────────────────────────────────────────┘
*/

import { notificationQueue } from '../Services/NotificationServices/notificationQueue.Service';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROCESS_INTERVAL_MS = 5000; // Process queue every 5 seconds
const ENABLE_QUEUE = process.env.ENABLE_NOTIFICATION_QUEUE !== 'false';

// ============================================================================
// QUEUE PROCESSOR
// ============================================================================

// PERF-AUDIT-2026-05: 11.2 — bound each processQueue tick with a timeout so a
// hung Firebase call cannot wedge the processor. 11.4 — schedule the existing
// `recoverStuckProcessing` to drain items stuck in the processing list.
const PROCESS_TIMEOUT_MS = 60_000;
const RECOVER_STUCK_INTERVAL_MS = 5 * 60_000;
const RECOVER_STUCK_THRESHOLD_MIN = 5;

class QueueProcessor {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private recoverIntervalId: NodeJS.Timeout | null = null;
  private tickInFlight = false;

  /**
   * Start the queue processor
   */
  async start(): Promise<void> {
    if (!ENABLE_QUEUE) {
      console.log('⏭ Queue processing disabled (ENABLE_NOTIFICATION_QUEUE=false)');
      return;
    }

    if (this.isRunning) {
      console.log('⚠️  Queue processor already running');
      return;
    }

    console.log(' Starting notification queue processor...');
    console.log(`   Processing interval: ${PROCESS_INTERVAL_MS}ms`);

    this.isRunning = true;

    // Process immediately on start
    await this.processQueue();

    // PERF-AUDIT-2026-05: 11.2 — overlap guard (tickInFlight) + timeout.
    this.intervalId = setInterval(async () => {
      if (this.tickInFlight) return;
      this.tickInFlight = true;
      try {
        await Promise.race([
          this.processQueue(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('processQueue timeout')), PROCESS_TIMEOUT_MS)
          ),
        ]);
      } catch (err) {
        console.error('processQueue tick error:', err);
      } finally {
        this.tickInFlight = false;
      }
    }, PROCESS_INTERVAL_MS);

    // PERF-AUDIT-2026-05: 11.4 — recover stuck processing items periodically.
    this.recoverIntervalId = setInterval(async () => {
      try {
        await notificationQueue.recoverStuckProcessing(RECOVER_STUCK_THRESHOLD_MIN);
      } catch (err) {
        console.error('recoverStuckProcessing error:', err);
      }
    }, RECOVER_STUCK_INTERVAL_MS);

    console.log('✅ Queue processor started successfully');
  }

  /**
   * Stop the queue processor
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚠️  Queue processor not running');
      return;
    }

    console.log('🛑 Stopping notification queue processor...');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.recoverIntervalId) {
      clearInterval(this.recoverIntervalId);
      this.recoverIntervalId = null;
    }

    this.isRunning = false;
    console.log('✅ Queue processor stopped');
  }

  /**
   * Process notifications from queue
   */
  private async processQueue(): Promise<void> {
    try {
      // Get queue stats first
      const stats = await notificationQueue.getStats();

      if (stats.waiting === 0) {
        // No notifications to process
        return;
      }

      console.log(` Queue stats: ${stats.waiting} waiting, ${stats.processing} processing, ${stats.failed} failed`);

      // Process the queue
      await notificationQueue.processQueue();

    } catch (error) {
      console.error(' Error in queue processor:', error);
      // Don't stop the processor on error, just log and continue
    }
  }

  /**
   * Get processor status
   */
  getStatus(): { running: boolean; enabled: boolean } {
    return {
      running: this.isRunning,
      enabled: ENABLE_QUEUE,
    };
  }
}

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================

export const queueProcessor = new QueueProcessor();

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

// Handle process termination signals
process.on('SIGINT', async () => {
  console.log(' SIGINT received, shutting down queue processor...');
  await queueProcessor.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(' SIGTERM received, shutting down queue processor...');
  await queueProcessor.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(' Uncaught exception in queue processor:', error);
  // Don't exit, let the processor continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(' Unhandled rejection in queue processor:', reason);
  // Don't exit, let the processor continue
});
