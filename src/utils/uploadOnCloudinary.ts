import { UploadApiResponse, UploadApiOptions } from "cloudinary";
import cloudinary from "../config/env";
import fs from "fs";

export const uploadOnCloudinary = async (
  localFilePath: string,
  options: UploadApiOptions = {}
): Promise<UploadApiResponse | null> => {
  try {
    if (!localFilePath) return null;

    const response: UploadApiResponse = await cloudinary.uploader.upload(
      localFilePath,
      { resource_type: "auto", ...options }
    );

    fs.unlinkSync(localFilePath);
    return response;
  } catch (error: any) {
    console.error("Cloudinary upload error:", error.message);
    if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);
    return null;
  }
};

export const uploadBufferOnCloudinary = async (
  buffer: Buffer,
  options: UploadApiOptions = {}
): Promise<UploadApiResponse | null> => {
  return new Promise((resolve) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: "auto", ...options },
      (error, result) => {
        if (error) {
          console.error("Cloudinary buffer upload error:", error.message);
          resolve(null);
        } else {
          resolve(result as UploadApiResponse);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

export const deleteFromCloudinary = async (
  publicId: string
): Promise<{ result: string } | null> => {
  try {
    const response = await cloudinary.uploader.destroy(publicId);
    return response;
  } catch (error: any) {
    console.error("Cloudinary delete error:", error.message);
    return null;
  }
};
