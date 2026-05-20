/*
┌───────────────────────────────────────────────────────────────────────┐
│  category.Validator - Zod schemas for category.Routes endpoints.      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { z, zodObjectId, safeString, passthroughObjectNoOperators } from "./_shared";

// Create category: title/name/offerText required (service errors otherwise).
// Numeric/boolean fields accept strings since they come from multipart forms.
export const createCategorySchema = z
    .object({
        name: safeString("name").min(1, "Missing required fields"),
        title: safeString("title").min(1, "Missing required fields"),
        offerText: safeString("offerText").min(1, "Missing required fields"),
        description: safeString("description").optional(),
        code: safeString("code").optional(),
        priority: z.union([z.number(), z.string()]).optional(),
        isFeatured: z.union([z.boolean(), z.string()]).optional(),
        isActive: z.union([z.boolean(), z.string()]).optional(),
    })
    .passthrough();

// Update category: all optional; permissive but rejects $-prefixed keys.
export const updateCategoryBodySchema = passthroughObjectNoOperators;

export const updateCategoryParamsSchema = z.object({
    id: zodObjectId("Category ID"),
});

export const getCategoryByIdParamsSchema = z.object({
    id: zodObjectId("Category ID"),
});

export const deleteCategoryParamsSchema = z.object({
    id: zodObjectId("Category ID"),
});

export const deleteCategoryQuerySchema = z
    .object({
        permanent: z.union([z.literal("true"), z.literal("false"), z.boolean()]).optional(),
    })
    .passthrough();

// Bulk toggle active
export const bulkToggleActiveSchema = z
    .object({
        categoryIds: z.array(zodObjectId("Category ID")).min(1, "categoryIds array is required"),
        isActive: z.boolean({ message: "isActive must be a boolean value" }),
    })
    .passthrough();

export const recentlyViewedParamsSchema = z.object({
    categoryId: zodObjectId("Category ID"),
});

// Listing endpoints — keep loose (existing services parse and default everything)
// but reject $-prefixed keys.
export const listCategoriesQuerySchema = z
    .object({
        page: z.union([z.string(), z.number()]).optional(),
        limit: z.union([z.string(), z.number()]).optional(),
        sortBy: safeString("sortBy").optional(),
        order: safeString("order").optional(),
        isActive: z.union([z.string(), z.boolean()]).optional(),
        isFeatured: z.union([z.string(), z.boolean()]).optional(),
        search: safeString("search").optional(),
    })
    .passthrough();

// Category log endpoints
export const categoryLogIdParamsSchema = z.object({
    id: zodObjectId("log ID"),
});

export const categoryLogsQuerySchema = z
    .object({
        page: z.union([z.string(), z.number()]).optional(),
        limit: z.union([z.string(), z.number()]).optional(),
        search: safeString("search").optional(),
        action: safeString("action").optional(),
        userId: safeString("userId").optional(),
        categoryId: safeString("categoryId").optional(),
        startDate: safeString("startDate").optional(),
        endDate: safeString("endDate").optional(),
        sortBy: safeString("sortBy").optional(),
        order: safeString("order").optional(),
        period: safeString("period").optional(),
    })
    .passthrough();
