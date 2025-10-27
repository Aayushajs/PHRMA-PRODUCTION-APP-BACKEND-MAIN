import nodemailer, { Transporter } from "nodemailer";
import dotenv from "dotenv";

dotenv.config({ path: "./config/.env" });

const testConnection = async (): Promise<void> => {
  try {
    const transporter: Transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // true for port 465, false for 587
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    });

    console.log("🔍 Verifying Gmail credentials...");
    await transporter.verify();
    console.log("✅ Gmail credentials are correct — SMTP connection successful.");
  } catch (error: any) {
    console.error("❌ Gmail credentials are incorrect or blocked.");
    console.error("Error message:", error.message);
  }
};

testConnection();
