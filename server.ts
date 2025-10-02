import express, {Express} from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import {connectDB} from './Databases/db';
import { errorHandler } from './Middlewares/errorHandler';
import mainRouter from './Routers/main.Router';
dotenv.config({path: './config/.env'});


const app: Express = express();

//middlewares
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());



//router
app.use('/api/v1', mainRouter);

app.use(errorHandler)

connectDB();

const PORT = process.env.PORT || 5001;
app.listen(PORT, async ()=>{
    console.log(`Server is running on port http://localhost:${PORT}`);
} )