/**
 * mail.Service.test.ts
 * Comprehensive test suite for Services/mail.Service.ts
 * Tests: all 5 handlers × happy-path + error-path + edge-case + injection-guard
 *
 * Mock strategy: mock Utils/mailer and Databases/Models/user.Models so tests
 * run in CI without Redis, MongoDB, or live SMTP.
 */

import { describe, it, beforeEach, mock } from "bun:test";
import assert from "node:assert/strict";
import { Request, Response } from "express";

// ─── env stubs ────────────────────────────────────────────────────────────────
process.env.JWT_SECRET   = process.env.JWT_SECRET   || "testsecret";
process.env.REDIS_HOST   = process.env.REDIS_HOST   || "localhost";
process.env.REDIS_PORT   = process.env.REDIS_PORT   || "6379";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockReq = (body: any = {}, extra: Partial<Request> = {}): Request =>
  ({ body, headers: {}, cookies: {}, query: {}, params: {}, ...extra } as unknown as Request);

const mockRes = () => {
  const res: any = { statusCode: 200, locals: {} };
  const calls: any[] = [];
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json   = (d: any)    => { calls.push(d); return res; };
  (res as any).__calls = calls;
  return res as Response & { __calls: any[] };
};

type NextArgs = any[];
const capturingNext = (): [(err?: any) => void, NextArgs] => {
  const args: NextArgs = [];
  return [(err?: any) => args.push(err ?? null), args];
};

// ─── Module mocking ───────────────────────────────────────────────────────────
// We use dynamic import after setting up module-level mocks via Bun's mock.module

const FAKE_USER   = { _id: "deadbeef000000000000001", name: "Alice", email: "alice@test.com" };
const SEND_OK     = { success: true, provider: "Mailjet", alternated: false };
const SEND_FAIL   = new Error("All providers failed");

// We patch individual imports through bun module mock
let sendEmailImpl: (...a: any[]) => Promise<any> = async () => SEND_OK;
let findOneImpl:   (...a: any[]) => any = () => ({
  select: () => ({ lean: async () => FAKE_USER }),
});
let redisSetImpl: (...a: any[]) => Promise<any>  = async () => "OK";
let redisDelImpl: (...a: any[]) => Promise<any>  = async () => 1;
let generateOtpImpl = () => 123456;

mock.module("../Utils/providers/mailer", () => ({
  sendEmail: (...a: any[]) => sendEmailImpl(...a),
}));
mock.module("../Databases/Models/user.Models", () => ({
  default: {
    findOne: (...a: any[]) => findOneImpl(...a),
  },
}));
mock.module("../config/redis", () => ({
  redis: {
    set: (...a: any[]) => redisSetImpl(...a),
    del: (...a: any[]) => redisDelImpl(...a),
  },
}));
mock.module("../Utils/auth/OtpGenerator", () => ({
  generateOtp: () => generateOtpImpl(),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("MailService", () => {
  // Re-import fresh on each test so mock state is clean
  let MailService: any;

  beforeEach(async () => {
    // Reset mocks to defaults
    sendEmailImpl  = async () => SEND_OK;
    findOneImpl    = () => ({ select: () => ({ lean: async () => FAKE_USER }) });
    redisSetImpl   = async () => "OK";
    redisDelImpl   = async () => 1;
    generateOtpImpl = () => 123456;
    MailService = (await import("../Services/mail.Service")).default;
  });

  // ═══════════════════════════════════════════════════════════════════
  // sendOTP
  // ═══════════════════════════════════════════════════════════════════

  describe("sendOTP", () => {
    it("200 – sends OTP and returns provider info", async () => {
      const req = mockReq({ email: "alice@test.com" });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        (res as any).json = (d: any) => { origJson(d); resolve(); return res; };
        MailService.sendOTP(req, res, next);
      });

      assert.equal(errs.length, 0, "next() should not be called with error");
      const body = (res as any).__calls[0];
      assert.equal(body.data.provider, "Mailjet");
      assert.equal(body.data.expiresIn, "3 minutes");
    });

    it("400 – missing email calls next(ApiError(400))", async () => {
      const req = mockReq({});
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        MailService.sendOTP(req, res, (e: any) => { next(e); resolve(); });
      });

      assert.ok(errs[0], "error should be set");
      assert.equal(errs[0].statusCode, 400);
    });

    it("400 – blank email string calls next(ApiError(400))", async () => {
      const req = mockReq({ email: "   " });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        MailService.sendOTP(req, res, (e: any) => { next(e); resolve(); });
      });

      assert.equal(errs[0].statusCode, 400);
    });

    it("400 – malformed email (no @) calls next(ApiError(400))", async () => {
      const req = mockReq({ email: "notanemail" });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        MailService.sendOTP(req, res, (e: any) => { next(e); resolve(); });
      });

      assert.equal(errs[0].statusCode, 400);
    });

    it("400 – malformed email (no TLD) calls next(ApiError(400))", async () => {
      const req = mockReq({ email: "user@domain" });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        MailService.sendOTP(req, res, (e: any) => { next(e); resolve(); });
      });

      assert.equal(errs[0].statusCode, 400);
    });

    it("404 – user not found calls next(ApiError(404))", async () => {
      findOneImpl = () => ({ select: () => ({ lean: async () => null }) });
      const req = mockReq({ email: "ghost@test.com" });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        MailService.sendOTP(req, res, (e: any) => { next(e); resolve(); });
      });

      assert.equal(errs[0].statusCode, 404);
    });

    it("500 – sendEmail failure cleans up Redis and calls next(ApiError(500))", async () => {
      let deletedKey: string | undefined;
      redisDelImpl = async (k: string) => { deletedKey = k; return 1; };
      sendEmailImpl = async () => { throw SEND_FAIL; };

      const req = mockReq({ email: "alice@test.com" });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        MailService.sendOTP(req, res, (e: any) => { next(e); resolve(); });
      });

      assert.equal(errs[0].statusCode, 500);
      assert.ok(deletedKey?.startsWith("otp:"), "Redis OTP key must be cleaned up on failure");
    });

    it("injection guard – email with NoSQL $gt object returns 400", async () => {
      const req = mockReq({ email: { $gt: "" } });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        MailService.sendOTP(req, res, (e: any) => { next(e); resolve(); });
      });

      assert.equal(errs[0].statusCode, 400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // sendWelcome
  // ═══════════════════════════════════════════════════════════════════

  describe("sendWelcome", () => {
    it("200 – returns provider and email echo", async () => {
      const req = mockReq({ email: "alice@test.com" });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        (res as any).json = (d: any) => { origJson(d); resolve(); return res; };
        MailService.sendWelcome(req, res, next);
      });

      assert.equal(errs.length, 0);
      const body = (res as any).__calls[0];
      assert.equal(body.data.provider, "Mailjet");
    });

    it("400 – missing email", async () => {
      const req = mockReq({});
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        MailService.sendWelcome(req, res, (e: any) => { next(e); resolve(); });
      });

      assert.equal(errs[0].statusCode, 400);
    });

    it("400 – email with spaces only", async () => {
      const req = mockReq({ email: "   \t  " });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        MailService.sendWelcome(req, res, (e: any) => { next(e); resolve(); });
      });

      assert.equal(errs[0].statusCode, 400);
    });

    it("404 – user not found", async () => {
      findOneImpl = () => ({ select: () => ({ lean: async () => null }) });
      const req = mockReq({ email: "ghost@test.com" });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        MailService.sendWelcome(req, res, (e: any) => { next(e); resolve(); });
      });

      assert.equal(errs[0].statusCode, 404);
    });

    it("500 – sendEmail throws → ApiError(500)", async () => {
      sendEmailImpl = async () => { throw SEND_FAIL; };
      const req = mockReq({ email: "alice@test.com" });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        MailService.sendWelcome(req, res, (e: any) => { next(e); resolve(); });
      });

      assert.equal(errs[0].statusCode, 500);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // sendPasswordResetConfirmation
  // ═══════════════════════════════════════════════════════════════════

  describe("sendPasswordResetConfirmation", () => {
    it("200 – sends confirmation email", async () => {
      const req = mockReq({ email: "alice@test.com" });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        (res as any).json = (d: any) => { origJson(d); resolve(); return res; };
        MailService.sendPasswordResetConfirmation(req, res, next);
      });

      assert.equal(errs.length, 0);
    });

    it("400 – missing email", async () => {
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendPasswordResetConfirmation(mockReq({}), mockRes(), (e: any) => { next(e); resolve(); });
      });
      assert.equal(errs[0].statusCode, 400);
    });

    it("404 – user not found", async () => {
      findOneImpl = () => ({ select: () => ({ lean: async () => null }) });
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendPasswordResetConfirmation(
          mockReq({ email: "ghost@test.com" }), mockRes(),
          (e: any) => { next(e); resolve(); }
        );
      });
      assert.equal(errs[0].statusCode, 404);
    });

    it("500 – SMTP failure → ApiError(500)", async () => {
      sendEmailImpl = async () => { throw SEND_FAIL; };
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendPasswordResetConfirmation(
          mockReq({ email: "alice@test.com" }), mockRes(),
          (e: any) => { next(e); resolve(); }
        );
      });
      assert.equal(errs[0].statusCode, 500);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // sendNotification
  // ═══════════════════════════════════════════════════════════════════

  describe("sendNotification", () => {
    it("200 – sends notification email", async () => {
      const req = mockReq({ email: "alice@test.com", subject: "Hello", message: "World" });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        (res as any).json = (d: any) => { origJson(d); resolve(); return res; };
        MailService.sendNotification(req, res, next);
      });

      assert.equal(errs.length, 0);
      const body = (res as any).__calls[0];
      assert.equal(body.data.provider, "Mailjet");
    });

    it("400 – missing email", async () => {
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendNotification(
          mockReq({ subject: "S", message: "M" }), mockRes(),
          (e: any) => { next(e); resolve(); }
        );
      });
      assert.equal(errs[0].statusCode, 400);
    });

    it("400 – missing subject", async () => {
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendNotification(
          mockReq({ email: "a@b.com", message: "M" }), mockRes(),
          (e: any) => { next(e); resolve(); }
        );
      });
      assert.equal(errs[0].statusCode, 400);
    });

    it("400 – missing message", async () => {
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendNotification(
          mockReq({ email: "a@b.com", subject: "S" }), mockRes(),
          (e: any) => { next(e); resolve(); }
        );
      });
      assert.equal(errs[0].statusCode, 400);
    });

    it("400 – invalid email format", async () => {
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendNotification(
          mockReq({ email: "bad-email", subject: "S", message: "M" }), mockRes(),
          (e: any) => { next(e); resolve(); }
        );
      });
      assert.equal(errs[0].statusCode, 400);
    });

    it("500 – sendEmail throws → ApiError(500)", async () => {
      sendEmailImpl = async () => { throw SEND_FAIL; };
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendNotification(
          mockReq({ email: "alice@test.com", subject: "S", message: "M" }), mockRes(),
          (e: any) => { next(e); resolve(); }
        );
      });
      assert.equal(errs[0].statusCode, 500);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // sendBulkNotification
  // ═══════════════════════════════════════════════════════════════════

  describe("sendBulkNotification", () => {
    it("200 – all emails sent successfully", async () => {
      const req = mockReq({
        emails: ["a@a.com", "b@b.com"],
        subject: "Bulk",
        message: "Msg",
      });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        (res as any).json = (d: any) => { origJson(d); resolve(); return res; };
        MailService.sendBulkNotification(req, res, next);
      });

      assert.equal(errs.length, 0);
      const body = (res as any).__calls[0];
      assert.equal(body.data.success, 2);
      assert.equal(body.data.failed, 0);
    });

    it("207 – partial failure returns mixed results", async () => {
      let callCount = 0;
      sendEmailImpl = async () => {
        callCount++;
        if (callCount === 1) return SEND_OK;
        throw new Error("provider failed");
      };

      const req = mockReq({
        emails: ["ok@a.com", "fail@b.com"],
        subject: "Bulk",
        message: "Msg",
      });
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        (res as any).json = (d: any) => { origJson(d); resolve(); return res; };
        MailService.sendBulkNotification(req, res, next);
      });

      assert.equal(errs.length, 0);
      const body = (res as any).__calls[0];
      assert.equal(body.data.success, 1);
      assert.equal(body.data.failed, 1);
      assert.equal(res.statusCode, 207);
    });

    it("400 – empty emails array", async () => {
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendBulkNotification(
          mockReq({ emails: [], subject: "S", message: "M" }), mockRes(),
          (e: any) => { next(e); resolve(); }
        );
      });
      assert.equal(errs[0].statusCode, 400);
    });

    it("400 – emails is not an array", async () => {
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendBulkNotification(
          mockReq({ emails: "single@a.com", subject: "S", message: "M" }), mockRes(),
          (e: any) => { next(e); resolve(); }
        );
      });
      assert.equal(errs[0].statusCode, 400);
    });

    it("400 – one invalid email in list rejects the whole batch", async () => {
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendBulkNotification(
          mockReq({ emails: ["ok@a.com", "not-valid"], subject: "S", message: "M" }), mockRes(),
          (e: any) => { next(e); resolve(); }
        );
      });
      assert.equal(errs[0].statusCode, 400);
      assert.ok(errs[0].message.includes("not-valid"));
    });

    it("400 – missing subject", async () => {
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendBulkNotification(
          mockReq({ emails: ["a@a.com"], message: "M" }), mockRes(),
          (e: any) => { next(e); resolve(); }
        );
      });
      assert.equal(errs[0].statusCode, 400);
    });

    it("400 – missing message", async () => {
      const [next, errs] = capturingNext();
      await new Promise<void>((resolve) => {
        MailService.sendBulkNotification(
          mockReq({ emails: ["a@a.com"], subject: "S" }), mockRes(),
          (e: any) => { next(e); resolve(); }
        );
      });
      assert.equal(errs[0].statusCode, 400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // healthCheck
  // ═══════════════════════════════════════════════════════════════════

  describe("healthCheck", () => {
    it("200 – at least one provider configured", async () => {
      process.env.GMAIL_USER = "test@gmail.com";
      process.env.GMAIL_PASS = "test-pass";

      const req = mockReq({});
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        (res as any).json = (d: any) => { origJson(d); resolve(); return res; };
        MailService.healthCheck(req, res, next);
      });

      assert.equal(errs.length, 0);
      const body = (res as any).__calls[0];
      assert.equal(body.data.healthy, true);
    });

    it("503 – no providers configured", async () => {
      delete process.env.SENDGRID_API_KEY;
      delete process.env.MAILJET_API_KEY;
      delete process.env.GMAIL_USER;
      delete process.env.GMAIL_PASS;

      const req = mockReq({});
      const res = mockRes();
      const [next, errs] = capturingNext();

      await new Promise<void>((resolve) => {
        const origJson = res.json.bind(res);
        (res as any).json = (d: any) => { origJson(d); resolve(); return res; };
        MailService.healthCheck(req, res, next);
      });

      assert.equal(errs.length, 0);
      const body = (res as any).__calls[0];
      assert.equal(body.data.healthy, false);
      assert.equal(res.statusCode, 503);
    });
  });
});
