/// <reference types="bun" />
import { describe, it } from "bun:test";
import assert from "node:assert/strict";
import {
    signupSchema,
    loginSchema,
    googleLoginSchema,
    forgotPasswordSchema,
    verifyOtpSchema,
    resetPasswordSchema,
} from "../Utils/lib/validators/user.Validator";

describe("user.Validator", () => {
    describe("signupSchema", () => {
        it("accepts a minimal valid signup body", () => {
            const result = signupSchema.safeParse({
                name: "Alice",
                email: "alice@example.com",
                password: "supersecret",
                phone: "9999999999",
            });
            assert.equal(result.success, true);
        });

        it("rejects short password (<6)", () => {
            const result = signupSchema.safeParse({
                name: "Alice",
                email: "alice@example.com",
                password: "abc",
                phone: "9999999999",
            });
            assert.equal(result.success, false);
        });

        it("rejects short phone (<10)", () => {
            const result = signupSchema.safeParse({
                name: "Alice",
                email: "alice@example.com",
                password: "supersecret",
                phone: "123",
            });
            assert.equal(result.success, false);
        });

        it("rejects email as NoSQL operator object", () => {
            const result = signupSchema.safeParse({
                name: "Alice",
                email: { $ne: "" },
                password: "supersecret",
                phone: "9999999999",
            });
            assert.equal(result.success, false);
        });

        it("rejects bad email format", () => {
            const result = signupSchema.safeParse({
                name: "Alice",
                email: "not-an-email",
                password: "supersecret",
                phone: "9999999999",
            });
            assert.equal(result.success, false);
        });

        it("accepts optional address object", () => {
            const result = signupSchema.safeParse({
                name: "Alice",
                email: "alice@example.com",
                password: "supersecret",
                phone: "9999999999",
                address: {
                    street: "1 Main St",
                    city: "Wonderland",
                    location: { latitude: 12.34, longitude: 56.78 },
                },
            });
            assert.equal(result.success, true);
        });
    });

    describe("loginSchema", () => {
        it("accepts a valid login", () => {
            const result = loginSchema.safeParse({
                email: "a@b.com",
                password: "x",
            });
            assert.equal(result.success, true);
        });

        it("rejects missing password", () => {
            const result = loginSchema.safeParse({ email: "a@b.com" });
            assert.equal(result.success, false);
        });

        it("rejects email as object (NoSQL injection)", () => {
            const result = loginSchema.safeParse({
                email: { $ne: "" },
                password: "x",
            });
            assert.equal(result.success, false);
        });
    });

    describe("googleLoginSchema", () => {
        it("accepts a userToken", () => {
            const result = googleLoginSchema.safeParse({ userToken: "tok" });
            assert.equal(result.success, true);
        });
        it("rejects missing userToken", () => {
            const result = googleLoginSchema.safeParse({});
            assert.equal(result.success, false);
        });
    });

    describe("forgotPasswordSchema", () => {
        it("requires email", () => {
            assert.equal(forgotPasswordSchema.safeParse({}).success, false);
            assert.equal(
                forgotPasswordSchema.safeParse({ email: "a@b.com" }).success,
                true
            );
        });
    });

    describe("verifyOtpSchema", () => {
        it("requires both otp and email", () => {
            assert.equal(verifyOtpSchema.safeParse({ otp: "123456" }).success, false);
            assert.equal(
                verifyOtpSchema.safeParse({ otp: "123456", email: "a@b.com" }).success,
                true
            );
        });
    });

    describe("resetPasswordSchema", () => {
        it("requires password >= 8 chars", () => {
            assert.equal(
                resetPasswordSchema.safeParse({ email: "a@b.com", password: "short" })
                    .success,
                false
            );
            assert.equal(
                resetPasswordSchema.safeParse({
                    email: "a@b.com",
                    password: "longenough",
                }).success,
                true
            );
        });
    });
});
