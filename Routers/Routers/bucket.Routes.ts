import { Router } from "express";
import { authenticatedUserMiddleware } from "../../Middlewares/CheckLoginMiddleware";
import BucketService from "../../Services/bucket.service";

const bucketRouter = Router();

bucketRouter.get("/", authenticatedUserMiddleware, (req, res, next) =>
  BucketService.handleGetBucket(req, res, next),
);

bucketRouter.post("/add", authenticatedUserMiddleware, (req, res, next) =>
  BucketService.handleAddToBucket(req, res, next),
);

bucketRouter.post("/remove", authenticatedUserMiddleware, (req, res, next) =>
  BucketService.handleRemoveFromBucket(req, res, next),
);

export default bucketRouter;
