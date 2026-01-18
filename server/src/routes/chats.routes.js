const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const Friendship = require("../models/Friendship");
const { authRequired } = require("../middleware/authRequired");
const { makePairKey } = require("../utils/pairKey");
const ChatSetting = require("../models/ChatSetting");
const Hangout = require("../models/Hangout");
const User = require("../models/User");
const { getIO } = require("../realtime");
const { resolveAvatar } = require("../utils/avatar");
const cloudinary = require("../utils/cloudinary");

const router = express.Router();

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

  // Optional: require users to be friends before chatting
  const pairKey = makePairKey(me, userId);
  const rel = await Friendship.findOne({ pairKey });
  if (!rel || rel.status !== "accepted") {
    return res
      .status(403)
      .json({ message: "You must be friends to start a chat" });
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
      { $set: { lastMessageAt: msg.createdAt, lastMessageText: text } }
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

  const chat = await Chat.findById(chatId).select("members type");
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
    { $set: { lastMessageAt: msg.createdAt, lastMessageText: text } }
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
    .select("type name avatarUrl creatorId admins members pendingJoinRequests");

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
    },
  });
});

// PATCH /chats/:chatId/group { name? }
router.patch("/:chatId/group", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId } = req.params;
  const { name } = req.body || {};

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
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

  const update = {};
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
  }

  await Chat.updateOne({ _id: chatId }, { $set: update });
  if (chat.type === "hangout" && update.name) {
    await Hangout.updateOne({ _id: chat.hangoutId }, { $set: { title: update.name } });
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
    { $set: { lastMessageAt: msg.createdAt, lastMessageText: text } }
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

// POST /chats/:chatId/join-request
router.post("/:chatId/join-request", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { chatId } = req.params;

  if (!mongoose.isValidObjectId(chatId)) {
    return res.status(400).json({ message: "Invalid chatId" });
  }

  const chat = await Chat.findById(chatId).select("type members pendingJoinRequests");
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

  await Chat.updateOne(
    { _id: chatId },
    { $push: { pendingJoinRequests: { userId: me, requestedAt: new Date() } } }
  );

  res.json({ ok: true });
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
    { $set: { lastMessageAt: msg.createdAt, lastMessageText: text } }
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
      "_id type members name avatarUrl lastMessageAt lastMessageText createdAt updatedAt"
    );

  const chatIds = chats.map((c) => c._id);

  const settingsDocs = await ChatSetting.find({
    userId: me,
    chatId: { $in: chatIds },
  }).select("chatId isPinned isMuted isIgnored hiddenAt");

  const settingsMap = new Map(settingsDocs.map((s) => [String(s.chatId), s]));

  // Attach settings + filter hidden
  let out = chats
    .map((c) => {
      const s = settingsMap.get(String(c._id));
      const settings = {
        isPinned: s?.isPinned || false,
        isMuted: s?.isMuted || false,
        isIgnored: s?.isIgnored || false,
        hiddenAt: s?.hiddenAt || null,
      };

      let otherUser = null;
      let displayName = c.type;

      if (c.type === "direct") {
        otherUser = c.members.find((m) => String(m._id) !== String(me)) || null;
        displayName = otherUser?.username || "Direct chat";
      } else if (c.type === "group") {
        displayName = c.name?.trim() || "Group chat";
      } else if (c.type === "hangout") {
        displayName = c.name?.trim() || "Hangout chat";
      }

      return {
        ...c.toObject(),
        displayName,
        avatarUrl:
          c.type === "group" || c.type === "hangout" ? c.avatarUrl || null : null,
        otherUser: otherUser
          ? {
              id: otherUser._id,
              username: otherUser.username,
              avatarUrl: resolveAvatar(otherUser),
            }
          : null,
        settings,
      };
    })
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
