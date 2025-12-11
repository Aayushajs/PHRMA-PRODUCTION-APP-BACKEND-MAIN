/*
┌───────────────────────────────────────────────────────────────────────┐
│  Server Entry Point - Main Express application setup/initialization.  │
└───────────────────────────────────────────────────────────────────────┘
*/

import express, { Express } from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { connectDB } from './Databases/db';
import { errorHandler } from './Middlewares/errorHandler';
import mainRouter from './Routers/main.Routes';
import { firebaseAdmin } from './Utils/serviceAccount';

dotenv.config({ path: './config/.env' });


const app: Express = express();

//middlewares
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: ['exp://10.168.86.226:8081', '*'],
  // origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));



//router
app.use('/api/v1', mainRouter);

app.use(errorHandler)

// Initialize database connection and Firebase
connectDB().catch(err => {
  console.error("Database initialization failed:", err);
});

// Firebase Admin SDK is initialized in serviceAccount.ts
try {
  console.log("✅ Firebase Admin SDK initialized successfully");
} catch (err) {
  console.error("❌ Firebase initialization failed:", err);
}

const PORT = process.env.PORT || 5001;
app.listen(PORT, async () => {
  console.log(`Server is running on port http://localhost:${PORT}`);
})