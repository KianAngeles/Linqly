const mongoose = require("mongoose");

const friendshipSchema = new mongoose.Schema(
  {
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // A normalized "pair key" so (A,B) and (B,A) are treated as the same pair
    pairKey: { type: String, required: true },

    status: {
      type: String,
      enum: ["pending", "accepted", "blocked"],
      default: "pending",
      required: true,
    },

    blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Only one friendship per pair of users
friendshipSchema.index({ pairKey: 1 }, { unique: true });

// Useful for listing quickly
friendshipSchema.index({ requesterId: 1, status: 1 });
friendshipSchema.index({ receiverId: 1, status: 1 });

module.exports = mongoose.model("Friendship", friendshipSchema);
