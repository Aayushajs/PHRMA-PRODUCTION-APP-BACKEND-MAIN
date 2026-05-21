/*
┌───────────────────────────────────────────────────────────────────────┐
│  Broadcast Notifications Helper                                       │
│                                                                       │
│  PERF-AUDIT-2026-05: 4.9 / 6.3 — replaces in-process N-user fan-outs  │
│  (User.find({fcmToken:{$ne:null}}) loaded entirely into memory +      │
│  Promise.all sendBulkNotifications) with a cursor-streamed,           │
│  chunk-bounded broadcast. The existing NotificationService is reused  │
│  so per-user DB logging + WebSocket emit behaviour stays identical.   │
└───────────────────────────────────────────────────────────────────────┘
*/

import User from "../../Databases/Models/user.Models";
import NotificationService from "../../Middlewares/LogMedillewares/notificationLogger";
import mongoose from "mongoose";

type EntityType = "Category" | "Advertisement" | "FeaturedMedicine" | "User" | "Other";

interface BroadcastOptions {
  type: string;
  relatedEntityId?: string | mongoose.Types.ObjectId;
  relatedEntityType?: EntityType;
  payload?: Record<string, any>;
  /** Max users sent to NotificationService per chunk. Default 250. */
  chunkSize?: number;
}

interface BroadcastResult {
  totalEnqueued: number;
  totalSent: number;
  totalFailed: number;
}

/**
 * Stream every user that has an fcmToken via a MongoDB cursor (bounded
 * memory) and hand them to NotificationService in chunks. This preserves
 * the side-effect contract (per-user notification logs + WebSocket emit)
 * while eliminating the O(N_users) in-memory broadcast spike.
 */
export async function broadcastToAllUsersWithLog(
  title: string,
  body: string,
  options: BroadcastOptions
): Promise<BroadcastResult> {
  const chunkSize = Math.max(1, options.chunkSize ?? 250);

  // PERF-AUDIT-2026-05: matches `users_fcmToken_partial` partial index.
  const cursor = User.find({
    fcmToken: { $exists: true, $type: "string", $ne: "" },
  })
    .select("_id name fcmToken")
    .lean()
    .cursor();

  let buffer: { _id: string; fcmToken: string; name?: string }[] = [];
  let totalEnqueued = 0;
  let totalSent = 0;
  let totalFailed = 0;

  const flush = async () => {
    if (buffer.length === 0) return;
    const chunk = buffer;
    buffer = [];
    totalEnqueued += chunk.length;
    try {
      const r = await NotificationService.sendNotificationToMultipleUsers(
        chunk,
        title,
        body,
        {
          type: options.type as any,
          relatedEntityId: options.relatedEntityId as any,
          relatedEntityType: options.relatedEntityType,
          payload: options.payload,
        }
      );
      totalSent += r.sent;
      totalFailed += r.failed;
    } catch (err) {
      // Background path — swallow + log only.
      console.error("broadcastToAllUsersWithLog chunk failed:", err);
      totalFailed += chunk.length;
    }
  };

  for await (const u of cursor as AsyncIterable<{ _id: any; name?: string; fcmToken: string }>) {
    if (!u.fcmToken) continue;
    buffer.push({
      _id: String(u._id),
      fcmToken: u.fcmToken,
      name: u.name,
    });
    if (buffer.length >= chunkSize) {
      await flush();
    }
  }
  await flush();

  return { totalEnqueued, totalSent, totalFailed };
}
