import { Router } from "express";
import {
  createFeaturedMedicine,
  getFeaturedMedicines,
  updateFeaturedMedicine
} from "../../Services/featured.Service";
import upload from "../../config/multer";
import { adminMiddleware } from "../../Middlewares/CheckLoginMiddleware";

const featuredRouter = Router();

featuredRouter.post(
  "/create", 
  adminMiddleware, 
  upload.single("imageUrl"), 
  createFeaturedMedicine
);

featuredRouter.get("/", getFeaturedMedicines); // check krna bcha hai 

featuredRouter.put(
  "/:id", 
  adminMiddleware, 
  upload.single("imageUrl"), 
  updateFeaturedMedicine
);

export default featuredRouter;