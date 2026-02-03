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
import morgan from 'morgan';

dotenv.config({ path: './config/.env' });


const app: Express = express();

//middlewares
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({
  origin: ['*'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role', 'x-user-email'],
  credentials: true,
}));
app.use(morgan('dev'));


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

httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
  console.log(`✅ WebSocket server ready on ws://localhost:${PORT}`);
  
  // Start keep-alive cron job to prevent cold starts on Render
  if (process.env.NODE_ENV === 'production') {
    startKeepAliveCron();
    console.log(' Keep-Alive cron job initialized');
  }
})