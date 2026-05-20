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
import { validateRequest } from '../../Middlewares/validateRequest';
import {
  singleEmailSchema,
  sendNotificationEmailSchema,
  sendBulkNotificationEmailSchema,
} from '../../Validators/mail.Validator';

const router = Router();

// Apply internal service authentication to all mail routes
router.use(internalServiceAuth);

router.post('/send-otp', validateRequest({ body: singleEmailSchema }), MailService.sendOTP);

router.post('/send-welcome', validateRequest({ body: singleEmailSchema }), MailService.sendWelcome);

router.post('/send-password-reset-confirmation', validateRequest({ body: singleEmailSchema }), MailService.sendPasswordResetConfirmation);

router.post('/send-notification', validateRequest({ body: sendNotificationEmailSchema }), MailService.sendNotification);

router.post('/send-bulk-notification', validateRequest({ body: sendBulkNotificationEmailSchema }), MailService.sendBulkNotification);

router.get('/health', MailService.healthCheck);

export default router;
