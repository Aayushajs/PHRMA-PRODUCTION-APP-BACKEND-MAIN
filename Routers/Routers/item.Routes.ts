import express from "express";
import ItemServices from "../../Services/item.Service";
import {uploadImage} from "../../config/multer";


const itemsRouter = express.Router();

itemsRouter.post("/add", uploadImage.array("itemImages"), ItemServices.createItem);

itemsRouter.put("/update/:itemId", uploadImage.array("itemImages"), ItemServices.updateItem);

itemsRouter.delete("/delete/:itemId", ItemServices.deleteItem);

itemsRouter.get("/", ItemServices.getAllItems);

itemsRouter.get("/category/:categoryId", ItemServices.getItemsByCategory);

itemsRouter.get('/deals-of-the-day', ItemServices.getDealsOfTheDay);

export default itemsRouter;