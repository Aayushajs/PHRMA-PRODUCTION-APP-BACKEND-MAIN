/*
 ┌───────────────────────────────────────────────────────────────────────┐
 │  checkLoginMiddleware.test.ts                                         │
 │  Tests for Middlewares/CheckLoginMiddleware.ts                        │
 │  Covers token-source priority and HS256 algorithm pinning.            │
 └───────────────────────────────────────────────────────────────────────┘
*/

import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";

process.env.USER_SECRET_KEY = process.env.USER_SECRET_KEY || "testsecret";
process.env.JWT_SECRET = process.env.JWT_SECRET || "testsecret";
process.env.INTERNAL_SERVICE_API_KEY = process.env.INTERNAL_SERVICE_API_KEY || "internal-secret";

const b64url = (input: Buffer | string) =>
  (typeof input === "string" ? Buffer.from(input) : input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const mockReq = (overrides: Partial<Request> = {}): Request =>
  ({
    headers: {},
    cookies: {},
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as unknown as Request);

const mockRes = () => {
  const res: any = {};
  res.statusArgs = [] as any[];
  res.jsonArgs = [] as any[];
  res.status = (c: number) => {
    res.statusArgs.push(c);
    return res;
  };
  res.json = (d: any) => {
    res.jsonArgs.push(d);
    return res;
  };
  return res as Response & { statusArgs: any[]; jsonArgs: any[] };
};

const validAccessToken = (payload: any, opts: any = {}) =>
  jwt.sign(payload, process.env.USER_SECRET_KEY as string, {
    algorithm: "HS256",
    expiresIn: "15m",
    ...opts,
  });

describe("CheckLoginMiddleware", () => {
  it("Authorization: Bearer <accessToken> populates req.user and calls next()", async () => {
    const { userMiddleware } = await import("../Middlewares/CheckLoginMiddleware");
    const token = validAccessToken({
      _id: "u1",
      role: "CUSTOMER",
      email: "a@b.c",
    });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } } as any);
    const res = mockRes();
    let nextCalledWith: any = "NOT-CALLED";
    userMiddleware(req, res, (err?: any) => {
      nextCalledWith = err;
    });
    assert.equal(nextCalledWith, undefined, "next() called with no error");
    assert.equal(req.user?._id, "u1");
    assert.equal(req.user?.role, "CUSTOMER");
  });

  it("accessToken cookie alone populates req.user", async () => {
    const { userMiddleware } = await import("../Middlewares/CheckLoginMiddleware");
    const token = validAccessToken({ _id: "u2", role: "ADMIN", email: "x@y.z" });
    const req = mockReq({ cookies: { accessToken: token } } as any);
    const res = mockRes();
    let err: any = "NOT-CALLED";
    userMiddleware(req, res, (e?: any) => {
      err = e;
    });
    assert.equal(err, undefined);
    assert.equal(req.user?._id, "u2");
    assert.equal(req.user?.role, "ADMIN");
  });

  it("legacy userToken cookie alone still works (back-compat)", async () => {
    const { userMiddleware } = await import("../Middlewares/CheckLoginMiddleware");
    const token = validAccessToken({ _id: "u3", role: "CUSTOMER", email: "x@y.z" });
    const req = mockReq({ cookies: { userToken: token } } as any);
    const res = mockRes();
    let err: any = "NOT-CALLED";
    userMiddleware(req, res, (e?: any) => {
      err = e;
    });
    assert.equal(err, undefined, "legacy userToken must keep working");
    assert.equal(req.user?._id, "u3");
  });

  it("Bearer token takes priority over cookie", async () => {
    const { userMiddleware } = await import("../Middlewares/CheckLoginMiddleware");
    const bearer = validAccessToken({ _id: "BEARER", role: "ADMIN", email: "b@b.b" });
    const cookie = validAccessToken({ _id: "COOKIE", role: "CUSTOMER", email: "c@c.c" });
    const req = mockReq({
      headers: { authorization: `Bearer ${bearer}` },
      cookies: { accessToken: cookie, userToken: cookie },
    } as any);
    const res = mockRes();
    userMiddleware(req, res, () => {});
    assert.equal(req.user?._id, "BEARER", "Bearer must win over cookie");
  });

  it("forged alg:none token is rejected (401)", async () => {
    const { userMiddleware } = await import("../Middlewares/CheckLoginMiddleware");
    const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const payload = b64url(JSON.stringify({ _id: "evil", role: "ADMIN", email: "e@e.e" }));
    const forged = `${header}.${payload}.`;
    const req = mockReq({ headers: { authorization: `Bearer ${forged}` } } as any);
    const res = mockRes();
    let err: any;
    userMiddleware(req, res, (e?: any) => {
      err = e;
    });
    assert.ok(err, "alg:none must be rejected");
    assert.equal(err.statusCode, 401);
    assert.equal(req.user, undefined);
  });

  it("expired token is rejected (401)", async () => {
    const { userMiddleware } = await import("../Middlewares/CheckLoginMiddleware");
    const token = validAccessToken({ _id: "u1", role: "CUSTOMER", email: "a@b.c" }, {
      expiresIn: "-1s",
    });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } } as any);
    const res = mockRes();
    let err: any;
    userMiddleware(req, res, (e?: any) => {
      err = e;
    });
    assert.ok(err);
    assert.equal(err.statusCode, 401);
  });

  it("gateway-mode headers with valid x-internal-api-key populate req.user without JWT", async () => {
    const { userMiddleware } = await import("../Middlewares/CheckLoginMiddleware");
    const req = mockReq({
      headers: {
        "x-internal-api-key": process.env.INTERNAL_SERVICE_API_KEY as string,
        "x-user-id": "gw-user",
        "x-user-role": "ADMIN",
        "x-user-email": "g@w.c",
      },
    } as any);
    const res = mockRes();
    let err: any = "NOT-CALLED";
    userMiddleware(req, res, (e?: any) => {
      err = e;
    });
    assert.equal(err, undefined);
    assert.equal(req.user?._id, "gw-user");
    assert.equal(req.user?.role, "ADMIN");
  });

  it("gateway-mode headers WITHOUT internal key falls back to JWT; no JWT => 401", async () => {
    const { userMiddleware } = await import("../Middlewares/CheckLoginMiddleware");
    const req = mockReq({
      headers: {
        // Missing or wrong x-internal-api-key
        "x-internal-api-key": "WRONG-KEY",
        "x-user-id": "gw-user",
        "x-user-role": "ADMIN",
      },
    } as any);
    const res = mockRes();
    let err: any;
    userMiddleware(req, res, (e?: any) => {
      err = e;
    });
    assert.ok(err);
    assert.equal(err.statusCode, 401);
    assert.equal(req.user, undefined);
  });

  it("adminMiddleware rejects CUSTOMER role with 403", async () => {
    const { adminMiddleware } = await import("../Middlewares/CheckLoginMiddleware");
    const token = validAccessToken({ _id: "u1", role: "CUSTOMER", email: "x@y.z" });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } } as any);
    const res = mockRes();
    let err: any;
    adminMiddleware(req, res, (e?: any) => {
      err = e;
    });
    assert.ok(err);
    assert.equal(err.statusCode, 403);
  });

  it("customersMiddleware rejects ADMIN role with 403", async () => {
    const { customersMiddleware } = await import("../Middlewares/CheckLoginMiddleware");
    const token = validAccessToken({ _id: "u1", role: "ADMIN", email: "x@y.z" });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } } as any);
    const res = mockRes();
    let err: any;
    customersMiddleware(req, res, (e?: any) => {
      err = e;
    });
    assert.ok(err);
    assert.equal(err.statusCode, 403);
  });

  it("no token, no headers => 401", async () => {
    const { userMiddleware } = await import("../Middlewares/CheckLoginMiddleware");
    const req = mockReq();
    const res = mockRes();
    let err: any;
    userMiddleware(req, res, (e?: any) => {
      err = e;
    });
    assert.ok(err);
    assert.equal(err.statusCode, 401);
  });

  it("HS512-signed token rejected by HS256-pinned verifier (algorithm-confusion guard)", async () => {
    const { userMiddleware } = await import("../Middlewares/CheckLoginMiddleware");
    const evil = jwt.sign(
      { _id: "evil", role: "ADMIN", email: "e@e.e" },
      process.env.USER_SECRET_KEY as string,
      { algorithm: "HS512" }
    );
    const req = mockReq({ headers: { authorization: `Bearer ${evil}` } } as any);
    const res = mockRes();
    let err: any;
    userMiddleware(req, res, (e?: any) => {
      err = e;
    });
    assert.ok(err, "HS512 must be rejected once middleware pins algorithm");
    assert.equal(err.statusCode, 401);
  });
});
