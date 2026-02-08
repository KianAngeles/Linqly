const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const MessageRequest = require("../models/MessageRequest");
const Friendship = require("../models/Friendship");
const { authRequired } = require("../middleware/authRequired");
const { makePairKey } = require("../utils/pairKey");
const ChatSetting = require("../models/ChatSetting");
const ChatRead = require("../models/ChatRead");
const Hangout = require("../models/Hangout");
const User = require("../models/User");
const { getIO, onlineUsers } = require("../realtime");
const { resolveAvatar } = require("../utils/avatar");
const cloudinary = require("../utils/cloudinary");
const {
  migrateLegacyDirectRequests,
  getRequestStatusForViewer,
} = require("../utils/messageRequests");

const router = express.Router();
const GROUP_CALLS_ENABLED =
  String(process.env.GROUP_CALLS_ENABLED || "").toLowerCase() === "true";

const uploadGroupAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okTypes = ["image/jpeg", "image/png"];
    if (!file.mimetype || !okTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG and PNG images are allowed"));
    }
    return cb(null, true);
  },
});

function uploadGroupAvatarToCloudinary(fileBuffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "linqly/avatars/groups", resource_type: "image" },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
}

function isAdminOrCreator(chat, userId) {
  if (!chat) return false;
  if (String(chat.creatorId) === String(userId)) return true;
  return (chat.admins || []).some((id) => String(id) === String(userId));
}

function emitJoinRequest(chatId, request) {
  const io = getIO();
  if (!io) return;
  io.to(String(chatId)).emit("chat:join-request", { chatId, request });
}

function emitJoinRequestResolved(chatId, userId) {
  const io = getIO();
  if (!io) return;
  io.to(String(chatId)).emit("chat:join-request:resolved", { chatId, userId });
}

async function emitSystemMessage(chatId, senderId, text) {
  if (!text) return;
  const msg = await Message.create({
    chatId,
    senderId,
    type: "system",
    text,
    replyTo: null,
    replyPreview: { text: "", senderUsername: "" },
    reactions: [],
  });

  await Chat.updateOne(
    { _id: chatId },
    {
      $set: {
        lastMessageAt: msg.createdAt,
        lastMessageText: text,
        lastMessageId: msg._id,
        lastMessageSenderId: msg.senderId,
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
}

/**
 * POST /chats/direct { userId }
 * Create or reuse a 1-on-1 chat
 */
router.post("/direct", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ message: "userId required" });
  if (!mongoose.isValidObjectId(userId))
    return res.status(400).json({ message: "Invalid userId" });
  if (String(userId) === String(me))
    return res.status(400).json({ message: "Cannot chat with yourself" });

  // Allow non-friends to chat, but block if either user has blocked the other
  const pairKey = makePairKey(me, userId);
  const rel = await Friendship.findOne({ pairKey }).select("status blockedBy");
  if (rel && rel.status === "blocked") {
    const blockedByMe = String(rel.blockedBy) === String(me);
    return res.status(403).json({
      message: blockedByMe
        ? "You blocked this user"
        : "You have been blocked by this user",
    });
  }

  const directKey = makePairKey(me, userId);

  // Reuse if exists
  let chat = await Chat.findOne({ type: "direct", directKey });
  if (!chat) {
    chat = await Chat.create({
      type: "direct",
      members: [me, userId],
      directKey,
      lastMessageAt: null,
      lastMessageText: "",
    });
  }

  res.status(201).json({ chatId: chat._id });
});

/**
 * POST /chats/group { memberIds: [], name? }
 * Create a group chat with existing friends only
 */
router.post("/group", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { memberIds, name } = req.body;

  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ message: "memberIds required" });
  }

  const unique = Array.from(new Set(memberIds.map(String))).filter(
    (id) => String(id) !== String(me)
  );

  if (unique.length === 0) {
    return res.status(400).json({ message: "At least one member required" });
  }

  for (const id of unique) {
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid memberId" });
    }
  }

  // Ensure every member is already a friend
  const pairKeys = unique.map((id) => makePairKey(me, id));
  const rels = await Friendship.find({
    pairKey: { $in: pairKeys },
    status: "accepted",
  }).select("pairKey");

  if (rels.length !== unique.length) {
    return res
      .status(403)
      .json({ message: "All members must be your friends" });
  }

  const cleanName = String(name || "").trim();

  const chat = await Chat.create({
    type: "group",
    members: [me, ...unique],
    name: cleanName,
    creatorId: me,
    admins: [me],
    avatarUrl: null,
    pendingJoinRequests: [],
    requireAdminApproval: false,
    allowAnyoneCall: true,
    lastMessageAt: null,
    lastMessageText: "",
  });

  res.status(201).json({ chatId: chat._id });
});

// POST /chats/:chatId/leave
router.post("/:chatId/leave", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId } = req.params;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }

  const chat = await Chat.findById(chatId).select(
    "members type creatorId admins hangoutId"
  );
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  if (!["group", "hangout"].includes(chat.type)) {
    return res.status(400).json({ message: "Only group chats can be left" });
  }

  const isMember = chat.members.some((id) => String(id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });

  if (chat.type === "hangout") {
    if (String(chat.creatorId) === String(me)) {
      return res.status(400).json({ message: "Creator cannot leave hangout chat" });
    }
    await Hangout.updateOne(
      { _id: chat.hangoutId },
      { $pull: { attendeeIds: me, sharedLocations: { userId: me } } }
    );
  }

  chat.members = chat.members.filter((id) => String(id) !== String(me));

  // remove personal settings for this chat
  await ChatSetting.deleteOne({ chatId, userId: me });

  if (chat.members.length === 0 && chat.type === "group") {
    await Message.deleteMany({ chatId });
    await ChatSetting.deleteMany({ chatId });
    await Chat.deleteOne({ _id: chatId });
    return res.json({ ok: true, deleted: true });
  }

  await chat.save();

  const user = await User.findById(me).select("username");
  const text = `${user?.username || "Someone"} left the chat`;

  if (chat.members.length > 0) {
    const msg = await Message.create({
      chatId,
      senderId: me,
      type: "system",
      text,
      replyTo: null,
      replyPreview: { text: "", senderUsername: "" },
      reactions: [],
    });

    await ChatSetting.updateMany(
      {
        chatId: chatId,
        userId: { $ne: me },
        hiddenAt: { $ne: null },
      },
      { $set: { hiddenAt: null } }
    );

    await Chat.updateOne(
      { _id: chatId },
      {
        $set: {
          lastMessageAt: msg.createdAt,
          lastMessageText: text,
          lastMessageId: msg._id,
          lastMessageSenderId: msg.senderId,
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
  }

  res.json({ ok: true, deleted: false });
});

// POST /chats/:chatId/members { userId }
router.post("/:chatId/members", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId } = req.params;
  const { userId } = req.body;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }
  if (!userId) return res.status(400).json({ message: "userId required" });
  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid userId" });
  }

  const chat = await Chat.findById(chatId).select(
    "members type creatorId admins requireAdminApproval pendingJoinRequests"
  );
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  if (chat.type !== "group") {
    return res.status(400).json({ message: "Only group chats can add members" });
  }

  const isMember = chat.members.some((id) => String(id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });

  if (chat.members.some((id) => String(id) === String(userId))) {
    return res.status(409).json({ message: "Already a member" });
  }

  const pairKey = makePairKey(me, userId);
  const rel = await Friendship.findOne({ pairKey });
  if (!rel || rel.status !== "accepted") {
    return res
      .status(403)
      .json({ message: "You can only add your friends" });
  }

  const isAdmin = isAdminOrCreator(chat, me);
  const needsApproval = chat.requireAdminApproval === true;
  if (needsApproval && !isAdmin) {
    if (
      (chat.pendingJoinRequests || []).some(
        (r) => String(r.userId) === String(userId)
      )
    ) {
      return res.status(409).json({ message: "Request already pending" });
    }
    const requestedAt = new Date();
    await Chat.updateOne(
      { _id: chatId },
      {
        $push: { pendingJoinRequests: { userId, requestedAt } },
      }
    );
    const requester = await User.findById(me).select("username");
    const requestedUser = await User.findById(userId).select("username avatarUrl");
    emitJoinRequest(chatId, {
      user: {
        id: requestedUser?._id,
        username: requestedUser?.username || "Someone",
        avatarUrl: resolveAvatar(requestedUser),
      },
      requestedAt,
    });
    const text = `${requester?.username || "Someone"} requested to add ${
      requestedUser?.username || "someone"
    }`;
    await emitSystemMessage(chatId, me, text);
    return res.json({ ok: true, pending: true });
  }

  await Chat.updateOne(
    { _id: chatId },
    { $addToSet: { members: userId } }
  );

  const adder = await User.findById(me).select("username");
  const added = await User.findById(userId).select("username");
  const text = `${adder?.username || "Someone"} added ${
    added?.username || "someone"
  }`;

  const msg = await Message.create({
    chatId,
    senderId: me,
    type: "system",
    text,
    replyTo: null,
    replyPreview: { text: "", senderUsername: "" },
    reactions: [],
  });

  await Chat.updateOne(
    { _id: chatId },
    {
      $set: {
        lastMessageAt: msg.createdAt,
        lastMessageText: text,
        lastMessageId: msg._id,
        lastMessageSenderId: msg.senderId,
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

// GET /chats/:chatId (group settings)
router.get("/:chatId", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId } = req.params;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }

  const chat = await Chat.findById(chatId)
    .populate("members", "username avatarUrl")
    .populate("admins", "username avatarUrl")
    .populate("creatorId", "username avatarUrl")
    .populate("pendingJoinRequests.userId", "username avatarUrl")
    .select(
      "type name avatarUrl creatorId admins members pendingJoinRequests nicknames requireAdminApproval allowAnyoneCall ongoingCall"
    );

  if (!chat) return res.status(404).json({ message: "Chat not found" });
  if (!["group", "hangout"].includes(chat.type)) {
    return res.status(400).json({ message: "Not a group chat" });
  }

  const isMember = chat.members.some((m) => String(m._id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });

  res.json({
    chat: {
      id: chat._id,
      name: chat.name || "",
      avatarUrl: chat.avatarUrl || null,
      nicknames:
        chat.nicknames && typeof chat.nicknames.get === "function"
          ? Object.fromEntries(chat.nicknames)
          : chat.nicknames || {},
      creator: chat.creatorId
        ? {
            id: chat.creatorId._id,
            username: chat.creatorId.username,
            avatarUrl: resolveAvatar(chat.creatorId),
          }
        : null,
      admins: (chat.admins || []).map((a) => ({
        id: a._id,
        username: a.username,
        avatarUrl: resolveAvatar(a),
      })),
      members: (chat.members || []).map((m) => ({
        id: m._id,
        username: m.username,
        avatarUrl: resolveAvatar(m),
      })),
      pendingJoinRequests: (chat.pendingJoinRequests || [])
        .filter((r) => r.userId)
        .map((r) => ({
          user: {
            id: r.userId._id,
            username: r.userId.username,
            avatarUrl: resolveAvatar(r.userId),
          },
          requestedAt: r.requestedAt,
        })),
      requireAdminApproval: chat.requireAdminApproval === true,
      allowAnyoneCall: GROUP_CALLS_ENABLED && chat.allowAnyoneCall !== false,
      ongoingCall: GROUP_CALLS_ENABLED ? chat.ongoingCall || null : null,
    },
  });
});

// GET /chats/:chatId/ongoing-call
router.get("/:chatId/ongoing-call", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId } = req.params;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }

  const chat = await Chat.findById(chatId).select(
    "type members ongoingCall allowAnyoneCall creatorId admins name"
  );
  if (!chat) return res.status(404).json({ message: "Chat not found" });

  const isMember = (chat.members || []).some((id) => String(id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });
  if (!["group", "hangout"].includes(chat.type)) {
    return res.status(400).json({ message: "Not a group chat" });
  }

  if (!GROUP_CALLS_ENABLED) {
    return res.json({
      ongoingCall: null,
      allowAnyoneCall: false,
      canStartCall: false,
      chatName: chat.name || "",
    });
  }

  const isAdmin = isAdminOrCreator(chat, me);
  res.json({
    ongoingCall: chat.ongoingCall || null,
    allowAnyoneCall: chat.allowAnyoneCall !== false,
    canStartCall: chat.allowAnyoneCall !== false || isAdmin,
    chatName: chat.name || "",
  });
});

// GET /chats/:chatId/reads
router.get("/:chatId/reads", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId } = req.params;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }

  const chat = await Chat.findById(chatId).select("members type");
  if (!chat) return res.status(404).json({ message: "Chat not found" });

  const isMember = chat.members.some((id) => String(id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });

  if (chat.type === "direct") {
    const requestDoc = await MessageRequest.findOne({ chatId }).select("status");
    if (requestDoc && requestDoc.status !== "accepted") {
      return res.json({ reads: [] });
    }
  }

  const reads = await ChatRead.find({ chatId })
    .select("userId lastReadMessageId readAt");

  res.json({
    reads: reads.map((r) => ({
      userId: String(r.userId),
      lastReadMessageId: String(r.lastReadMessageId),
      readAt: r.readAt,
    })),
  });
});

// PATCH /chats/:chatId/group { name? }
router.patch("/:chatId/group", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId } = req.params;
  const { name, nicknameUserId, nickname, requireAdminApproval, allowAnyoneCall } =
    req.body || {};

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }

  const chat = await Chat.findById(chatId).select(
    "type members creatorId admins hangoutId name nicknames requireAdminApproval allowAnyoneCall"
  );
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  if (!["group", "hangout", "direct"].includes(chat.type)) {
    return res.status(400).json({ message: "Not a group chat" });
  }

  const isMember = chat.members.some((id) => String(id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });
  const isAdmin = isAdminOrCreator(chat, me);
  if (!isAdmin) {
    if (
      chat.type === "hangout" && typeof name === "string"
    ) {
      return res.status(403).json({ message: "Admin only" });
    }
  }

  const update = {};
  const unset = {};
  let nextName = "";
  let nicknameChanged = false;
  let nextNickname = "";
  let nicknameTargetId = "";
  let nextNicknamesMap = null;
  if (typeof name === "string") {
    const clean = name.trim();
    const maxLen = chat.type === "hangout" ? 60 : 50;
    if (chat.type === "hangout" && clean.length === 0) {
      return res.status(400).json({ message: "Name required" });
    }
    if (clean.length > maxLen) {
      return res.status(400).json({ message: "Name too long" });
    }
    update.name = clean;
    nextName = clean;
  }
  if (nicknameUserId !== undefined) {
    const targetId = String(nicknameUserId || "");
    if (!mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ message: "Invalid nickname user" });
    }
    const isTargetMember = chat.members.some(
      (id) => String(id) === String(targetId)
    );
    if (!isTargetMember) {
      return res.status(400).json({ message: "Nickname user not in chat" });
    }
    const cleanNick = typeof nickname === "string" ? nickname.trim() : "";
    const currentNick =
      chat.nicknames && typeof chat.nicknames.get === "function"
        ? chat.nicknames.get(targetId) || ""
        : (chat.nicknames || {})[targetId] || "";
    if (cleanNick) {
      if (cleanNick.length > 40) {
        return res.status(400).json({ message: "Nickname too long" });
      }
      update[`nicknames.${targetId}`] = cleanNick;
      nicknameChanged = cleanNick !== currentNick;
      nextNickname = cleanNick;
      nicknameTargetId = targetId;
      nextNicknamesMap = {
        ...(chat.nicknames && typeof chat.nicknames.get === "function"
          ? Object.fromEntries(chat.nicknames)
          : chat.nicknames || {}),
        [targetId]: cleanNick,
      };
    } else if (currentNick) {
      unset[`nicknames.${targetId}`] = "";
      nicknameChanged = true;
      nextNickname = "";
      nicknameTargetId = targetId;
      const base =
        chat.nicknames && typeof chat.nicknames.get === "function"
          ? Object.fromEntries(chat.nicknames)
          : chat.nicknames || {};
      delete base[targetId];
      nextNicknamesMap = base;
    }
  }
  if (typeof requireAdminApproval === "boolean") {
    if (chat.type !== "group") {
      return res.status(400).json({ message: "Not a group chat" });
    }
    if (!isAdminOrCreator(chat, me)) {
      return res.status(403).json({ message: "Admin only" });
    }
    update.requireAdminApproval = requireAdminApproval;
  }
  if (typeof allowAnyoneCall === "boolean") {
    if (!["group", "hangout"].includes(chat.type)) {
      return res.status(400).json({ message: "Not a group chat" });
    }
    if (!isAdminOrCreator(chat, me)) {
      return res.status(403).json({ message: "Admin only" });
    }
    update.allowAnyoneCall = allowAnyoneCall;
  }

  const updateOps = { $set: update };
  if (Object.keys(unset).length > 0) {
    updateOps.$unset = unset;
  }
  await Chat.updateOne({ _id: chatId }, updateOps);
  if (chat.type === "hangout" && update.name) {
    await Hangout.updateOne({ _id: chat.hangoutId }, { $set: { title: update.name } });
  }
  if (nextName && nextName !== String(chat.name || "")) {
    const senderUser = await User.findById(me).select("username");
    const text = `${senderUser?.username || "Someone"} changed the group name to ${nextName}`;
    await emitSystemMessage(chatId, me, text);
  }
  if (nicknameChanged && nicknameTargetId) {
    const senderUser = await User.findById(me).select("username");
    const targetUser = await User.findById(nicknameTargetId).select("username");
    if (nextNickname) {
      const text = `${senderUser?.username || "Someone"} changed ${
        targetUser?.username || "Someone"
      }'s nickname to \"${nextNickname}\"`;
      await emitSystemMessage(chatId, me, text);
    }
    const io = getIO();
    if (io && nextNicknamesMap) {
      io.to(String(chatId)).emit("chat:nicknames", {
        chatId,
        nicknames: nextNicknamesMap,
      });
    }
  }
  return res.json({ ok: true });
});

// POST /chats/:chatId/avatar (multipart/form-data, field: avatar)
router.post("/:chatId/avatar", authRequired, (req, res) => {
  uploadGroupAvatar.single("avatar")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || "Upload failed" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "avatar file required" });
    }

    const me = req.user.userId;
    const { chatId } = req.params;

    if (!mongoose.isValidObjectId(chatId)) {
      return res.status(400).json({ message: "Invalid chatId" });
    }

    const chat = await Chat.findById(chatId).select(
      "type members creatorId admins hangoutId avatarPublicId"
    );
    if (!chat) return res.status(404).json({ message: "Chat not found" });
    if (!["group", "hangout"].includes(chat.type)) {
      return res.status(400).json({ message: "Not a group chat" });
    }

    const isMember = chat.members.some((id) => String(id) === String(me));
    if (!isMember) return res.status(403).json({ message: "Not a member" });
    if (!isAdminOrCreator(chat, me)) {
      return res.status(403).json({ message: "Admin only" });
    }

    let uploadResult;
    try {
      uploadResult = await uploadGroupAvatarToCloudinary(req.file.buffer);
    } catch (uploadErr) {
      return res
        .status(500)
        .json({ message: uploadErr.message || "Upload failed" });
    }

    const avatarUrl = uploadResult.secure_url || uploadResult.url;
    const avatarPublicId = uploadResult.public_id || null;
    if (chat.avatarPublicId) {
      try {
        await cloudinary.uploader.destroy(chat.avatarPublicId);
      } catch (destroyErr) {
        return res
          .status(500)
          .json({ message: destroyErr.message || "Failed to delete old avatar" });
      }
    }

    await Chat.updateOne(
      { _id: chatId },
      { $set: { avatarUrl, avatarPublicId } }
    );
    if (chat.type === "hangout") {
      await Hangout.updateOne(
        { _id: chat.hangoutId },
        { $set: { avatarUrl, avatarPublicId } }
      );
    }
    const senderUser = await User.findById(me).select("username");
    const text = `${senderUser?.username || "Someone"} updated the group photo`;
    await emitSystemMessage(chatId, me, text);
    const io = getIO();
    if (io) {
      io.to(String(chatId)).emit("chat:avatar", {
        chatId,
        avatarUrl,
        avatarPublicId,
      });
    }
    return res.json({ avatarUrl });
  });
});

// POST /chats/:chatId/members/:userId/remove
router.post("/:chatId/members/:userId/remove", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId, userId } = req.params;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }
  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid userId" });
  }

  const chat = await Chat.findById(chatId).select("type members creatorId admins hangoutId");
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  if (!["group", "hangout"].includes(chat.type)) {
    return res.status(400).json({ message: "Not a group chat" });
  }

  const isMember = chat.members.some((id) => String(id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });
  if (!isAdminOrCreator(chat, me)) {
    return res.status(403).json({ message: "Admin only" });
  }
  if (
    String(chat.creatorId) !== String(me) &&
    (chat.admins || []).some((id) => String(id) === String(userId))
  ) {
    return res
      .status(403)
      .json({ message: "Only the creator can remove admins" });
  }
  if (String(chat.creatorId) === String(userId)) {
    return res.status(400).json({ message: "Cannot remove creator" });
  }

  await Chat.updateOne(
    { _id: chatId },
    { $pull: { members: userId, admins: userId } }
  );

  if (chat.type === "hangout") {
    await Hangout.updateOne(
      { _id: chat.hangoutId },
      { $pull: { attendeeIds: userId, sharedLocations: { userId } } }
    );
    await ChatSetting.deleteOne({ chatId, userId });
  }

  const remover = await User.findById(me).select("username");
  const removed = await User.findById(userId).select("username");
  const text = `${remover?.username || "Someone"} removed ${
    removed?.username || "someone"
  }`;

  const msg = await Message.create({
    chatId,
    senderId: me,
    type: "system",
    text,
    replyTo: null,
    replyPreview: { text: "", senderUsername: "" },
    reactions: [],
  });

  await Chat.updateOne(
    { _id: chatId },
    {
      $set: {
        lastMessageAt: msg.createdAt,
        lastMessageText: text,
        lastMessageId: msg._id,
        lastMessageSenderId: msg.senderId,
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

// POST /chats/:chatId/admins/:userId
router.post("/:chatId/admins/:userId", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId, userId } = req.params;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }
  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid userId" });
  }

  const chat = await Chat.findById(chatId).select(
    "type members creatorId admins"
  );
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  if (chat.type !== "group") {
    return res.status(400).json({ message: "Not a group chat" });
  }

  const isMember = chat.members.some((id) => String(id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });
  if (!isAdminOrCreator(chat, me)) {
    return res.status(403).json({ message: "Admin only" });
  }

  const targetIsMember = chat.members.some((id) => String(id) === String(userId));
  if (!targetIsMember) {
    return res.status(400).json({ message: "User not in chat" });
  }

  await Chat.updateOne({ _id: chatId }, { $addToSet: { admins: userId } });

  const adder = await User.findById(me).select("username");
  const added = await User.findById(userId).select("username");
  const text = `${adder?.username || "Someone"} made ${
    added?.username || "someone"
  } an admin`;
  await emitSystemMessage(chatId, me, text);

  res.json({ ok: true });
});

// DELETE /chats/:chatId/admins/:userId
router.delete("/:chatId/admins/:userId", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId, userId } = req.params;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }
  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid userId" });
  }

  const chat = await Chat.findById(chatId).select(
    "type members creatorId admins"
  );
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  if (chat.type !== "group") {
    return res.status(400).json({ message: "Not a group chat" });
  }

  const isMember = chat.members.some((id) => String(id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });
  if (String(chat.creatorId) !== String(me)) {
    return res.status(403).json({ message: "Creator only" });
  }
  if (String(chat.creatorId) === String(userId)) {
    return res.status(400).json({ message: "Cannot remove creator admin" });
  }

  await Chat.updateOne({ _id: chatId }, { $pull: { admins: userId } });

  const remover = await User.findById(me).select("username");
  const removed = await User.findById(userId).select("username");
  const text = `${remover?.username || "Someone"} removed ${
    removed?.username || "someone"
  } as an admin`;
  await emitSystemMessage(chatId, me, text);

  res.json({ ok: true });
});

// POST /chats/:chatId/join-request
router.post("/:chatId/join-request", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId } = req.params;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }

  const chat = await Chat.findById(chatId).select(
    "type members pendingJoinRequests requireAdminApproval"
  );
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  if (chat.type !== "group") {
    return res.status(400).json({ message: "Not a group chat" });
  }

  if (chat.members.some((id) => String(id) === String(me))) {
    return res.status(400).json({ message: "Already a member" });
  }

  if ((chat.pendingJoinRequests || []).some((r) => String(r.userId) === String(me))) {
    return res.status(409).json({ message: "Request already sent" });
  }

  if (chat.requireAdminApproval !== true) {
    await Chat.updateOne(
      { _id: chatId },
      {
        $addToSet: { members: me },
        $pull: { pendingJoinRequests: { userId: me } },
      }
    );
    const joiner = await User.findById(me).select("username");
    const text = `${joiner?.username || "Someone"} joined the chat`;
    await emitSystemMessage(chatId, me, text);
    return res.json({ ok: true, joined: true });
  }

  const requestedAt = new Date();
  await Chat.updateOne(
    { _id: chatId },
    { $push: { pendingJoinRequests: { userId: me, requestedAt } } }
  );

  const requester = await User.findById(me).select("username avatarUrl");
  emitJoinRequest(chatId, {
    user: {
      id: requester?._id,
      username: requester?.username || "Someone",
      avatarUrl: resolveAvatar(requester),
    },
    requestedAt,
  });
  const text = `${requester?.username || "Someone"} requested to join the chat`;
  await emitSystemMessage(chatId, me, text);
  res.json({ ok: true, joined: false });
});

// POST /chats/:chatId/join-request/:userId/approve
router.post("/:chatId/join-request/:userId/approve", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId, userId } = req.params;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }
  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid userId" });
  }

  const chat = await Chat.findById(chatId).select("type members creatorId admins pendingJoinRequests");
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  if (chat.type !== "group") {
    return res.status(400).json({ message: "Not a group chat" });
  }

  const isMember = chat.members.some((id) => String(id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });
  if (!isAdminOrCreator(chat, me)) {
    return res.status(403).json({ message: "Admin only" });
  }

  await Chat.updateOne(
    { _id: chatId },
    {
      $addToSet: { members: userId },
      $pull: { pendingJoinRequests: { userId } },
    }
  );
  emitJoinRequestResolved(chatId, userId);

  const added = await User.findById(userId).select("username");
  const text = `${added?.username || "Someone"} joined the chat`;

  const msg = await Message.create({
    chatId,
    senderId: me,
    type: "system",
    text,
    replyTo: null,
    replyPreview: { text: "", senderUsername: "" },
    reactions: [],
  });

  await Chat.updateOne(
    { _id: chatId },
    {
      $set: {
        lastMessageAt: msg.createdAt,
        lastMessageText: text,
        lastMessageId: msg._id,
        lastMessageSenderId: msg.senderId,
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

// POST /chats/:chatId/join-request/:userId/reject
router.post("/:chatId/join-request/:userId/reject", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId, userId } = req.params;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }
  if (!mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid userId" });
  }

  const chat = await Chat.findById(chatId).select("type members creatorId admins");
  if (!chat) return res.status(404).json({ message: "Chat not found" });
  if (chat.type !== "group") {
    return res.status(400).json({ message: "Not a group chat" });
  }

  const isMember = chat.members.some((id) => String(id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });
  if (!isAdminOrCreator(chat, me)) {
    return res.status(403).json({ message: "Admin only" });
  }

  await Chat.updateOne(
    { _id: chatId },
    { $pull: { pendingJoinRequests: { userId } } }
  );
  emitJoinRequestResolved(chatId, userId);

  res.json({ ok: true });
});

/**
 * GET /chats
 * List my chats
 */
router.get("/", authRequired, async (req, res) => {
  const me = req.user.userId;

  const chats = await Chat.find({ members: me })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .populate("members", "username email avatarUrl")
    .select(
      "_id type members name avatarUrl nicknames creatorId admins allowAnyoneCall ongoingCall lastMessageAt lastMessageText lastMessageId lastMessageSenderId createdAt updatedAt"
    );

  const chatIds = chats.map((c) => c._id);
  const requestMap = await migrateLegacyDirectRequests(chats);

  const readDocs = await ChatRead.find({
    userId: me,
    chatId: { $in: chatIds },
  }).select("chatId lastReadMessageId readAt");

  const settingsDocs = await ChatSetting.find({
    userId: me,
    chatId: { $in: chatIds },
  }).select("chatId isPinned isMuted isIgnored hiddenAt");

  const settingsMap = new Map(settingsDocs.map((s) => [String(s.chatId), s]));
  const readMap = new Map(readDocs.map((r) => [String(r.chatId), r]));
  const directPairKeys = chats
    .filter((c) => c.type === "direct")
    .map((c) => {
      const other = c.members.find((m) => String(m._id) !== String(me));
      return other ? makePairKey(me, other._id) : null;
    })
    .filter(Boolean);
  const friendshipDocs = await Friendship.find({
    pairKey: { $in: directPairKeys },
  }).select("pairKey status requesterId receiverId blockedBy");
  const friendshipMap = new Map(
    friendshipDocs.map((d) => [String(d.pairKey), d])
  );

  // Attach settings + filter hidden
  let out = chats
    .map((c) => {
      const s = settingsMap.get(String(c._id));
      const read = readMap.get(String(c._id));
      const settings = {
        isPinned: s?.isPinned || false,
        isMuted: s?.isMuted || false,
        isIgnored: s?.isIgnored || false,
        hiddenAt: s?.hiddenAt || null,
      };
      const readInfo = {
        lastReadMessageId: read?.lastReadMessageId || null,
        lastReadAt: read?.readAt || null,
      };

      let otherUser = null;
      let displayName = c.type;
      const nicknames =
        c.nicknames && typeof c.nicknames.get === "function"
          ? Object.fromEntries(c.nicknames)
          : c.nicknames || {};

      if (c.type === "direct") {
        otherUser = c.members.find((m) => String(m._id) !== String(me)) || null;
        const otherId = otherUser ? String(otherUser._id) : "";
        const otherNick = otherId ? nicknames[otherId] : "";
        displayName = otherNick || otherUser?.username || "Direct chat";
        const requestDoc = requestMap.get(String(c._id)) || null;
        const requestStatus = getRequestStatusForViewer(requestDoc, me);
        if (requestStatus === "pending_incoming") return null;
        const pairKey = otherUser ? makePairKey(me, otherUser._id) : null;
        const rel = pairKey ? friendshipMap.get(String(pairKey)) : null;
        const blockedDoc = rel && rel.status === "blocked" ? rel : null;
        const blockedByMe =
          blockedDoc && String(blockedDoc.blockedBy) === String(me);
        const blockedByOther =
          blockedDoc && String(blockedDoc.blockedBy) !== String(me);
        let friendStatus = "none";
        if (rel) {
          if (rel.status === "accepted") {
            friendStatus = "friends";
          } else if (rel.status === "pending") {
            friendStatus =
              String(rel.requesterId) === String(me)
                ? "pending_outgoing"
                : "pending_incoming";
          } else if (rel.status === "blocked") {
            friendStatus = "blocked";
          } else {
            friendStatus = String(rel.status || "none");
          }
        }
        const pendingOrDeclined =
          requestStatus === "pending_outgoing" ||
          requestStatus === "declined_outgoing";
        return {
        ...c.toObject(),
        displayName,
        nicknames,
        avatarUrl: null,
        friendStatus,
        requestId: requestDoc?._id || null,
        requestStatus,
        messagingCaps: {
          typing: !pendingOrDeclined,
          readReceipts: !pendingOrDeclined,
          calls: !pendingOrDeclined,
        },
        otherUser: otherUser
          ? {
                id: otherUser._id,
                username: otherUser.username,
                avatarUrl: resolveAvatar(otherUser),
                isOnline: onlineUsers.has(String(otherUser._id)),
              }
            : null,
          settings,
          ...(pendingOrDeclined
            ? { lastReadMessageId: null, lastReadAt: null }
            : readInfo),
          blockStatus: {
            isBlocked: Boolean(blockedDoc),
            blockedByMe: Boolean(blockedByMe),
            blockedByOther: Boolean(blockedByOther),
          },
        };
      } else if (c.type === "group") {
        displayName = c.name?.trim() || "Group chat";
      } else if (c.type === "hangout") {
        displayName = c.name?.trim() || "Hangout chat";
      }

      const isGroupCreator = String(c.creatorId || "") === String(me);
      const isGroupAdmin = (c.admins || []).some(
        (adminId) => String(adminId) === String(me)
      );
      const canStartGroupCall =
        c.type === "group" || c.type === "hangout"
          ? GROUP_CALLS_ENABLED && (c.allowAnyoneCall !== false || isGroupCreator || isGroupAdmin)
          : true;

      return {
        ...c.toObject(),
        displayName,
        nicknames,
        requestStatus: "accepted",
        messagingCaps: {
          typing: true,
          readReceipts: true,
          calls: canStartGroupCall,
        },
        avatarUrl:
          c.type === "group" || c.type === "hangout" ? c.avatarUrl || null : null,
        ongoingCall: c.ongoingCall || null,
        otherUser: otherUser
          ? {
              id: otherUser._id,
              username: otherUser.username,
              avatarUrl: resolveAvatar(otherUser),
            }
          : null,
        settings,
        ...readInfo,
      };
    })
    .filter(Boolean)
    .filter((c) => !c.settings.hiddenAt);

  // Sort pinned first, then newest
  out.sort((a, b) => {
    const ap = a.settings.isPinned ? 1 : 0;
    const bp = b.settings.isPinned ? 1 : 0;
    if (ap !== bp) return bp - ap;

    const ad = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bd = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bd - ad;
  });

  res.json({ chats: out });
});

// PATCH /chats/:chatId/settings  { isPinned?, isMuted?, isIgnored? }
router.patch("/:chatId/settings", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId } = req.params;

  if (!mongoose.isValidObjectId(chatId))
    return res.status(400).json({ message: "Invalid chatId" });

  const chat = await Chat.findById(chatId).select("members");
  if (!chat) return res.status(404).json({ message: "Chat not found" });

  const isMember = chat.members.some((id) => String(id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });

  const update = {};
  for (const k of ["isPinned", "isMuted", "isIgnored"]) {
    if (typeof req.body[k] === "boolean") update[k] = req.body[k];
  }

  const doc = await ChatSetting.findOneAndUpdate(
    { chatId, userId: me },
    { $set: update },
    { upsert: true, new: true }
  ).select("chatId isPinned isMuted isIgnored hiddenAt");

  res.json({
    settings: {
      isPinned: doc.isPinned,
      isMuted: doc.isMuted,
      isIgnored: doc.isIgnored,
      hiddenAt: doc.hiddenAt,
    },
  });
});

// POST /chats/:chatId/delete  (delete for me only)
router.post("/:chatId/delete", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId } = req.params;

  if (!mongoose.isValidObjectId(chatId))
    return res.status(400).json({ message: "Invalid chatId" });

  const chat = await Chat.findById(chatId).select("members");
  if (!chat) return res.status(404).json({ message: "Chat not found" });

  const isMember = chat.members.some((id) => String(id) === String(me));
  if (!isMember) return res.status(403).json({ message: "Not a member" });

  await ChatSetting.findOneAndUpdate(
    { chatId, userId: me },
    { $set: { hiddenAt: new Date() } },
    { upsert: true }
  );

  res.json({ ok: true });
});

module.exports = router;
