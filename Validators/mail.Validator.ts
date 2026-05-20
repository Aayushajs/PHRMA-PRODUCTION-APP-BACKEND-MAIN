/*
┌───────────────────────────────────────────────────────────────────────┐
│  mail.Validator - Zod schemas for mail.Routes endpoints.              │
└───────────────────────────────────────────────────────────────────────┘
*/

import { z, safeString } from "./_shared";

// Single-email endpoints: send-otp, send-welcome, send-password-reset-confirmation
export const singleEmailSchema = z
    .object({
        email: safeString("email").min(1, "Email is required").email("Invalid email format"),
    })
    .strict();

// POST /mail/send-notification — { email, subject, message }
export const sendNotificationEmailSchema = z
    .object({
        email: safeString("email").min(1, "Email, subject, and message are required").email("Invalid email format"),
        subject: safeString("subject").min(1, "Email, subject, and message are required"),
        message: safeString("message").min(1, "Email, subject, and message are required"),
    })
    .strict();

// POST /mail/send-bulk-notification — { emails: string[], subject, message }
export const sendBulkNotificationEmailSchema = z
    .object({
        emails: z
            .array(safeString("email").email("Invalid email format"))
            .min(1, "Emails array is required and cannot be empty"),
        subject: safeString("subject").min(1, "Subject and message are required"),
        message: safeString("message").min(1, "Subject and message are required"),
    })
    .strict();
