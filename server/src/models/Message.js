const mongoose = require("mongoose");
const { decryptText, encryptText } = require("../utils/messageCrypto");

const messageSchema = new mongoose.Schema(
  {
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    type: {
      type: String,
      enum: ["text", "system", "image", "video", "file", "audio", "call_log"],
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
    // Mixed is required for group call logs because they include additional
    // metadata (scope, status, participants, starter info, etc.).
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

function encryptMessageDocFields(doc) {
  if (!doc) return;
  if (typeof doc.text === "string") {
    doc.text = encryptText(doc.text);
  }
  if (doc.replyPreview && typeof doc.replyPreview.text === "string") {
    doc.replyPreview.text = encryptText(doc.replyPreview.text);
  }
}

function decryptMessageDocFields(doc) {
  if (!doc) return;
  if (typeof doc.text === "string") {
    doc.text = decryptText(doc.text);
  }
  if (doc.replyPreview && typeof doc.replyPreview.text === "string") {
    doc.replyPreview.text = decryptText(doc.replyPreview.text);
  }
}

function encryptMessageUpdate(update) {
  if (!update || Array.isArray(update)) return update;

  if (typeof update.text === "string") {
    update.text = encryptText(update.text);
  }
  if (update.replyPreview && typeof update.replyPreview.text === "string") {
    update.replyPreview.text = encryptText(update.replyPreview.text);
  }

  if (update.$set && typeof update.$set === "object") {
    if (typeof update.$set.text === "string") {
      update.$set.text = encryptText(update.$set.text);
    }
    if (typeof update.$set["replyPreview.text"] === "string") {
      update.$set["replyPreview.text"] = encryptText(update.$set["replyPreview.text"]);
    }
  }

  return update;
}

// Cursor/pagination index
messageSchema.index({ chatId: 1, createdAt: -1 });

messageSchema.pre("save", function onPreSave(next) {
  encryptMessageDocFields(this);
  next();
});

messageSchema.post("init", function onInit(doc) {
  decryptMessageDocFields(doc);
});

messageSchema.post("save", function onSave(doc, next) {
  decryptMessageDocFields(doc);
  next();
});

["updateOne", "updateMany", "findOneAndUpdate"].forEach((hook) => {
  messageSchema.pre(hook, function onUpdate(next) {
    const update = this.getUpdate();
    if (update) {
      this.setUpdate(encryptMessageUpdate(update));
    }
    next();
  });
});

module.exports = mongoose.model("Message", messageSchema);
