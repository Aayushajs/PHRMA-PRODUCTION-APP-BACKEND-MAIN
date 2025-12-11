import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * FCM Token interface
 */
export interface IFcmToken extends Document {
  token: string;
  userId?: string;
  deviceId?: string;
  platform?: 'ios' | 'android' | 'web';
  createdAt: Date;
  updatedAt: Date;
  lastUsed?: Date;
  touch(): Promise<void>;
}

export interface IFcmTokenModel extends Model<IFcmToken> {
  findByUserId(userId: string): Promise<IFcmToken[]>;
  removeToken(token: string): Promise<boolean>;
  removeTokens(tokens: string[]): Promise<number>;
  touchToken(token: string): Promise<void>;
}


/**
 * FCM Token Schema
 * Stores Firebase Cloud Messaging tokens for push notifications
 */
const FcmTokenSchema: Schema<IFcmToken> = new Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      index: true,
      sparse: true, // Allow null/undefined
    },
    deviceId: {
      type: String,
      index: true,
      sparse: true,
    },
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
    },
    lastUsed: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for querying tokens by userId
FcmTokenSchema.index({ userId: 1, createdAt: -1 });

// TTL index to auto-delete tokens older than 90 days of inactivity
FcmTokenSchema.index({ lastUsed: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

/**
 * Static methods
 */
FcmTokenSchema.statics = {
  /**
   * Find all tokens for a user
   */
  async findByUserId(userId: string): Promise<IFcmToken[]> {
    return this.find({ userId }).sort({ createdAt: -1 });
  },

  /**
   * Remove a specific token
   */
  async removeToken(token: string): Promise<boolean> {
    const result = await this.deleteOne({ token });
    return result.deletedCount > 0;
  },

  /**
   * Remove multiple tokens (e.g., stale tokens)
   */
  async removeTokens(tokens: string[]): Promise<number> {
    const result = await this.deleteMany({ token: { $in: tokens } });
    return result.deletedCount;
  },

  /**
   * Update lastUsed timestamp
   */
  async touchToken(token: string): Promise<void> {
    await this.updateOne({ token }, { $set: { lastUsed: new Date() } });
  },
};

/**
 * Instance methods
 */
FcmTokenSchema.methods = {
  /**
   * Update last used timestamp
   */
  async touch(): Promise<void> {
    this.lastUsed = new Date();
    await this.save();
  },
};

export const FcmTokenModel: Model<IFcmToken> = mongoose.model<IFcmToken>('FcmToken', FcmTokenSchema);
