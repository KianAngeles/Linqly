const mongoose = require("mongoose");

const chatSettingSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    isPinned: { type: Boolean, default: false },
    isMuted: { type: Boolean, default: false },
    isIgnored: { type: Boolean, default: false },
    
    // "Delete for me" = hide chat from my list
    hiddenAt: { type: Date, default: null },

    // "Kicked from chat" history access (read-only up to removedAt)
    removedAt: { type: Date, default: null },
    removedLastMessageAt: { type: Date, default: null },
    removedLastMessageText: { type: String, default: "" },
    removedLastMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    removedLastMessageSenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

chatSettingSchema.index({ chatId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("ChatSetting", chatSettingSchema);
