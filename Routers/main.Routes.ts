import {Router} from "express";
import userRouter from './Service1.Routers/user.Routes';
import featuredRouter from './Service1.Routers/featured.Routes';
import categoryRouter from './Service1.Routers/category.Routes';
import itemsRouter from './Service1.Routers/item.Routes';
import advertisementRouter from './Service1.Routers/advertisement.Routes';
import units from '../Routers/Service1.Routers/unit.Routes';
import gstRouter from './Service1.Routers/gst.Routes';
const mainRouter = Router();

mainRouter.use('/users',userRouter);
mainRouter.use('/featured-medicines', featuredRouter);
mainRouter.use('/categories', categoryRouter);
mainRouter.use('/items', itemsRouter);
mainRouter.use('/advertisements', advertisementRouter);
mainRouter.use('/units', units);
mainRouter.use('/gsts', gstRouter);

export default mainRouter;