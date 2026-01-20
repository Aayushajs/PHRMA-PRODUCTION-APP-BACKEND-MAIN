/*
┌───────────────────────────────────────────────────────────────────────┐
│  Server Entry Point - Main Express application setup/initialization.  │
└───────────────────────────────────────────────────────────────────────┘
*/

import express, { Express } from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { createServer } from 'http';
import { connectDB } from './Databases/db';
import { errorHandler } from './Middlewares/errorHandler';
import mainRouter from './Routers/main.Routes';
import { startKeepAliveCron } from './cronjob/keepAlive';
import { initializeSocket } from './config/socket';

dotenv.config({ path: './config/.env' });


const app: Express = express();

//middlewares
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: ['*'],
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
  console.error(" Firebase initialization failed:", err);
}

const PORT = parseInt(process.env.PORT || '5001', 10);

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO
const io = initializeSocket(httpServer);
console.log(' Socket.IO initialized');

httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
  console.log(`✅ WebSocket server ready on ws://0.0.0.0:${PORT}`);
  
  // Start keep-alive cron job to prevent cold starts on Render
  if (process.env.NODE_ENV === 'production') {
    startKeepAliveCron();
    console.log(' Keep-Alive cron job initialized');
  }
})