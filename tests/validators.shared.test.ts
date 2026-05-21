/**
 * validators.shared.test.ts
 * Comprehensive tests for Validators/_shared.ts, category.Validator.ts,
 * notificationLog.Validator.ts and the paginationQueryFields / logListQueryFields
 * shared fragments added in the refactoring.
 *
 * Tests are written against ACTUAL schema behaviour.
 */

import { describe, it } from "bun:test";
import assert from "node:assert/strict";

// ─── imports ──────────────────────────────────────────────────────────────────
import {
  paginationQueryFields,
  logListQueryFields,
  zodObjectId,
  safeString,
  positiveIntString,
  noOperatorKeys,
  passthroughObjectNoOperators,
  z,
} from "../Utils/lib/validators/_shared";

import {
  createCategorySchema,
  updateCategoryBodySchema,
  getCategoryByIdParamsSchema,
  listCategoriesQuerySchema,
  categoryLogsQuerySchema,
} from "../Utils/lib/validators/category.Validator";

import { logListQuerySchema } from "../Utils/lib/validators/notificationLog.Validator";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ok  = (schema: any, data: any) =>
  assert.ok(schema.safeParse(data).success, `Should parse: ${JSON.stringify(data)}`);
const bad = (schema: any, data: any) =>
  assert.ok(!schema.safeParse(data).success, `Should reject: ${JSON.stringify(data)}`);

const VALID_OID = "507f1f77bcf86cd799439011";

// ─── zodObjectId (factory function — call it to get a schema) ─────────────────

describe("_shared validators", () => {

  describe("zodObjectId (factory fn)", () => {
    const schema = zodObjectId("TestID");

    it("accepts a valid 24-hex ObjectId", () => ok(schema, VALID_OID));
    it("rejects 23-char string (too short)", () => bad(schema, "507f1f77bcf86cd79943901"));
    it("rejects 25-char string (too long)",  () => bad(schema, "507f1f77bcf86cd7994390111"));
    it("rejects non-hex characters",          () => bad(schema, "507f1f77bcf86cd79943901z"));
    it("rejects empty string",                () => bad(schema, ""));
    it("rejects object (NoSQL injection)",    () => bad(schema, { $gt: "" }));
    it("rejects null",                        () => bad(schema, null));
    it("rejects number",                      () => bad(schema, 123456789012));
    it("rejects array",                       () => bad(schema, [VALID_OID]));
    it("label defaults to 'ID' when omitted", () => {
      const defaultSchema = zodObjectId();
      ok(defaultSchema, VALID_OID);
    });
  });

  // ─── safeString ─────────────────────────────────────────────────────────────
  // safeString() rejects non-strings. It does NOT reject $-prefixed strings
  // (that is the job of passthroughObjectNoOperators for object-level checks).

  describe("safeString", () => {
    const schema = safeString("field");

    it("accepts normal strings", ()       => ok(schema, "hello world"));
    it("accepts empty string", ()         => ok(schema, ""));
    it("accepts string with unicode", ()  => ok(schema, "नमस्ते"));
    it("accepts $-prefixed string (safeString only rejects non-string types)", () =>
      ok(schema, "$gt"));  // value-level check is NOT safeString's job
    it("rejects number",      () => bad(schema, 42));
    it("rejects plain object",() => bad(schema, { value: "x" }));
    it("rejects array",       () => bad(schema, ["x"]));
    it("rejects null",        () => bad(schema, null));
    it("rejects boolean",     () => bad(schema, true));
  });

  // ─── noOperatorKeys (guard function, not a schema) ────────────────────────

  describe("noOperatorKeys (guard function)", () => {
    it("returns true for plain object",          () => assert.ok(noOperatorKeys({ name: "test" })));
    it("returns false for $-key object",         () => assert.ok(!noOperatorKeys({ $gt: 1 })));
    it("returns true for null",                  () => assert.ok(noOperatorKeys(null)));
    it("returns true for arrays",                () => assert.ok(noOperatorKeys(["a"])));
    it("returns true for primitives",            () => assert.ok(noOperatorKeys("string")));
    it("returns false for mixed (has $-key)",    () => assert.ok(!noOperatorKeys({ a: 1, $where: "x" })));
    it("returns true for nested non-$ object",  () => assert.ok(noOperatorKeys({ a: { b: 1 } })));
  });

  // ─── positiveIntString ────────────────────────────────────────────────────
  // positiveIntString is OPTIONAL — it accepts undefined and valid positive ints

  describe("positiveIntString", () => {
    it("accepts '1'",        () => ok(positiveIntString, "1"));
    it("accepts '999'",      () => ok(positiveIntString, "999"));
    it("accepts integer 1",  () => ok(positiveIntString, 1));
    it("accepts '0' as a non-negative integer string", () => ok(positiveIntString, "0"));
    it("accepts 0 as nonnegative number", () => ok(positiveIntString, 0));
    it("accepts undefined (optional)", () => ok(positiveIntString, undefined));
    it("rejects negative integer",   () => bad(positiveIntString, -1));
    it("rejects decimal string",     () => bad(positiveIntString, "1.5"));
    it("rejects non-numeric string", () => bad(positiveIntString, "abc"));
    it("rejects plain object",       () => bad(positiveIntString, { $gt: 0 }));
  });

  // ─── passthroughObjectNoOperators ────────────────────────────────────────

  describe("passthroughObjectNoOperators", () => {
    it("accepts a plain object with no $-keys",     () =>
      ok(passthroughObjectNoOperators, { name: "test", value: 1 }));
    it("rejects object with $-prefixed top-level key", () =>
      bad(passthroughObjectNoOperators, { $where: "1==1" }));
    it("rejects object with $ne at top level",      () =>
      bad(passthroughObjectNoOperators, { $ne: "x" }));
    it("accepts nested plain objects",              () =>
      ok(passthroughObjectNoOperators, { user: { name: "Alice" } }));
    it("accepts empty object",                      () =>
      ok(passthroughObjectNoOperators, {}));
    it("accepts arbitrary non-operator fields",     () =>
      ok(passthroughObjectNoOperators, { color: "red", count: 5, tags: ["a"] }));
  });

  // ─── paginationQueryFields (shared fragment) ─────────────────────────────

  describe("paginationQueryFields (shared fragment)", () => {
    const schema = z.object(paginationQueryFields);

    it("accepts empty object (all fields optional)", () => ok(schema, {}));
    it("accepts page as string '1'",                 () => ok(schema, { page: "1" }));
    it("accepts page as number 1",                   () => ok(schema, { page: 1 }));
    it("accepts limit as string '10'",               () => ok(schema, { limit: "10" }));
    it("accepts sortBy as string",                   () => ok(schema, { sortBy: "name" }));
    it("accepts order as string",                    () => ok(schema, { order: "asc" }));
    it("accepts all fields together", () =>
      ok(schema, { page: "1", limit: "20", sortBy: "name", order: "desc" }));
    it("rejects non-string non-number page",  () => bad(schema, { page: { $gt: 0 } }));
    it("rejects non-string sortBy (object)", () => bad(schema, { sortBy: { $natural: 1 } }));
    it("rejects non-string order (array)",   () => bad(schema, { order: ["asc"] }));
  });

  // ─── logListQueryFields (shared fragment) ─────────────────────────────────

  describe("logListQueryFields (shared fragment)", () => {
    const schema = z.object(logListQueryFields);

    it("accepts empty object", () => ok(schema, {}));
    it("accepts all fields", () => ok(schema, {
      page: "1", limit: "20", sortBy: "date", order: "asc",
      startDate: "2024-01-01", endDate: "2024-12-31",
      userId: VALID_OID, period: "week",
    }));
    it("rejects non-string userId (object)", () => bad(schema, { userId: { $ne: null } }));
    it("accepts partial log fields",         () => ok(schema, { startDate: "2024-01-01" }));
    it("rejects non-string startDate",       () => bad(schema, { startDate: ["2024-01-01"] }));
  });
});

// ─── category.Validator.ts ────────────────────────────────────────────────────

describe("Category Validator", () => {

  describe("createCategorySchema", () => {
    const base = { title: "Vitamins", name: "vitamins", offerText: "10% off" };

    it("accepts minimal valid body",                   () => ok(createCategorySchema, base));
    it("accepts full body with optional fields", () => ok(createCategorySchema, {
      ...base, isActive: "true", isFeatured: "false", displayOrder: "5",
    }));
    it("rejects missing title",    () => bad(createCategorySchema, { name: "x", offerText: "y" }));
    it("rejects missing name",     () => bad(createCategorySchema, { title: "x", offerText: "y" }));
    it("rejects missing offerText",() => bad(createCategorySchema, { title: "x", name: "y" }));
    it("rejects object title (injection vector)",  () =>
      bad(createCategorySchema, { ...base, title: { $set: "x" } }));
    it("rejects object name (injection vector)",   () =>
      bad(createCategorySchema, { ...base, name: { $unset: "y" } }));
    it("rejects empty string title",               () =>
      bad(createCategorySchema, { ...base, title: "" }));
    it("rejects empty string name",                () =>
      bad(createCategorySchema, { ...base, name: "" }));
    it("passes through unknown fields (multipart)", () =>
      ok(createCategorySchema, { ...base, unknownField: "x" }));
  });

  describe("updateCategoryBodySchema (permissive passthrough, rejects $-keys)", () => {
    it("accepts partial update (only title)",  () => ok(updateCategoryBodySchema, { title: "New Title" }));
    it("accepts empty object (all optional)", () => ok(updateCategoryBodySchema, {}));
    it("rejects top-level $-prefixed key",    () => bad(updateCategoryBodySchema, { $set: { name: "x" } }));
    it("rejects $where key",                  () => bad(updateCategoryBodySchema, { $where: "1==1" }));
    it("accepts any non-operator fields",     () => ok(updateCategoryBodySchema, { color: "red", priority: 5 }));
    it("accepts name and title changes",      () => ok(updateCategoryBodySchema, { name: "new", title: "New" }));
  });

  describe("getCategoryByIdParamsSchema", () => {
    it("accepts valid ObjectId in params",     () => ok(getCategoryByIdParamsSchema, { id: VALID_OID }));
    it("rejects non-ObjectId param",          () => bad(getCategoryByIdParamsSchema, { id: "not-an-id" }));
    it("rejects numeric id",                  () => bad(getCategoryByIdParamsSchema, { id: 12345 }));
    it("rejects object id (injection)",       () => bad(getCategoryByIdParamsSchema, { id: { $gt: "" } }));
    it("rejects array id",                    () => bad(getCategoryByIdParamsSchema, { id: [VALID_OID] }));
    it("rejects missing id field",            () => bad(getCategoryByIdParamsSchema, {}));
  });

  describe("listCategoriesQuerySchema", () => {
    it("accepts empty query",          () => ok(listCategoriesQuerySchema, {}));
    it("accepts all valid query params", () => ok(listCategoriesQuerySchema, {
      page: "1", limit: "20", sortBy: "name", order: "asc",
      isActive: "true", isFeatured: "false", search: "vit",
    }));
    it("accepts pagination from shared fragment",    () => ok(listCategoriesQuerySchema, { page: 2, limit: 50 }));
    it("rejects non-string search (object injection)", () =>
      bad(listCategoriesQuerySchema, { search: { $regex: "x" } }));
    it("rejects non-string sortBy (object injection)", () =>
      bad(listCategoriesQuerySchema, { sortBy: { $natural: 1 } }));
    it("passes through unknown fields (passthrough mode)", () => {
      const result = listCategoriesQuerySchema.safeParse({ page: "1", unknownField: "x" });
      assert.ok(result.success);
    });
  });

  describe("categoryLogsQuerySchema", () => {
    it("accepts empty query", () => ok(categoryLogsQuerySchema, {}));
    it("accepts all shared log query fields", () => ok(categoryLogsQuerySchema, {
      page: "1", limit: "50", sortBy: "createdAt", order: "desc",
      startDate: "2024-01-01", endDate: "2024-12-31",
      userId: VALID_OID, period: "month",
      search: "vitamins", action: "CREATE", categoryId: VALID_OID,
    }));
    it("rejects object-typed action (injection)", () =>
      bad(categoryLogsQuerySchema, { action: { $where: "1==1" } }));
    it("rejects object-typed categoryId (injection)", () =>
      bad(categoryLogsQuerySchema, { categoryId: { $gt: "" } }));
    it("cross-validates: same pagination fields as listCategoriesQuerySchema", () => {
      ok(listCategoriesQuerySchema,  { page: "1", limit: "20" });
      ok(categoryLogsQuerySchema,    { page: "1", limit: "20" });
    });
  });
});

// ─── notificationLog.Validator.ts ─────────────────────────────────────────────

describe("NotificationLog Validator", () => {

  describe("logListQuerySchema", () => {
    it("accepts empty query", () => ok(logListQuerySchema, {}));
    it("accepts all shared log fields", () => ok(logListQuerySchema, {
      page: "1", limit: "50", sortBy: "createdAt", order: "asc",
      startDate: "2024-01-01", endDate: "2024-12-31",
      userId: VALID_OID, period: "week",
    }));
    it("accepts type field",  () => ok(logListQuerySchema, { type: "PUSH" }));
    it("accepts isRead field",() => ok(logListQuerySchema, { isRead: "true" }));
    it("rejects object type (injection vector)", () =>
      bad(logListQuerySchema, { type: { $ne: null } }));
    it("rejects object isRead (injection vector)", () =>
      bad(logListQuerySchema, { isRead: { $exists: true } }));
    it("rejects object userId (injection vector)", () =>
      bad(logListQuerySchema, { userId: { $or: [] } }));
    it("cross-validates: same pagination fields as categoryLogsQuerySchema", () => {
      const q = { page: "2", limit: "10", sortBy: "updatedAt", order: "desc" };
      ok(logListQuerySchema,      q);
      ok(categoryLogsQuerySchema, q);
    });
    it("cross-validates: same log fields as categoryLogsQuerySchema", () => {
      const q = { startDate: "2024-01-01", endDate: "2024-06-30", userId: VALID_OID };
      ok(logListQuerySchema,      q);
      ok(categoryLogsQuerySchema, q);
    });
  });
});
