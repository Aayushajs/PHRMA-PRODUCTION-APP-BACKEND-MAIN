# 🚀 WebSocket Frontend Implementation - Complete Guide for Claude 4.5

## 📋 Project Context

I have a backend server with Socket.IO WebSocket implementation. I need you to create a complete, production-ready WebSocket client implementation for my React Native 

---

## 🎯 Backend WebSocket Configuration

**Server URL**: `http://YOUR_BACKEND_URL:5001`  
**Protocol**: Socket.IO v4.x  
**Transport**: WebSocket with fallback to polling

---

## 📡 Available Events

### **1. Connection Management**

#### Client → Server (Emit)
```typescript
socket.emit('join:user', userId: string);           // Join user-specific room
socket.emit('join:category', categoryId: string);   // Join category-specific room
socket.emit('leave:user', userId: string);          // Leave user room
socket.emit('leave:category', categoryId: string);  // Leave category room
```

#### Server → Client (Listen)
```typescript
socket.on('connect', callback);         // Connected successfully
socket.on('disconnect', callback);      // Disconnected
socket.on('connect_error', callback);   // Connection error
```

---

### **2. Real-time Events (Server → Client)**

#### A) New Product Added
```typescript
socket.on('product:new', (data) => {
  // Structure:
  {
    type: 'new_product',
    data: {
      _id: string,
      itemName: string,
      itemFinalPrice: number,
      itemDiscount: number,
      itemCategory: string,
      image: string | null,
      isPremium?: boolean
    },
    timestamp: number
  }
});
```

#### B) Product Updated
```typescript
socket.on('product:updated', (data) => {
  // Structure:
  {
    type: 'product_updated',
    data: {
      _id: string,
      itemName: string,
      itemFinalPrice: number,
      // ... other fields
    },
    timestamp: number
  }
});
```

#### C) Product Deleted
```typescript
socket.on('product:deleted', (data) => {
  // Structure:
  {
    type: 'product_deleted',
    data: {
      productId: string
    },
    timestamp: number
  }
});
```

#### D) Recently Viewed Update (User-specific)
```typescript
socket.on('recentlyViewed:update', (data) => {
  // Structure:
  {
    type: 'recently_viewed',
    data: {
      _id: string,
      itemName: string,
      itemFinalPrice: number,
      itemDiscount: number,
      image: string | null
    },
    timestamp: number
  }
});
```

#### E) Category-specific Product (When joined category room)
```typescript
socket.on('category:product:new', (data) => {
  // Structure:
  {
    type: 'category_new_product',
    data: {
      _id: string,
      itemName: string,
      itemFinalPrice: number,
      itemDiscount: number,
      itemCategory: string,
      image: string | null
    },
    timestamp: number
  }
});
```

#### F) Trending Products Update
```typescript
socket.on('trendingProducts:update', (data) => {
  // Structure:
  {
    type: 'trending_products',
    data: Array<Product>,
    timestamp: number
  }
});
```

#### G) Wishlist Update (User-specific)
```typescript
socket.on('wishlist:update', (data) => {
  // Structure:
  {
    type: 'wishlist_update',
    action: 'added' | 'removed',
    data: Product,
    timestamp: number
  }
});
```

#### H) Cart Update (User-specific)
```typescript
socket.on('cart:update', (data) => {
  // Structure:
  {
    type: 'cart_update',
    action: 'added' | 'removed' | 'updated',
    data: Product,
    timestamp: number
  }
});
```

#### I) Order Status Update (User-specific)
```typescript
socket.on('order:status', (data) => {
  // Structure:
  {
    type: 'order_status_update',
    data: {
      orderId: string,
      status: string,
      // ... other order fields
    },
    timestamp: number
  }
});
```

#### J) Notification (User-specific)
```typescript
socket.on('notification:new', (data) => {
  // Structure:
  {
    type: 'notification',
    data: {
      title: string,
      message: string,
      type: 'info' | 'success' | 'warning' | 'error'
    },
    timestamp: number
  }
});
```

---

## 🔨 Implementation Requirements

### **Tech Stack**
- **Language**: TypeScript (preferred) or JavaScript
- **Framework**: React Native or React
- **Library**: socket.io-client v4.x
- **State Management**: Redux Toolkit / Zustand / Context API (your choice)

### **Core Features**
1. ✅ Auto-connect on app start
2. ✅ Auto-reconnect with exponential backoff
3. ✅ Connection state indicator (connected/disconnected/connecting)
4. ✅ User room auto-join on authentication
5. ✅ Category room management on navigation
6. ✅ Event queue for offline scenarios
7. ✅ Toast notifications for important events
8. ✅ Silent background updates for less important events
9. ✅ Type-safe event handling
10. ✅ Cleanup on unmount

### **Performance Requirements**
- Minimal re-renders
- Efficient state updates
- No memory leaks
- Proper cleanup

---

## 📁 File Structure to Create

```
src/
├── services/
│   ├── socket.service.ts          # Socket connection & management
│   └── socketEvents.types.ts      # TypeScript types for events
├── hooks/
│   ├── useSocket.ts               # Main socket hook
│   ├── useSocketEvent.ts          # Event listener hook
│   └── useSocketRoom.ts           # Room management hook
├── store/ (or context/)
│   ├── socketSlice.ts             # Redux slice (if using Redux)
│   └── socketContext.tsx          # Context (if using Context API)
├── components/
│   └── ConnectionIndicator.tsx    # Connection status component
└── utils/
    └── socketHelpers.ts           # Helper functions
```

---

## 💻 Implementation Details

### **1. Socket Service (socket.service.ts)**

Create a singleton socket service with:
- Connection management
- Event emitter wrapper
- Reconnection logic
- Error handling
- Debug logging (dev mode only)

**Requirements:**
```typescript
class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  connect(url: string): void;
  disconnect(): void;
  emit(event: string, data: any): void;
  on(event: string, callback: Function): void;
  off(event: string, callback?: Function): void;
  joinUserRoom(userId: string): void;
  leaveUserRoom(userId: string): void;
  joinCategoryRoom(categoryId: string): void;
  leaveCategoryRoom(categoryId: string): void;
  isConnected(): boolean;
}
```

### **2. Main Socket Hook (useSocket.ts)**

```typescript
export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  
  useEffect(() => {
    // Initialize connection
    // Setup listeners
    // Cleanup
  }, []);
  
  return {
    isConnected,
    connectionStatus,
    socket: socketService
  };
};
```

### **3. Event Listener Hook (useSocketEvent.ts)**

```typescript
export const useSocketEvent = <T = any>(
  event: string,
  callback: (data: T) => void
) => {
  useEffect(() => {
    socketService.on(event, callback);
    return () => {
      socketService.off(event, callback);
    };
  }, [event, callback]);
};
```

### **4. Room Management Hook (useSocketRoom.ts)**

```typescript
export const useSocketRoom = (
  type: 'user' | 'category',
  id?: string
) => {
  useEffect(() => {
    if (!id) return;
    
    if (type === 'user') {
      socketService.joinUserRoom(id);
    } else {
      socketService.joinCategoryRoom(id);
    }
    
    return () => {
      if (type === 'user') {
        socketService.leaveUserRoom(id);
      } else {
        socketService.leaveCategoryRoom(id);
      }
    };
  }, [type, id]);
};
```

### **5. TypeScript Types (socketEvents.types.ts)**

```typescript
export interface SocketEvent<T = any> {
  type: string;
  data: T;
  timestamp: number;
}

export interface Product {
  _id: string;
  itemName: string;
  itemFinalPrice: number;
  itemDiscount: number;
  itemCategory?: string;
  image?: string | null;
  isPremium?: boolean;
}

// ... more types for each event
```

---

## 🎨 UI Components

### **1. Connection Indicator**

Visual indicator showing:
- 🟢 Green: Connected
- 🔴 Red: Disconnected
- 🟡 Yellow: Connecting

Position: Top right corner (small badge)

### **2. Toast Notifications**

Show toast for:
- New products added (with product name)
- Order status updates
- Important notifications

**Don't show** toast for:
- Recently viewed updates
- Silent background updates

---

## 📱 Usage Examples

### **Example 1: Product List Screen**

```typescript
const ProductListScreen = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const { isConnected } = useSocket();
  const { user } = useAuth();
  
  // Join user room
  useSocketRoom('user', user?.id);
  
  // Listen for new products
  useSocketEvent<SocketEvent<Product>>('product:new', (data) => {
    setProducts(prev => [data.data, ...prev]);
    showToast(`New product: ${data.data.itemName}`);
  });
  
  // Listen for product updates
  useSocketEvent<SocketEvent<Product>>('product:updated', (data) => {
    setProducts(prev => 
      prev.map(p => p._id === data.data._id ? data.data : p)
    );
  });
  
  // Listen for product deletions
  useSocketEvent<SocketEvent<{productId: string}>>('product:deleted', (data) => {
    setProducts(prev => 
      prev.filter(p => p._id !== data.data.productId)
    );
  });
  
  return (
    <View>
      {isConnected && <Badge color="green">🟢 Live</Badge>}
      <FlatList data={products} renderItem={...} />
    </View>
  );
};
```

### **Example 2: Category Screen**

```typescript
const CategoryScreen = ({ categoryId }) => {
  const [products, setProducts] = useState<Product[]>([]);
  
  // Join category room
  useSocketRoom('category', categoryId);
  
  // Listen for category-specific products
  useSocketEvent('category:product:new', (data) => {
    setProducts(prev => [data.data, ...prev]);
  });
  
  return <ProductList products={products} />;
};
```

### **Example 3: Recently Viewed**

```typescript
const RecentlyViewedWidget = () => {
  const [recentItems, setRecentItems] = useState<Product[]>([]);
  const { user } = useAuth();
  
  useSocketRoom('user', user?.id);
  
  // Silent update (no toast)
  useSocketEvent('recentlyViewed:update', (data) => {
    setRecentItems(prev => {
      const filtered = prev.filter(item => item._id !== data.data._id);
      return [data.data, ...filtered].slice(0, 10);
    });
  });
  
  return <HorizontalScroll items={recentItems} />;
};
```

---

## 🔧 Configuration

### **Environment Variables**
```env
SOCKET_URL=http://localhost:5001    # Development
SOCKET_URL=https://api.prod.com:5001  # Production
```

### **Socket Options**
```typescript
{
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  timeout: 20000
}
```

---

## 🧪 Testing Requirements

1. Connection/disconnection scenarios
2. Network offline/online transitions
3. Background/foreground app state
4. Multiple simultaneous events
5. Memory leak prevention
6. Event cleanup on unmount

---

## 📋 Best Practices to Follow

1. ✅ Always cleanup event listeners
2. ✅ Use memoized callbacks to prevent re-subscriptions
3. ✅ Handle errors gracefully
4. ✅ Show connection status to users
5. ✅ Queue events when offline
6. ✅ Debounce rapid events
7. ✅ Type all events properly
8. ✅ Log errors in production
9. ✅ Disconnect on logout
10. ✅ Reconnect on login

---

## ⚠️ Important Notes

- **Auto-join user room** after authentication
- **Leave rooms** when navigating away
- **Don't create** multiple socket connections
- **Singleton pattern** for socket service
- **Clean up** all listeners on unmount
- **Memoize** callback functions
- **Handle** race conditions
- **Queue** updates if offline

---

## 🎯 Deliverables

Please create:

1. ✅ Socket service with connection management
2. ✅ All required hooks (useSocket, useSocketEvent, useSocketRoom)
3. ✅ TypeScript types for all events
4. ✅ Connection indicator component
5. ✅ State management (Redux/Zustand/Context)
6. ✅ Helper utilities
7. ✅ Usage examples in 3+ screens
8. ✅ README with setup instructions
9. ✅ Error handling throughout
10. ✅ Comments explaining complex logic

---

## 🚀 Success Criteria

- ✅ Socket connects automatically on app start
- ✅ Auto-reconnects after network issues
- ✅ Events update UI in real-time
- ✅ No memory leaks
- ✅ Proper cleanup on unmount
- ✅ User-specific and global events work
- ✅ Toast notifications for important events
- ✅ Silent updates for background events
- ✅ Connection indicator shows status
- ✅ Works offline (queues events)

---

## 📞 Additional Context

- Backend is production-ready
- All events are tested and working
- Server handles reconnection automatically
- CORS is configured for your domain
- Server emits events after database operations

---

**Start with the socket service and hooks, then move to UI components. Ask questions if anything is unclear!**
