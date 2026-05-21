/*
┌───────────────────────────────────────────────────────────────────────┐
│  prescription.Validator - Zod schemas for prescription.Routes.        │
│  Upload routes have multipart bodies; file is validated by multer.    │
│  We only enforce $-operator-free body and a passthrough on extras.    │
└───────────────────────────────────────────────────────────────────────┘
*/

import { passthroughObjectNoOperators } from "./_shared";

// POST /prescription/upload  and  /upload-stream
// Multipart form; "prescription" file is handled by multer. Any extra
// text fields are allowed but $-operator keys are rejected.
export const uploadPrescriptionBodySchema = passthroughObjectNoOperators;
