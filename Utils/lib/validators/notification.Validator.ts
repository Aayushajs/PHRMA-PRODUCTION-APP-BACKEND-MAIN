/*
┌───────────────────────────────────────────────────────────────────────┐
│  notification.Validator - Zod schemas for notification.Routes.        │
└───────────────────────────────────────────────────────────────────────┘
*/

import { z, safeString, zodObjectId } from "./_shared";

// Common required fields across send endpoints
const titleBody = {
    title: safeString("title").min(1, "Missing required fields: title, body"),
    body: safeString("body").min(1, "Missing required fields: title, body"),
    // `data` is freeform map; allow any object/string/etc but reject array root.
    data: z.record(z.string(), z.unknown()).optional(),
};

// POST /notification/sendToUser — authenticated; body: { title, body, data }
export const sendToUserSchema = z.object({ ...titleBody }).passthrough();

// POST /notification/send — internal; body: { fcmToken, title, body, data }
export const sendSchema = z
    .object({
        fcmToken: safeString("fcmToken").min(1, "Missing required fields: fcmToken, title, body"),
        ...titleBody,
    })
    .passthrough();

// POST /notification/send-to-user, sendToUsers, send-to-users, sendBulk, send-bulk
// Body: { userIds?: string[], userId?: string, title, body, data }
export const sendToUsersSchema = z
    .object({
        userIds: z.array(zodObjectId("userId")).optional(),
        userId: zodObjectId("userId").optional(),
        ...titleBody,
    })
    .passthrough()
    .refine(
        (val) => Array.isArray(val.userIds) ? val.userIds.length > 0 : !!val.userId,
        { message: "userIds must be a non-empty array or provide userId" }
    );

// POST /notification/sendBulk — userIds required.
export const sendBulkSchema = z
    .object({
        userIds: z.array(zodObjectId("userId")).min(1, "userIds must be a non-empty array"),
        ...titleBody,
    })
    .passthrough();

// GET /notification/health and /notification/queue-stats — no input.
export const emptyQuerySchema = z.object({}).passthrough();
