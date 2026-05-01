import { Router, Request, Response, NextFunction } from "express";
import { authenticatedUserMiddleware } from "../../Middlewares/CheckLoginMiddleware";
import SearchService from "../../Services/search.service";

const searchRouter = Router();

searchRouter.post("/", authenticatedUserMiddleware, (req, res, next) =>
  SearchService.handleSearch(req, res, next),
);

searchRouter.get("/global", (req, res, next) =>
  SearchService.handleGlobalSearch(req, res, next),
);

export default searchRouter;
