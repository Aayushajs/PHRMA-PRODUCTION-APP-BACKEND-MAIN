import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config({ path: './config/.env' });

if(!process.env.GMAIL_USER || !process.env.GMAIL_PASS){
    throw new Error("GMAIL_USER and GMAIL_PASS must be defined in .env file");
}

// Production-ready SMTP configuration
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false // Accept self-signed certificates in production
    },
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 5000,
    socketTimeout: 10000
});

// Verify transporter connection on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ SMTP Connection Error:', error.message);
        console.error('Please check GMAIL_USER and GMAIL_PASS in .env file');
    } else {
        console.log('✅ SMTP Server is ready to send emails');
    }
});

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

// Email sending function with retry logic
export const sendEmail = async (email: string, otp: number, retries: number = 3): Promise<boolean> => {
    const mailOptions = {
        from: {
            name: 'Epharma Support',
            address: process.env.GMAIL_USER as string
        },
        to: email,
        subject: '🔐 Your Password Reset OTP Code',
        text: `Your OTP code is: ${otp}\n\nThis code will expire in 3 minutes.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nEpharma Team`,
        html: getOtpEmailHTML(otp)
    };

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const info = await transporter.sendMail(mailOptions);
            console.log(`✅ Email sent successfully to ${email}`);
            console.log(`📧 Message ID: ${info.messageId}`);
            console.log(`📬 Response: ${info.response}`);
            return true;
        } catch (error: any) {
            console.error(`❌ Email sending failed (Attempt ${attempt}/${retries}):`, error.message);
            
            if (error.code === 'EAUTH') {
                console.error('🔒 Authentication failed. Please check:');
                console.error('   1. GMAIL_USER is correct');
                console.error('   2. GMAIL_PASS is a valid App Password (not regular password)');
                console.error('   3. 2-Step Verification is enabled on Gmail');
                console.error('   4. Generate new App Password: https://myaccount.google.com/apppasswords');
            } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
                console.error('🌐 Network connection issue. Retrying...');
            } else if (error.code === 'EMESSAGE') {
                console.error('📧 Invalid email format or message content');
            }
            
            // If this was the last attempt, throw error
            if (attempt === retries) {
                console.error(`💥 Failed to send email after ${retries} attempts`);
                throw new Error(`Email sending failed: ${error.message}`);
            }
            
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
    
    return false;
};
