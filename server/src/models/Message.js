const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    type: {
      type: String,
      enum: ["text", "system", "image", "video", "file", "audio"],
      default: "text",
    },

    text: { type: String, default: "" },
    imageUrl: { type: String, default: "" }, // later
    imagePublicId: { type: String, default: "" },
    fileUrl: { type: String, default: "" },
    fileName: { type: String, default: "" },
    fileType: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
    filePublicId: { type: String, default: "" },
    fileResourceType: { type: String, default: "" },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    replyPreview: {
      text: { type: String, default: "" },
      senderUsername: { type: String, default: "" },
    },
    mentions: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        username: { type: String, required: true },
      },
    ],
    reactions: [
      {
        emoji: { type: String, required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      },
    ],
  },
  { timestamps: true }
);

// Cursor/pagination index
messageSchema.index({ chatId: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
