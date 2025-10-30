import { cloudinary } from "../config/cloudinary";
import { ApiError } from "./ApiError";

interface UploadOptions {
  folder?: string;
  resource_type?: "image" | "video" | "raw" | "auto";
  public_id?: string;
}


export const uploadToCloudinary = async (
  fileBuffer: Buffer,
  options: UploadOptions = {}
): Promise<{ secure_url: string; public_id: string }> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || "Epharma/profiles",
        resource_type: options.resource_type || "image",
        public_id: options.public_id,
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          reject(new ApiError(500, `Failed to upload file: ${error.message}`));
        } else if (result) {
          resolve({
            secure_url: result.secure_url,
            public_id: result.public_id,
          });
        } else {
          reject(new ApiError(500, "Unknown error during upload"));
        }
      }
    );

    uploadStream.end(fileBuffer);
  });
};


export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    if (result.result !== "ok") {
      console.warn(`Warning: File ${publicId} deletion result: ${result.result}`);
    }
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error);
    throw new ApiError(500, "Failed to delete file from Cloudinary");
  }
};


export const uploadMultipleToCloudinary = async (
  fileBuffers: Buffer[],
  folder: string = "Epharma/profiles"
): Promise<{ secure_url: string; public_id: string }[]> => {
  const uploadPromises = fileBuffers.map((buffer) =>
    uploadToCloudinary(buffer, { folder })
  );

  try {
    return await Promise.all(uploadPromises);
  } catch (error) {
    console.error("Error uploading multiple files:", error);
    throw error;
  }
};
