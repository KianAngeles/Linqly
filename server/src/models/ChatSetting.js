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
  },
  { timestamps: true }
);

chatSettingSchema.index({ chatId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("ChatSetting", chatSettingSchema);
