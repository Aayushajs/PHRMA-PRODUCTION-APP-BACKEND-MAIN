import express from "express";
import ItemServices from "../../Services/item.Service";

const itemsRouter = express.Router();

itemsRouter.post("/add", ItemServices.createItem);

itemsRouter.put("/update/:itemId", ItemServices.updateItem);

itemsRouter.delete("/delete/:itemId", ItemServices.deleteItem);

itemsRouter.get("/", ItemServices.getAllItems);

itemsRouter.get("/category/:categoryId", ItemServices.getItemsByCategory);

export default itemsRouter;