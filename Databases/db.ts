/*
┌───────────────────────────────────────────────────────────────────────┐
│  Database Connection - Mongoose configuration and connection logic.   │
│  Handles connection to MongoDB Atlas or local instance based on ENV.  │
└───────────────────────────────────────────────────────────────────────┘
*/

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: './config/.env' });

export const connectDB = async (): Promise<void> => {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error("MONGO_URI is not defined in .env file");
    }

    const isAtlas = uri.includes('mongodb.net') || uri.includes('atlas');
    const isLocal = uri.includes('localhost') || uri.includes('127.0.0.1');

    const connectionOptions: any = {
      dbName: "e-pharmacy",
    };

    if (isAtlas || uri.includes('ssl=true') || uri.includes('tls=true')) {
      connectionOptions.ssl = true;
      connectionOptions.tls = true;
      // SECURITY (F-09): TLS certificate validation must be ENABLED for any
      // public Atlas / TLS-enabled cluster. Setting the two flags below to
      // `true` silently disables MITM protection. Only allow override via
      // explicit env (e.g. for self-signed local clusters during testing).
      const allowInvalidCerts = process.env.MONGO_TLS_ALLOW_INVALID === 'true';
      connectionOptions.tlsAllowInvalidCertificates = allowInvalidCerts;
      connectionOptions.tlsAllowInvalidHostnames = allowInvalidCerts;
    }

    if (isLocal) {
      connectionOptions.ssl = false;
      connectionOptions.tls = false;
    }

    await mongoose.connect(uri, connectionOptions);
    console.log("✅ MongoDB connected successfully");

  } catch (error: any) {
    console.error("MongoDB connection failed:", error.message);
    console.log("Server will continue without MongoDB connection");
  }
};
