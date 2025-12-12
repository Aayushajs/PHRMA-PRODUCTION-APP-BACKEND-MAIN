/*
┌───────────────────────────────────────────────────────────────────────┐
│  Category Types - Type definitions and interfaces for Category module.│
└───────────────────────────────────────────────────────────────────────┘
*/
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
};
