# 📘 How to Add WebSocket to Any API - Developer Guide

## 🎯 Quick Start

Adding real-time updates to any API is now just **2 simple steps**!

---

## 📋 Step-by-Step Guide

### **Step 1: Import the Emitter**

At the top of your service file:

```typescript
import { 
  emitNewProductAdded,           // For new items
  emitProductUpdated,             // For updates
  emitProductDeleted,             // For deletions
  emitRecentlyViewedUpdate,       // For user-specific views
  emitWishlistUpdate,             // For wishlist changes
  emitCartUpdate,                 // For cart changes
  emitOrderStatusUpdate,          // For order updates
  emitNotification,               // For notifications
  emitCustomEvent                 // For custom events
} from '../Utils/socketEmitters';
```

### **Step 2: Call the Emitter**

After your database operation, call the appropriate emitter:

```typescript
// Example: After creating a new item
const newItem = await ItemModel.create(itemData);

// Emit real-time event
emitNewProductAdded({
  _id: newItem._id,
  itemName: newItem.itemName,
  itemFinalPrice: newItem.itemFinalPrice,
  itemDiscount: newItem.itemDiscount,
  itemCategory: newItem.itemCategory,
  image: newItem.itemImages?.[0] || null
});

return handleResponse(req, res, 201, "Item created", newItem);
```

**That's it!** ✅ Your API now sends real-time updates!

---

## 🔥 Real-World Examples

### **Example 1: Create New Product**

```typescript
public static createProduct = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    // Your existing code
    const newProduct = await ProductModel.create(productData);
    await redis.del("cache-key");
    
    // ✅ Add this line
    emitNewProductAdded({
      _id: newProduct._id,
      itemName: newProduct.itemName,
      itemFinalPrice: newProduct.itemFinalPrice,
      itemDiscount: newProduct.itemDiscount,
      itemCategory: newProduct.itemCategory,
      image: newProduct.images?.[0] || null
    });
    
    return handleResponse(req, res, 201, "Product created", newProduct);
  }
);
```

### **Example 2: Update Product**

```typescript
public static updateProduct = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const updatedProduct = await ProductModel.findByIdAndUpdate(
      productId,
      updateData,
      { new: true }
    );
    
    // ✅ Add this line
    emitProductUpdated({
      _id: updatedProduct._id,
      itemName: updatedProduct.itemName,
      itemFinalPrice: updatedProduct.itemFinalPrice,
      itemDiscount: updatedProduct.itemDiscount,
      itemCategory: updatedProduct.itemCategory,
      image: updatedProduct.images?.[0] || null
    });
    
    return handleResponse(req, res, 200, "Product updated", updatedProduct);
  }
);
```

### **Example 3: Delete Product**

```typescript
public static deleteProduct = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const { productId } = req.params;
    const product = await ProductModel.findById(productId);
    
    await ProductModel.findByIdAndDelete(productId);
    
    // ✅ Add this line
    emitProductDeleted(productId, product?.itemCategory);
    
    return handleResponse(req, res, 200, "Product deleted", { productId });
  }
);
```

### **Example 4: Add to Wishlist**

```typescript
public static addToWishlist = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const { itemId } = req.params;
    
    await userModel.findByIdAndUpdate(userId, {
      $addToSet: { wishlist: itemId }
    });
    
    const item = await ItemModel.findById(itemId)
      .select('_id itemName itemFinalPrice itemDiscount itemImages');
    
    // ✅ Add this line
    emitWishlistUpdate(userId.toString(), 'added', {
      _id: item._id,
      itemName: item.itemName,
      itemFinalPrice: item.itemFinalPrice,
      itemDiscount: item.itemDiscount,
      image: item.itemImages?.[0] || null
    });
    
    return handleResponse(req, res, 200, "Added to wishlist", item);
  }
);
```

### **Example 5: Update Order Status**

```typescript
public static updateOrderStatus = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const { orderId } = req.params;
    const { status } = req.body;
    
    const order = await OrderModel.findByIdAndUpdate(
      orderId,
      { status },
      { new: true }
    );
    
    // ✅ Add this line
    emitOrderStatusUpdate(order.userId.toString(), {
      orderId: order._id,
      status: order.status,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount
    });
    
    return handleResponse(req, res, 200, "Order status updated", order);
  }
);
```

### **Example 6: Send Notification**

```typescript
public static sendNotification = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const { title, message, type } = req.body;
    
    const notification = await NotificationModel.create({
      userId,
      title,
      message,
      type
    });
    
    // ✅ Add this line
    emitNotification(userId.toString(), {
      title,
      message,
      type: type || 'info'
    });
    
    return handleResponse(req, res, 201, "Notification sent", notification);
  }
);
```

### **Example 7: Recently Viewed (User-specific)**

```typescript
public static addToRecentlyViewed = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?._id;
    const { itemId } = req.params;
    
    await userModel.findByIdAndUpdate(userId, {
      $push: { viewedItems: { $each: [itemId], $slice: -15 } }
    });
    
    const item = await ItemModel.findById(itemId)
      .select('_id itemName itemFinalPrice itemDiscount itemImages');
    
    // ✅ Add this line
    emitRecentlyViewedUpdate(userId.toString(), {
      _id: item._id,
      itemName: item.itemName,
      itemFinalPrice: item.itemFinalPrice,
      itemDiscount: item.itemDiscount,
      image: item.itemImages?.[0] || null
    });
    
    return handleResponse(req, res, 200, "Added to recently viewed", item);
  }
);
```

### **Example 8: Custom Event**

```typescript
public static customAction = catchAsyncErrors(
  async (req: Request, res: Response, next: NextFunction) => {
    // Your logic here
    const data = await SomeModel.create(someData);
    
    // ✅ Custom event
    emitCustomEvent('custom:event:name', {
      customField1: data.field1,
      customField2: data.field2
    }, `user:${userId}`); // Optional: send to specific room
    
    return handleResponse(req, res, 200, "Action completed", data);
  }
);
```

---

## 📚 Available Emitter Functions

| Function | Purpose | Sends To |
|----------|---------|----------|
| `emitNewProductAdded(product)` | New product created | All users |
| `emitProductUpdated(product)` | Product updated | All users |
| `emitProductDeleted(productId, categoryId?)` | Product deleted | All users |
| `emitRecentlyViewedUpdate(userId, item)` | Item viewed | Specific user |
| `emitWishlistUpdate(userId, action, item)` | Wishlist changed | Specific user |
| `emitCartUpdate(userId, action, item)` | Cart changed | Specific user |
| `emitOrderStatusUpdate(userId, order)` | Order status changed | Specific user |
| `emitNotification(userId, notification)` | New notification | Specific user |
| `emitTrendingProductsUpdate(products)` | Trending updated | All users |
| `emitCategoryViewUpdate(userId, categoryId)` | Category viewed | Specific user |
| `emitCustomEvent(event, data, room?)` | Custom event | All or specific room |

---

## 🎨 Event Naming Convention

When creating custom events, follow this pattern:

```
[entity]:[action]
```

Examples:
- `product:new`
- `order:status`
- `cart:update`
- `notification:new`
- `category:product:new`

---

## ⚡ Performance Tips

### **1. Send Only Necessary Data**

❌ **Bad:**
```typescript
emitNewProductAdded(newProduct); // Sends everything (huge payload)
```

✅ **Good:**
```typescript
emitNewProductAdded({
  _id: newProduct._id,
  itemName: newProduct.itemName,
  itemFinalPrice: newProduct.itemFinalPrice,
  itemDiscount: newProduct.itemDiscount,
  image: newProduct.itemImages?.[0] || null
}); // Only essential data
```

### **2. Emit After Database Success**

❌ **Bad:**
```typescript
emitNewProductAdded(data);
const newProduct = await ProductModel.create(data); // Might fail
```

✅ **Good:**
```typescript
const newProduct = await ProductModel.create(data);
emitNewProductAdded(newProduct); // Emit only after success
```

### **3. Use User-Specific Events When Possible**

❌ **Bad:**
```typescript
emitCustomEvent('wishlist:update', data); // Broadcasts to all users
```

✅ **Good:**
```typescript
emitWishlistUpdate(userId, 'added', data); // Only to specific user
```

---

## 🐛 Debugging

### **Check if Event is Being Emitted**

The emitter automatically logs errors. Check your server console for:
```
WebSocket emit error (eventName): [error details]
```

### **Test with HTML Client**

Use the provided test client:
```
Open: websocket-test-client.html
Connect to your server
Watch the event log
```

### **Browser Console Test**

```javascript
const socket = io('http://localhost:5001');
socket.on('product:new', (data) => console.log('Received:', data));
```

---

## 🔒 Security Considerations

### **1. User-Specific Events**

Always verify the user has permission:

```typescript
// ✅ Good
if (req.user?._id) {
  emitNotification(req.user._id.toString(), notification);
}
```

### **2. Sensitive Data**

Don't send sensitive information:

```typescript
// ❌ Bad
emitOrderStatusUpdate(userId, {
  ...order,
  paymentDetails: order.paymentDetails, // Sensitive!
  userAddress: order.userAddress         // Sensitive!
});

// ✅ Good
emitOrderStatusUpdate(userId, {
  orderId: order._id,
  status: order.status,
  orderNumber: order.orderNumber
});
```

---

## 📋 Checklist for New API

When creating a new API that needs real-time updates:

- [ ] Import appropriate emitter from `Utils/socketEmitters`
- [ ] Call emitter after successful database operation
- [ ] Send only necessary data (no sensitive info)
- [ ] Use user-specific emitter if update is user-specific
- [ ] Test with websocket-test-client.html
- [ ] Verify event received in frontend
- [ ] Check server logs for emit errors

---

## 🎯 Quick Reference

### **Broadcast to All Users:**
```typescript
emitNewProductAdded(product);
emitProductUpdated(product);
emitProductDeleted(productId);
emitTrendingProductsUpdate(products);
```

### **Send to Specific User:**
```typescript
emitRecentlyViewedUpdate(userId, item);
emitWishlistUpdate(userId, 'added', item);
emitCartUpdate(userId, 'added', item);
emitOrderStatusUpdate(userId, order);
emitNotification(userId, notification);
emitCategoryViewUpdate(userId, categoryId);
```

### **Custom Events:**
```typescript
// To all users
emitCustomEvent('my:event', data);

// To specific user
emitCustomEvent('my:event', data, `user:${userId}`);

// To category room
emitCustomEvent('my:event', data, `category:${categoryId}`);
```

---

## 🚀 Example: Complete CRUD with WebSocket

```typescript
export default class ProductService {
  
  // CREATE
  public static create = catchAsyncErrors(async (req, res, next) => {
    const product = await ProductModel.create(req.body);
    emitNewProductAdded(product); // ✅ Add this
    return handleResponse(req, res, 201, "Created", product);
  });
  
  // READ (no WebSocket needed)
  public static getAll = catchAsyncErrors(async (req, res, next) => {
    const products = await ProductModel.find();
    return handleResponse(req, res, 200, "Success", products);
  });
  
  // UPDATE
  public static update = catchAsyncErrors(async (req, res, next) => {
    const product = await ProductModel.findByIdAndUpdate(
      req.params.id, 
      req.body, 
      { new: true }
    );
    emitProductUpdated(product); // ✅ Add this
    return handleResponse(req, res, 200, "Updated", product);
  });
  
  // DELETE
  public static delete = catchAsyncErrors(async (req, res, next) => {
    const product = await ProductModel.findById(req.params.id);
    await ProductModel.findByIdAndDelete(req.params.id);
    emitProductDeleted(req.params.id, product?.categoryId); // ✅ Add this
    return handleResponse(req, res, 200, "Deleted", { id: req.params.id });
  });
}
```

---

## 📞 Need Help?

If the emitter functions don't meet your needs:

1. Use `emitCustomEvent()` for custom scenarios
2. Check `Utils/socketEmitters.ts` for implementation
3. Add new emitter function if needed (follow same pattern)

---

**Remember: WebSocket is already set up globally. Just import and call the emitter! 🚀**
