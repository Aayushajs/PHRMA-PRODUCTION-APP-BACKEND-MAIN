import {Router} from "express";
import userRouter from './Service1.Routers/user.Routes';
import featuredRouter from './Service1.Routers/featured.Routes';
import categoryRouter from './Service1.Routers/category.Routes';
import advertisementRouter from './Service1.Routers/advertisement.Routes';
import notificationLogRouter from './Service1.Routers/notificationLog.Routes';
const mainRouter = Router();

mainRouter.use('/users',userRouter);
mainRouter.use('/featured-medicines', featuredRouter);
mainRouter.use('/categories', categoryRouter);
mainRouter.use('/advertisements', advertisementRouter);
mainRouter.use('/notifications', notificationLogRouter);


export default mainRouter;