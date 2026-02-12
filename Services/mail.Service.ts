/*
┌───────────────────────────────────────────────────────────────────────┐
│  Mail Service - Centralized Email Service (Service 1)                 │
│  Handles email sending for both Service 1 and Service 2               │
│  Provides API endpoints for internal service communication             │
│  Auto-generates OTPs and fetches user data automatically              │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Request, Response, NextFunction } from 'express';
import { sendEmail } from '../Utils/mailer';
import { generateOtp } from '../Utils/OtpGenerator';
import { redis } from '../config/redis';
import UserModel from '../Databases/Models/user.Models';
import { catchAsyncErrors } from '../Utils/catchAsyncErrors';
import { ApiError } from '../Utils/ApiError';
import { handleResponse } from '../Utils/handleResponse';

export default class MailService {
  /**
   * Send OTP Email - Auto-generates and stores OTP
   * POST /api/v1/mail-service/send-otp
   * Body: { email: string }
   */
  public static sendOTP = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const { email } = req.body;

      if (!email) {
        return next(new ApiError(400, 'Email is required'));
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return next(new ApiError(400, 'Invalid email format'));
      }

      // Check if user exists
      const user = await UserModel.findOne({ email }).select('_id email name');
      if (!user) {
        return next(new ApiError(404, 'User with this email not found'));
      }

      // Generate OTP (6 digits)
      const otp = generateOtp(6).toString();

      // Store OTP in Redis (expires in 3 minutes)
      await redis.set(`otp:${user._id}`, otp, { EX: 180 });
      console.log(`📧 OTP generated for ${email}: ${otp}`);

      try {
        // Send OTP email
        const result = await sendEmail(email, 'otp', { otp });

        return handleResponse(req, res, 200, 'OTP sent successfully', {
          provider: result.provider,
          alternated: result.alternated,
          expiresIn: '3 minutes',
        });
      } catch (error: any) {
        // Clean up OTP if email failed
        await redis.del(`otp:${user._id}`);
        console.error('❌ Failed to send OTP email:', error.message);
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

      if (!email) {
        return next(new ApiError(400, 'Email is required'));
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return next(new ApiError(400, 'Invalid email format'));
      }

      // Fetch user data
      const user = await UserModel.findOne({ email }).select('name email');
      if (!user) {
        return next(new ApiError(404, 'User with this email not found'));
      }

      try {
        // Send welcome email
        const result = await sendEmail(email, 'welcome', { name: user.name });

        return handleResponse(req, res, 200, 'Welcome email sent successfully', {
          provider: result.provider,
          alternated: result.alternated,
          to: email,
        });
      } catch (error: any) {
        console.error('❌ Failed to send welcome email:', error.message);
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

      if (!email) {
        return next(new ApiError(400, 'Email is required'));
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return next(new ApiError(400, 'Invalid email format'));
      }

      // Fetch user data
      const user = await UserModel.findOne({ email }).select('name email');
      if (!user) {
        return next(new ApiError(404, 'User with this email not found'));
      }

      try {
        // Send password reset confirmation
        const result = await sendEmail(email, 'password-reset-confirmation', { name: user.name });

        return handleResponse(req, res, 200, 'Password reset confirmation sent successfully', {
          provider: result.provider,
          alternated: result.alternated,
          to: email,
        });
      } catch (error: any) {
        console.error('❌ Failed to send password reset confirmation:', error.message);
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

      if (!email || !subject || !message) {
        return next(new ApiError(400, 'Email, subject, and message are required'));
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return next(new ApiError(400, 'Invalid email format'));
      }

      try {
        // Send notification email
        const result = await sendEmail(email, 'notification', { subject, message });

        return handleResponse(req, res, 200, 'Notification email sent successfully', {
          provider: result.provider,
          alternated: result.alternated,
          to: email,
        });
      } catch (error: any) {
        console.error('❌ Failed to send notification email:', error.message);
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

      // Validate request body
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return next(new ApiError(400, 'Emails array is required and cannot be empty'));
      }

      if (!subject || !message) {
        return next(new ApiError(400, 'Subject and message are required'));
      }

      // Validate email format for all recipients
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = emails.filter((email) => !emailRegex.test(email));
      
      if (invalidEmails.length > 0) {
        return next(
          new ApiError(400, `Invalid email format for: ${invalidEmails.join(', ')}`)
        );
      }

      const results: Array<{ email: string; success: boolean; provider?: string; error?: string }> = [];
      let successCount = 0;
      let failureCount = 0;

      // Send emails sequentially to avoid rate limits
      for (const email of emails) {
        try {
          const result = await sendEmail(email, 'notification', { subject, message });
          results.push({
            email,
            success: true,
            provider: result.provider,
          });
          successCount++;
        } catch (error: any) {
          results.push({
            email,
            success: false,
            error: error.message || 'Failed to send email',
          });
          failureCount++;
        }

        // Add small delay to prevent rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const responseMessage =
        failureCount === 0
          ? `All ${successCount} notifications sent successfully`
          : `${successCount} notifications sent, ${failureCount} failed`;

      return handleResponse(req, res, failureCount === 0 ? 200 : 207, responseMessage, {
        total: emails.length,
        success: successCount,
        failed: failureCount,
        results,
      });
    }
  );

  /**
   * Health Check - Internal API Endpoint
   * Check if mail service is operational
   * GET /api/v1/mail-service/health
   */
  public static healthCheck = catchAsyncErrors(
    async (req: Request, res: Response, next: NextFunction) => {
      const sendGridReady = !!process.env.SENDGRID_API_KEY && !!process.env.SENDGRID_FROM_EMAIL;
      const mailjetReady =
        !!process.env.MAILJET_API_KEY &&
        !!process.env.MAILJET_SECRET_KEY &&
        !!process.env.MAILJET_FROM_EMAIL;
      const gmailReady = !!process.env.GMAIL_USER && !!process.env.GMAIL_PASS;

      const availableProviders = [];
      if (sendGridReady) availableProviders.push('SendGrid');
      if (mailjetReady) availableProviders.push('Mailjet');
      if (gmailReady) availableProviders.push('Gmail');

      const isHealthy = availableProviders.length > 0;

      return handleResponse(
        req,
        res,
        isHealthy ? 200 : 503,
        isHealthy ? 'Mail service is operational' : 'No email providers configured',
        {
          healthy: isHealthy,
          availableProviders,
          providerCount: availableProviders.length,
        }
      );
    }
  );
}
