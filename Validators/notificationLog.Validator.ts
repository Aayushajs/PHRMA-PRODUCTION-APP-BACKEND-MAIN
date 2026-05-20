/*
┌───────────────────────────────────────────────────────────────────────┐
│  notificationLog.Validator - Zod schemas for notificationLog.Routes.  │
└───────────────────────────────────────────────────────────────────────┘
*/

import { z, safeString, zodObjectId } from "./_shared";

// Listing queries — all optional with passthrough so existing service parsers
// keep working unchanged.
export const logListQuerySchema = z
    .object({
        page: z.union([z.string(), z.number()]).optional(),
        limit: z.union([z.string(), z.number()]).optional(),
        type: safeString("type").optional(),
        userId: safeString("userId").optional(),
        startDate: safeString("startDate").optional(),
        endDate: safeString("endDate").optional(),
        sortBy: safeString("sortBy").optional(),
        order: safeString("order").optional(),
        isRead: safeString("isRead").optional(),
        period: safeString("period").optional(),
    })
    .passthrough();

export const logIdParamsSchema = z.object({
    id: zodObjectId("log ID"),
});

// PATCH /mark-multiple-read
export const markMultipleReadSchema = z
    .object({
        logIds: z.array(zodObjectId("log ID")).min(1, "logIds array is required"),
    })
    .passthrough();

// POST /register-token
export const registerTokenSchema = z
    .object({
        token: safeString("token").min(1, "Valid FCM token is required"),
    })
    .passthrough();

// POST /send-test
export const sendTestSchema = z
    .object({
        title: safeString("title").optional(),
        body: safeString("body").optional(),
        type: safeString("type").optional(),
    })
    .passthrough();

// POST /receive — no input fields.
export const emptyBodySchema = z.object({}).passthrough();
