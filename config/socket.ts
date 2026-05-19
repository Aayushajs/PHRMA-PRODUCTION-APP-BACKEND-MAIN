/*
┌───────────────────────────────────────────────────────────────────────┐
│  Socket.IO Configuration - Real-time WebSocket Server                 │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config({ path: './config/.env' });

let io: SocketIOServer | null = null;

export const initializeSocket = (httpServer: HTTPServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*", // Update with your frontend URL in production
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authenticate socket connection using JWT provided in handshake
  io.use((socket, next) => {
    try {
      const auth = (socket.handshake.auth as any) || {};
      const headers = (socket.handshake.headers as any) || {};
      let token: string | undefined = undefined;

      if (typeof auth.token === 'string') token = auth.token;
      if (!token && typeof headers.authorization === 'string') token = headers.authorization;
      if (!token) return next(new Error('Authentication token required'));

      token = token.replace(/^Bearer\s+/i, '');
      const secret = process.env.USER_SECRET_KEY as string;
      if (!secret) return next(new Error('Server misconfigured: missing USER_SECRET_KEY'));

      const decoded = jwt.verify(token, secret) as any;
      socket.data.user = {
        id: decoded?.id || decoded?.userId || decoded?.sub,
        role: decoded?.role,
        email: decoded?.email,
      };

      return next();
    } catch (err) {
      return next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ Authenticated client connected: ${socket.id} user=${socket.data.user?.id}`);

    // Join user-specific room for personalized updates (only same user or admin)
    socket.on('join:user', (userId: string) => {
      if (!socket.data.user) { socket.emit('error', 'unauthorized'); return; }
      if (socket.data.user.id === userId || socket.data.user.role === 'admin') {
        socket.join(`user:${userId}`);
        console.log(`User ${userId} joined their room`);
      } else {
        socket.emit('error', 'forbidden');
      }
    });

    // Join category room for category-specific updates (authenticated users allowed)
    socket.on('join:category', (categoryId: string) => {
      if (!socket.data.user) { socket.emit('error', 'unauthorized'); return; }
      socket.join(`category:${categoryId}`);
      console.log(`Joined category room: ${categoryId} by user ${socket.data.user.id}`);
    });

    // Leave rooms
    socket.on('leave:user', (userId: string) => {
      if (!socket.data.user) { socket.emit('error', 'unauthorized'); return; }
      socket.leave(`user:${userId}`);
    });

    socket.on('leave:category', (categoryId: string) => {
      if (!socket.data.user) { socket.emit('error', 'unauthorized'); return; }
      socket.leave(`category:${categoryId}`);
    });

    socket.on('disconnect', () => {
      console.log(` Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return io;
};

// Real-time event emitters
export const emitRecentlyViewedUpdate = (userId: string, item: any) => {
  if (io) {
    io.to(`user:${userId}`).emit('recentlyViewed:update', {
      type: 'recently_viewed',
      data: item,
      timestamp: Date.now()
    });
  }
};

export const emitTrendingProductsUpdate = (products: any[]) => {
  if (io) {
    io.emit('trendingProducts:update', {
      type: 'trending_products',
      data: products,
      timestamp: Date.now()
    });
  }
};

export const emitNewProductAdded = (product: any) => {
  if (io) {
    io.emit('product:new', {
      type: 'new_product',
      data: product,
      timestamp: Date.now()
    });

    // Also emit to category-specific room
    if (product.itemCategory) {
      io.to(`category:${product.itemCategory}`).emit('category:product:new', {
        type: 'category_new_product',
        data: product,
        timestamp: Date.now()
      });
    }
  }
};

export const emitCategoryViewUpdate = (userId: string, categoryId: string) => {
  if (io) {
    io.to(`user:${userId}`).emit('categoryViewed:update', {
      type: 'category_viewed',
      data: { categoryId },
      timestamp: Date.now()
    });
  }
};
