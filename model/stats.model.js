import mongoose from "mongoose";

const statSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  totalFlights: Number,
  feedbacks: [String],
});

export const Stat = mongoose.model("Stat", statSchema);
