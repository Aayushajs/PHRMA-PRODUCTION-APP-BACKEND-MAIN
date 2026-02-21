import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config({ path: './config/.env' });

// Convert Base64 → JSON
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_STRING!, "base64").toString("utf8")
);

// Check if Firebase app is already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const firebaseAdmin = admin;