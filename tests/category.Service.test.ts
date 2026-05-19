import { describe, it, beforeEach, spyOn, mock } from "bun:test";
import assert from "node:assert/strict";
import { Request, Response } from "express";

process.env.JWT_SECRET = process.env.JWT_SECRET || "testsecret";
process.env.DB_URI = process.env.DB_URI || "mongodb://localhost:27017/test";
process.env.REDIS_HOST = process.env.REDIS_HOST || "localhost";
process.env.REDIS_PORT = process.env.REDIS_PORT || "6379";

import { CategoryModel } from "../Databases/Models/Category.model";
import * as cloudinaryUpload from "../Utils/cloudinaryUpload";
import * as cache from "../Utils/cache";
import CategoryService from "../Services/category.Service";
import NotificationService from "../Middlewares/LogMedillewares/notificationLogger";
import User from "../Databases/Models/user.Models";

describe("Category Service", () => {
  beforeEach(() => {
    mock.restore();
  });

  const mockReq = (body: any, files?: any, user?: any) => {
    return {
      body,
      files,
      // User must be a valid 24-char ObjectId for Mongoose querying
      user: user || { _id: "123456789012345678901234", name: "Test Admin" },
      query: {},
      params: {}
    } as unknown as Request;
  };

  const mockRes = () => {
    const res: any = {};
    res.statusArgs = [] as any[];
    res.jsonArgs = [] as any[];
    res.status = (code: number) => { res.statusArgs.push(code); return res; };
    res.json = (data: any) => { res.jsonArgs.push(data); return res; };
    return res as Response & { statusArgs: any[], jsonArgs: any[] };
  };

  it("should fail createCategory if missing required fields", async () => {
    const req = mockReq({});
    const res = mockRes();
    const nextArgs: any[] = [];
    const next = (err: any) => nextArgs.push(err);

    await CategoryService.createCategory(req, res, next as any);
    
    assert.equal(nextArgs.length, 1);
    assert.equal(nextArgs[0].statusCode, 400);
  });

  it("should retrieve categories via getCategoriesSimple", async () => {
    const req = mockReq({});
    const res = mockRes();
    const nextArgs: any[] = [];
    const next = (err: any) => nextArgs.push(err);

    spyOn(cache, "getCache").mockImplementation(async () => null);
    spyOn(cache, "setCache").mockImplementation(async () => {});
    
    spyOn(CategoryModel, "aggregate").mockImplementation(async () => 
      Promise.resolve([{
         categories: [{ _id: "cat123", name: "Vits", imageUrl: "fake" }],
         totalItems: 1
      }])
    );
    
    spyOn(User, "findById").mockImplementation((() => ({
      select: async () => Promise.resolve({ viewedCategories: [] })
    })) as any);

    spyOn(CategoryModel, "countDocuments").mockImplementation(async () => 1);
    
    await CategoryService.getCategoriesSimple(req, res, next as any);

    assert.equal(res.statusArgs[0], 200);
    assert.equal(res.jsonArgs[0].data.categories[0].name, "Vits");
  });
  
  it("should retrieve log debug info", async () => {
    const req = mockReq({});
    const res = mockRes();
    
    // Import CategoryLogService and CategoryLogModel
    const { CategoryLogService } = await import("../Services/category.Service");
    const CategoryLogModel = (await import("../Databases/Models/categoryLog.model")).default;
    
    // Mock countDocuments
    spyOn(CategoryLogModel, "countDocuments").mockImplementation(async () => 
      Promise.resolve(5)
    );
    
    // Mock find().limit().lean()
    spyOn(CategoryLogModel, "find").mockImplementation((() => ({
      limit: () => ({
        lean: async () => Promise.resolve([
          { action: "CREATE", performedBy: "user123" }
        ])
      })
    })) as any);
    
    // Set model metadata
    Object.defineProperty(CategoryLogModel, "modelName", {
      value: "CategoryLog",
      configurable: true
    });
    Object.defineProperty(CategoryLogModel, "collection", {
      value: { name: "categorylogs" },
      configurable: true
    });
    
    await CategoryLogService.getDebugInfo(req, res, (() => {}) as any);
    
    assert.equal(res.statusArgs[0], 200);
    assert.equal(res.jsonArgs[0].data.totalLogs, 5);
  });
});