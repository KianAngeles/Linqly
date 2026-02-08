const express = require("express");
const mongoose = require("mongoose");
const Chat = require("../models/Chat");
const ChatSetting = require("../models/ChatSetting");
const Message = require("../models/Message");
const MessageRequest = require("../models/MessageRequest");
const User = require("../models/User");
const { authRequired } = require("../middleware/authRequired");
const { getIO, onlineUsers } = require("../realtime");
const { makePairKey } = require("../utils/pairKey");
const { resolveAvatar } = require("../utils/avatar");
const {
  resolveDirectMessagePolicy,
  upsertRequestAfterDirectMessage,
  getRequestStatusForViewer,
  migrateLegacyDirectRequests,
} = require("../utils/messageRequests");

const router = express.Router();

function emitToUser(userId, event, payload) {
  if (!userId) return;
  const io = getIO();
  if (!io) return;
  const sockets = onlineUsers.get(String(userId));
  if (!sockets || sockets.size === 0) return;
  sockets.forEach((socketId) => io.to(socketId).emit(event, payload));
}

function mapMessage(doc) {
  return {
    id: doc._id,
    chatId: doc.chatId,
    sender: {
      id: doc.senderId?._id || doc.senderId,
      username: doc.senderId?.username || "Unknown",
      avatarUrl: resolveAvatar(doc.senderId),
    },
    type: doc.type,
    text: doc.text || "",
    imageUrl: doc.imageUrl || null,
    fileUrl: doc.fileUrl || null,
    fileName: doc.fileName || "",
    fileType: doc.fileType || "",
    fileSize: doc.fileSize || 0,
    createdAt: doc.createdAt,
    replyTo: doc.replyTo || null,
    replyPreview: doc.replyPreview || null,
    reactions: doc.reactions || [],
    mentions: doc.mentions || [],
  };
}

router.post("/", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { toUserId, text } = req.body || {};

  if (!toUserId) return res.status(400).json({ message: "toUserId required" });
  if (!mongoose.isValidObjectId(toUserId)) {
    return res.status(400).json({ message: "Invalid toUserId" });
  }
  if (String(toUserId) === String(me)) {
    return res.status(400).json({ message: "Cannot send request to yourself" });
  }

  const cleanText = String(text || "").trim();
  if (!cleanText) return res.status(400).json({ message: "Text required" });
  if (cleanText.length > 2000) {
    return res.status(400).json({ message: "Too long" });
  }

  const directKey = makePairKey(me, toUserId);
  let chat = await Chat.findOne({ type: "direct", directKey }).select(
    "_id type members directKey lastMessageAt lastMessageText"
  );
  if (!chat) {
    chat = await Chat.create({
      type: "direct",
      members: [me, toUserId],
      directKey,
      lastMessageAt: null,
      lastMessageText: "",
    });
  }

  const policy = await resolveDirectMessagePolicy({ chat, senderId: me });
  if (!policy.allowed) {
    return res.status(policy.code || 403).json({ message: policy.message || "Not allowed" });
  }

  const msg = await Message.create({
    chatId: chat._id,
    senderId: me,
    type: "text",
    text: cleanText,
    replyTo: null,
    replyPreview: { text: "", senderUsername: "" },
    reactions: [],
    mentions: [],
  });

  await Chat.updateOne(
    { _id: chat._id },
    {
      $set: {
        lastMessageAt: msg.createdAt,
        lastMessageText: cleanText,
        lastMessageId: msg._id,
        lastMessageSenderId: me,
      },
    }
  );

  await ChatSetting.updateMany(
    { chatId: chat._id, userId: { $ne: me }, hiddenAt: { $ne: null } },
    { $set: { hiddenAt: null } }
  );

  const requestDoc = await upsertRequestAfterDirectMessage({
    chat,
    policy,
    senderId: me,
    messageType: "text",
    messageText: cleanText,
    messageCreatedAt: msg.createdAt,
  });

  const senderUser = await User.findById(me).select("username avatarUrl");
  const io = getIO();
  if (io) {
    io.to(String(chat._id)).emit("message:new", {
      id: msg._id,
      chatId: chat._id,
      sender: {
        id: me,
        username: senderUser?.username || "You",
        avatarUrl: resolveAvatar(senderUser),
      },
      type: msg.type,
      text: msg.text,
      createdAt: msg.createdAt,
      replyTo: msg.replyTo,
      replyPreview: msg.replyPreview,
      reactions: msg.reactions,
      mentions: msg.mentions || [],
    });
  }

  if (policy.shouldCreatePendingRequest && requestDoc?.toUserId) {
    emitToUser(requestDoc.toUserId, "message_request:new", {
      requestId: requestDoc._id,
      chatId: requestDoc.chatId,
      fromUserId: requestDoc.fromUserId,
      toUserId: requestDoc.toUserId,
      status: requestDoc.status,
      lastMessageAt: requestDoc.lastMessageAt,
      lastMessageText: requestDoc.lastMessageText,
    });
  }

  res.status(201).json({
    request: requestDoc
      ? {
          id: requestDoc._id,
          chatId: requestDoc.chatId,
          status: requestDoc.status,
          direction: getRequestStatusForViewer(requestDoc, me),
          lastMessageAt: requestDoc.lastMessageAt,
          lastMessageText: requestDoc.lastMessageText,
        }
      : null,
    message: { id: msg._id, createdAt: msg.createdAt },
    chatId: chat._id,
  });
});

router.get("/", authRequired, async (req, res) => {
  const me = req.user.userId;
  const limit = Math.min(Math.max(parseInt(req.query.limit || "8", 10), 1), 50);

  const directChats = await Chat.find({ members: me, type: "direct" })
    .populate("members", "username email avatarUrl")
    .select("_id type members lastMessageAt lastMessageText");
  await migrateLegacyDirectRequests(directChats);

  const rows = await MessageRequest.find({
    toUserId: me,
    status: "pending",
  })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(limit)
    .populate("fromUserId", "username avatarUrl")
    .select(
      "_id chatId fromUserId toUserId status lastMessageAt lastMessageText createdAt updatedAt"
    );

  res.json({
    requests: rows.map((row) => ({
      id: row._id,
      chatId: row.chatId,
      status: row.status,
      direction: getRequestStatusForViewer(row, me),
      fromUser: row.fromUserId
        ? {
            id: row.fromUserId._id,
            username: row.fromUserId.username,
            avatarUrl: resolveAvatar(row.fromUserId),
          }
        : null,
      toUserId: row.toUserId,
      lastMessageAt: row.lastMessageAt || row.updatedAt || row.createdAt,
      lastMessageText: row.lastMessageText || "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
  });
});

router.get("/:id", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;
  const { cursor } = req.query;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid request id" });
  }

  const requestDoc = await MessageRequest.findById(id)
    .populate("fromUserId", "username avatarUrl")
    .populate("toUserId", "username avatarUrl")
    .select(
      "_id chatId fromUserId toUserId status lastMessageAt lastMessageText createdAt updatedAt"
    );
  if (!requestDoc) return res.status(404).json({ message: "Request not found" });

  const isParticipant =
    String(requestDoc.fromUserId?._id || "") === String(me) ||
    String(requestDoc.toUserId?._id || "") === String(me);
  if (!isParticipant) return res.status(403).json({ message: "Not allowed" });

  if (
    requestDoc.status === "declined" &&
    String(requestDoc.toUserId?._id || "") === String(me)
  ) {
    return res.status(404).json({ message: "Request not found" });
  }

  if (!requestDoc.chatId || !mongoose.isValidObjectId(requestDoc.chatId)) {
    return res.json({
      request: {
        id: requestDoc._id,
        chatId: null,
        status: requestDoc.status,
        direction: getRequestStatusForViewer(requestDoc, me),
      },
      messages: [],
      nextCursor: null,
    });
  }

  const limit = 30;
  const query = { chatId: requestDoc.chatId };
  if (cursor) {
    const dt = new Date(cursor);
    if (!Number.isNaN(dt.getTime())) query.createdAt = { $lt: dt };
  }
  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("senderId", "username avatarUrl")
    .select(
      "_id chatId senderId type text imageUrl fileUrl fileName fileType fileSize createdAt replyTo replyPreview reactions mentions"
    );
  const nextCursor = messages.length ? messages[messages.length - 1].createdAt : null;

  res.json({
    request: {
      id: requestDoc._id,
      chatId: requestDoc.chatId,
      status: requestDoc.status,
      direction: getRequestStatusForViewer(requestDoc, me),
      fromUser: requestDoc.fromUserId
        ? {
            id: requestDoc.fromUserId._id,
            username: requestDoc.fromUserId.username,
            avatarUrl: resolveAvatar(requestDoc.fromUserId),
          }
        : null,
      toUser: requestDoc.toUserId
        ? {
            id: requestDoc.toUserId._id,
            username: requestDoc.toUserId.username,
            avatarUrl: resolveAvatar(requestDoc.toUserId),
          }
        : null,
      lastMessageAt: requestDoc.lastMessageAt || requestDoc.updatedAt || requestDoc.createdAt,
      lastMessageText: requestDoc.lastMessageText || "",
    },
    messages: messages.map(mapMessage),
    nextCursor,
  });
});

router.post("/:id/accept", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid request id" });
  }

  const requestDoc = await MessageRequest.findById(id).select(
    "_id fromUserId toUserId status chatId"
  );
  if (!requestDoc) return res.status(404).json({ message: "Request not found" });
  if (String(requestDoc.toUserId) !== String(me)) {
    return res.status(403).json({ message: "Only recipient can accept" });
  }
  if (requestDoc.status !== "pending") {
    return res.status(409).json({ message: "Request is not pending" });
  }

  let chat = null;
  if (requestDoc.chatId) {
    chat = await Chat.findById(requestDoc.chatId).select("_id type members directKey");
  }
  if (!chat) {
    const directKey = makePairKey(requestDoc.fromUserId, requestDoc.toUserId);
    chat = await Chat.findOne({ type: "direct", directKey }).select(
      "_id type members directKey"
    );
    if (!chat) {
      chat = await Chat.create({
        type: "direct",
        members: [requestDoc.fromUserId, requestDoc.toUserId],
        directKey,
        lastMessageAt: null,
        lastMessageText: "",
      });
    }
  }

  await MessageRequest.updateOne(
    { _id: requestDoc._id, status: "pending" },
    {
      $set: {
        status: "accepted",
        chatId: chat._id,
      },
    }
  );

  await ChatSetting.updateMany(
    {
      chatId: chat._id,
      userId: { $in: [requestDoc.fromUserId, requestDoc.toUserId] },
      hiddenAt: { $ne: null },
    },
    { $set: { hiddenAt: null } }
  );

  const payload = {
    requestId: requestDoc._id,
    chatId: chat._id,
    fromUserId: requestDoc.fromUserId,
    toUserId: requestDoc.toUserId,
    status: "accepted",
  };
  emitToUser(requestDoc.fromUserId, "message_request:accepted", payload);
  emitToUser(requestDoc.toUserId, "message_request:accepted", payload);
  emitToUser(requestDoc.fromUserId, "chat:activated", { chatId: chat._id });
  emitToUser(requestDoc.toUserId, "chat:activated", { chatId: chat._id });

  res.json({ ok: true, chatId: chat._id, requestId: requestDoc._id });
});

router.post("/:id/decline", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid request id" });
  }

  const requestDoc = await MessageRequest.findById(id).select(
    "_id fromUserId toUserId status chatId"
  );
  if (!requestDoc) return res.status(404).json({ message: "Request not found" });
  if (String(requestDoc.toUserId) !== String(me)) {
    return res.status(403).json({ message: "Only recipient can decline" });
  }
  if (requestDoc.status !== "pending") {
    return res.status(409).json({ message: "Request is not pending" });
  }

  await MessageRequest.updateOne(
    { _id: requestDoc._id, status: "pending" },
    { $set: { status: "declined" } }
  );

  if (requestDoc.chatId) {
    await ChatSetting.findOneAndUpdate(
      { chatId: requestDoc.chatId, userId: me },
      { $set: { hiddenAt: new Date() } },
      { upsert: true, new: true }
    );
  }

  emitToUser(requestDoc.fromUserId, "message_request:declined", {
    requestId: requestDoc._id,
    chatId: requestDoc.chatId || null,
    fromUserId: requestDoc.fromUserId,
    toUserId: requestDoc.toUserId,
    status: "declined",
  });

  res.json({ ok: true, requestId: requestDoc._id });
});

router.post("/:id/ignore", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid request id" });
  }

  const requestDoc = await MessageRequest.findById(id).select(
    "_id fromUserId toUserId status chatId"
  );
  if (!requestDoc) return res.status(404).json({ message: "Request not found" });
  if (String(requestDoc.toUserId) !== String(me)) {
    return res.status(403).json({ message: "Only recipient can ignore" });
  }

  res.json({
    ok: true,
    request: {
      id: requestDoc._id,
      chatId: requestDoc.chatId,
      status: requestDoc.status,
      direction: getRequestStatusForViewer(requestDoc, me),
    },
  });
});

module.exports = router;
