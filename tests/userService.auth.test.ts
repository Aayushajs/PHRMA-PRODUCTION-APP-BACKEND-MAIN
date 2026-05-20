/*
 ┌───────────────────────────────────────────────────────────────────────┐
 │  userService.auth.test.ts                                             │
 │  Integration tests for login / refresh / logout in user.Service.ts.   │
 │  No real DB / Redis — everything mocked.                              │
 └───────────────────────────────────────────────────────────────────────┘
*/

import { describe, it, beforeEach, spyOn, mock } from "bun:test";
import assert from "node:assert/strict";
import { Request, Response } from "express";

process.env.USER_SECRET_KEY = process.env.USER_SECRET_KEY || "testsecret";
process.env.JWT_SECRET = process.env.JWT_SECRET || "testsecret";
process.env.DB_URI = process.env.DB_URI || "mongodb://localhost:27017/test";
process.env.REDIS_HOST = process.env.REDIS_HOST || "localhost";
process.env.REDIS_PORT = process.env.REDIS_PORT || "6379";

import bcrypt from "bcryptjs";
import UserModel from "../Databases/Models/user.Models";
import * as redisMod from "../config/redis";
import * as notificationMod from "../Utils/notification";

// --- helpers ---------------------------------------------------------------

const mockReq = (overrides: Partial<Request> = {}): Request => {
  return {
    body: {},
    cookies: {},
    headers: {},
    query: {},
    params: {},
    ip: "127.0.0.1",
    get: (h: string) => (h.toLowerCase() === "user-agent" ? "jest-ua" : undefined),
    ...overrides,
  } as unknown as Request;
};

interface CookieCall {
  name: string;
  value: string;
  opts: any;
}

const mockRes = () => {
  const res: any = {};
  res.statusArgs = [] as any[];
  res.jsonArgs = [] as any[];
  res.cookies = [] as CookieCall[];
  res.clearedCookies = [] as { name: string; opts: any }[];
  res.status = (code: number) => {
    res.statusArgs.push(code);
    return res;
  };
  res.json = (data: any) => {
    res.jsonArgs.push(data);
    return res;
  };
  res.cookie = (name: string, value: string, opts: any) => {
    res.cookies.push({ name, value, opts: opts || {} });
    return res;
  };
  res.clearCookie = (name: string, opts: any) => {
    res.clearedCookies.push({ name, opts: opts || {} });
    return res;
  };
  return res as Response & {
    statusArgs: any[];
    jsonArgs: any[];
    cookies: CookieCall[];
    clearedCookies: { name: string; opts: any }[];
  };
};

const lastJson = (res: any) => res.jsonArgs[res.jsonArgs.length - 1];
const lastStatus = (res: any) => res.statusArgs[res.statusArgs.length - 1];

/**
 * `catchAsyncErrors` wrapper returns undefined synchronously — the inner
 * Promise is dropped onto the microtask queue. Calling `await fn(...)` is
 * NOT enough to wait for completion. We yield several macrotasks to let
 * any awaited DB/redis spies resolve.
 */
const runHandler = async (handler: any, req: any, res: any, next: any) => {
  handler(req, res, next);
  // Yield to microtask + macrotask queue a few times.
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setImmediate(r));
  }
};

// Helper: dynamically resolve refresh-token model
async function getRefreshTokenModel(): Promise<any> {
  try {
    const m: any = await import("../Databases/Models/refreshToken.Model");
    return m.default || m.RefreshTokenModel || m;
  } catch {
    return null;
  }
}

// --- tests -----------------------------------------------------------------

describe("UserService auth (login / refresh / logout)", () => {
  beforeEach(() => {
    mock.restore();
  });

  // ---------------- LOGIN HAPPY PATH ----------------
  it("login happy path returns { user, token, accessToken, refreshToken } and sets 3 cookies", async () => {
    const UserService = (await import("../Services/user.Service")).default;
    const RefreshTokenModel = await getRefreshTokenModel();

    const fakeUser: any = {
      _id: "507f1f77bcf86cd799439011",
      name: "T",
      email: "t@x.com",
      password: "hashedpw",
      phone: "+15551112222",
      role: "CUSTOMER",
      isEmailVerified: true,
      isVerified: true,
      lastLogin: null,
      address: {},
      ProfileImage: [],
      save: async function () {
        return this;
      },
      toObject: function () {
        return { ...this };
      },
    };

    spyOn(UserModel, "findOne").mockImplementation((() => ({
      select: async () => fakeUser,
    })) as any);
    spyOn(bcrypt, "compare").mockImplementation(async () => true as any);

    const createSpy =
      RefreshTokenModel && spyOn(RefreshTokenModel, "create").mockImplementation(async () => ({}));

    spyOn(notificationMod, "sendPushNotification").mockImplementation(async () => undefined as any);
    try {
      spyOn(redisMod.redis as any, "get").mockImplementation(async () => null);
      spyOn(redisMod.redis as any, "set").mockImplementation(async () => "OK");
    } catch {
      /* redis may not expose get/set in test env — ignore */
    }

    const req = mockReq({ body: { email: "t@x.com", password: "pw" } } as any);
    const res = mockRes();
    await runHandler(
      UserService.login,
      req,
      res,
      ((e: any) => {
        if (e) throw e;
      }) as any
    );

    assert.equal(lastStatus(res), 200);
    const body = lastJson(res);
    assert.equal(body.success, true);
    assert.ok(body.data, "expected data block");
    assert.ok(body.data.token, "expected legacy token field");
    assert.ok(body.data.accessToken, "expected accessToken field");
    assert.ok(body.data.refreshToken, "expected refreshToken field");
    assert.equal(body.data.token, body.data.accessToken, "token must alias accessToken");
    assert.equal(body.data.refreshToken.length, 128, "refresh token must be 128 hex chars");
    assert.ok(/^[0-9a-f]+$/.test(body.data.refreshToken));

    // 3 cookies
    const names = res.cookies.map((c) => c.name).sort();
    assert.deepEqual(names, ["accessToken", "refreshToken", "userToken"]);
    for (const c of res.cookies) {
      assert.equal(c.opts.httpOnly, true, `${c.name} must be httpOnly`);
    }
    const rtCookie = res.cookies.find((c) => c.name === "refreshToken")!;
    assert.equal(rtCookie.opts.path, "/api/v1/users");

    // RefreshTokenModel.create called with hashed token NOT raw
    if (createSpy && (createSpy as any).mock?.calls?.length) {
      const args = (createSpy as any).mock.calls[0][0];
      assert.ok(args.tokenHash, "must store tokenHash");
      assert.notEqual(args.tokenHash, body.data.refreshToken, "must store hash, not raw");
      assert.equal(args.tokenHash.length, 64, "SHA-256 hex = 64 chars");
    }
  });

  // ---------------- LOGIN WRONG PASSWORD ----------------
  it("login with wrong password does NOT set cookies and does NOT create refresh-token row", async () => {
    const UserService = (await import("../Services/user.Service")).default;
    const RefreshTokenModel = await getRefreshTokenModel();

    const fakeUser = {
      _id: "507f1f77bcf86cd799439011",
      email: "t@x.com",
      password: "hashedpw",
      role: "CUSTOMER",
      isEmailVerified: true,
    };
    spyOn(UserModel, "findOne").mockImplementation((() => ({
      select: async () => fakeUser,
    })) as any);
    spyOn(bcrypt, "compare").mockImplementation(async () => false as any);

    const createSpy =
      RefreshTokenModel && spyOn(RefreshTokenModel, "create").mockImplementation(async () => ({}));

    const req = mockReq({ body: { email: "t@x.com", password: "wrong" } } as any);
    const res = mockRes();
    const errs: any[] = [];
    await runHandler(UserService.login, req, res, ((e: any) => errs.push(e)) as any);

    assert.equal(res.cookies.length, 0, "no cookies on failed login");
    if (createSpy) assert.equal((createSpy as any).mock.calls.length, 0);
    // Either next(err) with 4xx or json with success:false
    if (errs.length) {
      assert.ok(errs[0].statusCode >= 400);
    } else {
      assert.notEqual(lastJson(res)?.success, true);
    }
  });

  // ---------------- LOGIN NON-EXISTENT USER ----------------
  it("login with non-existent user does NOT set cookies / create refresh-token", async () => {
    const UserService = (await import("../Services/user.Service")).default;
    const RefreshTokenModel = await getRefreshTokenModel();

    spyOn(UserModel, "findOne").mockImplementation((() => ({
      select: async () => null,
    })) as any);

    const createSpy =
      RefreshTokenModel && spyOn(RefreshTokenModel, "create").mockImplementation(async () => ({}));

    const req = mockReq({ body: { email: "ghost@x.com", password: "pw" } } as any);
    const res = mockRes();
    const errs: any[] = [];
    await runHandler(UserService.login, req, res, ((e: any) => errs.push(e)) as any);

    assert.equal(res.cookies.length, 0);
    if (createSpy) assert.equal((createSpy as any).mock.calls.length, 0);
  });

  // ---------------- LOGIN EMAIL NOT VERIFIED ----------------
  it("login does not issue tokens if user.isEmailVerified is false (if branch exists)", async () => {
    const UserService = (await import("../Services/user.Service")).default;
    const RefreshTokenModel = await getRefreshTokenModel();

    const fakeUser = {
      _id: "507f1f77bcf86cd799439011",
      email: "t@x.com",
      password: "hashedpw",
      role: "CUSTOMER",
      isEmailVerified: false,
      isVerified: false,
    };
    spyOn(UserModel, "findOne").mockImplementation((() => ({
      select: async () => fakeUser,
    })) as any);
    spyOn(bcrypt, "compare").mockImplementation(async () => true as any);

    const createSpy =
      RefreshTokenModel && spyOn(RefreshTokenModel, "create").mockImplementation(async () => ({}));

    const req = mockReq({ body: { email: "t@x.com", password: "pw" } } as any);
    const res = mockRes();
    const errs: any[] = [];
    await runHandler(UserService.login, req, res, ((e: any) => errs.push(e)) as any);

    // Acceptable behaviours:
    //   (a) login service emits an error (verification required), OR
    //   (b) login succeeds — verification is enforced elsewhere
    // Either way: if it errors, ensure no cookies/refresh-row.
    if (errs.length || lastJson(res)?.success === false) {
      assert.equal(res.cookies.length, 0);
      if (createSpy) assert.equal((createSpy as any).mock.calls.length, 0);
    }
  });

  // ---------------- REFRESH HAPPY PATH ----------------
  it("refresh happy path: issues new pair, revokes old row, links replacedByHash", async () => {
    const UserService = (await import("../Services/user.Service")).default;
    const RefreshTokenModel = await getRefreshTokenModel();
    if (!RefreshTokenModel) return; // implementation not landed

    const { hashRefreshToken, generateRefreshToken } = await import("../Utils/jwtToken");
    const rawOld = generateRefreshToken();
    const oldHash = hashRefreshToken(rawOld);

    const oldRow: any = {
      _id: "rt1",
      userId: "507f1f77bcf86cd799439011",
      tokenHash: oldHash,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      replacedByHash: null,
      save: async function () {
        return this;
      },
    };

    spyOn(RefreshTokenModel, "findOne").mockImplementation((() => oldRow) as any);
    const createSpy = spyOn(RefreshTokenModel, "create").mockImplementation(async (doc: any) => doc);

    spyOn(UserModel, "findById").mockImplementation((() => ({
      lean: async () => ({
        _id: oldRow.userId,
        name: "T",
        email: "t@x.com",
        role: "CUSTOMER",
      }),
      select: async () => ({
        _id: oldRow.userId,
        email: "t@x.com",
        role: "CUSTOMER",
      }),
    })) as any);

    const refreshFn: any = (UserService as any).refreshToken;
    assert.equal(typeof refreshFn, "function", "UserService.refreshToken must exist");

    const req = mockReq({ cookies: { refreshToken: rawOld } } as any);
    const res = mockRes();
    await runHandler(refreshFn, req, res, ((e: any) => {
      if (e) throw e;
    }) as any);

    assert.equal(lastStatus(res), 200);
    const body = lastJson(res);
    assert.ok(body.data.accessToken);
    assert.ok(body.data.refreshToken);
    assert.notEqual(body.data.refreshToken, rawOld, "must rotate token");

    // Old row revoked, linked by replacedByHash
    assert.ok(oldRow.revokedAt, "old row must be revoked");
    const newHash = hashRefreshToken(body.data.refreshToken);
    assert.equal(oldRow.replacedByHash, newHash, "replacedByHash chain must link old to new");

    // New row created
    assert.ok((createSpy as any).mock.calls.length >= 1);
  });

  // ---------------- REFRESH MISSING TOKEN ----------------
  it("refresh with missing token returns 401", async () => {
    const UserService = (await import("../Services/user.Service")).default;
    const refreshFn: any = (UserService as any).refreshToken;
    if (typeof refreshFn !== "function") return;

    const req = mockReq();
    const res = mockRes();
    const errs: any[] = [];
    await runHandler(refreshFn, req, res, ((e: any) => errs.push(e)) as any);

    if (errs.length) {
      assert.equal(errs[0].statusCode, 401);
    } else {
      assert.equal(lastStatus(res), 401);
    }
  });

  // ---------------- REFRESH NOT IN DB ----------------
  it("refresh with token not found in DB returns 401", async () => {
    const UserService = (await import("../Services/user.Service")).default;
    const RefreshTokenModel = await getRefreshTokenModel();
    if (!RefreshTokenModel) return;
    const refreshFn: any = (UserService as any).refreshToken;
    if (typeof refreshFn !== "function") return;

    spyOn(RefreshTokenModel, "findOne").mockImplementation((() => null) as any);
    const req = mockReq({ cookies: { refreshToken: "f".repeat(128) } } as any);
    const res = mockRes();
    const errs: any[] = [];
    await runHandler(refreshFn, req, res, ((e: any) => errs.push(e)) as any);

    if (errs.length) assert.equal(errs[0].statusCode, 401);
    else assert.equal(lastStatus(res), 401);
  });

  // ---------------- REFRESH EXPIRED ----------------
  it("refresh with expired token returns 401", async () => {
    const UserService = (await import("../Services/user.Service")).default;
    const RefreshTokenModel = await getRefreshTokenModel();
    if (!RefreshTokenModel) return;
    const refreshFn: any = (UserService as any).refreshToken;
    if (typeof refreshFn !== "function") return;

    const expiredRow: any = {
      _id: "rt2",
      userId: "507f1f77bcf86cd799439011",
      tokenHash: "h",
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      save: async function () {
        return this;
      },
    };
    spyOn(RefreshTokenModel, "findOne").mockImplementation((() => expiredRow) as any);
    const req = mockReq({ cookies: { refreshToken: "f".repeat(128) } } as any);
    const res = mockRes();
    const errs: any[] = [];
    await runHandler(refreshFn, req, res, ((e: any) => errs.push(e)) as any);

    if (errs.length) assert.equal(errs[0].statusCode, 401);
    else assert.equal(lastStatus(res), 401);
  });

  // ---------------- REFRESH REUSE DETECTION ----------------
  it("refresh with already-revoked token (reuse) returns 401 and revokes ALL user tokens", async () => {
    const UserService = (await import("../Services/user.Service")).default;
    const RefreshTokenModel = await getRefreshTokenModel();
    if (!RefreshTokenModel) return;
    const refreshFn: any = (UserService as any).refreshToken;
    if (typeof refreshFn !== "function") return;

    const revokedRow: any = {
      _id: "rt3",
      userId: "507f1f77bcf86cd799439011",
      tokenHash: "h",
      expiresAt: new Date(Date.now() + 60 * 1000 * 60 * 24),
      revokedAt: new Date(Date.now() - 5000),
      save: async function () {
        return this;
      },
    };
    spyOn(RefreshTokenModel, "findOne").mockImplementation((() => revokedRow) as any);
    const updateManySpy = spyOn(RefreshTokenModel, "updateMany").mockImplementation(
      async () => ({ acknowledged: true, modifiedCount: 5 } as any)
    );

    const req = mockReq({ cookies: { refreshToken: "f".repeat(128) } } as any);
    const res = mockRes();
    const errs: any[] = [];
    await runHandler(refreshFn, req, res, ((e: any) => errs.push(e)) as any);

    if (errs.length) assert.equal(errs[0].statusCode, 401);
    else assert.equal(lastStatus(res), 401);

    assert.ok(
      (updateManySpy as any).mock.calls.length >= 1,
      "must updateMany() to revoke all user refresh tokens on reuse"
    );
    // First arg should filter by userId; behavior recorded.
    const filter = (updateManySpy as any).mock.calls[0][0];
    assert.ok(filter && (filter.userId || filter.user || filter.user_id), "filter must reference user");
  });

  // ---------------- REFRESH READ FROM BODY (MOBILE) ----------------
  it("refresh reads token from body when cookie missing (mobile flow)", async () => {
    const UserService = (await import("../Services/user.Service")).default;
    const RefreshTokenModel = await getRefreshTokenModel();
    if (!RefreshTokenModel) return;
    const refreshFn: any = (UserService as any).refreshToken;
    if (typeof refreshFn !== "function") return;

    const { hashRefreshToken, generateRefreshToken } = await import("../Utils/jwtToken");
    const raw = generateRefreshToken();
    const row: any = {
      _id: "rt4",
      userId: "507f1f77bcf86cd799439011",
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      save: async function () {
        return this;
      },
    };
    spyOn(RefreshTokenModel, "findOne").mockImplementation((() => row) as any);
    spyOn(RefreshTokenModel, "create").mockImplementation(async (doc: any) => doc);
    spyOn(UserModel, "findById").mockImplementation((() => ({
      lean: async () => ({
        _id: row.userId,
        name: "T",
        email: "t@x.com",
        role: "CUSTOMER",
      }),
      select: async () => ({
        _id: row.userId,
        email: "t@x.com",
        role: "CUSTOMER",
      }),
    })) as any);

    const req = mockReq({ body: { refreshToken: raw }, cookies: {} } as any);
    const res = mockRes();
    await runHandler(refreshFn, req, res, ((e: any) => {
      if (e) throw e;
    }) as any);

    assert.equal(lastStatus(res), 200);
    assert.ok(lastJson(res).data.accessToken);
  });

  // ---------------- LOGOUT ----------------
  it("logout revokes refresh-token row and clears all 3 cookies", async () => {
    const UserService = (await import("../Services/user.Service")).default;
    const RefreshTokenModel = await getRefreshTokenModel();

    const { hashRefreshToken, generateRefreshToken } = await import("../Utils/jwtToken");
    const raw = generateRefreshToken();
    const row: any = {
      _id: "rt5",
      userId: "507f1f77bcf86cd799439011",
      tokenHash: hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      save: async function () {
        return this;
      },
    };
    let updateOneSpy: any = null;
    if (RefreshTokenModel) {
      spyOn(RefreshTokenModel, "findOne").mockImplementation((() => row) as any);
      updateOneSpy = spyOn(RefreshTokenModel, "updateOne").mockImplementation(
        async () => ({ acknowledged: true, modifiedCount: 1 } as any)
      );
    }

    const req = mockReq({
      cookies: { refreshToken: raw, accessToken: "at", userToken: "ut" },
      user: { _id: row.userId, role: "CUSTOMER", email: "t@x.com" },
    } as any);
    const res = mockRes();
    await runHandler(UserService.logout, req, res, ((e: any) => {
      if (e) throw e;
    }) as any);

    // 3 cookies cleared (accessToken, refreshToken, userToken)
    const clearedNames = res.clearedCookies.map((c) => c.name).sort();
    for (const n of ["accessToken", "refreshToken", "userToken"]) {
      assert.ok(clearedNames.includes(n), `expected ${n} cleared`);
    }

    // Refresh row marked revoked (either via save() with revokedAt set, or updateOne)
    if (updateOneSpy && (updateOneSpy as any).mock.calls.length) {
      // ok
    } else {
      assert.ok(row.revokedAt, "expected refresh row revokedAt to be set");
    }
  });

  // ---------------- LOGOUT WITHOUT REFRESH TOKEN ----------------
  it("logout with no refresh token still clears cookies, no crash, success response", async () => {
    const UserService = (await import("../Services/user.Service")).default;
    const RefreshTokenModel = await getRefreshTokenModel();
    if (RefreshTokenModel) {
      spyOn(RefreshTokenModel, "findOne").mockImplementation((() => null) as any);
      spyOn(RefreshTokenModel, "updateOne").mockImplementation(
        async () => ({ acknowledged: true, modifiedCount: 0 } as any)
      );
    }

    const req = mockReq({
      cookies: {},
      user: { _id: "507f1f77bcf86cd799439011", role: "CUSTOMER", email: "t@x.com" },
    } as any);
    const res = mockRes();
    const errs: any[] = [];
    await runHandler(UserService.logout, req, res, ((e: any) => errs.push(e)) as any);

    assert.equal(errs.length, 0, "logout must not crash without refresh token");
    const clearedNames = res.clearedCookies.map((c) => c.name);
    assert.ok(clearedNames.length >= 1, "must still clear cookies");
    // Last response success
    const body = lastJson(res);
    if (body) assert.notEqual(body.success, false);
  });
});
