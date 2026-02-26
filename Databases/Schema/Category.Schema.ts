/*
┌───────────────────────────────────────────────────────────────────────┐
│  Defines product categories with unique name, title, and code for     │
│  organizing medicines. Supports multiple images, banners, view        │
│  tracking, and featured categories. Includes user references for      │
│  creation and updates with timestamps.                                │
└───────────────────────────────────────────────────────────────────────┘
*/

import { ICategory } from "../Entities/Category.interface";
import { Schema, Document } from "mongoose";

export const categorySchema = new Schema<ICategory & Document>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, "Category title is required"],
      trim: true,
      minlength: [2, "Title must have at least 2 characters"],
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      maxlength: [100, "Description cannot exceed 100 characters"],
    },
    imageUrl: {
      type: [String],
      required: true,
    },
    code: {
      type: String,

      unique: true,
      trim: true,
      minlength: [2, "Code must have at least 2 characters"],
      maxlength: [100, "Code cannot exceed 100 characters"],
    },
    bannerUrl: {
      type: [String],
      trim: true,
    },
    offerText: {
      type: String,
      required: [true, "Offer text is required"],
      trim: true,
      maxlength: [100, "Offer text cannot exceed 100 characters"],
    },
    priority: {
      type: Number,
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
    viewedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);
