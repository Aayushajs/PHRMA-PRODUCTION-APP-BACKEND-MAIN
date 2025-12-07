import nodemailer, { Transporter } from 'nodemailer';
import dotenv from 'dotenv';
import { sendEmailViaSendGrid, isSendGridAvailable } from './sendgridMailer';

dotenv.config({ path: './config/.env' });

if(!process.env.GMAIL_USER || !process.env.GMAIL_PASS){
    throw new Error("GMAIL_USER and GMAIL_PASS must be defined in .env file");
}

// Create transporter with multiple fallback configurations
const createTransporter = (): Transporter => {
    // Try SSL first (Port 465)
    const sslTransporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2'
        },
        connectionTimeout: 60000,
        greetingTimeout: 60000,
        socketTimeout: 60000,
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5,
        logger: false,
        debug: false
    });

    return sslTransporter;
};

// Fallback TLS transporter (Port 587)
const createFallbackTransporter = (): Transporter => {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false,
            ciphers: 'SSLv3'
        },
        connectionTimeout: 60000,
        greetingTimeout: 60000,
        socketTimeout: 60000
    });
};

let transporter: Transporter = createTransporter();
let usingFallback = false;

// Verify connection and switch to fallback if needed
const verifyConnection = async () => {
    try {
        await transporter.verify();
        console.log('✅ SMTP Server ready (Port 465 - SSL)');
        return true;
    } catch (error: any) {
        console.error('❌ Port 465 failed:', error.message);
        console.log('🔄 Trying fallback Port 587 (TLS)...');
        
        try {
            transporter = createFallbackTransporter();
            await transporter.verify();
            usingFallback = true;
            console.log('✅ SMTP Server ready (Port 587 - TLS Fallback)');
            return true;
        } catch (fallbackError: any) {
            console.error('❌ Port 587 also failed:', fallbackError.message);
            console.error('Please check GMAIL_USER and GMAIL_PASS in environment variables');
            console.error('Make sure you are using Gmail App Password, not regular password');
            return false;
        }
    }
};

// Verify on startup
verifyConnection();

// HTML Email Template
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
            .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
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

// Email sending function with SendGrid fallback and enhanced retry logic
export const sendEmail = async (email: string, otp: number, retries: number = 3): Promise<boolean> => {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
    }

    // Try SendGrid first if available (best for Render deployment)
    if (isSendGridAvailable()) {
        try {
            console.log('📧 Using SendGrid (Primary method)...');
            const result = await sendEmailViaSendGrid(email, otp);
            if (result) {
                return true;
            }
        } catch (sendGridError: any) {
            console.error('❌ SendGrid failed:', sendGridError.message);
            console.log('🔄 Falling back to Gmail SMTP...');
            // Continue to Gmail SMTP fallback
        }
    } else {
        console.log('⚠️ SendGrid not configured, using Gmail SMTP...');
    }

    const mailOptions = {
        from: {
            name: 'Epharma Support',
            address: process.env.GMAIL_USER as string
        },
        to: email,
        subject: '🔐 Your Password Reset OTP Code',
        text: `Your OTP code is: ${otp}\n\nThis code will expire in 3 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nEpharma Team`,
        html: getOtpEmailHTML(otp),
        priority: 'high' as const
    };

    let switchedToFallback = false;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const transporterType = usingFallback ? 'Port 587-TLS' : 'Port 465-SSL';
            console.log(`📤 Attempt ${attempt}/${retries} using ${transporterType} to ${email}...`);
            
            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ Email sent successfully to ${email}`);
            console.log(`📧 Message ID: ${info.messageId}`);
            return true;
        } catch (error: any) {
            console.error(`❌ Failed (Attempt ${attempt}/${retries}):`, error.message);
            console.error(`Error Code: ${error.code || 'UNKNOWN'}`);
            
            // Handle authentication errors - don't retry
            if (error.code === 'EAUTH') {
                console.error('🔒 Authentication failed!');
                console.error('   ⚠️ GMAIL_USER:', process.env.GMAIL_USER ? '✓ Set' : '✗ Missing');
                console.error('   ⚠️ GMAIL_PASS:', process.env.GMAIL_PASS ? '✓ Set' : '✗ Missing');
                console.error('   📝 Use Gmail App Password: https://myaccount.google.com/apppasswords');
                throw new Error('SMTP Authentication failed. Check Gmail App Password.');
            }
            
            // Handle connection/timeout errors
            if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT' || error.code === 'ESOCKET' || error.message.includes('timeout')) {
                console.error(`🌐 Connection/Timeout issue detected`);
                
                // Try switching to fallback transporter after 2 failed attempts
                if (attempt === 2 && !switchedToFallback && !usingFallback) {
                    console.log('🔄 Switching to fallback Port 587 (TLS)...');
                    try {
                        transporter = createFallbackTransporter();
                        await transporter.verify();
                        usingFallback = true;
                        switchedToFallback = true;
                        console.log('✅ Switched to Port 587 successfully');
                        // Don't increment attempt counter for this switch
                        continue;
                    } catch (fallbackError: any) {
                        console.error('❌ Fallback also failed:', fallbackError.message);
                    }
                }
                
                // Last attempt - give up
                if (attempt === retries) {
                    console.error(`💥 All ${retries} attempts failed`);
                    console.error('Possible reasons:');
                    console.error('  1. SMTP ports (465/587) blocked by hosting provider');
                    console.error('  2. Invalid Gmail App Password');
                    console.error('  3. Network connectivity issues');
                    console.error('  4. Gmail account security restrictions');
                    throw new Error(`Email failed after ${retries} attempts: ${error.message}`);
                }
                
                // Exponential backoff with jitter
                const baseDelay = Math.min(3000 * Math.pow(1.5, attempt - 1), 30000);
                const jitter = Math.random() * 2000;
                const waitTime = baseDelay + jitter;
                console.log(`⏳ Waiting ${Math.round(waitTime/1000)}s before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } 
            // Handle message format errors
            else if (error.code === 'EMESSAGE') {
                console.error('📧 Invalid message format');
                throw new Error('Invalid email message format');
            } 
            // Handle other errors
            else {
                console.error(`⚠️ Unexpected error: ${error.message}`);
                
                if (attempt === retries) {
                    throw new Error(`Email sending failed: ${error.message}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 4000 * attempt));
            }
        }
    }
    
    return false;
};
