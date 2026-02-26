/*
┌───────────────────────────────────────────────────────────────────────┐
│  Keep Alive Cron Job - Prevents server from sleeping on Render        │
│  Pings the health check endpoint every 5 minutes                       │
└───────────────────────────────────────────────────────────────────────┘
*/

import axios from 'axios';

// Get the server URL from environment or use default
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5001';
const HEALTH_CHECK_URL = `${SERVER_URL}/api/v1/health`;

// Interval in milliseconds (5 minutes = 300000ms)
const INTERVAL = 5 * 60 * 1000;

let isRunning = false;

/**
 * Pings the health check endpoint to keep server alive
 */
async function pingServer() {
  if (isRunning) {
    console.log('⏳ Previous ping still in progress, skipping...');
    return;
  }

  try {
    isRunning = true;
    const startTime = Date.now();
    
    const response = await axios.get(HEALTH_CHECK_URL, {
      timeout: 30000, // 30 seconds timeout
      headers: {
        'User-Agent': 'KeepAlive-CronJob'
      }
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`✅ Server ping successful (${duration}ms):`, {
      status: response.data.status,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error(' Failed to ping server:', {
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
  } finally {
    isRunning = false;
  }
}

/**
 * Starts the keep-alive cron job
 */
export function startKeepAliveCron() {
  console.log('🚀 Starting Keep-Alive Cron Job');
  console.log(` Server URL: ${SERVER_URL}`);
  console.log(`⏱️  Interval: ${INTERVAL / 1000} seconds (${INTERVAL / 60000} minutes)`);
  
  // Initial ping after 30 seconds
  setTimeout(() => {
    console.log(' Running initial health check...');
    pingServer();
  }, 30000);
  
  // Set up recurring ping
  const intervalId = setInterval(pingServer, INTERVAL);
  
  // Handle graceful shutdown
  process.on('SIGTERM', () => {
    console.log('⚠️  SIGTERM received, stopping keep-alive cron...');
    clearInterval(intervalId);
  });
  
  process.on('SIGINT', () => {
    console.log('  SIGINT received, stopping keep-alive cron...');
    clearInterval(intervalId);
    process.exit(0);
  });
  
  return intervalId;
}

// Auto-start if this file is run directly
if (require.main === module) {
  startKeepAliveCron();
  console.log('✅ Keep-Alive service started successfully');
}
