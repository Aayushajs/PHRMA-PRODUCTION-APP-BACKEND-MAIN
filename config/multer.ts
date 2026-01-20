/*
┌───────────────────────────────────────────────────────────────────────┐
│  Multer Config - Middleware for handling file uploads with validation.│
└───────────────────────────────────────────────────────────────────────┘
*/

import multer from "multer";

// Use memory storage so we can access file.buffer in services
const storage = multer.memoryStorage();

// File filter to accept only images
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Accept only image files
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP and GIF images are allowed.'));
  }
};

export const uploadImage = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size (will be optimized by Sharp)
  }
});

export default uploadImage;
