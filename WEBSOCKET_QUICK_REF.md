# 🎯 WebSocket Quick Reference - Copy & Paste Examples

## 📋 For Backend Developers

### **Import Statement (Add to any service)**
```typescript
import { emitNewProductAdded, emitProductUpdated, emitProductDeleted, emitRecentlyViewedUpdate, emitWishlistUpdate, emitCartUpdate, emitOrderStatusUpdate, emitNotification } from '../Utils/socketEmitters';
```

### **Common Use Cases**

#### 1️⃣ New Item Created
```typescript
const newItem = await ItemModel.create(data);
emitNewProductAdded({
  _id: newItem._id,
  itemName: newItem.itemName,
  itemFinalPrice: newItem.itemFinalPrice,
  itemDiscount: newItem.itemDiscount,
  itemCategory: newItem.itemCategory,
  image: newItem.itemImages?.[0] || null
});
```

#### 2️⃣ Item Updated
```typescript
const updated = await ItemModel.findByIdAndUpdate(id, data, { new: true });
emitProductUpdated({
  _id: updated._id,
  itemName: updated.itemName,
  itemFinalPrice: updated.itemFinalPrice,
  itemDiscount: updated.itemDiscount,
  itemCategory: updated.itemCategory,
  image: updated.itemImages?.[0] || null
});
```

#### 3️⃣ Item Deleted
```typescript
await ItemModel.findByIdAndDelete(id);
emitProductDeleted(id, categoryId); // categoryId optional
```

#### 4️⃣ User Viewed Item
```typescript
emitRecentlyViewedUpdate(userId.toString(), {
  _id: item._id,
  itemName: item.itemName,
  itemFinalPrice: item.itemFinalPrice,
  itemDiscount: item.itemDiscount,
  image: item.itemImages?.[0] || null
});
```

#### 5️⃣ Wishlist Updated
```typescript
emitWishlistUpdate(userId.toString(), 'added', {
  _id: item._id,
  itemName: item.itemName,
  itemFinalPrice: item.itemFinalPrice,
  image: item.itemImages?.[0] || null
});
```

#### 6️⃣ Order Status Changed
```typescript
emitOrderStatusUpdate(userId.toString(), {
  orderId: order._id,
  status: order.status,
  orderNumber: order.orderNumber,
  totalAmount: order.totalAmount
});
```

#### 7️⃣ Send Notification
```typescript
emitNotification(userId.toString(), {
  title: 'New Offer!',
  message: 'Get 50% off on medicines',
  type: 'info' // 'info' | 'success' | 'warning' | 'error'
});
```

---

## 📱 For Frontend Developers (Claude 4.5 Prompt)

### **Step 1: Copy Complete Prompt**

File: `FRONTEND_WEBSOCKET_PROMPT.md`

**Just copy the entire file and send to Claude 4.5!**

### **Step 2: Install Package**
```bash
npm install socket.io-client
```

### **Step 3: Use Generated Code**

Claude will generate:
- Socket service
- Custom hooks
- TypeScript types
- Example components
- State management

---

## 🧪 Quick Test

### **Test Backend (Browser Console)**
```javascript
const socket = io('http://localhost:5001');

socket.on('connect', () => {
  console.log('Connected!', socket.id);
  socket.emit('join:user', 'YOUR_USER_ID');
});

socket.on('product:new', (data) => {
  console.log('New product:', data);
});

socket.on('recentlyViewed:update', (data) => {
  console.log('Recently viewed:', data);
});
```

### **Test with HTML Client**
```
Open: websocket-test-client.html in browser
```

---

## 🎨 All Available Events

### **Server → Client (Listen in Frontend)**

```typescript
// Global Events (All Users)
socket.on('product:new', callback);
socket.on('product:updated', callback);
socket.on('product:deleted', callback);
socket.on('trendingProducts:update', callback);

// User-Specific Events
socket.on('recentlyViewed:update', callback);
socket.on('wishlist:update', callback);
socket.on('cart:update', callback);
socket.on('order:status', callback);
socket.on('notification:new', callback);
socket.on('categoryViewed:update', callback);

// Category-Specific Events
socket.on('category:product:new', callback);
socket.on('category:product:updated', callback);
socket.on('category:product:deleted', callback);
```

### **Client → Server (Emit from Frontend)**

```typescript
// Join/Leave Rooms
socket.emit('join:user', userId);
socket.emit('join:category', categoryId);
socket.emit('leave:user', userId);
socket.emit('leave:category', categoryId);
```

---

## 📊 Event Data Structures

### **Product Event**
```typescript
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
```

### **Wishlist Event**
```typescript
{
  type: 'wishlist_update',
  action: 'added' | 'removed',
  data: {
    _id: string,
    itemName: string,
    itemFinalPrice: number,
    image: string | null
  },
  timestamp: number
}
```

### **Order Event**
```typescript
{
  type: 'order_status_update',
  data: {
    orderId: string,
    status: string,
    orderNumber: string,
    totalAmount: number
  },
  timestamp: number
}
```

### **Notification Event**
```typescript
{
  type: 'notification',
  data: {
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error'
  },
  timestamp: number
}
```

---

## 🔥 Ultra Quick Setup (Backend)

**Add to ANY API in 30 seconds:**

```typescript
// 1. Import at top
import { emitNewProductAdded } from '../Utils/socketEmitters';

// 2. Add after database operation
const result = await Model.create(data);
emitNewProductAdded(result); // ✅ Done!
```

---

## 📁 Important Files

| File | Purpose |
|------|---------|
| `config/socket.ts` | Socket.IO server config |
| `Utils/socketEmitters.ts` | **All emitter functions (USE THIS)** |
| `server.ts` | Server initialization |
| `FRONTEND_WEBSOCKET_PROMPT.md` | **Frontend implementation prompt** |
| `HOW_TO_ADD_WEBSOCKET.md` | Detailed guide for adding to APIs |
| `websocket-test-client.html` | Testing tool |

---

## 🚀 Production Checklist

### Backend
- [x] Socket.IO installed
- [x] Server initialized
- [x] Emitters created
- [x] Events added to 3 APIs (example)
- [x] Error handling
- [x] CORS configured

### Frontend (To Do)
- [ ] Install socket.io-client
- [ ] Use prompt with Claude 4.5
- [ ] Implement socket service
- [ ] Add connection indicator
- [ ] Test real-time updates
- [ ] Deploy

---

## 💡 Pro Tips

1. **Always emit AFTER database success**
2. **Send only necessary data** (not entire objects)
3. **Use user-specific events** when possible
4. **Test with HTML client** before frontend integration
5. **Check server logs** for emit errors
6. **Frontend handles reconnection** automatically

---

## 🎯 Next Steps

### For Backend:
1. ✅ Everything is ready!
2. Add emitters to more APIs as needed
3. Use `HOW_TO_ADD_WEBSOCKET.md` as reference

### For Frontend:
1. Copy `FRONTEND_WEBSOCKET_PROMPT.md`
2. Send to Claude 4.5
3. Follow generated code
4. Test end-to-end

---

## 📞 Support

**File an issue if:**
- Event not received in frontend
- Server emit error in logs
- Need new event type

**Check first:**
- Server is running
- Frontend is connected
- User joined correct room
- Event name matches exactly

---

**Everything is production-ready! Just add emitters to your APIs! 🎉**
