/*
 ┌───────────────────────────────────────────────────────────────────────┐
 │  jwtToken.test.ts                                                     │
 │  Pure-unit tests for Utils/jwtToken.ts.                               │
 │  No mocks needed; just env vars.                                      │
 └───────────────────────────────────────────────────────────────────────┘

 Covers:
   - generateAccessToken / verifyAccessToken round-trip
   - alg:HS256 pinning (header inspection)
   - alg:none forgery rejected
   - alg:HS512 algorithm-confusion rejected
   - expired token rejected
   - tampered-payload token rejected
   - generateRefreshToken: 128 hex chars, 100x uniqueness
   - hashRefreshToken: deterministic + 64 hex chars
   - Default access token TTL ~= 15 minutes
   - Legacy generateUserToken still works (back-compat alias)
*/

import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

// MUST be set before importing jwtToken
process.env.USER_SECRET_KEY = process.env.USER_SECRET_KEY || "testsecret";

const b64url = (input: Buffer | string) =>
  (typeof input === "string" ? Buffer.from(input) : input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

describe("Utils/auth/jwtToken", () => {
  it("generateAccessToken produces a JWT verifiable by verifyAccessToken", async () => {
    const { generateAccessToken, verifyAccessToken } = await import("../Utils/auth/jwtToken");
    const token = generateAccessToken({ _id: "u1", role: "CUSTOMER", email: "a@b.c" });
    assert.equal(typeof token, "string");
    assert.equal(token.split(".").length, 3);

    const decoded: any = verifyAccessToken(token);
    assert.equal(decoded._id, "u1");
    assert.equal(decoded.role, "CUSTOMER");
    assert.equal(decoded.email, "a@b.c");
  });

  it("generated access token has alg:HS256 in header", async () => {
    const { generateAccessToken } = await import("../Utils/auth/jwtToken");
    const token = generateAccessToken({ _id: "u1" });
    const [headerB64] = token.split(".");
    const header = JSON.parse(
      Buffer.from(headerB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    assert.equal(header.alg, "HS256");
    assert.equal(header.typ, "JWT");
  });

  it("verifyAccessToken rejects a forged alg:none token", async () => {
    const { verifyAccessToken } = await import("../Utils/auth/jwtToken");

    const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const payload = b64url(JSON.stringify({ _id: "evil", role: "ADMIN" }));
    // RFC 7519 allows empty signature for alg:none
    const forged = `${header}.${payload}.`;

    let threw = false;
    try {
      verifyAccessToken(forged);
    } catch {
      threw = true;
    }
    assert.equal(threw, true, "alg:none token must be rejected");
  });

  it("verifyAccessToken rejects a token signed with HS512 using same secret (algorithm-confusion)", async () => {
    const { verifyAccessToken } = await import("../Utils/auth/jwtToken");
    const evil = jwt.sign({ _id: "evil", role: "ADMIN" }, process.env.USER_SECRET_KEY as string, {
      algorithm: "HS512",
    });
    let threw = false;
    try {
      verifyAccessToken(evil);
    } catch {
      threw = true;
    }
    assert.equal(threw, true, "HS512-signed token must be rejected by HS256-pinned verifier");
  });

  it("verifyAccessToken rejects an expired token", async () => {
    const { generateAccessToken, verifyAccessToken } = await import("../Utils/auth/jwtToken");
    // negative TTL => instantly expired
    const token = generateAccessToken({ _id: "u1" }, "-1s" as any);
    let threw = false;
    try {
      verifyAccessToken(token);
    } catch (e: any) {
      threw = true;
      // jsonwebtoken throws TokenExpiredError
      assert.ok(/expir/i.test(e.message) || e.name === "TokenExpiredError");
    }
    assert.equal(threw, true);
  });

  it("verifyAccessToken rejects tampered payload", async () => {
    const { generateAccessToken, verifyAccessToken } = await import("../Utils/auth/jwtToken");
    const token = generateAccessToken({ _id: "u1", role: "CUSTOMER" });
    const [h, , s] = token.split(".");
    const tamperedPayload = b64url(JSON.stringify({ _id: "u1", role: "ADMIN" }));
    const tampered = `${h}.${tamperedPayload}.${s}`;
    let threw = false;
    try {
      verifyAccessToken(tampered);
    } catch {
      threw = true;
    }
    assert.equal(threw, true);
  });

  it("generateRefreshToken returns 128-hex-char string and is unique across 100 calls", async () => {
    const { generateRefreshToken } = await import("../Utils/auth/jwtToken");
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const t = generateRefreshToken();
      assert.equal(typeof t, "string");
      assert.equal(t.length, 128, "refresh token must be 64 bytes = 128 hex chars");
      assert.ok(/^[0-9a-f]+$/.test(t), "refresh token must be hex");
      seen.add(t);
    }
    assert.equal(seen.size, 100, "all 100 tokens must be unique");
  });

  it("hashRefreshToken is deterministic and produces 64-hex chars (SHA-256)", async () => {
    const { hashRefreshToken } = await import("../Utils/auth/jwtToken");
    const sample = "a".repeat(128);
    const h1 = hashRefreshToken(sample);
    const h2 = hashRefreshToken(sample);
    assert.equal(h1, h2, "deterministic");
    assert.equal(h1.length, 64, "SHA-256 hex = 64 chars");
    assert.ok(/^[0-9a-f]+$/.test(h1));

    // Sanity: matches Node's crypto for SHA-256 hex
    const expected = crypto.createHash("sha256").update(sample).digest("hex");
    assert.equal(h1, expected);
  });

  it("default access token TTL is 15 minutes", async () => {
    const { generateAccessToken } = await import("../Utils/auth/jwtToken");
    const token = generateAccessToken({ _id: "u1" });
    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    const ttl = payload.exp - payload.iat;
    assert.equal(ttl, 15 * 60, `expected 900s TTL, got ${ttl}`);
  });

  it("legacy generateUserToken still works (back-compat alias)", async () => {
    const mod: any = await import("../Utils/auth/jwtToken");
    assert.equal(typeof mod.generateUserToken, "function");
    const token = mod.generateUserToken({ _id: "u1", role: "CUSTOMER" });
    assert.equal(typeof token, "string");
    // Must verify against same secret/HS256
    const decoded: any = jwt.verify(token, process.env.USER_SECRET_KEY as string, {
      algorithms: ["HS256"],
    });
    assert.equal(decoded._id, "u1");
  });

  it("ACCESS_TOKEN_TTL and REFRESH_TOKEN_TTL_DAYS constants exported with correct values", async () => {
    const mod: any = await import("../Utils/auth/jwtToken");
    assert.equal(mod.ACCESS_TOKEN_TTL, "15m");
    assert.equal(mod.REFRESH_TOKEN_TTL_DAYS, 60);
  });
});
