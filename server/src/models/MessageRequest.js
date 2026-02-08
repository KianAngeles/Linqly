const mongoose = require("mongoose");

const messageRequestSchema = new mongoose.Schema(
  {
    fromUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    toUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
      required: true,
      index: true,
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
      unique: true,
      sparse: true,
    },
    lastMessageAt: { type: Date, default: null },
    lastMessageText: { type: String, default: "" },
    requesterMessageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

messageRequestSchema.index({ toUserId: 1, status: 1, lastMessageAt: -1 });
messageRequestSchema.index({ fromUserId: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model("MessageRequest", messageRequestSchema);
