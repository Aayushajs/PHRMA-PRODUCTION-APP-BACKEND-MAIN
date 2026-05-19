/*
┌───────────────────────────────────────────────────────────────────────┐
│  Socket.IO Configuration - Real-time WebSocket Server                 │
└───────────────────────────────────────────────────────────────────────┘
*/

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import dotenv from 'dotenv';
import { verifyAccessToken } from '../Utils/jwtToken';
import RoleIndex from '../Utils/Roles.enum';

dotenv.config({ path: './config/.env' });

let io: SocketIOServer | null = null;

// SECURITY (F-08): Build an origin allowlist from env. CORS wildcard with
// `credentials: true` is both insecure AND non-functional (browsers reject
// it). We keep the wildcard as a *last-resort* fallback so dev environments
// without CORS_ORIGINS still boot, but production must set CORS_ORIGINS.
const parseOrigins = (): string[] | '*' => {
  const raw = (process.env.SOCKET_CORS_ORIGINS || process.env.CORS_ORIGINS || '').trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[socket] CORS_ORIGINS not set in production — falling back to "*" (credentials disabled).');
    }
    return '*';
  }
  return raw.split(',').map(o => o.trim()).filter(Boolean);
};

export const initializeSocket = (httpServer: HTTPServer) => {
  const origin = parseOrigins();

  io = new SocketIOServer(httpServer, {
    cors: {
      origin,
      methods: ["GET", "POST"],
      // Browsers ignore credentials when origin is '*', so only set credentials
      // when we have an explicit allowlist — this also makes the misconfig fail
      // loudly instead of silently.
      credentials: origin !== '*'
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authenticate socket connection using JWT provided in handshake.
  // Uses the shared verifyAccessToken helper — algorithm pinned to HS256.
  io.use((socket, next) => {
    try {
      const auth = (socket.handshake.auth as any) || {};
      const headers = (socket.handshake.headers as any) || {};
      let token: string | undefined = undefined;

      if (typeof auth.token === 'string') token = auth.token;
      if (!token && typeof headers.authorization === 'string') token = headers.authorization;
      if (!token) return next(new Error('Authentication token required'));

      token = token.replace(/^Bearer\s+/i, '');

      // verifyAccessToken throws on invalid signature / wrong algorithm / expired.
      const decoded = verifyAccessToken(token) as any;

      // SECURITY: only honor the canonical `_id` claim that we sign. Accepting
      // alternative names (id / userId / sub) opens claim-confusion attacks.
      const userId = decoded?._id;
      if (!userId) return next(new Error('Invalid token: missing _id'));

      socket.data.user = {
        id: String(userId),
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
      // SECURITY (F-08): role enum is uppercase. Comparing against 'admin'
      // was always false → admin clients silently lost access to user rooms.
      if (socket.data.user.id === userId || socket.data.user.role === RoleIndex.ADMIN) {
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
