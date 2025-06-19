import mongoose from "mongoose";
import { DB_URI } from "../config/env.js";

const MONGODB_URI = DB_URI;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable inside .env");
}

export async function connectDB() {
  if (mongoose.connection.readyState >= 1) {
    console.log("[MongoDB] Already connected.");
    return;
  }

  mongoose.connection.on("connected", () => {
    console.log("[MongoDB] Connected successfully.");
  });

  mongoose.connection.on("error", (err) => {
    console.log(`[MongoDB] Connection error: ${err.message}`);
  });

  mongoose.connection.on("disconnected", () => {
    console.log("[MongoDB] Disconnected.");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("[MongoDB] Reconnected.");
  });

  try {
    await mongoose.connect(MONGODB_URI);

  } catch (error) {
    console.error(`[MongoDB] Initial connection error: ${error.message}`);
    throw error;
  }
}
