import express from "express";
import ItemServices from "../../Services/item.Service";

const itemsRouter = express.Router();

itemsRouter.post("/create", ItemServices.createItem);

itemsRouter.put("/:itemId", ItemServices.updateItem);

itemsRouter.delete("/:itemId", ItemServices.deleteItem);

itemsRouter.get("/", ItemServices.getAllItems);

itemsRouter.get("/category/:categoryId", ItemServices.getItemsByCategory);

export default itemsRouter;