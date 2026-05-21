/*
┌───────────────────────────────────────────────────────────────────────┐
│  features.Validator - Zod schema for public features.Routes.          │
└───────────────────────────────────────────────────────────────────────┘
*/

import { z } from "./_shared";

// GET /features — no required input; passthrough query.
export const getUserFeaturesQuerySchema = z.object({}).passthrough();
