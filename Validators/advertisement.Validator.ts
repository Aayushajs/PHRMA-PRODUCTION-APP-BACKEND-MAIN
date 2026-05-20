/*
┌───────────────────────────────────────────────────────────────────────┐
│  advertisement.Validator - Zod schemas for advertisement.Routes.      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { z, zodObjectId, safeString, passthroughObjectNoOperators } from "./_shared";

const AD_TYPES = ["Product", "Brand", "Offer", "Event"] as const;

// POST /advertisement/create
export const createAdSchema = z
    .object({
        title: safeString("title")
            .min(3, "Title must be between 3 and 100 characters")
            .max(100, "Title must be between 3 and 100 characters"),
        description: safeString("description")
            .min(2, "Description must be between 2 and 100 characters")
            .max(100, "Description must be between 2 and 100 characters"),
        type: z.enum(AD_TYPES, { message: "Type must be Product, Brand, Offer, or Event" }),
        brand: safeString("brand").optional(),
        itemId: safeString("itemId").optional(),
        categoryId: safeString("categoryId").optional(),
        offerText: safeString("offerText").optional(),
        startDate: safeString("startDate").min(1, "startDate is required"),
        endDate: safeString("endDate").min(1, "endDate is required"),
        isActive: z.union([z.boolean(), z.string()]).optional(),
    })
    .passthrough();

// PUT /advertisement/update/:adId — all fields optional; permissive but
// rejects $-prefixed operator keys.
export const updateAdBodySchema = passthroughObjectNoOperators;

export const adIdParamsSchema = z.object({
    adId: zodObjectId("advertisement ID"),
});

export const adLogIdParamsSchema = z.object({
    id: zodObjectId("log ID"),
});

export const adLogByAdvertisementParamsSchema = z.object({
    advertisementId: zodObjectId("advertisement ID"),
});

export const adListingQuerySchema = z
    .object({
        page: z.union([z.string(), z.number()]).optional(),
        limit: z.union([z.string(), z.number()]).optional(),
        startDate: safeString("startDate").optional(),
        endDate: safeString("endDate").optional(),
        action: safeString("action").optional(),
        period: safeString("period").optional(),
        sortBy: safeString("sortBy").optional(),
        order: safeString("order").optional(),
    })
    .passthrough();
