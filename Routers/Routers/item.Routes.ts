
/*
┌───────────────────────────────────────────────────────────────────────┐
│  Item Routes - API endpoints for Item/Product management.             │
│  Routes for managing items, deals, and searching by category.         │
└───────────────────────────────────────────────────────────────────────┘
*/

import {uploadImage} from "../../config/multer";
import express from "express";
import ItemServices from "../../Services/item.Service";
import { adminMiddleware, authenticatedUserMiddleware } from "../../Middlewares/CheckLoginMiddleware";



const itemsRouter = express.Router();

itemsRouter.post("/addPremiumItem", uploadImage.array("itemImages"), ItemServices.createPremiumItem);  // allow all 50% incres rate , create in itme 
itemsRouter.post("/add", uploadImage.array("itemImages"), ItemServices.createItem);

itemsRouter.put("/update/:itemId", uploadImage.array("itemImages"), ItemServices.updateItem);

itemsRouter.delete("/delete/:itemId", adminMiddleware, ItemServices.deleteItem);
itemsRouter.delete("/delete-all", ItemServices.deleteAllItems)

itemsRouter.get("/", ItemServices.getAllItems);

itemsRouter.get("/category/:categoryId", ItemServices.getItemsByCategory);


itemsRouter.get("/search/suggestions", ItemServices.getSearchSuggestions);
itemsRouter.get("/search/popular-terms", ItemServices.getPopularSearchTerms);
itemsRouter.post("/search/recent", authenticatedUserMiddleware, ItemServices.saveRecentSearch);
itemsRouter.get("/search/get-recent", authenticatedUserMiddleware, ItemServices.getRecentSearches);
itemsRouter.delete("/search/recent/clear", authenticatedUserMiddleware, ItemServices.clearRecentSearches);
itemsRouter.delete("/search/recent/:query", authenticatedUserMiddleware, ItemServices.deleteRecentSearch);

itemsRouter.get('/deals-of-the-day', ItemServices.getDealsOfTheDay);

itemsRouter.get("/details/:itemId", ItemServices.getItemDetails);
itemsRouter.get("/trending/AiPersonalized", ItemServices.getAITrendingProducts);
itemsRouter.get("/GetItemFeed",authenticatedUserMiddleware, ItemServices.getDynamicFeed);

// Similar Products API - O(n) complexity with smart scoring
itemsRouter.get("/similar/:itemId", ItemServices.getSimilarProducts);

itemsRouter.get("/GetRecentlyViewedItems", authenticatedUserMiddleware, ItemServices.getRecentlyViewedItems);

itemsRouter.post("/AddToRecentlyViewedItems", authenticatedUserMiddleware, ItemServices.addToRecentlyViewedItems);

itemsRouter.delete("/wishlist/remove/:itemId", authenticatedUserMiddleware, ItemServices.removeFromWishlist);

//only testing perpose
itemsRouter.get("/wishlist", authenticatedUserMiddleware, ItemServices.getWishlist);
itemsRouter.get("/wishlist/check/:itemId", authenticatedUserMiddleware, ItemServices.checkWishlistStatus);
itemsRouter.delete("/wishlist/clear", authenticatedUserMiddleware, ItemServices.clearWishlist);
    
export default itemsRouter;