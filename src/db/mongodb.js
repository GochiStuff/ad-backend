import mongoose from "mongoose";
import dotenv from "dotenv";

// Load environment variables safely
dotenv.config();

// Use a fallback or warning if no URI is provided
const MONGODB_URI = process.env.DB_URI || process.env.MONGODB_URI;

export async function connectDB() {
  if (!MONGODB_URI) {
    console.warn("[MongoDB] Warning: No MongoDB URI found. Skipping connection.");
    return;
  }

  if (mongoose.connection.readyState >= 1) {
    console.log("[MongoDB] Already connected.");
    return;
  }

  mongoose.connection.on("connected", () => {
    console.log("[MongoDB] Connected successfully.");
  });

  mongoose.connection.on("error", (err) => {
    console.error(`[MongoDB] Connection error: ${err.message}`);
  });

  mongoose.connection.on("disconnected", () => {
    console.log("[MongoDB] Disconnected.");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("[MongoDB] Reconnected.");
  });

  try {
    await mongoose.connect(MONGODB_URI, {
      // Optional recommended options
      useNewUrlParser: true,
      useUnifiedTopology: true,
      autoIndex: false,
      serverSelectionTimeoutMS: 10000,
    });
  } catch (error) {
    console.error(`[MongoDB] Initial connection error: ${error.message}`);
    // Don’t crash app on open-source version
    console.warn("[MongoDB] Skipping DB connection (dev/FOSS mode).");
  }
}
