
/*
┌───────────────────────────────────────────────────────────────────────┐
│  Item Routes - API endpoints for Item/Product management.             │
│  Routes for managing items, deals, and searching by category.         │
└───────────────────────────────────────────────────────────────────────┘
*/

import express from "express";
import ItemServices from "../../Services/item.Service";
import { authenticatedUserMiddleware } from "../../Middlewares/CheckLoginMiddleware";
import { validateRequest } from "../../Middlewares/validateRequest";
import {
    listItemsQuerySchema,
    itemsByCategoryParamsSchema,
    itemDetailsParamsSchema,
    similarItemsParamsSchema,
    addToRecentlyViewedSchema,
    wishlistItemParamsSchema,
    wishlistListQuerySchema,
    searchSuggestionsQuerySchema,
    saveRecentSearchSchema,
    recentSearchesQuerySchema,
    deleteRecentSearchParamsSchema,
} from "../../Utils/lib/validators/item.Validator";



import { apiLimiter } from "../../Middlewares/rateLimiter";

const itemsRouter = express.Router();
itemsRouter.get("/", validateRequest({ query: listItemsQuerySchema }), ItemServices.getAllItems);

itemsRouter.get("/category/:categoryId", validateRequest({ params: itemsByCategoryParamsSchema, query: listItemsQuerySchema }), ItemServices.getItemsByCategory);


itemsRouter.get("/search/suggestions", validateRequest({ query: searchSuggestionsQuerySchema }), ItemServices.getSearchSuggestions);
itemsRouter.get("/search/popular-terms", ItemServices.getPopularSearchTerms);
itemsRouter.post("/search/recent", authenticatedUserMiddleware, validateRequest({ body: saveRecentSearchSchema }), ItemServices.saveRecentSearch);
itemsRouter.get("/search/get-recent", authenticatedUserMiddleware, validateRequest({ query: recentSearchesQuerySchema }), ItemServices.getRecentSearches);
itemsRouter.delete("/search/recent/clear", authenticatedUserMiddleware, ItemServices.clearRecentSearches);
itemsRouter.delete("/search/recent/:query", authenticatedUserMiddleware, validateRequest({ params: deleteRecentSearchParamsSchema }), ItemServices.deleteRecentSearch);

itemsRouter.get('/deals-of-the-day', ItemServices.getDealsOfTheDay);

itemsRouter.get("/details/:itemId", validateRequest({ params: itemDetailsParamsSchema }), ItemServices.getItemDetails);
itemsRouter.get("/trending/AiPersonalized", apiLimiter, ItemServices.getAITrendingProducts);
itemsRouter.get("/GetItemFeed", authenticatedUserMiddleware, apiLimiter, ItemServices.getDynamicFeed);

// Similar Products API - O(n) complexity with smart scoring
itemsRouter.get("/similar/:itemId", apiLimiter, validateRequest({ params: similarItemsParamsSchema }), ItemServices.getSimilarProducts);

itemsRouter.get("/GetRecentlyViewedItems", authenticatedUserMiddleware, ItemServices.getRecentlyViewedItems);

itemsRouter.post("/AddToRecentlyViewedItems", authenticatedUserMiddleware, validateRequest({ body: addToRecentlyViewedSchema }), ItemServices.addToRecentlyViewedItems);

itemsRouter.delete("/wishlist/remove/:itemId", authenticatedUserMiddleware, validateRequest({ params: wishlistItemParamsSchema }), ItemServices.removeFromWishlist);

//only testing perpose
itemsRouter.get("/wishlist", authenticatedUserMiddleware, validateRequest({ query: wishlistListQuerySchema }), ItemServices.getWishlist);
itemsRouter.get("/wishlist/check/:itemId", authenticatedUserMiddleware, validateRequest({ params: wishlistItemParamsSchema }), ItemServices.checkWishlistStatus);
itemsRouter.delete("/wishlist/clear", authenticatedUserMiddleware, ItemServices.clearWishlist);

export default itemsRouter;
