/*
┌───────────────────────────────────────────────────────────────────────┐
│  featured.Validator - Zod schemas for featured.Routes endpoints.      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { z, zodObjectId, safeString, passthroughObjectNoOperators } from "./_shared";

// POST /featured/create — title/category/stock required; service validates
// category is ObjectId, others optional with defaults.
export const createFeaturedSchema = z
    .object({
        title: safeString("title").min(1, "Missing or invalid required fields"),
        category: zodObjectId("category ID"),
        stock: z.union([z.number(), z.string()]),
        description: safeString("description").optional(),
        remarks: safeString("remarks").optional(),
        discount: z.union([z.number(), z.string()]).optional(),
        featured: z.union([z.boolean(), z.string()]).optional(),
        ratings: z.union([z.number(), z.string()]).optional(),
        imageUrl: safeString("imageUrl").optional(),
        createdBy: safeString("createdBy").optional(),
        userId: safeString("userId").optional(),
    })
    .passthrough();

// PUT /featured/:id — service explicitly filters to an allow-list of fields,
// so we use a permissive (no-operator) body schema and a strict params one.
export const updateFeaturedBodySchema = passthroughObjectNoOperators;

export const featuredIdParamsSchema = z.object({
    id: zodObjectId("medicine ID"),
});

// Listing + logs query
export const featuredListQuerySchema = z
    .object({
        page: z.union([z.string(), z.number()]).optional(),
        limit: z.union([z.string(), z.number()]).optional(),
        search: safeString("search").optional(),
        action: safeString("action").optional(),
        userId: safeString("userId").optional(),
        medicineId: safeString("medicineId").optional(),
        startDate: safeString("startDate").optional(),
        endDate: safeString("endDate").optional(),
        sortBy: safeString("sortBy").optional(),
        order: safeString("order").optional(),
        period: safeString("period").optional(),
    })
    .passthrough();

export const featuredLogIdParamsSchema = z.object({
    id: zodObjectId("log ID"),
});
