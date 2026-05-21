/**
 * checkLoginMiddleware.expanded.test.ts
 * Extended test suite for Middlewares/CheckLoginMiddleware.ts
 *
 * Covers all exported middlewares (customersMiddleware, adminMiddleware,
 * userMiddleware, authenticatedUserMiddleware, roleMiddleware factory)
 * with token-source priority, algorithm-pinning, gateway mode, and
 * every role-permission boundary.
 */

import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";

// ─── env stubs ────────────────────────────────────────────────────────────────
process.env.USER_SECRET_KEY            = process.env.USER_SECRET_KEY || "testsecret";
process.env.JWT_SECRET                 = process.env.JWT_SECRET       || "testsecret";
process.env.INTERNAL_SERVICE_API_KEY   = "internal-secret-key";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const b64url = (input: Buffer | string) =>
  (typeof input === "string" ? Buffer.from(input) : input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const mkToken = (payload: any, opts: jwt.SignOptions = {}) =>
  jwt.sign(payload, process.env.USER_SECRET_KEY as string, {
    algorithm: "HS256",
    expiresIn: "15m",
    ...opts,
  });

const mockReq = (overrides: Partial<Request> = {}): Request =>
  ({ headers: {}, cookies: {}, body: {}, query: {}, params: {}, ...overrides } as unknown as Request);

const mockRes = () =>
  ({ statusArgs: [], jsonArgs: [] } as any as Response & { statusArgs: any[]; jsonArgs: any[] });

/** Call middleware synchronously and return the error passed to next(). */
const callMw = (mw: Function, req: Request): { err: any; reqAfter: Request } => {
  let err: any = "NOT-CALLED";
  mw(req, mockRes(), (e?: any) => { err = e ?? null; });
  return { err, reqAfter: req };
};

// ─── All exported names from the refactored middleware ────────────────────────
const {
  customersMiddleware,
  adminMiddleware,
  userMiddleware,
  authenticatedUserMiddleware,
  roleMiddleware,
}: any = await import("../Middlewares/CheckLoginMiddleware");

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("CheckLoginMiddleware (expanded)", () => {

  // ═══════════════════════════════════════════════════════════════════
  // userMiddleware (CUSTOMER | ADMIN)
  // ═══════════════════════════════════════════════════════════════════

  describe("userMiddleware", () => {
    it("Bearer CUSTOMER → next() with no error, req.user populated", () => {
      const token = mkToken({ _id: "u1", role: "CUSTOMER", email: "a@b.com" });
      const req   = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const { err } = callMw(userMiddleware, req);
      assert.equal(err, null);
      assert.equal(req.user?._id, "u1");
      assert.equal(req.user?.role, "CUSTOMER");
    });

    it("Bearer ADMIN → next() with no error", () => {
      const token = mkToken({ _id: "a1", role: "ADMIN", email: "x@y.com" });
      const req   = mockReq({ headers: { authorization: `Bearer ${token}` } });
      const { err } = callMw(userMiddleware, req);
      assert.equal(err, null);
    });

    it("accessToken cookie → req.user populated", () => {
      const token = mkToken({ _id: "u2", role: "CUSTOMER", email: "c@d.com" });
      const req   = mockReq({ cookies: { accessToken: token } });
      const { err } = callMw(userMiddleware, req);
      assert.equal(err, null);
      assert.equal(req.user?._id, "u2");
    });

    it("legacy userToken cookie → still works (backward compat)", () => {
      const token = mkToken({ _id: "u3", role: "CUSTOMER", email: "e@f.com" });
      const req   = mockReq({ cookies: { userToken: token } });
      const { err } = callMw(userMiddleware, req);
      assert.equal(err, null);
    });

    it("Bearer takes priority over both cookies", () => {
      const bearer = mkToken({ _id: "BEARER", role: "ADMIN",    email: "b@b.com" });
      const cookie = mkToken({ _id: "COOKIE", role: "CUSTOMER", email: "c@c.com" });
      const req    = mockReq({
        headers: { authorization: `Bearer ${bearer}` },
        cookies: { accessToken: cookie, userToken: cookie },
      });
      callMw(userMiddleware, req);
      assert.equal(req.user?._id, "BEARER");
    });

    it("accessToken cookie beats userToken cookie", () => {
      const newToken = mkToken({ _id: "NEW", role: "ADMIN",    email: "n@n.com" });
      const oldToken = mkToken({ _id: "OLD", role: "CUSTOMER", email: "o@o.com" });
      const req      = mockReq({ cookies: { accessToken: newToken, userToken: oldToken } });
      callMw(userMiddleware, req);
      assert.equal(req.user?._id, "NEW");
    });

    it("no token → 401", () => {
      const { err } = callMw(userMiddleware, mockReq());
      assert.ok(err);
      assert.equal(err.statusCode, 401);
    });

    it("expired token → 401", () => {
      const token = mkToken({ _id: "u1", role: "CUSTOMER", email: "a@b.com" }, { expiresIn: "-1s" });
      const { err } = callMw(userMiddleware, mockReq({ headers: { authorization: `Bearer ${token}` } }));
      assert.ok(err);
      assert.equal(err.statusCode, 401);
    });

    it("forged alg:none token → 401", () => {
      const header  = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
      const payload = b64url(JSON.stringify({ _id: "evil", role: "ADMIN", email: "e@e.e" }));
      const forged  = `${header}.${payload}.`;
      const { err } = callMw(userMiddleware, mockReq({ headers: { authorization: `Bearer ${forged}` } }));
      assert.ok(err);
      assert.equal(err.statusCode, 401);
    });

    it("HS512 algorithm confusion → 401 (algorithm pinning)", () => {
      const evil = jwt.sign(
        { _id: "evil", role: "ADMIN", email: "e@e.e" },
        process.env.USER_SECRET_KEY as string,
        { algorithm: "HS512" }
      );
      const { err } = callMw(userMiddleware, mockReq({ headers: { authorization: `Bearer ${evil}` } }));
      assert.ok(err);
      assert.equal(err.statusCode, 401);
    });

    it("wrong signing key → 401", () => {
      const evil = jwt.sign({ _id: "u", role: "ADMIN", email: "e@e.e" }, "WRONG-KEY", { algorithm: "HS256" });
      const { err } = callMw(userMiddleware, mockReq({ headers: { authorization: `Bearer ${evil}` } }));
      assert.ok(err);
      assert.equal(err.statusCode, 401);
    });

    it("'Bearer' without token → 401", () => {
      const { err } = callMw(userMiddleware, mockReq({ headers: { authorization: "Bearer " } }));
      assert.ok(err);
      assert.equal(err.statusCode, 401);
    });

    it("malformed token (random string) → 401", () => {
      const { err } = callMw(userMiddleware, mockReq({ headers: { authorization: "Bearer thisIsNotAJWT" } }));
      assert.ok(err);
      assert.equal(err.statusCode, 401);
    });

    it("token with missing role field still populates req.user (role undefined)", () => {
      const token = mkToken({ _id: "norole", email: "n@n.com" }); // no role
      const req   = mockReq({ headers: { authorization: `Bearer ${token}` } });
      // userMiddleware accepts CUSTOMER | ADMIN; missing role should fail role check
      const { err } = callMw(userMiddleware, req);
      // role is undefined so not in [CUSTOMER, ADMIN] → 403
      assert.ok(err);
      assert.equal(err.statusCode, 403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // adminMiddleware
  // ═══════════════════════════════════════════════════════════════════

  describe("adminMiddleware", () => {
    it("ADMIN token → allowed", () => {
      const token = mkToken({ _id: "a1", role: "ADMIN", email: "a@a.com" });
      const { err } = callMw(adminMiddleware, mockReq({ headers: { authorization: `Bearer ${token}` } }));
      assert.equal(err, null);
    });

    it("CUSTOMER token → 403 Forbidden", () => {
      const token = mkToken({ _id: "c1", role: "CUSTOMER", email: "c@c.com" });
      const { err } = callMw(adminMiddleware, mockReq({ headers: { authorization: `Bearer ${token}` } }));
      assert.ok(err);
      assert.equal(err.statusCode, 403);
    });

    it("no token → 401", () => {
      const { err } = callMw(adminMiddleware, mockReq());
      assert.equal(err.statusCode, 401);
    });

    it("CUSTOMER from cookie → 403", () => {
      const token = mkToken({ _id: "c1", role: "CUSTOMER", email: "c@c.com" });
      const { err } = callMw(adminMiddleware, mockReq({ cookies: { accessToken: token } }));
      assert.equal(err.statusCode, 403);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // customersMiddleware
  // ═══════════════════════════════════════════════════════════════════

  describe("customersMiddleware", () => {
    it("CUSTOMER token → allowed", () => {
      const token = mkToken({ _id: "c1", role: "CUSTOMER", email: "c@c.com" });
      const { err } = callMw(customersMiddleware, mockReq({ headers: { authorization: `Bearer ${token}` } }));
      assert.equal(err, null);
    });

    it("ADMIN token → 403 Forbidden", () => {
      const token = mkToken({ _id: "a1", role: "ADMIN", email: "a@a.com" });
      const { err } = callMw(customersMiddleware, mockReq({ headers: { authorization: `Bearer ${token}` } }));
      assert.equal(err.statusCode, 403);
    });

    it("no token → 401", () => {
      const { err } = callMw(customersMiddleware, mockReq());
      assert.equal(err.statusCode, 401);
    });

    it("CUSTOMER from cookie → allowed", () => {
      const token = mkToken({ _id: "c1", role: "CUSTOMER", email: "c@c.com" });
      const { err } = callMw(customersMiddleware, mockReq({ cookies: { accessToken: token } }));
      assert.equal(err, null);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // authenticatedUserMiddleware (any role)
  // ═══════════════════════════════════════════════════════════════════

  describe("authenticatedUserMiddleware", () => {
    it("CUSTOMER → allowed", () => {
      const token = mkToken({ _id: "c1", role: "CUSTOMER", email: "c@c.com" });
      const { err } = callMw(authenticatedUserMiddleware, mockReq({ headers: { authorization: `Bearer ${token}` } }));
      assert.equal(err, null);
    });

    it("ADMIN → allowed", () => {
      const token = mkToken({ _id: "a1", role: "ADMIN", email: "a@a.com" });
      const { err } = callMw(authenticatedUserMiddleware, mockReq({ headers: { authorization: `Bearer ${token}` } }));
      assert.equal(err, null);
    });

    it("arbitrary role → allowed (any-auth semantics)", () => {
      const token = mkToken({ _id: "s1", role: "SUPERUSER", email: "s@s.com" });
      const { err } = callMw(authenticatedUserMiddleware, mockReq({ headers: { authorization: `Bearer ${token}` } }));
      assert.equal(err, null);
    });

    it("no token → 401 (not authenticated)", () => {
      const { err } = callMw(authenticatedUserMiddleware, mockReq());
      assert.equal(err.statusCode, 401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // roleMiddleware factory
  // ═══════════════════════════════════════════════════════════════════

  describe("roleMiddleware factory", () => {
    it("single role: only that role passes", () => {
      const mw    = roleMiddleware("PHARMACIST");
      const token = mkToken({ _id: "p1", role: "PHARMACIST", email: "p@p.com" });
      const { err } = callMw(mw, mockReq({ headers: { authorization: `Bearer ${token}` } }));
      assert.equal(err, null);
    });

    it("single role: other roles are forbidden (403)", () => {
      const mw    = roleMiddleware("PHARMACIST");
      const token = mkToken({ _id: "c1", role: "CUSTOMER", email: "c@c.com" });
      const { err } = callMw(mw, mockReq({ headers: { authorization: `Bearer ${token}` } }));
      assert.equal(err.statusCode, 403);
    });

    it("multiple roles: all listed roles pass", () => {
      const mw = roleMiddleware("MANAGER", "PHARMACIST");
      ["MANAGER", "PHARMACIST"].forEach((role) => {
        const token = mkToken({ _id: "x", role, email: "x@x.com" });
        const { err } = callMw(mw, mockReq({ headers: { authorization: `Bearer ${token}` } }));
        assert.equal(err, null, `${role} should be allowed`);
      });
    });

    it("multiple roles: unlisted role is forbidden", () => {
      const mw    = roleMiddleware("MANAGER", "PHARMACIST");
      const token = mkToken({ _id: "c1", role: "CUSTOMER", email: "c@c.com" });
      const { err } = callMw(mw, mockReq({ headers: { authorization: `Bearer ${token}` } }));
      assert.equal(err.statusCode, 403);
    });

    it("no roles (= any-auth): any role passes", () => {
      const mw = roleMiddleware(); // same as authenticatedUserMiddleware
      ["CUSTOMER", "ADMIN", "PHARMACIST", "SUPERUSER"].forEach((role) => {
        const token = mkToken({ _id: "x", role, email: "x@x.com" });
        const { err } = callMw(mw, mockReq({ headers: { authorization: `Bearer ${token}` } }));
        assert.equal(err, null, `${role} should pass any-auth`);
      });
    });

    it("no roles: unauthenticated → 401", () => {
      const mw    = roleMiddleware();
      const { err } = callMw(mw, mockReq());
      assert.equal(err.statusCode, 401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Gateway mode (x-internal-api-key)
  // ═══════════════════════════════════════════════════════════════════

  describe("Gateway mode (x-internal-api-key)", () => {
    const GW_HEADERS = (role = "ADMIN") => ({
      "x-internal-api-key": "internal-secret-key",
      "x-user-id":          "gw-user",
      "x-user-role":        role,
      "x-user-email":       "g@w.com",
    });

    it("valid internal key + ADMIN headers → req.user without JWT", () => {
      const req = mockReq({ headers: GW_HEADERS() });
      const { err } = callMw(userMiddleware, req);
      assert.equal(err, null);
      assert.equal(req.user?._id, "gw-user");
      assert.equal(req.user?.role, "ADMIN");
    });

    it("valid internal key + CUSTOMER role → passes customerMiddleware", () => {
      const req = mockReq({ headers: GW_HEADERS("CUSTOMER") });
      const { err } = callMw(customersMiddleware, req);
      assert.equal(err, null);
    });

    it("valid internal key + CUSTOMER role → blocked by adminMiddleware (403)", () => {
      const req = mockReq({ headers: GW_HEADERS("CUSTOMER") });
      const { err } = callMw(adminMiddleware, req);
      assert.equal(err.statusCode, 403);
    });

    it("wrong internal key → falls back to JWT; no JWT → 401", () => {
      const req = mockReq({
        headers: { ...GW_HEADERS(), "x-internal-api-key": "WRONG" },
      });
      const { err } = callMw(userMiddleware, req);
      assert.ok(err);
      assert.equal(err.statusCode, 401);
    });

    it("missing x-user-id header → falls back to JWT; no JWT → 401", () => {
      const headers: any = { ...GW_HEADERS() };
      delete headers["x-user-id"];
      const req = mockReq({ headers });
      const { err } = callMw(userMiddleware, req);
      assert.equal(err.statusCode, 401);
    });

    it("missing x-user-role header → falls back to JWT; no JWT → 401", () => {
      const headers: any = { ...GW_HEADERS() };
      delete headers["x-user-role"];
      const req = mockReq({ headers });
      const { err } = callMw(userMiddleware, req);
      assert.equal(err.statusCode, 401);
    });

    it("gateway mode takes priority over Bearer token", () => {
      const jwtToken = mkToken({ _id: "JWT-USER", role: "CUSTOMER", email: "j@j.com" });
      const req      = mockReq({
        headers: {
          ...GW_HEADERS("ADMIN"),
          authorization: `Bearer ${jwtToken}`,
        },
      });
      callMw(userMiddleware, req);
      // Gateway user wins
      assert.equal(req.user?._id, "gw-user");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Security edge cases
  // ═══════════════════════════════════════════════════════════════════

  describe("Security edge cases", () => {
    it("RS256-signed token is rejected (algorithm pinning)", () => {
      const { privateKey } = require("crypto").generateKeyPairSync("rsa", { modulusLength: 2048 });
      const evil = jwt.sign({ _id: "evil", role: "ADMIN", email: "e@e.e" }, privateKey, { algorithm: "RS256" });
      const { err } = callMw(userMiddleware, mockReq({ headers: { authorization: `Bearer ${evil}` } }));
      assert.ok(err);
      assert.equal(err.statusCode, 401);
    });

    it("empty Authorization header → 401", () => {
      const { err } = callMw(userMiddleware, mockReq({ headers: { authorization: "" } }));
      assert.equal(err.statusCode, 401);
    });

    it("authorization header with wrong scheme (Basic) → 401", () => {
      const { err } = callMw(userMiddleware, mockReq({ headers: { authorization: "Basic dXNlcjpwYXNz" } }));
      assert.equal(err.statusCode, 401);
    });

    it("JWT with tampered payload → 401 (signature check)", () => {
      const token  = mkToken({ _id: "u1", role: "CUSTOMER", email: "a@b.com" });
      const parts  = token.split(".");
      // Tamper with payload
      const fakePayload = Buffer.from(JSON.stringify({ _id: "hacker", role: "ADMIN", email: "h@h.com" })).toString("base64url");
      const tampered    = `${parts[0]}.${fakePayload}.${parts[2]}`;
      const { err }     = callMw(userMiddleware, mockReq({ headers: { authorization: `Bearer ${tampered}` } }));
      assert.ok(err);
      assert.equal(err.statusCode, 401);
    });

    it("req.user is undefined after a 401 rejection (no partial population)", () => {
      const { err, reqAfter } = callMw(userMiddleware, mockReq());
      assert.equal(err.statusCode, 401);
      assert.equal(reqAfter.user, undefined);
    });
  });
});
