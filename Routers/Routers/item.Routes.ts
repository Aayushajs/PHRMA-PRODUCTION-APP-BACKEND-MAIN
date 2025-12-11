import express from "express";
import ItemServices from "../../Services/item.Service";
import {uploadImage} from "../../config/multer";
/*
┌───────────────────────────────────────────────────────────────────────┐
│  Item Routes - API endpoints for Item/Product management.             │
│  Routes for managing items, deals, and searching by category.         │
└───────────────────────────────────────────────────────────────────────┘
*/



const itemsRouter = express.Router();

itemsRouter.post("/add", uploadImage.array("itemImages"), ItemServices.createItem);

itemsRouter.put("/update/:itemId", uploadImage.array("itemImages"), ItemServices.updateItem);
itemsRouter.post("/addPremiumItem", uploadImage.array("itemImages"), ItemServices.createPremiumItem);  // allow all 50% incres rate , create in itme 

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