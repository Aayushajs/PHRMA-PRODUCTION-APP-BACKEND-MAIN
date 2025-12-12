/*
┌───────────────────────────────────────────────────────────────────────┐
│  Multer Config - Middleware for handling file uploads.                │
└───────────────────────────────────────────────────────────────────────┘
*/
import multer from "multer";
// Use memory storage so we can access file.buffer in services
const storage = multer.memoryStorage();
export const uploadImage = multer({ storage });
export default uploadImage;
