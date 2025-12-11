/*
┌───────────────────────────────────────────────────────────────────────┐
│  Multer Config - Middleware for handling file uploads.                │
└───────────────────────────────────────────────────────────────────────┘
*/

import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";

// Cloudinary storage setup for Multer
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "Epharma",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation: [{ width: 800, height: 800, crop: "limit" }],
    public_id: `${Date.now()}-${file.originalname}`,
  }),
});

export const uploadImage = multer({ storage });

export default uploadImage;
