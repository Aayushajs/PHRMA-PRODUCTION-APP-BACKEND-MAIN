import { createServer } from 'http';
import app from './App';
import { initializeSocket } from './config/socket';
import { startKeepAliveCron } from './cronjob/keepAlive';
import { queueProcessor } from './cronjob/queueProcessor.js';
import dns from "node:dns";

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const PORT = parseInt(process.env.PORT || '5001', 10);

const httpServer = createServer(app);

initializeSocket(httpServer);

httpServer.on('error', (error: any) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`\n❌ PORT ${PORT} IS ALREADY IN USE!`);
    console.error(`Please kill the existing process running on port ${PORT} and try again.\n`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
  }
});

httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}`);
  
  // Start notification queue processor (shared queue with Service 2)
  await queueProcessor.start();
  
  if (process.env.NODE_ENV === 'production') {
    startKeepAliveCron();
    console.log('Keep-Alive cron job initialized');
  }
});