import {Router} from "express";
import userRouter from './Service1.Routers/user.Routes';
import featuredRouter from './Service1.Routers/featured.Routes';
import categoryRouter from './Service1.Routers/category.Routes';
<<<<<<< HEAD
import itemsRouter from './Service1.Routers/item.Routes'
=======
import advertisementRouter from './Service1.Routers/advertisement.Routes';
>>>>>>> 77f5e76a2ae04be4f394909091de335dca84dd8b
const mainRouter = Router();

mainRouter.use('/users',userRouter);
mainRouter.use('/featured-medicines', featuredRouter);
mainRouter.use('/categories', categoryRouter);
<<<<<<< HEAD
mainRouter.use('/items', itemsRouter);
=======
mainRouter.use('/advertisements', advertisementRouter);
>>>>>>> 77f5e76a2ae04be4f394909091de335dca84dd8b


export default mainRouter;