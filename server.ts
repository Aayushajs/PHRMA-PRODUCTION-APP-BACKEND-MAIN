import { createServer } from 'http';
import app from './App';
import { initializeSocket } from './config/socket';
import { startKeepAliveCron } from './cronjob/keepAlive';

const PORT = parseInt(process.env.PORT || '5001', 10);

const httpServer = createServer(app);

initializeSocket(httpServer);

httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}`);
  
  if (process.env.NODE_ENV === 'production') {
    startKeepAliveCron();
    console.log('Keep-Alive cron job initialized');
  }
});