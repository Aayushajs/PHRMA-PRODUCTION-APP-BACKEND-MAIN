import {Router} from "express";
import userRouter from './Service1.Routers/user.Routes';
import featuredRouter from './Service1.Routers/featured.Routes';
import categoryRouter from './Service1.Routers/category.Routes';
import itemsRouter from './Service1.Routers/item.Routes'
import advertisementRouter from './Service1.Routers/advertisement.Routes';
import unitRouter from './Service1.Routers/unit.Routes';
const mainRouter = Router();

mainRouter.use('/users',userRouter);
mainRouter.use('/featured-medicines', featuredRouter);
mainRouter.use('/categories', categoryRouter);
mainRouter.use('/items', itemsRouter);
mainRouter.use('/advertisements', advertisementRouter);
mainRouter.use('/units', unitRouter);


export default mainRouter;