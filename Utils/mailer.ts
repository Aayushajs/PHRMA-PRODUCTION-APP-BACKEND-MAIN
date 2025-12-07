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
        console.log('✅ SendGrid initialized');
    } catch (error) {
        console.warn('⚠️ SendGrid failed to initialize');
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
        console.log('✅ Mailjet initialized');
    } catch (error) {
        console.warn('⚠️ Mailjet failed to initialize');
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
    console.log('✅ Gmail SMTP configured');
}

// Email Templates
const getEmailTemplate = (type: 'otp' | 'welcome' | 'notification', data: any): { subject: string; html: string; text: string } => {
    if (type === 'otp') {
        return {
            subject: 'Your Password Reset OTP',
            text: `Your OTP: ${data.otp}\n\nExpires in 3 minutes.\n\nVelcart Team`,
            html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
.container{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1)}
.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:30px;text-align:center}
.content{padding:40px 30px}
.otp-box{background:#f8f9fa;border:2px dashed #667eea;border-radius:8px;padding:20px;text-align:center;margin:30px 0}
.otp-code{font-size:36px;font-weight:bold;color:#667eea;letter-spacing:8px;margin:10px 0}
.footer{background:#f8f9fa;padding:20px;text-align:center;color:#666;font-size:12px}
.warning{color:#dc3545;font-size:14px;margin-top:20px}
</style>
</head>
<body>
<div class="container">
<div class="header"><h1> Password Reset</h1></div>
<div class="content">
<h2>Hello!</h2>
<p>Use the OTP code below to reset your password:</p>
<div class="otp-box">
<p style="margin:0;color:#666;font-size:14px">Your One-Time Password</p>
<div class="otp-code">${data.otp}</div>
<p style="margin:0;color:#666;font-size:12px">Valid for 3 minutes</p>
</div>
<p><strong> Expires in 3 minutes</strong></p>
<p class="warning"> Didn't request this? Ignore this email.</p>
<p>Best regards,<br><strong>Velcart Team</strong></p>
</div>
<div class="footer">
<p>© 2025 Velcart. All rights reserved.</p>
<p>This is an automated email. Please do not reply.</p>
</div>
</div>
</body>
</html>`
        };
    }
    
    if (type === 'welcome') {
        return {
            subject: 'Welcome to Velcart!',
            text: `Welcome ${data.name}!\n\nThank you for joining Velcart.\n\nVelcart Team`,
            html: `<h1>Welcome ${data.name}!</h1><p>Thank you for joining Velcart.</p>`
        };
    }
    
    // Default notification template
    return {
        subject: data.subject || 'Velcart Notification',
        text: data.message || 'Notification from Velcart',
        html: `<p>${data.message || 'Notification from Velcart'}</p>`
    };
};

/**
 * Send email via SendGrid with auto-fallback
 */
const sendViaSendGrid = async (to: string, template: any): Promise<boolean> => {
    if (!sendGridReady) return false;
    
    try {
        await sgMail.send({
            to,
            from: { 
                email: SENDGRID_FROM_EMAIL as string, 
                name: 'Epharma Support' 
            },
            subject: template.subject,
            text: template.text,
            html: template.html,
        });
        console.log(`✅ Email sent via SendGrid to ${to}`);
        return true;
    } catch (error: any) {
        const errorMsg = error.response?.body?.errors?.[0]?.message || error.message;
        console.error('❌ SendGrid failed:', errorMsg);
        return false;
    }
};

/**
 * Send email via Mailjet with auto-fallback
 */
const sendViaMailjet = async (to: string, template: any): Promise<boolean> => {
    if (!mailjetReady) return false;
    
    try {
        const request = await mailjetClient
            .post('send', { version: 'v3.1' })
            .request({
                Messages: [{
                    From: {
                        Email: MAILJET_FROM_EMAIL,
                        Name: 'Epharma Support'
                    },
                    To: [{
                        Email: to
                    }],
                    Subject: template.subject,
                    TextPart: template.text,
                    HTMLPart: template.html
                }]
            });

        if (request.response.status === 200) {
            console.log(`✅ Email sent via Mailjet to ${to}`);
            return true;
        }
        return false;
    } catch (error: any) {
        const errorMsg = error.response?.body?.ErrorMessage || error.message;
        console.error('❌ Mailjet failed:', errorMsg);
        return false;
    }
};

/**
 * Send email via Gmail SMTP
 */
const sendViaGmail = async (to: string, template: any): Promise<boolean> => {
    if (!gmailTransporter) return false;
    
    try {
        await gmailTransporter.sendMail({
            from: { 
                name: 'Epharma Support', 
                address: process.env.GMAIL_USER as string 
            },
            to,
            subject: template.subject,
            text: template.text,
            html: template.html,
        });
        console.log(`✅ Email sent via Gmail to ${to}`);
        return true;
    } catch (error: any) {
        console.error('❌ Gmail failed:', error.message);
        return false;
    }
};

/**
 * Smart Email Service - Round-Robin with Auto-Fallback
 * 
 * Features:
 * - Alternates between SendGrid and Mailjet (load balancing)
 * - Auto-fallback if primary provider fails or reaches limit
 * - Gmail as last resort backup
 * 
 * Flow: Mailjet → SendGrid → Mailjet → SendGrid (alternating)
 * If any fails: Try other provider → Gmail → Error
 * 
 * @param to - Recipient email address
 * @param type - Email type: 'otp' | 'welcome' | 'notification'
 * @param data - Email data
 * @returns Promise<{ success: boolean; provider: string; alternated: boolean }>
 */
export const sendEmail = async (
    to: string, 
    type: 'otp' | 'welcome' | 'notification' = 'otp', 
    data: any
): Promise<{ success: boolean; provider: string; alternated: boolean }> => {
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
        throw new Error('Invalid email format');
    }

    const template = getEmailTemplate(type, data);
    emailCounter++;

    // Determine primary provider using round-robin (alternating)
    const useMailjetFirst = emailCounter % 2 === 1; // Odd = Mailjet, Even = SendGrid
    const primaryProvider = useMailjetFirst ? 'Mailjet' : 'SendGrid';
    const secondaryProvider = useMailjetFirst ? 'SendGrid' : 'Mailjet';
    
    console.log(`🔄 Round ${emailCounter}: Trying ${primaryProvider} first`);

    // Try PRIMARY provider first
    let success = false;
    let usedProvider = '';
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

    // PRIMARY FAILED - Try SECONDARY provider
    console.log(`⚠️ ${primaryProvider} failed, switching to ${secondaryProvider}...`);
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

    // BOTH SendGrid & Mailjet FAILED - Try Gmail as last resort
    console.log('⚠️ Both SendGrid and Mailjet failed, trying Gmail backup...');
    success = await sendViaGmail(to, template);
    if (success) {
        lastUsedProvider = 'Gmail';
        return { success: true, provider: 'Gmail', alternated: true };
    }

    // ALL PROVIDERS FAILED
    throw new Error('All email providers failed. Please check configurations.');
};

export default sendEmail;
