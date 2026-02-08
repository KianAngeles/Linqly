const mongoose = require("mongoose");

const groupCallNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    callId: { type: String, required: true },
    chatName: { type: String, default: "" },
    actorName: { type: String, default: "" },
    callStatus: {
      type: String,
      enum: ["started", "ended"],
      default: "started",
    },
  },
  { timestamps: true }
);

groupCallNotificationSchema.index({ userId: 1, createdAt: -1 });
groupCallNotificationSchema.index({ chatId: 1, callId: 1 });

module.exports = mongoose.model(
  "GroupCallNotification",
  groupCallNotificationSchema
);
