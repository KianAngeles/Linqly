const mongoose = require("mongoose");

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
    requireAdminApproval: { type: Boolean, default: false },
    allowAnyoneCall: { type: Boolean, default: true },
    nicknames: { type: Map, of: String, default: {} },
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

// Helpful indexes
chatSchema.index({ members: 1 });
chatSchema.index({ type: 1, lastMessageAt: -1 });
chatSchema.index({ "ongoingCall.callId": 1 });

module.exports = mongoose.model("Chat", chatSchema);
