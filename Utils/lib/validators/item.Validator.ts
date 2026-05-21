/*
┌───────────────────────────────────────────────────────────────────────┐
│  item.Validator - Zod schemas for item.Routes endpoints.              │
└───────────────────────────────────────────────────────────────────────┘
*/

import { z, zodObjectId, safeString } from "./_shared";

// GET /items — list with many optional filters.
export const listItemsQuerySchema = z
    .object({
        page: z.union([z.string(), z.number()]).optional(),
        limit: z.union([z.string(), z.number()]).optional(),
        category: safeString("category").optional(),
        company: safeString("company").optional(),
        minPrice: z.union([z.string(), z.number()]).optional(),
        maxPrice: z.union([z.string(), z.number()]).optional(),
        priceRange: safeString("priceRange").optional(),
        minDiscount: z.union([z.string(), z.number()]).optional(),
        minRating: z.union([z.string(), z.number()]).optional(),
        formula: safeString("formula").optional(),
        HSNCode: safeString("HSNCode").optional(),
        search: safeString("search").optional(),
        sortBy: safeString("sortBy").optional(),
        order: safeString("order").optional(),
        isTrending: safeString("isTrending").optional(),
        inStock: safeString("inStock").optional(),
    })
    .passthrough();

// GET /items/category/:categoryId
export const itemsByCategoryParamsSchema = z.object({
    categoryId: zodObjectId("category ID"),
});

// GET /items/details/:itemId
export const itemDetailsParamsSchema = z.object({
    itemId: zodObjectId("Item ID"),
});

// GET /items/similar/:itemId
export const similarItemsParamsSchema = z.object({
    itemId: zodObjectId("Item ID"),
});

// POST /items/AddToRecentlyViewedItems
// itemId is intentionally NOT a strict ObjectId because the service supports
// the special "wishlistitem<oid>" prefix and validates internally.
export const addToRecentlyViewedSchema = z
    .object({
        itemId: safeString("itemId").min(1, "Item ID is required in request body"),
    })
    .passthrough();

// DELETE /items/wishlist/remove/:itemId
export const wishlistItemParamsSchema = z.object({
    itemId: zodObjectId("item ID"),
});

// GET /items/wishlist (pagination)
export const wishlistListQuerySchema = z
    .object({
        page: z.union([z.string(), z.number()]).optional(),
        limit: z.union([z.string(), z.number()]).optional(),
    })
    .passthrough();

// Search suggestions
export const searchSuggestionsQuerySchema = z
    .object({
        q: safeString("q").optional(),
        limit: z.union([z.string(), z.number()]).optional(),
    })
    .passthrough();

export const popularSearchQuerySchema = z.object({}).passthrough();

// POST /items/search/recent — save a recent search.
export const saveRecentSearchSchema = z
    .object({
        query: safeString("query").min(2, "Valid search query is required (min 2 characters)"),
        itemId: safeString("itemId").optional(),
        itemName: safeString("itemName").optional(),
        itemImage: safeString("itemImage").optional(),
    })
    .passthrough();

export const recentSearchesQuerySchema = z
    .object({
        limit: z.union([z.string(), z.number()]).optional(),
    })
    .passthrough();

// DELETE /items/search/recent/:query — URL-encoded query string.
export const deleteRecentSearchParamsSchema = z.object({
    query: safeString("query").min(1, "Search query is required"),
});

// Trending / feed / deals — no params.
export const emptyQuerySchema = z.object({}).passthrough();
