/*
┌───────────────────────────────────────────────────────────────────────┐
│  featureFlag.Validator - Zod schemas for featureFlag.Routes.          │
└───────────────────────────────────────────────────────────────────────┘
*/

import { z, safeString, passthroughObjectNoOperators } from "./_shared";

// POST /feature-flags/create
export const createFeatureFlagSchema = z
    .object({
        key: safeString("key").min(1, "Key and name are required"),
        name: safeString("name").min(1, "Key and name are required"),
        description: safeString("description").optional(),
        enabled: z.boolean().optional(),
        allowedRoles: z.array(safeString("role")).optional(),
        allowedUserIds: z.array(safeString("userId")).optional(),
        rolloutPercentage: z.union([z.number(), z.string()]).optional(),
    })
    .passthrough();

// PUT /feature-flags/:key — fully permissive body, but disallow operators.
export const updateFeatureFlagBodySchema = passthroughObjectNoOperators;

// :key is a string — not an ObjectId — service uppercases it. Disallow non-
// strings and reject empty / control-only values.
export const featureFlagKeyParamsSchema = z.object({
    key: safeString("key")
        .min(1, "Feature key is required")
        .regex(/^[A-Za-z0-9_\-]+$/, "Feature key must be alphanumeric"),
});

// POST /feature-flags/bulk-update
export const bulkUpdateFeatureFlagsSchema = z
    .object({
        updates: z
            .array(
                z
                    .object({
                        key: safeString("key").min(1, "key is required"),
                        enabled: z.boolean().optional(),
                    })
                    .passthrough()
            )
            .min(1, "Updates array is required"),
    })
    .passthrough();
