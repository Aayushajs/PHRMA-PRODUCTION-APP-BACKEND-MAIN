import { Schema } from "mongoose";

// Base Category Interface
export interface ICategory {
  _id?: string;
  name: string;
  title: string;
  description?: string;
  imageUrl: string[];
  code: string;
  bannerUrl: string[];
  offerText: string;
  priority: number;
  views: number;
  viewedBy: Schema.Types.ObjectId[];
  isFeatured: boolean;
  isActive: boolean;
  createdBy: Schema.Types.ObjectId;
  updatedBy: Schema.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

// Simple Category (for list APIs)
export interface ICategorySimple {
  _id: string;
  name: string;
  imageUrl: string | null;
}

// Pagination interface
export interface IPagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// Bulk operations
export interface IBulkTogglePayload {
  categoryIds: string[];
  isActive: boolean;
}

// Service method return types
export type CategoryServiceResponse = Promise<any>;

// Constants
export const CATEGORY_CONSTANTS = {
  CACHE_PREFIX: 'categories',
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  LIST_CACHE_TTL: 300,
  MAX_IMAGES: 5,
  MAX_BANNERS: 3,
  CLOUDINARY_FOLDERS: {
    IMAGES: 'categories/images',
    BANNERS: 'categories/banners'
  }
} as const;
