/*
┌───────────────────────────────────────────────────────────────────────┐
│  Mail Routes - Centralized Email Service API (Service 1)              │
│  Internal API for Service 1 and Service 2 to send emails              │
│  Auto-generates OTPs and fetches user data automatically              │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Router } from 'express';
import MailService from '../../Services/mail.Service';
import { internalServiceAuth } from '../../Middlewares/internalServiceAuth';

const router = Router();

// Apply internal service authentication to all mail routes
// Only requests with valid INTERNAL_SERVICE_API_KEY can access these endpoints
router.use(internalServiceAuth);

/**
 * @route   POST /api/v1/mail-service/send-otp
 * @desc    Generate and send OTP email (auto-generates 6-digit OTP, stores in Redis)
 * @access  Internal (Service 1 & Service 2)
 * @body    { email: string }
 * 
 * @example
 * {
 *   "email": "user@example.com"
 * }
 */
router.post('/send-otp', MailService.sendOTP);

/**
 * @route   POST /api/v1/mail-service/send-welcome
 * @desc    Send welcome email (auto-fetches user name from database)
 * @access  Internal (Service 1 & Service 2)
 * @body    { email: string }
 * 
 * @example
 * {
 *   "email": "newuser@example.com"
 * }
 */
router.post('/send-welcome', MailService.sendWelcome);

/**
 * @route   POST /api/v1/mail-service/send-password-reset-confirmation
 * @desc    Send password reset confirmation (auto-fetches user name)
 * @access  Internal (Service 1 & Service 2)
 * @body    { email: string }
 * 
 * @example
 * {
 *   "email": "user@example.com"
 * }
 */
router.post('/send-password-reset-confirmation', MailService.sendPasswordResetConfirmation);

/**
 * @route   POST /api/v1/mail-service/send-notification
 * @desc    Send notification email
 * @access  Internal (Service 1 & Service 2)
 * @body    { email: string, subject: string, message: string }
 * 
 * @example
 * {
 *   "email": "user@example.com",
 *   "subject": "Order Confirmed",
 *   "message": "Your order has been confirmed"
 * }
 */
router.post('/send-notification', MailService.sendNotification);

/**
 * @route   POST /api/v1/mail-service/send-bulk-notification
 * @desc    Send bulk notification emails
 * @access  Internal (Service 1 & Service 2)
 * @body    { emails: string[], subject: string, message: string }
 * 
 * @example
 * {
 *   "emails": ["user1@example.com", "user2@example.com"],
 *   "subject": "System Maintenance",
 *   "message": "Scheduled maintenance on Feb 15"
 * }
 */
router.post('/send-bulk-notification', MailService.sendBulkNotification);

/**
 * @route   GET /api/v1/mail-service/health
 * @desc    Check mail service health and available providers
 * @access  Internal (Service 1 & Service 2)
 */
router.get('/health', MailService.healthCheck);

export default router;
