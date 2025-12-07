import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

dotenv.config({ path: './config/.env' });

// Initialize SendGrid
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.GMAIL_USER;

let sendGridInitialized = false;

if (SENDGRID_API_KEY && SENDGRID_FROM_EMAIL) {
    try {
        sgMail.setApiKey(SENDGRID_API_KEY);
        sendGridInitialized = true;
        console.log('✅ SendGrid initialized successfully');
    } catch (error: any) {
        console.error('❌ SendGrid initialization failed:', error.message);
    }
} else {
    console.warn('⚠️ SendGrid not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in .env');
}

// HTML Email Template (same as Gmail version)
const getOtpEmailHTML = (otp: number): string => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
            .content { padding: 40px 30px; }
            .otp-box { background: #f8f9fa; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0; }
            .otp-code { font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; margin: 10px 0; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
            .warning { color: #dc3545; font-size: 14px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🔐 Password Reset Request</h1>
            </div>
            <div class="content">
                <h2>Hello!</h2>
                <p>We received a request to reset your password. Use the OTP code below to proceed:</p>
                
                <div class="otp-box">
                    <p style="margin: 0; color: #666; font-size: 14px;">Your One-Time Password</p>
                    <div class="otp-code">${otp}</div>
                    <p style="margin: 0; color: #666; font-size: 12px;">Valid for 3 minutes</p>
                </div>
                
                <p><strong>⏰ This OTP will expire in 3 minutes.</strong></p>
                
                <p class="warning">⚠️ If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
                
                <p>Best regards,<br><strong>Epharma Team</strong></p>
            </div>
            <div class="footer">
                <p>© 2025 Epharma. All rights reserved.</p>
                <p>This is an automated email. Please do not reply to this message.</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

/**
 * Send email using SendGrid
 * @param email Recipient email address
 * @param otp OTP code to send
 * @returns Promise<boolean> true if sent successfully
 */
export const sendEmailViaSendGrid = async (email: string, otp: number): Promise<boolean> => {
    if (!sendGridInitialized) {
        throw new Error('SendGrid is not initialized. Check API key configuration.');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
    }

    const msg = {
        to: email,
        from: {
            email: SENDGRID_FROM_EMAIL as string,
            name: 'Epharma Support'
        },
        subject: '🔐 Your Password Reset OTP Code',
        text: `Your OTP code is: ${otp}\n\nThis code will expire in 3 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nEpharma Team`,
        html: getOtpEmailHTML(otp),
    };

    try {
        console.log(`📤 Sending email via SendGrid to ${email}...`);
        const response = await sgMail.send(msg);
        
        if (response && response[0]?.statusCode === 202) {
            console.log(`✅ Email sent successfully via SendGrid to ${email}`);
            console.log(`📧 Status: ${response[0].statusCode}`);
            return true;
        }
        
        return false;
    } catch (error: any) {
        console.error('❌ SendGrid email error:', error.message);
        
        if (error.response) {
            console.error('SendGrid Error Details:', error.response.body);
        }
        
        throw new Error(`SendGrid failed: ${error.message}`);
    }
};

/**
 * Check if SendGrid is available
 */
export const isSendGridAvailable = (): boolean => {
    return sendGridInitialized;
};

export default sendEmailViaSendGrid;
