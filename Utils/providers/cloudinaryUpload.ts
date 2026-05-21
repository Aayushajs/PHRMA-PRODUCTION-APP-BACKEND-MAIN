/*
┌───────────────────────────────────────────────────────────────────────┐
│  Cloudinary Upload with Sharp Image Optimization                      │
└───────────────────────────────────────────────────────────────────────┘
*/

import { v2 as cloudinary } from "cloudinary";
import type { UploadApiResponse } from "cloudinary";
import dotenv from "dotenv";
import sharp from "sharp";

dotenv.config({ path: './config/.env' });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const optimizeImage = async (fileBuffer: Buffer): Promise<Buffer> => {
  try {
    if (!fileBuffer || fileBuffer.length === 0) return fileBuffer;

    const image = sharp(fileBuffer);
    const metadata = await image.metadata();

    if (!metadata || !metadata.format) return fileBuffer;

    // Skip if already optimized WebP
    if (metadata.format === 'webp' && fileBuffer.length < 100 * 1024) {
      return fileBuffer;
    }

    const maxWidth = 1920;
    const shouldResize = metadata.width && metadata.width > maxWidth;

    let pipeline = image;

    if (shouldResize) {
      pipeline = pipeline.resize(maxWidth, undefined, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    const optimizedBuffer = await pipeline
      .webp({ 
        quality: 85,
        effort: 4,
        smartSubsample: true
      })
      .toBuffer();

    // Use original if optimization increased size
    if (optimizedBuffer.length > fileBuffer.length) return fileBuffer;

    return optimizedBuffer;
  } catch (error: any) {
    console.error("Sharp optimization error:", error?.message);
    return fileBuffer;
  }
};

export const uploadToCloudinary = async (fileBuffer: Buffer, folder: string): Promise<UploadApiResponse> => {
  return new Promise<UploadApiResponse>(async (resolve, reject) => {
    if (!fileBuffer || fileBuffer.length === 0) {
      return reject(new Error("Invalid file buffer"));
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return reject(new Error("Cloudinary credentials not configured"));
    }

    try {
      const optimizedBuffer = await optimizeImage(fileBuffer);

      cloudinary.uploader
        .upload_stream(
          {
            folder: folder || "Epharma",
            resource_type: "image",
            format: "webp"
          },
          (error, result) => {
            if (error) {
              console.error("Cloudinary upload error:", error);
              return reject(error);
            }
            if (result) {
              resolve(result);
            } else {
              reject(new Error("Upload failed - no result"));
            }
          }
        )
        .end(optimizedBuffer);
    } catch (error: any) {
      console.error("Image upload error:", error?.message);
      reject(error);
    }
  });
};
