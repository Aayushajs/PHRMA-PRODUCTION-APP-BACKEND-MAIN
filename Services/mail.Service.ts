/*
┌───────────────────────────────────────────────────────────────────────┐
│  Mail Service - Centralized Email Service (Service 1)                 │
│  Handles email sending for both Service 1 and Service 2               │
│  Provides API endpoints for internal service communication             │
│  Auto-generates OTPs and fetches user data automatically              │
│                                                                       │
│  SDE-3 Refactor: single validateEmailInput() helper eliminates the    │
│  5× duplicated email-format + ApiError pattern in every handler.      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from 'express';
import { sendEmail } from '../Utils/providers/mailer';
import { generateOtp } from '../Utils/auth/OtpGenerator';
import { redis } from '../config/redis';
import UserModel from '../Databases/Models/user.Models';
import { catchAsyncErrors } from '../Utils/errors/catchAsyncErrors';
import { ApiError } from '../Utils/errors/ApiError';
import { handleResponse } from '../Utils/responses/handleResponse';

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** RFC-5322-lite email regex shared by all handlers. */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate that `email` is present and well-formed.
 * Returns an ApiError (to be passed to next()) or null.
 *
 * Centralises the 5× repeated:
 *   if (!email) return next(new ApiError(400, ...));
 *   if (!emailRegex.test(email)) return next(new ApiError(400, ...));
 */
function validateEmailInput(email: unknown): ApiError | null {
  if (!email || typeof email !== 'string' || !email.trim()) {
    return new ApiError(400, 'Email is required');
  }
  if (!EMAIL_REGEX.test(email.trim())) {
    return new ApiError(400, 'Invalid email format');
  }
  return null;
}

/**
 * Fetch a user by email (lean, minimal projection) or return a 404 ApiError.
 * Removes the repeated findOne + null check from every handler.
 */
async function findUserByEmail(
  email: string,
  select = 'name email'
): Promise<{ user: any; error: ApiError | null }> {
  const user = await UserModel
    .findOne({ email: email.toLowerCase().trim() })
    .select(select)
    .lean();

  if (!user) {
    return { user: null, error: new ApiError(404, 'User with this email not found') };
  }
  return { user, error: null };
}

// ─── Service class ────────────────────────────────────────────────────────────

export default class MailService {
  /**
   * Send OTP Email - Auto-generates and stores OTP
   * POST /api/v1/mail-service/send-otp
   * Body: { email: string }
   */
  public static sendOTP = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email } = req.body;

      const validationErr = validateEmailInput(email);
      if (validationErr) return next(validationErr);

      const { user, error } = await findUserByEmail(email, '_id email name');
      if (error || !user) return next(error);

      // Generate OTP (6 digits) and cache it (3 minutes TTL)
      const otp = generateOtp(6).toString();
      await redis.set(`otp:${user._id}`, otp, { EX: 180 });

      try {
        const result = await sendEmail(email.trim(), 'otp', { otp });

        return handleResponse(req, res, 200, 'OTP sent successfully', {
          provider:  result.provider,
          alternated: result.alternated,
          expiresIn: '3 minutes',
        });
      } catch (err: any) {
        // Roll back the OTP so the user can retry immediately
        await redis.del(`otp:${user._id}`);
        console.error('❌ Failed to send OTP email:', err.message);
        return next(new ApiError(500, 'Failed to send OTP. Please try again.'));
      }
    }
  );

  /**
   * Send Welcome Email - Auto-fetches user data
   * POST /api/v1/mail-service/send-welcome
   * Body: { email: string }
   */
  public static sendWelcome = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email } = req.body;

      const validationErr = validateEmailInput(email);
      if (validationErr) return next(validationErr);

      const { user, error } = await findUserByEmail(email);
      if (error || !user) return next(error);

      try {
        const result = await sendEmail(email.trim(), 'welcome', { name: user.name });

        return handleResponse(req, res, 200, 'Welcome email sent successfully', {
          provider:  result.provider,
          alternated: result.alternated,
          to: email.trim(),
        });
      } catch (err: any) {
        console.error('❌ Failed to send welcome email:', err.message);
        return next(new ApiError(500, 'Failed to send welcome email. Please try again.'));
      }
    }
  );

  /**
   * Send Password Reset Confirmation - Auto-fetches user data
   * POST /api/v1/mail-service/send-password-reset-confirmation
   * Body: { email: string }
   */
  public static sendPasswordResetConfirmation = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email } = req.body;

      const validationErr = validateEmailInput(email);
      if (validationErr) return next(validationErr);

      const { user, error } = await findUserByEmail(email);
      if (error || !user) return next(error);

      try {
        const result = await sendEmail(
          email.trim(),
          'password-reset-confirmation',
          { name: user.name }
        );

        return handleResponse(
          req, res, 200,
          'Password reset confirmation sent successfully',
          {
            provider:  result.provider,
            alternated: result.alternated,
            to: email.trim(),
          }
        );
      } catch (err: any) {
        console.error('❌ Failed to send password reset confirmation:', err.message);
        return next(new ApiError(500, 'Failed to send confirmation email. Please try again.'));
      }
    }
  );

  /**
   * Send Notification Email
   * POST /api/v1/mail-service/send-notification
   * Body: { email: string, subject: string, message: string }
   */
  public static sendNotification = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email, subject, message } = req.body;

      const validationErr = validateEmailInput(email);
      if (validationErr) return next(validationErr);

      if (!subject || !message) {
        return next(new ApiError(400, 'Email, subject, and message are required'));
      }

      try {
        const result = await sendEmail(email.trim(), 'notification', { subject, message });

        return handleResponse(req, res, 200, 'Notification email sent successfully', {
          provider:  result.provider,
          alternated: result.alternated,
          to: email.trim(),
        });
      } catch (err: any) {
        console.error('❌ Failed to send notification email:', err.message);
        return next(new ApiError(500, 'Failed to send notification. Please try again.'));
      }
    }
  );

  /**
   * Send Bulk Notification Emails
   * POST /api/v1/mail-service/send-bulk-notification
   * Body: { emails: string[], subject: string, message: string }
   */
  public static sendBulkNotification = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { emails, subject, message } = req.body;

      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return next(new ApiError(400, 'Emails array is required and cannot be empty'));
      }

      if (!subject || !message) {
        return next(new ApiError(400, 'Subject and message are required'));
      }

      // Validate every email up-front so we fail fast before sending anything
      const invalidEmails = emails.filter(
        (e: unknown) => typeof e !== 'string' || !EMAIL_REGEX.test(e.trim())
      );
      if (invalidEmails.length > 0) {
        return next(
          new ApiError(400, `Invalid email format for: ${invalidEmails.join(', ')}`)
        );
      }

      const results: Array<{ email: string; success: boolean; provider?: string; error?: string }> = [];
      let successCount = 0;
      let failureCount = 0;

      // Sequential sends to respect provider rate limits
      for (const email of emails as string[]) {
        try {
          const result = await sendEmail(email.trim(), 'notification', { subject, message });
          results.push({ email, success: true, provider: result.provider });
          successCount++;
        } catch (err: any) {
          results.push({ email, success: false, error: err.message || 'Failed to send email' });
          failureCount++;
        }
        // Small back-off to stay within provider rate limits
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }

      const responseMessage =
        failureCount === 0
          ? `All ${successCount} notifications sent successfully`
          : `${successCount} notifications sent, ${failureCount} failed`;

      return handleResponse(req, res, failureCount === 0 ? 200 : 207, responseMessage, {
        total:   emails.length,
        success: successCount,
        failed:  failureCount,
        results,
      });
    }
  );

  /**
   * Health Check - Internal API Endpoint
   * GET /api/v1/mail-service/health
   */
  public static healthCheck = catchAsyncErrors(
    async (req: Request, res: Response, _next: NextFunction) => {
      const sendGridReady = !!process.env.SENDGRID_API_KEY && !!process.env.SENDGRID_FROM_EMAIL;
      const mailjetReady  =
        !!process.env.MAILJET_API_KEY &&
        !!process.env.MAILJET_SECRET_KEY &&
        !!process.env.MAILJET_FROM_EMAIL;
      const gmailReady = !!process.env.GMAIL_USER && !!process.env.GMAIL_PASS;

      const availableProviders: string[] = [];
      if (sendGridReady) availableProviders.push('SendGrid');
      if (mailjetReady)  availableProviders.push('Mailjet');
      if (gmailReady)    availableProviders.push('Gmail');

      const isHealthy = availableProviders.length > 0;

      return handleResponse(
        req, res,
        isHealthy ? 200 : 503,
        isHealthy ? 'Mail service is operational' : 'No email providers configured',
        {
          healthy:           isHealthy,
          availableProviders,
          providerCount:     availableProviders.length,
        }
      );
    }
  );
}
