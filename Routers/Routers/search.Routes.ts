import { Router, Request, Response, NextFunction } from "express";
import { authenticatedUserMiddleware } from "../../Middlewares/CheckLoginMiddleware";
import { apiLimiter } from "../../Middlewares/rateLimiter";
import SearchService from "../../Services/search.service";

const searchRouter = Router();

searchRouter.post("/", apiLimiter, authenticatedUserMiddleware, (req, res, next) =>
  SearchService.handleSearch(req, res, next),
);

searchRouter.get("/global", apiLimiter, (req, res, next) =>
  SearchService.handleGlobalSearch(req, res, next),
);

export default searchRouter;
