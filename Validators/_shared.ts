/*
┌───────────────────────────────────────────────────────────────────────┐
│  Shared Zod helpers used across validator modules.                    │
│  - zodObjectId: validates that a string is a Mongo ObjectId.          │
│  - noOperatorObject: rejects {$ne: ...} style NoSQL operator payloads │
│  - safeString: a string that cannot be an operator object.            │
└───────────────────────────────────────────────────────────────────────┘
*/

import { z } from "zod";
import mongoose from "mongoose";

/**
 * Validates a MongoDB ObjectId in a path/query/body string slot.
 * Accepts 24-char hex strings (and other forms `mongoose.isValidObjectId`
 * recognizes). Rejects objects (NoSQL injection vectors) and empty strings.
 */
export const zodObjectId = (label = "ID") =>
    z
        .string({ message: `${label} must be a string` })
        .refine((v) => typeof v === "string" && v.length > 0, {
            message: `${label} is required`,
        })
        .refine((v) => mongoose.isValidObjectId(v), {
            message: `Invalid ${label}`,
        });

/**
 * Reject objects whose top-level keys start with "$" (Mongo operators).
 * Use as a `.refine()` on permissive object schemas.
 */
export const noOperatorKeys = (val: unknown): boolean => {
    if (val === null || typeof val !== "object") return true;
    if (Array.isArray(val)) return true;
    for (const k of Object.keys(val as Record<string, unknown>)) {
        if (k.startsWith("$")) return false;
    }
    return true;
};

/**
 * A string field that cannot accept a NoSQL operator object.
 * z.string() already rejects objects, but we provide an explicit refine for
 * readability + defense-in-depth.
 */
export const safeString = (label = "value") =>
    z
        .string({ message: `${label} must be a string` })
        .refine((v) => typeof v === "string", { message: `${label} must be a string` });

/**
 * Coerce a string flag like "true"/"false" into a boolean while preserving
 * legitimate booleans. Many existing GET handlers compare via String(x) === "true".
 */
export const stringBool = z
    .union([z.boolean(), z.literal("true"), z.literal("false")])
    .optional();

/**
 * A pagination-friendly positive integer accepted as either string or number.
 * Mirrors the project's `parseInt(page as string) || N` convention by keeping
 * the original shape — we only validate, not coerce.
 */
export const positiveIntString = z
    .union([
        z.string().regex(/^\d+$/, "must be a non-negative integer string"),
        z.number().int().nonnegative(),
    ])
    .optional();

/**
 * A passthrough object schema that nonetheless forbids `$`-prefixed keys.
 * Use for routes that legitimately accept arbitrary fields (e.g. admin
 * partial updates that spread into Mongoose), to close NoSQL operator
 * injection while preserving the loose request shape.
 */
export const passthroughObjectNoOperators = z
    .object({})
    .passthrough()
    .refine(noOperatorKeys, {
        message: "Request contains forbidden operator keys",
    });

export { z };
