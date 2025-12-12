/*
┌───────────────────────────────────────────────────────────────────────┐
│  Mailer Utility - Service for sending emails via SendGrid/Mailjet/Gmail.│
└───────────────────────────────────────────────────────────────────────┘
*/

import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import Mailjet from 'node-mailjet';
import dotenv from 'dotenv';

dotenv.config({ path: './config/.env' });

// Initialize SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.GMAIL_USER;
let sendGridReady = false;

if (SENDGRID_API_KEY && SENDGRID_FROM_EMAIL) {
    try {
        sgMail.setApiKey(SENDGRID_API_KEY);
        sendGridReady = true;
    } catch (error) {
        console.error('SendGrid initialization failed');
    }
}

// Initialize Mailjet
const MAILJET_API_KEY = process.env.MAILJET_API_KEY;
const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY;
const MAILJET_FROM_EMAIL = process.env.MAILJET_FROM_EMAIL || SENDGRID_FROM_EMAIL || process.env.GMAIL_USER;
let mailjetClient: any = null;
let mailjetReady = false;

if (MAILJET_API_KEY && MAILJET_SECRET_KEY && MAILJET_FROM_EMAIL) {
    try {
        mailjetClient = new Mailjet({
            apiKey: MAILJET_API_KEY,
            apiSecret: MAILJET_SECRET_KEY
        });
        mailjetReady = true;
    } catch (error) {
        console.error('Mailjet initialization failed');
    }
}

// Round-Robin Counter for alternating between providers
let emailCounter = 0;
let lastUsedProvider: 'SendGrid' | 'Mailjet' | 'Gmail' | null = null;

// Gmail SMTP (Last Fallback - For Local Development)
let gmailTransporter: any = null;
if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    gmailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS,
        },
        pool: true,
        maxConnections: 3,
    });
}

// Email Templates - Simple and Professional (Anti-Spam Optimized)
const getEmailTemplate = (type: 'otp' | 'welcome' | 'password-reset-confirmation' | 'notification', data: any): { subject: string; html: string; text: string } => {
    if (type === 'otp') {
        return {
            subject: 'Your Verification Code',
            text: `Hello,\n\nYour verification code is: ${data.otp}\n\nThis code will expire in 3 minutes.\n\nIf you didn't request this, please ignore this email.\n\nRegards,\nVelcart Team`,
            html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verification Code</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
                    <tr>
                        <td style="background-color:#4a5568;padding:30px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:24px;">Velcart</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:40px 30px;">
                            <p style="margin:0 0 20px;color:#333333;font-size:16px;">Hello,</p>
                            <p style="margin:0 0 30px;color:#666666;font-size:14px;line-height:1.6;">Your verification code is:</p>
                            <div style="background-color:#f7fafc;border:2px solid #4a5568;border-radius:6px;padding:20px;text-align:center;margin:30px 0;">
                                <span style="font-size:32px;font-weight:bold;color:#4a5568;letter-spacing:5px;">${data.otp}</span>
                            </div>
                            <p style="margin:20px 0;color:#666666;font-size:14px;line-height:1.6;">This code will expire in 3 minutes.</p>
                            <p style="margin:20px 0;color:#666666;font-size:14px;line-height:1.6;">If you didn't request this code, please ignore this email.</p>
                            <p style="margin:30px 0 0;color:#666666;font-size:14px;">Regards,<br><strong>Velcart Team</strong></p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color:#f7fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0;">
                            <p style="margin:0;color:#999999;font-size:12px;">© 2025 Velcart. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
        };
    }

    if (type === 'welcome') {
        return {
            subject: 'Welcome to Velcart',
            text: `Hello ${data.name},\n\nWelcome to Velcart! We're glad to have you on board.\n\nYou can now start exploring our platform and all its features.\n\nRegards,\nVelcart Team`,
            html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
                    <tr>
                        <td style="background-color:#4a5568;padding:30px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:24px;">Welcome to Velcart</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:40px 30px;">
                            <p style="margin:0 0 20px;color:#333333;font-size:16px;">Hello ${data.name},</p>
                            <p style="margin:0 0 20px;color:#666666;font-size:14px;line-height:1.6;">Welcome to Velcart! We're glad to have you on board.</p>
                            <p style="margin:0 0 20px;color:#666666;font-size:14px;line-height:1.6;">You can now start exploring our platform and all its features.</p>
                            <p style="margin:30px 0 0;color:#666666;font-size:14px;">Regards,<br><strong>Velcart Team</strong></p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color:#f7fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0;">
                            <p style="margin:0;color:#999999;font-size:12px;">© 2025 Velcart. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
        };
    }

    if (type === 'password-reset-confirmation') {
        return {
            subject: 'Password Reset Successful',
            text: `Hello ${data.name},\n\nYour password has been successfully reset.\n\nIf you didn't make this change, please contact us immediately.\n\nRegards,\nVelcart Team`,
            html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
                    <tr>
                        <td style="background-color:#4a5568;padding:30px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:24px;">Password Reset Successful</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:40px 30px;">
                            <p style="margin:0 0 20px;color:#333333;font-size:16px;">Hello ${data.name},</p>
                            <p style="margin:0 0 20px;color:#666666;font-size:14px;line-height:1.6;">Your password has been successfully reset.</p>
                            <p style="margin:0 0 20px;color:#666666;font-size:14px;line-height:1.6;">If you didn't make this change, please contact us immediately.</p>
                            <p style="margin:30px 0 0;color:#666666;font-size:14px;">Regards,<br><strong>Velcart Team</strong></p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color:#f7fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0;">
                            <p style="margin:0;color:#999999;font-size:12px;">© 2025 Velcart. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
        };
    }

    return {
        subject: data.subject || 'Notification from Velcart',
        text: data.message || 'You have a new notification from Velcart.',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notification</title>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
                    <tr>
                        <td style="background-color:#4a5568;padding:30px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:24px;">Velcart</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:40px 30px;">
                            <p style="margin:0;color:#666666;font-size:14px;line-height:1.6;">${data.message || 'You have a new notification from Velcart.'}</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color:#f7fafc;padding:20px;text-align:center;border-top:1px solid #e2e8f0;">
                            <p style="margin:0;color:#999999;font-size:12px;">© 2025 Velcart. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`
    };
};

const sendViaSendGrid = async (to: string, template: any): Promise<boolean> => {
    if (!sendGridReady) return false;

    try {
        await sgMail.send({
            to,
            from: {
                email: SENDGRID_FROM_EMAIL as string,
                name: 'Velcart'
            },
            subject: template.subject,
            text: template.text,
            html: template.html,
            replyTo: SENDGRID_FROM_EMAIL as string,
            trackingSettings: {
                clickTracking: { enable: false },
                openTracking: { enable: false },
                subscriptionTracking: { enable: false }
            },
            mailSettings: {
                sandboxMode: { enable: false },
                bypassListManagement: { enable: false }
            }
        });
        return true;
    } catch (error: any) {
        const errorMsg = error.response?.body?.errors?.[0]?.message || error.message;
        console.error('SendGrid failed:', errorMsg);
        return false;
    }
};

const sendViaMailjet = async (to: string, template: any): Promise<boolean> => {
    if (!mailjetReady) return false;

    try {
        const request = await mailjetClient
            .post('send', { version: 'v3.1' })
            .request({
                Messages: [{
                    From: {
                        Email: MAILJET_FROM_EMAIL,
                        Name: 'Velcart'
                    },
                    To: [{
                        Email: to
                    }],
                    Subject: template.subject,
                    TextPart: template.text,
                    HTMLPart: template.html,
                    CustomID: `velcart-${Date.now()}`
                }]
            });

        if (request.response.status === 200) {
            return true;
        }
        return false;
    } catch (error: any) {
        const errorMsg = error.response?.body?.ErrorMessage || error.message;
        console.error('Mailjet failed:', errorMsg);
        return false;
    }
};

const sendViaGmail = async (to: string, template: any): Promise<boolean> => {
    if (!gmailTransporter) return false;

    try {
        await gmailTransporter.sendMail({
            from: {
                name: 'Velcart',
                address: process.env.GMAIL_USER as string
            },
            to,
            subject: template.subject,
            text: template.text,
            html: template.html
        });
        return true;
    } catch (error: any) {
        console.error('Gmail failed:', error.message);
        return false;
    }
};

export const sendEmail = async (
    to: string,
    type: 'otp' | 'welcome' | 'password-reset-confirmation' | 'notification' = 'otp',
    data: any
): Promise<{ success: boolean; provider: string; alternated: boolean }> => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
        throw new Error('Invalid email format');
    }

    const template = getEmailTemplate(type, data);
    emailCounter++;

    const useMailjetFirst = emailCounter % 2 === 1;
    const primaryProvider = useMailjetFirst ? 'Mailjet' : 'SendGrid';
    const secondaryProvider = useMailjetFirst ? 'SendGrid' : 'Mailjet';

    let success = false;
    let alternated = false;

    if (primaryProvider === 'Mailjet') {
        success = await sendViaMailjet(to, template);
        if (success) {
            lastUsedProvider = 'Mailjet';
            return { success: true, provider: 'Mailjet', alternated: false };
        }
    } else {
        success = await sendViaSendGrid(to, template);
        if (success) {
            lastUsedProvider = 'SendGrid';
            return { success: true, provider: 'SendGrid', alternated: false };
        }
    }

    alternated = true;

    if (secondaryProvider === 'Mailjet') {
        success = await sendViaMailjet(to, template);
        if (success) {
            lastUsedProvider = 'Mailjet';
            return { success: true, provider: 'Mailjet', alternated: true };
        }
    } else {
        success = await sendViaSendGrid(to, template);
        if (success) {
            lastUsedProvider = 'SendGrid';
            return { success: true, provider: 'SendGrid', alternated: true };
        }
    }

    success = await sendViaGmail(to, template);
    if (success) {
        lastUsedProvider = 'Gmail';
        return { success: true, provider: 'Gmail', alternated: true };
    }

    throw new Error('All email providers failed');
};

export default sendEmail;
