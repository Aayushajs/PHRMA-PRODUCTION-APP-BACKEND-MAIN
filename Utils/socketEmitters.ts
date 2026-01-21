/*
┌───────────────────────────────────────────────────────────────────────┐
│  WebSocket Event Emitters - Global utility for real-time events       │
│  Usage: Import and call functions to emit real-time updates           │
└───────────────────────────────────────────────────────────────────────┘
*/

import { getIO } from '../config/socket';

/**
 * Emit recently viewed item update to specific user
 * @param userId - User ID string
 * @param item - Item data to send
 */
export const emitRecentlyViewedUpdate = (userId: string, item: any) => {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit('recentlyViewed:update', {
      type: 'recently_viewed',
      data: item,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('WebSocket emit error (recentlyViewed):', error);
  }
};

/**
 * Emit new product to all connected clients
 * @param product - Product data to broadcast
 */
export const emitNewProductAdded = (product: any) => {
  try {
    const io = getIO();
    
    // Broadcast to all users
    io.emit('product:new', {
      type: 'new_product',
      data: product,
      timestamp: Date.now()
    });

    // Also emit to category-specific room if category exists
    if (product.itemCategory) {
      io.to(`category:${product.itemCategory}`).emit('category:product:new', {
        type: 'category_new_product',
        data: product,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.error('WebSocket emit error (newProduct):', error);
  }
};

/**
 * Emit product update to all connected clients
 * @param product - Updated product data
 */
export const emitProductUpdated = (product: any) => {
  try {
    const io = getIO();
    
    io.emit('product:updated', {
      type: 'product_updated',
      data: product,
      timestamp: Date.now()
    });

    // Also emit to category room
    if (product.itemCategory) {
      io.to(`category:${product.itemCategory}`).emit('category:product:updated', {
        type: 'category_product_updated',
        data: product,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.error('WebSocket emit error (productUpdated):', error);
  }
};

/**
 * Emit product deletion to all connected clients
 * @param productId - Deleted product ID
 * @param categoryId - Category ID (optional)
 */
export const emitProductDeleted = (productId: string, categoryId?: string) => {
  try {
    const io = getIO();
    
    io.emit('product:deleted', {
      type: 'product_deleted',
      data: { productId },
      timestamp: Date.now()
    });

    if (categoryId) {
      io.to(`category:${categoryId}`).emit('category:product:deleted', {
        type: 'category_product_deleted',
        data: { productId },
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.error('WebSocket emit error (productDeleted):', error);
  }
};

/**
 * Emit trending products update to all users
 * @param products - Array of trending products
 */
export const emitTrendingProductsUpdate = (products: any[]) => {
  try {
    const io = getIO();
    io.emit('trendingProducts:update', {
      type: 'trending_products',
      data: products,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('WebSocket emit error (trending):', error);
  }
};

/**
 * Emit category viewed to specific user
 * @param userId - User ID
 * @param categoryId - Category ID
 */
export const emitCategoryViewUpdate = (userId: string, categoryId: string) => {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit('categoryViewed:update', {
      type: 'category_viewed',
      data: { categoryId },
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('WebSocket emit error (categoryViewed):', error);
  }
};

/**
 * Emit wishlist update to specific user
 * @param userId - User ID
 * @param action - 'added', 'removed', or 'cleared'
 * @param item - Item data
 */
export const emitWishlistUpdate = (userId: string, action: 'added' | 'removed' | 'cleared', item: any) => {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit('wishlist:update', {
      type: 'wishlist_update',
      action,
      data: item,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('WebSocket emit error (wishlist):', error);
  }
};

/**
 * Emit cart update to specific user
 * @param userId - User ID
 * @param action - 'added', 'removed', or 'updated'
 * @param item - Item data
 */
export const emitCartUpdate = (userId: string, action: 'added' | 'removed' | 'updated', item: any) => {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit('cart:update', {
      type: 'cart_update',
      action,
      data: item,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('WebSocket emit error (cart):', error);
  }
};

/**
 * Emit order status update to specific user
 * @param userId - User ID
 * @param order - Order data with status
 */
export const emitOrderStatusUpdate = (userId: string, order: any) => {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit('order:status', {
      type: 'order_status_update',
      data: order,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('WebSocket emit error (orderStatus):', error);
  }
};

/**
 * Emit notification to specific user
 * @param userId - User ID
 * @param notification - Notification data
 */
export const emitNotification = (userId: string, notification: any) => {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit('notification:new', {
      type: 'notification',
      data: notification,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('WebSocket emit error (notification):', error);
  }
};

/**
 * Generic emit function for custom events
 * @param event - Event name
 * @param data - Data to send
 * @param room - Optional room to emit to (if not provided, broadcasts to all)
 */
export const emitCustomEvent = (event: string, data: any, room?: string) => {
  try {
    const io = getIO();
    if (room) {
      io.to(room).emit(event, {
        type: event,
        data,
        timestamp: Date.now()
      });
    } else {
      io.emit(event, {
        type: event,
        data,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.error(`WebSocket emit error (${event}):`, error);
  }
};
