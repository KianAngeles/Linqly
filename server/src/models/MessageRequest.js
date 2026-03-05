const mongoose = require("mongoose");
const { decryptText, encryptText } = require("../utils/messageCrypto");

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

function encryptRequestDocFields(doc) {
  if (!doc) return;
  if (typeof doc.lastMessageText === "string") {
    doc.lastMessageText = encryptText(doc.lastMessageText);
  }
}

function decryptRequestDocFields(doc) {
  if (!doc) return;
  if (typeof doc.lastMessageText === "string") {
    doc.lastMessageText = decryptText(doc.lastMessageText);
  }
}

function encryptRequestUpdate(update) {
  if (!update || Array.isArray(update)) return update;

  if (typeof update.lastMessageText === "string") {
    update.lastMessageText = encryptText(update.lastMessageText);
  }

  if (update.$set && typeof update.$set === "object") {
    if (typeof update.$set.lastMessageText === "string") {
      update.$set.lastMessageText = encryptText(update.$set.lastMessageText);
    }
  }

  if (update.$setOnInsert && typeof update.$setOnInsert === "object") {
    if (typeof update.$setOnInsert.lastMessageText === "string") {
      update.$setOnInsert.lastMessageText = encryptText(update.$setOnInsert.lastMessageText);
    }
  }

  return update;
}

messageRequestSchema.index({ toUserId: 1, status: 1, lastMessageAt: -1 });
messageRequestSchema.index({ fromUserId: 1, status: 1, updatedAt: -1 });

messageRequestSchema.pre("save", function onPreSave() {
  encryptRequestDocFields(this);
});

messageRequestSchema.post("init", function onInit(doc) {
  decryptRequestDocFields(doc);
});

messageRequestSchema.post("save", function onSave(doc) {
  decryptRequestDocFields(doc);
});

["updateOne", "updateMany", "findOneAndUpdate"].forEach((hook) => {
  messageRequestSchema.pre(hook, function onUpdate() {
    const update = this.getUpdate();
    if (update) {
      this.setUpdate(encryptRequestUpdate(update));
    }
  });
});

module.exports = mongoose.model("MessageRequest", messageRequestSchema);
