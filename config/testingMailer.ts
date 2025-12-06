import nodemailer, { Transporter } from "nodemailer";
import dotenv from "dotenv";

dotenv.config({ path: "./config/.env" });

const testConnection = async (): Promise<void> => {
  console.log("\n🔍 Testing Email Configuration...\n");
  console.log("📧 Email:", process.env.GMAIL_USER);
  console.log("🔑 Password:", process.env.GMAIL_PASS ? "✅ Set (hidden)" : "❌ Not Set");
  console.log("\n" + "=".repeat(50) + "\n");

  try {
    const transporter: Transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // false for port 587, true for 465
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    console.log("⏳ Verifying SMTP connection...");
    await transporter.verify();
    console.log("\n✅ SUCCESS! Gmail credentials are correct");
    console.log("✅ SMTP connection successful");
    console.log("✅ Server is ready to send emails\n");
    
    // Send test email
    console.log("📨 Sending test email...");
    const testEmail = await transporter.sendMail({
      from: {
        name: 'Epharma Test',
        address: process.env.GMAIL_USER as string
      },
      to: process.env.GMAIL_USER, // Send to self for testing
      subject: "🧪 Test Email - SMTP Configuration Successful",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; background: #f4f4f4;">
          <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px;">
            <h2 style="color: #4CAF50;">✅ Email Configuration Test Successful!</h2>
            <p>Your SMTP configuration is working correctly.</p>
            <ul>
              <li><strong>Host:</strong> smtp.gmail.com</li>
              <li><strong>Port:</strong> 587</li>
              <li><strong>Email:</strong> ${process.env.GMAIL_USER}</li>
              <li><strong>Time:</strong> ${new Date().toLocaleString()}</li>
            </ul>
            <p style="color: #666; margin-top: 30px; font-size: 12px;">
              This is an automated test email from your Epharma backend server.
            </p>
          </div>
        </div>
      `
    });
    
    console.log("✅ Test email sent successfully!");
    console.log("📬 Message ID:", testEmail.messageId);
    console.log("\n" + "=".repeat(50));
    console.log("🎉 All tests passed! Email system is ready for production.");
    console.log("=".repeat(50) + "\n");
    
  } catch (error: any) {
    console.error("\n❌ FAILED! Gmail credentials are incorrect or blocked.\n");
    console.error("Error Code:", error.code);
    console.error("Error Message:", error.message);
    
    if (error.code === 'EAUTH') {
      console.error("\n🔧 Fix this error:");
      console.error("   1. Enable 2-Step Verification: https://myaccount.google.com/security");
      console.error("   2. Generate App Password: https://myaccount.google.com/apppasswords");
      console.error("   3. Use App Password (16 chars) in .env file, NOT your Gmail password");
      console.error("   4. Update GMAIL_PASS in config/.env\n");
    } else if (error.code === 'ECONNECTION') {
      console.error("\n🌐 Network connection issue. Check your internet connection.\n");
    }
    
    console.error("=".repeat(50) + "\n");
    process.exit(1);
  }
};

testConnection();
