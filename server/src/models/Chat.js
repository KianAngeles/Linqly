const mongoose = require("mongoose");
const { decryptText, encryptText } = require("../utils/messageCrypto");

const ongoingCallSchema = new mongoose.Schema(
  {
    callId: { type: String, default: "" },
    callType: { type: String, enum: ["audio"], default: "audio" },
    startedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    startedByName: { type: String, default: "" },
    startedAt: { type: Date, default: Date.now },
    participantUserIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    participantNames: [{ type: String, default: "" }],
    participantCount: { type: Number, default: 0 },
  },
  { _id: false }
);

const chatSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["direct", "group", "hangout"],
      required: true,
    },

    // members in the chat
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],

    // Optional group name (group chats only)
    name: { type: String, default: "" },
    avatarUrl: { type: String, default: null },
    avatarPublicId: { type: String, default: null },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    pendingJoinRequests: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        requestedAt: { type: Date, default: Date.now },
      },
    ],
    groupMemberAddEvents: [
      {
        addedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        addedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    groupJoinInviteRequestEvents: [
      {
        requestedByUserId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        requestedAt: { type: Date, default: Date.now },
        status: {
          type: String,
          enum: ["pending", "approved", "declined"],
          default: "pending",
        },
        resolvedAt: { type: Date, default: null },
        resolvedByUserId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
      },
    ],
    requireAdminApproval: { type: Boolean, default: false },
    allowAnyoneCall: { type: Boolean, default: true },
    nicknames: { type: Map, of: String, default: {} },
    defaultSendEmoji: { type: String, default: "👍" },
    ongoingCall: { type: ongoingCallSchema, default: null },

    // For direct chat uniqueness: makePairKey(userA, userB)
    directKey: { type: String, unique: true, sparse: true },

    // Only for hangout chat later
    hangoutId: { type: mongoose.Schema.Types.ObjectId, ref: "Hangout", default: null },

    lastMessageAt: { type: Date, default: null },
    lastMessageText: { type: String, default: "" },
    lastMessageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    lastMessageSenderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

function encryptChatDocFields(doc) {
  if (!doc) return;
  if (typeof doc.lastMessageText === "string") {
    doc.lastMessageText = encryptText(doc.lastMessageText);
  }
}

function decryptChatDocFields(doc) {
  if (!doc) return;
  if (typeof doc.lastMessageText === "string") {
    doc.lastMessageText = decryptText(doc.lastMessageText);
  }
}

function encryptChatUpdate(update) {
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

// Helpful indexes
chatSchema.index({ members: 1 });
chatSchema.index({ type: 1, lastMessageAt: -1 });
chatSchema.index({ "ongoingCall.callId": 1 });

chatSchema.pre("save", function onPreSave() {
  encryptChatDocFields(this);
});

chatSchema.post("init", function onInit(doc) {
  decryptChatDocFields(doc);
});

chatSchema.post("save", function onSave(doc) {
  decryptChatDocFields(doc);
});

["updateOne", "updateMany", "findOneAndUpdate"].forEach((hook) => {
  chatSchema.pre(hook, function onUpdate() {
    const update = this.getUpdate();
    if (update) {
      this.setUpdate(encryptChatUpdate(update));
    }
  });
});

module.exports = mongoose.model("Chat", chatSchema);
