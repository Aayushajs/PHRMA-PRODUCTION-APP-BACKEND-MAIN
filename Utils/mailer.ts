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

// Email Templates
const getEmailTemplate = (type: 'otp' | 'welcome' | 'notification', data: any): { subject: string; html: string; text: string } => {
    if (type === 'otp') {
        return {
            subject: 'Password Reset Code - Velcart',
            text: `Your verification code: ${data.otp}\n\nThis code will expire in 3 minutes.\n\nIf you didn't request this code, please ignore this email.\n\nBest regards,\nVelcart Team`,
            html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>Password Reset</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;background-color:#f5f7fa;color:#333}.email-wrapper{width:100%;background-color:#f5f7fa;padding:40px 20px}.email-container{max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:40px 30px;text-align:center}.header h1{color:#ffffff;font-size:28px;font-weight:600;margin:0}.content{padding:40px 35px}.greeting{font-size:18px;color:#333;margin-bottom:20px;font-weight:500}.message{font-size:15px;color:#666;line-height:1.8;margin-bottom:30px}.otp-container{background:linear-gradient(135deg,#f8f9ff 0%,#f0f2ff 100%);border:2px solid #667eea;border-radius:12px;padding:30px;text-align:center;margin:30px 0}.otp-label{font-size:13px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:15px;font-weight:600}.otp-code{font-size:40px;font-weight:700;color:#667eea;letter-spacing:12px;font-family:'Courier New',monospace;margin:10px 0}.otp-validity{font-size:13px;color:#999;margin-top:15px}.security-note{background-color:#fff8e1;border-left:4px solid #ffc107;padding:15px 20px;margin:25px 0;border-radius:4px}.security-note p{font-size:14px;color:#666;margin:0}.footer{background-color:#f8f9fa;padding:30px;text-align:center;border-top:1px solid #e9ecef}.footer-text{font-size:13px;color:#999;margin:5px 0}.footer-brand{font-size:14px;color:#667eea;font-weight:600;margin-top:15px}@media only screen and (max-width:600px){.email-wrapper{padding:20px 10px}.content{padding:30px 20px}.otp-code{font-size:32px;letter-spacing:8px}.header h1{font-size:24px}}</style></head><body><div class="email-wrapper"><div class="email-container"><div class="header"><h1>🔐 Password Reset Request</h1></div><div class="content"><div class="greeting">Hello,</div><p class="message">We received a request to reset your password. Use the verification code below to proceed with resetting your password.</p><div class="otp-container"><div class="otp-label">Your Verification Code</div><div class="otp-code">${data.otp}</div><div class="otp-validity">⏱ Valid for 3 minutes only</div></div><div class="security-note"><p><strong>⚠️ Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your account remains secure.</p></div><p class="message">For your security, this code will expire in 3 minutes. If the code expires, you can request a new one.</p><p style="margin-top:30px;font-size:14px;color:#666">Best regards,<br><strong style="color:#667eea">Velcart Team</strong></p></div><div class="footer"><p class="footer-text">© 2025 Velcart. All rights reserved.</p><p class="footer-text">This is an automated message, please do not reply to this email.</p><div class="footer-brand">Velcart - Your Trusted Platform</div></div></div></div></body></html>`
        };
    }

    if (type === 'welcome') {
        return {
            subject: 'Welcome to Velcart - Get Started Today!',
            text: `Welcome ${data.name}!\n\nThank you for joining Velcart. We're excited to have you on board.\n\nBest regards,\nVelcart Team`,
            html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f7fa}.wrapper{padding:40px 20px}.container{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.08)}.header{background:linear-gradient(135deg,#667eea,#764ba2);padding:40px;text-align:center;color:#fff}.header h1{font-size:28px;margin-bottom:10px}.content{padding:40px}.welcome-text{font-size:18px;color:#333;margin-bottom:20px}.message{color:#666;line-height:1.8;margin-bottom:20px}.footer{background:#f8f9fa;padding:30px;text-align:center;border-top:1px solid #e9ecef;color:#999;font-size:13px}</style></head><body><div class="wrapper"><div class="container"><div class="header"><h1>🎉 Welcome to Velcart!</h1></div><div class="content"><p class="welcome-text">Hello ${data.name},</p><p class="message">Thank you for joining Velcart! We're thrilled to have you as part of our community.</p><p class="message">You can now explore all our features and start your journey with us.</p><p style="margin-top:30px;color:#666">Best regards,<br><strong style="color:#667eea">Velcart Team</strong></p></div><div class="footer"><p>© 2025 Velcart. All rights reserved.</p></div></div></div></body></html>`
        };
    }

    return {
        subject: data.subject || 'Notification from Velcart',
        text: data.message || 'You have a new notification from Velcart.',
        html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f5f7fa}.wrapper{padding:40px 20px}.container{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.08)}.header{background:linear-gradient(135deg,#667eea,#764ba2);padding:30px;text-align:center;color:#fff}.content{padding:40px;color:#666;line-height:1.8}.footer{background:#f8f9fa;padding:20px;text-align:center;color:#999;font-size:13px}</style></head><body><div class="wrapper"><div class="container"><div class="header"><h1>📢 Notification</h1></div><div class="content"><p>${data.message || 'You have a new notification from Velcart.'}</p></div><div class="footer"><p>© 2025 Velcart. All rights reserved.</p></div></div></div></body></html>`
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
            // Anti-spam headers
            headers: {
                'X-Priority': '1',
                'X-MSMail-Priority': 'High',
                'Importance': 'high'
            },
            // Track settings
            trackingSettings: {
                clickTracking: { enable: false },
                openTracking: { enable: false }
            },
            mailSettings: {
                sandboxMode: { enable: false }
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
                    // Anti-spam configuration
                    CustomID: `velcart-${Date.now()}`,
                    Headers: {
                        'X-Priority': '1',
                        'X-MSMail-Priority': 'High',
                        'Importance': 'high'
                    }
                }]
            });

        if (request.response.status === 200) {
            return true;
        }
        return false;
    } catch (error: any) {
        const errorMsg = error.response?.body?.ErrorMessage || error.message;
        console.error(' Mailjet failed:', errorMsg);
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
            html: template.html,
            // Anti-spam headers
            headers: {
                'X-Priority': '1',
                'X-MSMail-Priority': 'High',
                'Importance': 'high',
                'X-Entity-Ref-ID': `velcart-${Date.now()}`
            },
            priority: 'high'
        });
        return true;
    } catch (error: any) {
        console.error(' Gmail failed:', error.message);
        return false;
    }
};

export const sendEmail = async (
    to: string,
    type: 'otp' | 'welcome' | 'notification' = 'otp',
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
