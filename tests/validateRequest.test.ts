/// <reference types="bun" />
import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { validateRequest } from "../Middlewares/validateRequest";
import { zodObjectId, passthroughObjectNoOperators } from "../Validators/_shared";
import { ApiError } from "../Utils/ApiError";

// Minimal shape compatible with the middleware's expectations.
const mkReq = (overrides: Partial<any> = {}) =>
    ({ body: {}, query: {}, params: {}, ...overrides } as any);

const mkRes = () => {
    const res: any = {};
    res.status = (_c: number) => res;
    res.json = (_d: any) => res;
    return res;
};

describe("validateRequest", () => {
    it("body validation success mutates req.body to parsed value", () => {
        const schema = z.object({ email: z.string().email() }).strict();
        const mw = validateRequest({ body: schema });
        const req = mkReq({ body: { email: "user@example.com" } });
        const res = mkRes();
        const nextArgs: any[] = [];

        mw(req, res, (err?: any) => nextArgs.push(err));

        assert.equal(nextArgs.length, 1);
        assert.equal(nextArgs[0], undefined);
        assert.equal(req.body.email, "user@example.com");
    });

    it("body validation failure forwards ApiError(400) with standard envelope shape", () => {
        const schema = z.object({ email: z.string().email() });
        const mw = validateRequest({ body: schema });
        const req = mkReq({ body: { email: "not-an-email" } });
        const res = mkRes();
        const nextArgs: any[] = [];

        mw(req, res, (err?: any) => nextArgs.push(err));

        assert.equal(nextArgs.length, 1);
        const err = nextArgs[0];
        assert.ok(err instanceof ApiError, "expected ApiError");
        assert.equal(err.statusCode, 400);
        assert.equal(typeof err.message, "string");
        assert.ok(err.message.length > 0);
    });

    it("query validation works and mutates req.query (where writable)", () => {
        const schema = z.object({ page: z.string().optional() }).passthrough();
        const mw = validateRequest({ query: schema });
        const req = mkReq({ query: { page: "2", extra: "x" } });
        const res = mkRes();
        const nextArgs: any[] = [];

        mw(req, res, (err?: any) => nextArgs.push(err));
        assert.equal(nextArgs[0], undefined);
        // Either the mutated query or the validatedQuery snapshot must have the value.
        const q = (req as any).query?.page ?? (req as any).validatedQuery?.page;
        assert.equal(q, "2");
    });

    it("params validation rejects an invalid ObjectId", () => {
        const schema = z.object({ id: zodObjectId("Item ID") });
        const mw = validateRequest({ params: schema });
        const req = mkReq({ params: { id: "not-an-objectid" } });
        const res = mkRes();
        const nextArgs: any[] = [];

        mw(req, res, (err?: any) => nextArgs.push(err));
        assert.ok(nextArgs[0] instanceof ApiError);
        assert.equal(nextArgs[0].statusCode, 400);
    });

    it("params validation accepts a valid ObjectId", () => {
        const schema = z.object({ id: zodObjectId("Item ID") });
        const mw = validateRequest({ params: schema });
        const req = mkReq({ params: { id: "507f1f77bcf86cd799439011" } });
        const res = mkRes();
        const nextArgs: any[] = [];

        mw(req, res, (err?: any) => nextArgs.push(err));
        assert.equal(nextArgs[0], undefined);
    });

    it("zodObjectId rejects object inputs (NoSQL operator injection)", () => {
        const schema = z.object({ id: zodObjectId("Item ID") });
        const mw = validateRequest({ params: schema });
        const req = mkReq({ params: { id: { $ne: "" } as any } });
        const res = mkRes();
        const nextArgs: any[] = [];

        mw(req, res, (err?: any) => nextArgs.push(err));
        assert.ok(nextArgs[0] instanceof ApiError);
        assert.equal(nextArgs[0].statusCode, 400);
    });

    it("NoSQL operator object in a string-typed body field is rejected", () => {
        const schema = z.object({ email: z.string().email() });
        const mw = validateRequest({ body: schema });
        const req = mkReq({ body: { email: { $ne: "" } } });
        const res = mkRes();
        const nextArgs: any[] = [];

        mw(req, res, (err?: any) => nextArgs.push(err));
        assert.ok(nextArgs[0] instanceof ApiError);
        assert.equal(nextArgs[0].statusCode, 400);
    });

    it(".strict() schema rejects unknown fields", () => {
        const schema = z.object({ name: z.string() }).strict();
        const mw = validateRequest({ body: schema });
        const req = mkReq({ body: { name: "ok", extra: "should-reject" } });
        const res = mkRes();
        const nextArgs: any[] = [];

        mw(req, res, (err?: any) => nextArgs.push(err));
        assert.ok(nextArgs[0] instanceof ApiError);
        assert.equal(nextArgs[0].statusCode, 400);
    });

    it(".passthrough() schema accepts unknown fields", () => {
        const schema = z.object({ name: z.string() }).passthrough();
        const mw = validateRequest({ body: schema });
        const req = mkReq({ body: { name: "ok", extra: "kept" } });
        const res = mkRes();
        const nextArgs: any[] = [];

        mw(req, res, (err?: any) => nextArgs.push(err));
        assert.equal(nextArgs[0], undefined);
        assert.equal(req.body.name, "ok");
        assert.equal(req.body.extra, "kept");
    });

    it("passthroughObjectNoOperators rejects $-prefixed top-level keys", () => {
        const mw = validateRequest({ body: passthroughObjectNoOperators });
        const req = mkReq({ body: { $set: { isActive: false } } });
        const res = mkRes();
        const nextArgs: any[] = [];

        mw(req, res, (err?: any) => nextArgs.push(err));
        assert.ok(nextArgs[0] instanceof ApiError);
        assert.equal(nextArgs[0].statusCode, 400);
    });

    it("passes through when no schema is provided for a section", () => {
        const schema = z.object({ name: z.string() });
        const mw = validateRequest({ body: schema });
        // No `params` schema — even malformed params should pass.
        const req = mkReq({ body: { name: "ok" }, params: { id: "anything" } });
        const res = mkRes();
        const nextArgs: any[] = [];

        mw(req, res, (err?: any) => nextArgs.push(err));
        assert.equal(nextArgs[0], undefined);
    });

    it("error envelope is producible from forwarded ApiError (success:false, statusCode:400)", () => {
        // Simulate the project errorHandler outcome from a forwarded ApiError.
        const schema = z.object({ email: z.string() });
        const mw = validateRequest({ body: schema });
        const req = mkReq({ body: { email: 123 as any } });
        const res = mkRes();
        const nextArgs: any[] = [];

        mw(req, res, (err?: any) => nextArgs.push(err));
        const err = nextArgs[0] as ApiError;
        const envelope = {
            success: false,
            statusCode: err.statusCode,
            message: err.message,
        };
        assert.equal(envelope.success, false);
        assert.equal(envelope.statusCode, 400);
        assert.equal(typeof envelope.message, "string");
    });
});
