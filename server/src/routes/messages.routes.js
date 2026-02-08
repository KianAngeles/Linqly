const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const { authRequired } = require("../middleware/authRequired");
const { getIO, onlineUsers } = require("../realtime");
const ChatSetting = require("../models/ChatSetting");
const MessageRequest = require("../models/MessageRequest");
const User = require("../models/User");
const { resolveAvatar } = require("../utils/avatar");
const cloudinary = require("../utils/cloudinary");
const {
  resolveDirectMessagePolicy,
  upsertRequestAfterDirectMessage,
} = require("../utils/messageRequests");
const http = require("http");
const https = require("https");

const router = express.Router();
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!okTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and WEBP images are allowed"));
    }
    cb(null, true);
  },
});

const uploadFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okTypes = [
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
    ];
    if (!okTypes.includes(file.mimetype)) {
      return cb(new Error("Unsupported file type"));
    }
    cb(null, true);
  },
});

const uploadVoice = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okTypes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/webm",
      "audio/ogg",
      "audio/wav",
    ];
    if (!okTypes.includes(file.mimetype)) {
      return cb(new Error("Unsupported audio type"));
    }
    cb(null, true);
  },
});

function uploadToCloudinary(fileBuffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
}

function extractLinks(text) {
  if (!text) return [];
  const matches = String(text).match(/https?:\/\/[^\s]+/gi);
  return matches ? matches.map((m) => m.replace(/[),.;!?]+$/, "")) : [];
}

function emitToUser(userId, event, payload) {
  if (!userId) return;
  const io = getIO();
  if (!io) return;
  const sockets = onlineUsers.get(String(userId));
  if (!sockets || sockets.size === 0) return;
  sockets.forEach((socketId) => io.to(socketId).emit(event, payload));
}

async function canViewChatMessages({ chatId, viewerId }) {
  const requestDoc = await MessageRequest.findOne({ chatId }).select("status toUserId");
  if (!requestDoc) return true;
  if (
    requestDoc.status === "declined" &&
    String(requestDoc.toUserId || "") === String(viewerId || "")
  ) {
    return false;
  }
  return true;
}


/**
 * GET /messages/attachments?chatId=...&kind=media|files|links&limit=...
 */
router.get("/attachments", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId, kind } = req.query;
  const limit = Math.min(parseInt(req.query.limit || "12", 10), 50);

  if (!chatId) return res.status(400).json({ message: "chatId required" });
  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }

  const chat = await Chat.findById(chatId).select("members");
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  const isMember = chat.members.some((m) => String(m) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });
  const canView = await canViewChatMessages({ chatId, viewerId: me });
  if (!canView) return res.status(404).json({ message: "Chat not found" });

  if (!["media", "files", "links"].includes(kind)) {
    return res.status(400).json({ message: "Invalid kind" });
  }

  if (kind === "media") {
    const docs = await Message.find({
      chatId,
      type: { $in: ["image", "video"] },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("senderId", "username avatarUrl")
      .select("type imageUrl fileUrl createdAt senderId");

    const items = docs.map((m) => ({
      id: m._id,
      type: m.type,
      url: m.type === "image" ? m.imageUrl : m.fileUrl,
      createdAt: m.createdAt,
      sender: {
        id: m.senderId?._id,
        username: m.senderId?.username || "Unknown",
        avatarUrl: resolveAvatar(m.senderId),
      },
    }));

    return res.json({ items });
  }

  if (kind === "files") {
    const docs = await Message.find({
      chatId,
      type: "file",
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("senderId", "username avatarUrl")
      .select("fileUrl fileName fileType fileSize createdAt senderId");

    const items = docs.map((m) => ({
      id: m._id,
      fileUrl: m.fileUrl,
      fileName: m.fileName || "file",
      fileType: m.fileType || "",
      fileSize: m.fileSize || 0,
      createdAt: m.createdAt,
      sender: {
        id: m.senderId?._id,
        username: m.senderId?.username || "Unknown",
        avatarUrl: resolveAvatar(m.senderId),
      },
    }));

    return res.json({ items });
  }

  const docs = await Message.find({
    chatId,
    type: "text",
    text: { $regex: /https?:\/\//i },
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("senderId", "username avatarUrl")
    .select("text createdAt senderId");

  const items = [];
  for (const m of docs) {
    const links = extractLinks(m.text);
    links.forEach((url) => {
      if (items.length < limit) {
        items.push({
          id: m._id,
          url,
          text: m.text || "",
          createdAt: m.createdAt,
          sender: {
            id: m.senderId?._id,
            username: m.senderId?.username || "Unknown",
            avatarUrl: resolveAvatar(m.senderId),
          },
        });
      }
    });
    if (items.length >= limit) break;
  }

  return res.json({ items });
});


/**
 * GET /messages?chatId=...&cursor=...
 */
router.get("/", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId, cursor } = req.query;

  if (!chatId) return res.status(400).json({ message: "chatId required" });
  if (!mongoose.isValidObjectId(chatId))
    return res.status(400).json({ message: "Invalid chatId" });

  const chat = await Chat.findById(chatId)
    .populate("members", "username")
    .select("members");
  if (!chat) return res.status(404).json({ message: "Chat not found" });

  const isMember = chat.members.some(
    (m) => String(m._id || m) === String(me)
  );
  if (!isMember)
    return res.status(403).json({ message: "Not a member of this chat" });

  const limit = 30;
  const query = { chatId };

  if (cursor) {
    const dt = new Date(cursor);
    if (!isNaN(dt.getTime())) query.createdAt = { $lt: dt };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("senderId", "username avatarUrl")
    .select(
      "_id chatId senderId type text imageUrl fileUrl fileName fileType fileSize createdAt replyTo replyPreview reactions mentions meta"
    );

  const nextCursor = messages.length
    ? messages[messages.length - 1].createdAt
    : null;

  const out = messages.map((m) => ({
    id: m._id,
    chatId: m.chatId,
    sender: {
      id: m.senderId?._id,
      username: m.senderId?.username || "Unknown",
      avatarUrl: resolveAvatar(m.senderId),
    },
    type: m.type,
    text: m.text,
    imageUrl: m.imageUrl || null,
    fileUrl: m.fileUrl || null,
    fileName: m.fileName || "",
    fileType: m.fileType || "",
    fileSize: m.fileSize || 0,
    createdAt: m.createdAt,
    replyTo: m.replyTo || null,
    replyPreview: m.replyPreview || null,
    reactions: m.reactions || [],
    mentions: m.mentions || [],
    meta: m.meta || null,
  }));

  res.json({ messages: out, nextCursor });
});

/**
 * POST /messages { chatId, text, replyTo? }
 */
router.post("/", authRequired, async (req, res) => {
  const t0 = Date.now();
  const me = req.user.userId;
  const { chatId, text, replyTo } = req.body; // ✅ include replyTo

  if (!chatId) return res.status(400).json({ message: "chatId required" });
  if (!mongoose.isValidObjectId(chatId))
    return res.status(400).json({ message: "Invalid chatId" });

  const cleanText = String(text || "").trim();
  if (!cleanText) return res.status(400).json({ message: "Text required" });
  if (cleanText.length > 2000)
    return res.status(400).json({ message: "Too long" });

  const chat = await Chat.findById(chatId)
    .populate("members", "username")
    .select("members type");
  if (!chat) return res.status(404).json({ message: "Chat not found" });

  const isMember = chat.members.some(
    (m) => String(m._id || m) === String(me)
  );
  if (!isMember)
    return res.status(403).json({ message: "Not a member of this chat" });
  const canView = await canViewChatMessages({ chatId, viewerId: me });
  if (!canView) return res.status(404).json({ message: "Chat not found" });
  const policy = await resolveDirectMessagePolicy({ chat, senderId: me });
  if (!policy.allowed) {
    return res.status(policy.code || 403).json({ message: policy.message || "Not allowed" });
  }

  let replyPreview = { text: "", senderUsername: "" };
  let replyToId = null;

  if (replyTo) {
    if (!mongoose.isValidObjectId(replyTo)) {
      return res.status(400).json({ message: "Invalid replyTo" });
    }

    const original = await Message.findById(replyTo)
      .populate("senderId", "username")
      .select("chatId text senderId");

    if (!original)
      return res.status(404).json({ message: "Original message not found" });

    if (String(original.chatId) !== String(chatId)) {
      return res
        .status(400)
        .json({ message: "replyTo must be in the same chat" });
    }

    replyToId = original._id;
    replyPreview = {
      text: (original.text || "").slice(0, 120),
      senderUsername: original.senderId?.username || "Unknown",
    };
  }

  const mentions = [];
  if (cleanText) {
    const memberMap = new Map(
      (chat.members || []).map((m) => [
        String(m.username || "").toLowerCase(),
        { userId: m._id, username: m.username },
      ])
    );

    const seen = new Set();
    const re = /@([a-zA-Z0-9_]+)/g;
    let match;
    while ((match = re.exec(cleanText)) !== null) {
      const key = String(match[1] || "").toLowerCase();
      const hit = memberMap.get(key);
      if (hit && !seen.has(String(hit.userId))) {
        seen.add(String(hit.userId));
        mentions.push({ userId: hit.userId, username: hit.username });
      }
    }
  }

  const msg = await Message.create({
    chatId,
    senderId: me,
    type: "text",
    text: cleanText,
    replyTo: replyToId,
    replyPreview,
    reactions: [],
    mentions,
  });

  const senderUser = await User.findById(me).select("username avatarUrl");

  await ChatSetting.updateMany(
    { chatId, userId: { $ne: me }, hiddenAt: { $ne: null } },
    { $set: { hiddenAt: null } }
  );

  await Chat.updateOne(
    { _id: chatId },
    {
      $set: {
        lastMessageAt: msg.createdAt,
        lastMessageText: cleanText,
        lastMessageId: msg._id,
        lastMessageSenderId: me,
      },
    }
  );

  const requestDoc = await upsertRequestAfterDirectMessage({
    chat,
    policy,
    senderId: me,
    messageType: msg.type,
    messageText: msg.text,
    messageCreatedAt: msg.createdAt,
  });
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

  const io = getIO();
  if (io) {
    io.to(String(chatId)).emit("message:new", {
      id: msg._id,
      chatId,
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

  if (process.env.CHAT_DEBUG === "true") {
    console.log("[chat] send text", {
      chatId: String(chatId),
      userId: String(me),
      elapsedMs: Date.now() - t0,
    });
  }
  res.status(201).json({ message: { id: msg._id, createdAt: msg.createdAt } });
});

/**
 * POST /messages/system { chatId, text }
 */
router.post("/system", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId, text } = req.body;

  if (!chatId) return res.status(400).json({ message: "chatId required" });
  if (!mongoose.isValidObjectId(chatId))
    return res.status(400).json({ message: "Invalid chatId" });

  const cleanText = String(text || "").trim();
  if (!cleanText) return res.status(400).json({ message: "Text required" });
  if (cleanText.length > 2000)
    return res.status(400).json({ message: "Too long" });

  const chat = await Chat.findById(chatId).select("members");
  if (!chat) return res.status(404).json({ message: "Chat not found" });

  const isMember = chat.members.some(
    (m) => String(m._id || m) === String(me)
  );
  if (!isMember)
    return res.status(403).json({ message: "Not a member of this chat" });

  const msg = await Message.create({
    chatId,
    senderId: me,
    type: "system",
    text: cleanText,
    replyTo: null,
    replyPreview: { text: "", senderUsername: "" },
    reactions: [],
  });

  await Chat.updateOne(
    { _id: chatId },
    {
      $set: {
        lastMessageAt: msg.createdAt,
        lastMessageText: cleanText,
        lastMessageId: msg._id,
        lastMessageSenderId: me,
      },
    }
  );

  const io = getIO();
  if (io) {
    io.to(String(chatId)).emit("message:new", {
      id: msg._id,
      chatId,
      type: msg.type,
      text: msg.text,
      createdAt: msg.createdAt,
    });
  }

  res.json({ ok: true });
});

/**
 * POST /messages/call-log { chatId, callType, callStatus, durationSec? }
 */
router.post("/call-log", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId, callType, callStatus } = req.body || {};
  const durationRaw = Number(req.body?.durationSec);
  const durationSec = Number.isFinite(durationRaw)
    ? Math.max(0, Math.floor(durationRaw))
    : 0;

  if (!chatId) return res.status(400).json({ message: "chatId required" });
  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }
  if (callType !== "audio") {
    return res.status(400).json({ message: "Invalid callType" });
  }
  if (!["missed", "completed"].includes(String(callStatus || ""))) {
    return res.status(400).json({ message: "Invalid callStatus" });
  }

  const chat = await Chat.findById(chatId).select("members type");
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  if (chat.type !== "direct") {
    return res.status(400).json({ message: "Call logs are only supported for direct chats" });
  }

  const isMember = chat.members.some((m) => String(m._id || m) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member of this chat" });
  const canView = await canViewChatMessages({ chatId, viewerId: me });
  if (!canView) return res.status(404).json({ message: "Chat not found" });

  const cleanText = callStatus === "missed" ? "Missed audio call" : "Audio call";
  const msg = await Message.create({
    chatId,
    senderId: me,
    type: "call_log",
    text: cleanText,
    replyTo: null,
    replyPreview: { text: "", senderUsername: "" },
    reactions: [],
    mentions: [],
    meta: {
      callType: "audio",
      callStatus,
      durationSec,
    },
  });

  const senderUser = await User.findById(me).select("username avatarUrl");

  await Chat.updateOne(
    { _id: chatId },
    {
      $set: {
        lastMessageAt: msg.createdAt,
        lastMessageText: cleanText,
        lastMessageId: msg._id,
        lastMessageSenderId: me,
      },
    }
  );

  const io = getIO();
  if (io) {
    io.to(String(chatId)).emit("message:new", {
      id: msg._id,
      chatId,
      sender: {
        id: me,
        username: senderUser?.username || "You",
        avatarUrl: resolveAvatar(senderUser),
      },
      type: msg.type,
      text: msg.text,
      meta: msg.meta || null,
      createdAt: msg.createdAt,
      replyTo: msg.replyTo,
      replyPreview: msg.replyPreview,
      reactions: msg.reactions,
      mentions: msg.mentions || [],
    });
  }

  res.status(201).json({ message: { id: msg._id, createdAt: msg.createdAt } });
});

/**
 * POST /messages/image { chatId, replyTo? } + image file
 */
router.post("/image", authRequired, (req, res) => {
  uploadImage.single("image")(req, res, async (err) => {
    const me = req.user.userId;
    const { chatId, replyTo } = req.body;

    if (err) {
      return res.status(400).json({ message: err.message || "Upload failed" });
    }
    if (!chatId) return res.status(400).json({ message: "chatId required" });
    if (!mongoose.isValidObjectId(chatId)) {
      return res.status(400).json({ message: "Invalid chatId" });
    }
    if (!req.file) return res.status(400).json({ message: "Image required" });

    const chat = await Chat.findById(chatId)
      .populate("members", "username")
      .select("members type");
    if (!chat) return res.status(404).json({ message: "Chat not found" });

  const isMember = chat.members.some(
    (m) => String(m._id || m) === String(me)
  );
  if (!isMember)
    return res.status(403).json({ message: "Not a member of this chat" });
  const policy = await resolveDirectMessagePolicy({ chat, senderId: me });
  if (!policy.allowed) {
    return res.status(policy.code || 403).json({ message: policy.message || "Not allowed" });
  }

    let replyPreview = { text: "", senderUsername: "" };
    let replyToId = null;

    if (replyTo) {
      if (!mongoose.isValidObjectId(replyTo)) {
        return res.status(400).json({ message: "Invalid replyTo" });
      }

      const original = await Message.findById(replyTo)
        .populate("senderId", "username")
        .select("chatId text senderId");

      if (!original)
        return res.status(404).json({ message: "Original message not found" });

      if (String(original.chatId) !== String(chatId)) {
        return res
          .status(400)
          .json({ message: "replyTo must be in the same chat" });
      }

      replyToId = original._id;
      replyPreview = {
        text: (original.text || "").slice(0, 120),
        senderUsername: original.senderId?.username || "Unknown",
      };
    }

    let uploadResult;
    try {
      uploadResult = await uploadToCloudinary(req.file.buffer, {
        folder: "linqly/messages",
        resource_type: "image",
      });
    } catch (uploadErr) {
      return res
        .status(500)
        .json({ message: uploadErr.message || "Upload failed" });
    }

    const imageUrl = uploadResult.secure_url || uploadResult.url;
    const imagePublicId = uploadResult.public_id || "";
    const msg = await Message.create({
      chatId,
      senderId: me,
      type: "image",
      text: "",
      imageUrl,
      imagePublicId,
      replyTo: replyToId,
      replyPreview,
      reactions: [],
      mentions: [],
    });

    const senderUser = await User.findById(me).select("username avatarUrl");

    await ChatSetting.updateMany(
      { chatId, userId: { $ne: me }, hiddenAt: { $ne: null } },
      { $set: { hiddenAt: null } }
    );

  await Chat.updateOne(
    { _id: chatId },
    {
      $set: {
        lastMessageAt: msg.createdAt,
        lastMessageText: "[Image]",
        lastMessageId: msg._id,
        lastMessageSenderId: me,
      },
    }
  );

  const requestDoc = await upsertRequestAfterDirectMessage({
    chat,
    policy,
    senderId: me,
    messageType: msg.type,
    messageText: msg.text,
    messageCreatedAt: msg.createdAt,
  });
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

    const io = getIO();
    if (io) {
      io.to(String(chatId)).emit("message:new", {
        id: msg._id,
        chatId,
        sender: {
          id: me,
          username: senderUser?.username || "You",
          avatarUrl: resolveAvatar(senderUser),
        },
        type: msg.type,
        text: msg.text,
        imageUrl: msg.imageUrl,
        fileUrl: msg.fileUrl || null,
        fileName: msg.fileName || "",
        fileType: msg.fileType || "",
        fileSize: msg.fileSize || 0,
        createdAt: msg.createdAt,
        replyTo: msg.replyTo,
        replyPreview: msg.replyPreview,
        reactions: msg.reactions,
        mentions: msg.mentions || [],
      });
    }

    res.status(201).json({ message: { id: msg._id, createdAt: msg.createdAt } });
  });
});

/**
 * POST /messages/file { chatId, replyTo? } + file
 */
router.post("/file", authRequired, (req, res) => {
  uploadFile.single("file")(req, res, async (err) => {
    const me = req.user.userId;
    const { chatId, replyTo } = req.body;

    if (err) {
      return res.status(400).json({ message: err.message || "Upload failed" });
    }
    if (!chatId) return res.status(400).json({ message: "chatId required" });
    if (!mongoose.isValidObjectId(chatId)) {
      return res.status(400).json({ message: "Invalid chatId" });
    }
    if (!req.file) return res.status(400).json({ message: "File required" });

    const chat = await Chat.findById(chatId)
      .populate("members", "username")
      .select("members type");
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const isMember = chat.members.some(
      (m) => String(m._id || m) === String(me)
    );
    if (!isMember)
      return res.status(403).json({ message: "Not a member of this chat" });
    const policy = await resolveDirectMessagePolicy({ chat, senderId: me });
    if (!policy.allowed) {
      return res
        .status(policy.code || 403)
        .json({ message: policy.message || "Not allowed" });
    }

    let replyPreview = { text: "", senderUsername: "" };
    let replyToId = null;

    if (replyTo) {
      if (!mongoose.isValidObjectId(replyTo)) {
        return res.status(400).json({ message: "Invalid replyTo" });
      }

      const original = await Message.findById(replyTo)
        .populate("senderId", "username")
        .select("chatId text senderId");

      if (!original)
        return res.status(404).json({ message: "Original message not found" });

      if (String(original.chatId) !== String(chatId)) {
        return res
          .status(400)
          .json({ message: "replyTo must be in the same chat" });
      }

      replyToId = original._id;
      replyPreview = {
        text: (original.text || "").slice(0, 120),
        senderUsername: original.senderId?.username || "Unknown",
      };
    }

    const isVideo = req.file.mimetype.startsWith("video/");
    const resourceType = isVideo ? "video" : "raw";
    const folder = isVideo ? "linqly/messages/videos" : "linqly/messages/files";

    let uploadResult;
    try {
      uploadResult = await uploadToCloudinary(req.file.buffer, {
        folder,
        resource_type: resourceType,
      });
    } catch (uploadErr) {
      return res
        .status(500)
        .json({ message: uploadErr.message || "Upload failed" });
    }

    const fileUrl = uploadResult.secure_url || uploadResult.url;
    const filePublicId = uploadResult.public_id || "";
    const msg = await Message.create({
      chatId,
      senderId: me,
      type: isVideo ? "video" : "file",
      text: "",
      fileUrl,
      fileName: req.file.originalname || "file",
      fileType: req.file.mimetype || "",
      fileSize: req.file.size || 0,
      filePublicId,
      fileResourceType: resourceType,
      replyTo: replyToId,
      replyPreview,
      reactions: [],
      mentions: [],
    });

    const senderUser = await User.findById(me).select("username avatarUrl");

    await ChatSetting.updateMany(
      { chatId, userId: { $ne: me }, hiddenAt: { $ne: null } },
      { $set: { hiddenAt: null } }
    );

    await Chat.updateOne(
      { _id: chatId },
      {
        $set: {
          lastMessageAt: msg.createdAt,
          lastMessageText: isVideo ? "[Video]" : "[File]",
          lastMessageId: msg._id,
          lastMessageSenderId: me,
        },
      }
    );

    const requestDoc = await upsertRequestAfterDirectMessage({
      chat,
      policy,
      senderId: me,
      messageType: msg.type,
      messageText: msg.text,
      messageCreatedAt: msg.createdAt,
    });
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

    const io = getIO();
    if (io) {
      io.to(String(chatId)).emit("message:new", {
        id: msg._id,
        chatId,
        sender: {
          id: me,
          username: senderUser?.username || "You",
          avatarUrl: resolveAvatar(senderUser),
        },
        type: msg.type,
        text: msg.text,
        fileUrl: msg.fileUrl || null,
        fileName: msg.fileName || "",
        fileType: msg.fileType || "",
        fileSize: msg.fileSize || 0,
        createdAt: msg.createdAt,
        replyTo: msg.replyTo,
        replyPreview: msg.replyPreview,
        reactions: msg.reactions,
        mentions: msg.mentions || [],
      });
    }

    res.status(201).json({ message: { id: msg._id, createdAt: msg.createdAt } });
  });
});

/**
 * POST /messages/voice { chatId, replyTo? } + audio file
 */
router.post("/voice", authRequired, (req, res) => {
  uploadVoice.single("voice")(req, res, async (err) => {
    const me = req.user.userId;
    const { chatId, replyTo } = req.body;

    if (err) {
      return res.status(400).json({ message: err.message || "Upload failed" });
    }
    if (!chatId) return res.status(400).json({ message: "chatId required" });
    if (!mongoose.isValidObjectId(chatId)) {
      return res.status(400).json({ message: "Invalid chatId" });
    }
    if (!req.file) return res.status(400).json({ message: "Voice file required" });

    const chat = await Chat.findById(chatId)
      .populate("members", "username")
      .select("members type");
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    const isMember = chat.members.some(
      (m) => String(m._id || m) === String(me)
    );
    if (!isMember)
      return res.status(403).json({ message: "Not a member of this chat" });
    const policy = await resolveDirectMessagePolicy({ chat, senderId: me });
    if (!policy.allowed) {
      return res
        .status(policy.code || 403)
        .json({ message: policy.message || "Not allowed" });
    }

    let replyPreview = { text: "", senderUsername: "" };
    let replyToId = null;

    if (replyTo) {
      if (!mongoose.isValidObjectId(replyTo)) {
        return res.status(400).json({ message: "Invalid replyTo" });
      }

      const original = await Message.findById(replyTo)
        .populate("senderId", "username")
        .select("chatId text senderId");

      if (!original)
        return res.status(404).json({ message: "Original message not found" });

      if (String(original.chatId) !== String(chatId)) {
        return res
          .status(400)
          .json({ message: "replyTo must be in the same chat" });
      }

      replyToId = original._id;
      replyPreview = {
        text: (original.text || "").slice(0, 120),
        senderUsername: original.senderId?.username || "Unknown",
      };
    }

    let uploadResult;
    try {
      uploadResult = await uploadToCloudinary(req.file.buffer, {
        folder: "linqly/messages/voice",
        resource_type: "video",
      });
    } catch (uploadErr) {
      return res
        .status(500)
        .json({ message: uploadErr.message || "Upload failed" });
    }

    const fileUrl = uploadResult.secure_url || uploadResult.url;
    const filePublicId = uploadResult.public_id || "";
    const msg = await Message.create({
      chatId,
      senderId: me,
      type: "audio",
      text: "",
      fileUrl,
      fileName: req.file.originalname || "voice",
      fileType: req.file.mimetype || "",
      fileSize: req.file.size || 0,
      filePublicId,
      fileResourceType: "video",
      replyTo: replyToId,
      replyPreview,
      reactions: [],
      mentions: [],
    });

    const senderUser = await User.findById(me).select("username avatarUrl");

    await ChatSetting.updateMany(
      { chatId, userId: { $ne: me }, hiddenAt: { $ne: null } },
      { $set: { hiddenAt: null } }
    );

    await Chat.updateOne(
      { _id: chatId },
      {
        $set: {
          lastMessageAt: msg.createdAt,
          lastMessageText: "[Voice]",
          lastMessageId: msg._id,
          lastMessageSenderId: me,
        },
      }
    );

    const requestDoc = await upsertRequestAfterDirectMessage({
      chat,
      policy,
      senderId: me,
      messageType: msg.type,
      messageText: msg.text,
      messageCreatedAt: msg.createdAt,
    });
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

    const io = getIO();
    if (io) {
      io.to(String(chatId)).emit("message:new", {
        id: msg._id,
        chatId,
        sender: {
          id: me,
          username: senderUser?.username || "You",
          avatarUrl: resolveAvatar(senderUser),
        },
        type: msg.type,
        text: msg.text,
        fileUrl: msg.fileUrl || null,
        fileName: msg.fileName || "",
        fileType: msg.fileType || "",
        fileSize: msg.fileSize || 0,
        createdAt: msg.createdAt,
        replyTo: msg.replyTo,
        replyPreview: msg.replyPreview,
        reactions: msg.reactions,
        mentions: msg.mentions || [],
      });
    }

    res.status(201).json({ message: { id: msg._id, createdAt: msg.createdAt } });
  });
});

// POST /messages/:id/react { emoji }
router.post("/:id/react", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;
  const { emoji } = req.body;

  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid message id" });
  if (!emoji || typeof emoji !== "string") return res.status(400).json({ message: "emoji required" });
  if (emoji.length > 8) return res.status(400).json({ message: "emoji too long" });

  const msg = await Message.findById(id).select("chatId reactions");
  if (!msg) return res.status(404).json({ message: "Message not found" });

  const chat = await Chat.findById(msg.chatId).select("members");
  if (!chat) return res.status(404).json({ message: "Chat not found" });

  const isMember = chat.members.some((m) => String(m) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member of this chat" });

  msg.reactions = (msg.reactions || []).filter((r) => String(r.userId) !== String(me));
  msg.reactions.push({ emoji, userId: me });
  await msg.save();

  const io = getIO();
  if (io) {
    io.to(String(msg.chatId)).emit("message:reaction", {
      messageId: String(msg._id),
      chatId: String(msg.chatId),
      reactions: msg.reactions,
    });
  }

  res.json({ ok: true, reactions: msg.reactions });
});

// GET /messages/:id/download
async function streamFileResponse(res, msg, mode = "attachment") {
  const safeName = String(msg.fileName || "file")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .slice(0, 160);
  res.setHeader(
    "Content-Disposition",
    `${mode}; filename="${safeName}"`
  );
  res.setHeader("Content-Type", msg.fileType || "application/octet-stream");

  const streamUrl = msg.fileUrl;
  const client = streamUrl.startsWith("https://") ? https : http;

  const pipeStream = (url, redirects = 0) => {
    client
      .get(url, (upstream) => {
        if (
          upstream.statusCode >= 300 &&
          upstream.statusCode < 400 &&
          upstream.headers.location &&
          redirects < 5
        ) {
          pipeStream(upstream.headers.location, redirects + 1);
          return;
        }
        if (upstream.statusCode !== 200) {
          res.status(502).end("Failed to fetch file");
          return;
        }
        upstream.pipe(res);
      })
      .on("error", () => {
        res.status(502).end("Failed to fetch file");
      });
  };

  pipeStream(streamUrl);
}

async function getFileMessageForUser(req, res) {
  const me = req.user.userId;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: "Invalid message id" });
    return null;
  }

  const msg = await Message.findById(id).select(
    "chatId type fileUrl fileName fileType"
  );
  if (!msg) {
    res.status(404).json({ message: "Message not found" });
    return null;
  }
  if (!["file", "video", "audio"].includes(msg.type)) {
    res.status(400).json({ message: "Not a file message" });
    return null;
  }
  if (!msg.fileUrl) {
    res.status(404).json({ message: "File not available" });
    return null;
  }

  const chat = await Chat.findById(msg.chatId).select("members");
  if (!chat) {
    res.status(404).json({ message: "Chat not found" });
    return null;
  }

  const isMember = chat.members.some((m) => String(m) === String(me));
  if (!isMember) {
    res.status(403).json({ message: "Not a member" });
    return null;
  }

  return msg;
}

router.get("/:id/download", authRequired, async (req, res) => {
  const msg = await getFileMessageForUser(req, res);
  if (!msg) return;
  await streamFileResponse(res, msg, "attachment");
});

// POST /messages/:id/unreact
router.post("/:id/unreact", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid message id" });

  const msg = await Message.findById(id).select("chatId reactions");
  if (!msg) return res.status(404).json({ message: "Message not found" });

  const chat = await Chat.findById(msg.chatId).select("members");
  if (!chat) return res.status(404).json({ message: "Chat not found" });

  const isMember = chat.members.some((m) => String(m) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member of this chat" });

  msg.reactions = (msg.reactions || []).filter((r) => String(r.userId) !== String(me));
  await msg.save();

  const io = getIO();
  if (io) {
    io.to(String(msg.chatId)).emit("message:reaction", {
      messageId: String(msg._id),
      chatId: String(msg.chatId),
      reactions: msg.reactions,
    });
  }

  res.json({ ok: true, reactions: msg.reactions });
});

// DELETE /messages/:id (unsend)
router.delete("/:id", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid message id" });
  }

  const msg = await Message.findById(id).select(
    "chatId senderId createdAt type imagePublicId filePublicId fileResourceType"
  );
  if (!msg) return res.status(404).json({ message: "Message not found" });

  if (String(msg.senderId) !== String(me)) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const chatId = String(msg.chatId);
  if (msg.type === "image" && msg.imagePublicId) {
    try {
      await cloudinary.uploader.destroy(msg.imagePublicId);
    } catch (e) {
      return res.status(500).json({ message: "Failed to delete image" });
    }
  }
  if (
    (msg.type === "video" || msg.type === "file" || msg.type === "audio") &&
    msg.filePublicId
  ) {
    try {
      const resourceType =
        msg.fileResourceType ||
        (msg.type === "file" ? "raw" : "video");
      await cloudinary.uploader.destroy(msg.filePublicId, {
        resource_type: resourceType,
      });
    } catch (e) {
      return res.status(500).json({ message: "Failed to delete file" });
    }
  }
  const senderUser = await User.findById(me).select("username avatarUrl");
  const systemText = `${senderUser?.username || "User"} deleted a message`;

  const updated = await Message.findByIdAndUpdate(
    id,
    {
      $set: {
        type: "system",
        text: systemText,
        imageUrl: "",
        fileUrl: "",
        fileName: "",
        fileType: "",
        fileSize: 0,
        filePublicId: "",
        fileResourceType: "",
        replyTo: null,
        replyPreview: null,
        reactions: [],
        mentions: [],
      },
    },
    { new: true }
  ).select("chatId text type createdAt");

  const latest = await Message.find({ chatId })
    .sort({ createdAt: -1 })
    .limit(1)
    .select("text imageUrl createdAt type senderId");

  if (latest.length) {
    const last = latest[0];
    const lastLabel =
      last.type === "image"
        ? "[Image]"
        : last.type === "video"
        ? "[Video]"
        : last.type === "file"
        ? "[File]"
        : last.type === "audio"
        ? "[Voice]"
        : last.text || "";
    await Chat.updateOne(
      { _id: chatId },
      {
        $set: {
          lastMessageAt: last.createdAt,
          lastMessageText: lastLabel,
          lastMessageId: last._id,
          lastMessageSenderId: last.senderId || null,
        },
      }
    );
  } else {
    await Chat.updateOne(
      { _id: chatId },
      {
        $set: {
          lastMessageAt: null,
          lastMessageText: "",
          lastMessageId: null,
          lastMessageSenderId: null,
        },
      }
    );
  }

  const io = getIO();
  if (io) {
    io.to(chatId).emit("message:deleted", {
      messageId: id,
      chatId,
      systemText,
      createdAt: updated?.createdAt || msg.createdAt,
    });
  }

  res.json({ ok: true });
});

module.exports = router;
