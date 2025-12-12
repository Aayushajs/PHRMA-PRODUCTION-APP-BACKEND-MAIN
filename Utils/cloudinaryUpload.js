/*
┌───────────────────────────────────────────────────────────────────────┐
│  Cloudinary Upload Utility - Helper for uploading files to Cloudinary.│
└───────────────────────────────────────────────────────────────────────┘
*/
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
dotenv.config({ path: './config/.env' });
// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
export const uploadToCloudinary = async (fileBuffer, folder) => {
    return new Promise((resolve, reject) => {
        // Validate input
        if (!fileBuffer || fileBuffer.length === 0) {
            return reject(new Error("Invalid file buffer"));
        }
        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
            return reject(new Error("Cloudinary credentials not configured"));
        }
        cloudinary.uploader
            .upload_stream({
            folder: folder || "Epharma",
            resource_type: "image"
        }, (error, result) => {
            if (error) {
                console.error("Cloudinary upload error:", error);
                return reject(error);
            }
            if (result) {
                resolve(result);
            }
            else {
                reject(new Error("Upload failed - no result"));
            }
        })
            .end(fileBuffer);
    });
};
