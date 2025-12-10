/*
┌───────────────────────────────────────────────────────────────────────┐
│  Item Routes - API endpoints for Item/Product management.             │
│  Routes for managing items, deals, and searching by category.         │
└───────────────────────────────────────────────────────────────────────┘
*/

import express from "express";
import ItemServices from "../../Services/item.Service";
import upload from "../../config/multer";


const itemsRouter = express.Router();

itemsRouter.post("/addPremiumItem", upload.array("itemImages"), ItemServices.createPremiumItem);  // allow all 50% incres rate , create in itme 
itemsRouter.post("/add", upload.array("itemImages"), ItemServices.createItem);

itemsRouter.put("/update/:itemId", upload.array("itemImages"), ItemServices.updateItem);

itemsRouter.delete("/delete/:itemId", ItemServices.deleteItem);

itemsRouter.get("/", ItemServices.getAllItems);

itemsRouter.get("/category/:categoryId", ItemServices.getItemsByCategory);

itemsRouter.get('/deals-of-the-day', ItemServices.getDealsOfTheDay);

itemsRouter.get("/details/:itemId", ItemServices.getItemDetails);
itemsRouter.get("/trending/AiPersonalized", ItemServices.getAITrendingProducts);
itemsRouter.get("/GetItemFeed", ItemServices.getDynamicFeed);
itemsRouter.get("/GetRecentlyViewedItems", ItemServices.getRecentlyViewedItems);
itemsRouter.post("/AddToRecentlyViewedItems/:itemId", ItemServices.addToRecentlyViewedItems);

export default itemsRouter;