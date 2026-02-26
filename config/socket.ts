/*
┌───────────────────────────────────────────────────────────────────────┐
│  Socket.IO Configuration - Real-time WebSocket Server                 │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

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

  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);

    // Join user-specific room for personalized updates
    socket.on('join:user', (userId: string) => {
      socket.join(`user:${userId}`);
      console.log(`User ${userId} joined their room`);
    });

    // Join category room for category-specific updates
    socket.on('join:category', (categoryId: string) => {
      socket.join(`category:${categoryId}`);
      console.log(`Joined category room: ${categoryId}`);
    });

    // Leave rooms
    socket.on('leave:user', (userId: string) => {
      socket.leave(`user:${userId}`);
    });

    socket.on('leave:category', (categoryId: string) => {
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
