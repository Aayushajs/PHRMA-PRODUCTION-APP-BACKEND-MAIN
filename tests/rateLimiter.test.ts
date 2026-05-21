import { describe, it, expect, mock } from "bun:test";
import express from "express";
import { globalLimiter } from "../Middlewares/rateLimiter";
import request from "supertest";

describe("Rate Limiter Middleware", () => {
    it("should allow requests under the limit", async () => {
        const app = express();
        app.use(globalLimiter);
        app.get("/", (req, res) => res.status(200).send("OK"));

        const res = await request(app).get("/");
        expect(res.status).toBe(200);
        expect(res.text).toBe("OK");
    });
});
