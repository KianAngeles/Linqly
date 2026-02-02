const mongoose = require("mongoose");

const chatReadSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    lastReadMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      required: true,
    },
    readAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

chatReadSchema.index({ chatId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("ChatRead", chatReadSchema);
