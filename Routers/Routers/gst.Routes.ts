import express from "express";
import GSTServices from "../../Services/gst.Service";

const gstRouter = express.Router();

gstRouter.post("/add", GSTServices.createGST);
gstRouter.put("/update/:gstId", GSTServices.updateGST);
gstRouter.delete("/delete/:gstId", GSTServices.deleteGST);
gstRouter.get("/", GSTServices.getAllGSTs);

export default gstRouter;