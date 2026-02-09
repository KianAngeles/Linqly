const express = require("express");
const mongoose = require("mongoose");
const Hangout = require("../models/Hangout");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const ChatSetting = require("../models/ChatSetting");
const Friendship = require("../models/Friendship");
const User = require("../models/User");
const { authRequired } = require("../middleware/authRequired");
const { getIO, onlineUsers } = require("../realtime");

const router = express.Router();
const ATTENDEE_STATUS_OPTIONS = new Set([
  "Confirmed",
  "On the way",
  "Running late",
  "Arrived",
  "Waiting",
]);

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeJoinPolicy(input) {
  if (input === "approval") return "approval";
  if (input === "open") return "open";
  if (typeof input === "boolean") return input ? "open" : "approval";
  return "open";
}

function toUserSummary(user) {
  if (!user) return null;
  if (typeof user === "string" || user instanceof mongoose.Types.ObjectId) {
    return {
      id: user,
      username: "Unknown",
      avatarUrl: null,
    };
  }
  return {
    id: user._id,
    displayName: user.displayName || user.username,
    username: user.username,
    avatarUrl: user.avatarUrl || null,
  };
}

function emitToUser(userId, event, payload) {
  if (!userId) return;
  const io = getIO();
  if (!io) return;
  const socketIds = onlineUsers.get(String(userId));
  if (!socketIds || socketIds.size === 0) return;
  socketIds.forEach((socketId) => {
    io.to(socketId).emit(event, payload);
  });
}

async function emitSystemMessage(chatId, senderId, text) {
  if (!chatId || !senderId || !text) return;
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

function toHangoutSummary(doc, opts = {}) {
  const { includeSharedLocations = false, viewerId = null } = opts;
  const statusById = new Map();
  for (const entry of doc.attendeeStatuses || []) {
    if (!entry?.userId) continue;
    statusById.set(String(entry.userId), entry);
  }
  let sharedLocations = [];
  if (includeSharedLocations) {
    const attendeeById = new Map();
    for (const a of doc.attendeeIds || []) {
      attendeeById.set(String(a._id), a);
    }
    sharedLocations = (doc.sharedLocations || []).map((entry) => {
      const user = attendeeById.get(String(entry.userId)) || null;
      return {
        user: toUserSummary(user),
        location: entry.location,
        updatedAt: entry.updatedAt,
        note: entry.note || "",
      };
    });
  }
  const viewer = String(viewerId || "");
  const creatorId = String(doc.creatorId?._id || doc.creatorId || "");
  const pendingJoinRequestsRaw = Array.isArray(doc.pendingJoinRequests)
    ? doc.pendingJoinRequests
    : [];
  const pendingJoinRequests = pendingJoinRequestsRaw.map((entry) => ({
    user: toUserSummary(entry.userId),
    requestedAt: entry.requestedAt,
  }));
  const viewerPendingRequest = pendingJoinRequestsRaw.some(
    (entry) => String(entry?.userId?._id || entry?.userId || "") === viewer
  );

  return {
    _id: doc._id,
    title: doc.title,
    description: doc.description || "",
    location: doc.location,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    maxAttendees: doc.maxAttendees ?? null,
    visibility: doc.visibility || "friends",
    joinPolicy: doc.joinPolicy || "open",
    avatarUrl: doc.avatarUrl || null,
    creator: toUserSummary(doc.creatorId),
    attendees: (doc.attendeeIds || []).map((user) => {
      const summary = toUserSummary(user);
      const entry = statusById.get(String(summary?.id || ""));
      return {
        ...summary,
        status: entry?.status || "Confirmed",
        statusUpdatedAt: entry?.updatedAt || null,
      };
    }),
    attendeeCount: (doc.attendeeIds || []).length,
    joinRequestStatus: viewerPendingRequest ? "pending" : "none",
    pendingJoinRequests:
      viewer && viewer === creatorId ? pendingJoinRequests : [],
    sharedLocations,
  };
}

async function getFriendIds(me) {
  const docs = await Friendship.find({
    status: "accepted",
    $or: [{ requesterId: me }, { receiverId: me }],
  }).select("requesterId receiverId");

  const out = [];
  for (const d of docs) {
    const other =
      String(d.requesterId) === String(me) ? d.receiverId : d.requesterId;
    out.push(other);
  }
  return out;
}

function parseStartsEnds({ startsAt, endsAt, durationMinutes }) {
  const start = startsAt ? new Date(startsAt) : new Date();
  if (Number.isNaN(start.getTime())) return { error: "Invalid startsAt" };

  let end = null;
  if (endsAt) {
    end = new Date(endsAt);
  } else if (durationMinutes) {
    const mins = asNumber(durationMinutes);
    if (mins === null || mins <= 0) return { error: "Invalid durationMinutes" };
    end = new Date(start.getTime() + mins * 60 * 1000);
  }

  if (!end || Number.isNaN(end.getTime())) {
    end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  }

  if (end <= start) return { error: "endsAt must be after startsAt" };

  return { start, end };
}

// POST /hangouts
router.post("/", authRequired, async (req, res) => {
  const me = req.user.userId;
  const {
    title,
    description,
    visibility,
    location,
    lng,
    lat,
    createGroupChat,
    anyoneCanJoin,
    joinPolicy: requestedJoinPolicy,
  } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ message: "Title is required" });
  }

  const parsedLng = asNumber(location?.lng ?? lng);
  const parsedLat = asNumber(location?.lat ?? lat);
  if (parsedLng === null || parsedLat === null) {
    return res.status(400).json({ message: "Valid lng/lat required" });
  }

  const { start, end, error } = parseStartsEnds(req.body);
  if (error) return res.status(400).json({ message: error });

  const maxAttendees =
    req.body.maxAttendees === "" || req.body.maxAttendees === null
      ? null
      : asNumber(req.body.maxAttendees);
  if (maxAttendees !== null && (!Number.isInteger(maxAttendees) || maxAttendees < 1)) {
    return res.status(400).json({ message: "Invalid maxAttendees" });
  }

  const doc = await Hangout.create({
    creatorId: me,
    title: title.trim(),
    description: description?.trim() || "",
    location: { type: "Point", coordinates: [parsedLng, parsedLat] },
    startsAt: start,
    endsAt: end,
    visibility: visibility || "friends",
    joinPolicy: normalizeJoinPolicy(
      requestedJoinPolicy !== undefined ? requestedJoinPolicy : anyoneCanJoin
    ),
    maxAttendees,
    attendeeIds: [me],
    attendeeStatuses: [{ userId: me, status: "Confirmed", updatedAt: new Date() }],
  });

  if (createGroupChat !== false) {
    await Chat.create({
      type: "hangout",
      members: [me],
      name: doc.title,
      creatorId: me,
      admins: [me],
      hangoutId: doc._id,
      lastMessageAt: null,
      lastMessageText: "",
    });
  }

  await doc.populate("creatorId", "username displayName avatarUrl");
  await doc.populate("attendeeIds", "username displayName avatarUrl");

  const io = getIO();
  if (io) io.emit("hangout:new", { hangoutId: doc._id.toString() });

  res.status(201).json({ hangout: toHangoutSummary(doc, { viewerId: me }) });
});

// GET /hangouts/mine
router.get("/mine", authRequired, async (req, res) => {
  const me = req.user.userId;
  const docs = await Hangout.find({
    $or: [{ creatorId: me }, { attendeeIds: me }],
  })
    .sort({ startsAt: -1 })
    .populate("creatorId", "username displayName avatarUrl")
    .populate("attendeeIds", "username displayName avatarUrl")
    .populate("pendingJoinRequests.userId", "username displayName avatarUrl");

  return res.json({
    hangouts: docs.map((doc) => toHangoutSummary(doc, { viewerId: me })),
  });
});

// GET /hangouts/feed?lng=&lat=&radius=
router.get("/feed", authRequired, async (req, res) => {
  const me = req.user.userId;
  const lng = asNumber(req.query.lng);
  const lat = asNumber(req.query.lat);
  const radius = asNumber(req.query.radius) ?? 5000;

  if (lng === null || lat === null) {
    return res.status(400).json({ message: "Valid lng/lat required" });
  }

  const friendIds = await getFriendIds(me);
  const now = new Date();
  const query = {
    endsAt: { $gt: now },
    $or: [{ creatorId: { $in: [me, ...friendIds] } }, { visibility: "public" }],
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lng, lat] },
        $maxDistance: radius,
      },
    },
  };

  const docs = await Hangout.find(query)
    .populate("creatorId", "username displayName avatarUrl")
    .populate("attendeeIds", "username displayName avatarUrl")
    .populate("pendingJoinRequests.userId", "username displayName avatarUrl");

  docs.sort((a, b) => {
    const aStart = new Date(a.startsAt).getTime();
    const bStart = new Date(b.startsAt).getTime();
    if (aStart !== bStart) return aStart - bStart;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  res.json({ hangouts: docs.map((doc) => toHangoutSummary(doc, { viewerId: me })) });
});

// GET /hangouts/:id
router.get("/:id", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid hangout id" });
  }

  const doc = await Hangout.findById(id)
    .populate("creatorId", "username displayName avatarUrl")
    .populate("attendeeIds", "username displayName avatarUrl")
    .populate("pendingJoinRequests.userId", "username displayName avatarUrl");

  if (!doc) return res.status(404).json({ message: "Hangout not found" });

  const friendIds = await getFriendIds(me);
  const isCreator = String(doc.creatorId?._id) === String(me);
  const isFriend = friendIds.some((fid) => String(fid) === String(doc.creatorId?._id));
  const isPublic = doc.visibility === "public";

  if (!isCreator && !isFriend && !isPublic) {
    return res.status(403).json({ message: "Not allowed" });
  }

  res.json({
    hangout: toHangoutSummary(doc, { includeSharedLocations: true, viewerId: me }),
  });
});

// POST /hangouts/:id/join
router.post("/:id/join", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid hangout id" });
  }

  const doc = await Hangout.findById(id);
  if (!doc) return res.status(404).json({ message: "Hangout not found" });

  if (doc.endsAt <= new Date()) {
    return res.status(400).json({ message: "Hangout already ended" });
  }

  const friendIds = await getFriendIds(me);
  const isCreator = String(doc.creatorId) === String(me);
  const isFriend = friendIds.some((fid) => String(fid) === String(doc.creatorId));
  const isPublic = doc.visibility === "public";
  if (!isCreator && !isFriend && !isPublic) {
    return res.status(403).json({ message: "Not allowed" });
  }

  const alreadyJoined = doc.attendeeIds.some((id) => String(id) === String(me));
  const alreadyRequested = (doc.pendingJoinRequests || []).some(
    (entry) => String(entry?.userId || "") === String(me)
  );
  if (!alreadyJoined && alreadyRequested) {
    const refreshed = await Hangout.findById(id)
      .populate("creatorId", "username displayName avatarUrl")
      .populate("attendeeIds", "username displayName avatarUrl")
      .populate("pendingJoinRequests.userId", "username displayName avatarUrl");
    return res.status(409).json({
      message: "Join request already pending",
      pending: true,
      hangout: toHangoutSummary(refreshed || doc, {
        includeSharedLocations: true,
        viewerId: me,
      }),
    });
  }
  if (alreadyJoined) {
    const refreshed = await Hangout.findById(id)
      .populate("creatorId", "username displayName avatarUrl")
      .populate("attendeeIds", "username displayName avatarUrl")
      .populate("pendingJoinRequests.userId", "username displayName avatarUrl");
    return res.json({
      hangout: toHangoutSummary(refreshed || doc, {
        includeSharedLocations: true,
        viewerId: me,
      }),
    });
  }
  if (!alreadyJoined && doc.maxAttendees && doc.attendeeIds.length >= doc.maxAttendees) {
    return res.status(409).json({ message: "Hangout is full" });
  }
  const joinPolicy = doc.joinPolicy || "open";

  if (!alreadyJoined && !isCreator && joinPolicy === "approval") {
    const requestedAt = new Date();
    const updated = await Hangout.findByIdAndUpdate(
      id,
      { $push: { pendingJoinRequests: { userId: me, requestedAt } } },
      { new: true }
    )
      .populate("creatorId", "username displayName avatarUrl")
      .populate("attendeeIds", "username displayName avatarUrl")
      .populate("pendingJoinRequests.userId", "username displayName avatarUrl");

    const io = getIO();
    if (io) io.emit("hangout:update", { hangoutId: id, pendingJoinRequest: true });

    return res.json({
      pending: true,
      hangout: toHangoutSummary(updated, { includeSharedLocations: true, viewerId: me }),
    });
  }

  const updated = await Hangout.findByIdAndUpdate(
    id,
    {
      $addToSet: { attendeeIds: me },
      $pull: { pendingJoinRequests: { userId: me }, attendeeStatuses: { userId: me } },
      $push: { attendeeStatuses: { userId: me, status: "Confirmed", updatedAt: new Date() } },
    },
    { new: true }
  )
    .populate("creatorId", "username displayName avatarUrl")
    .populate("attendeeIds", "username displayName avatarUrl")
    .populate("pendingJoinRequests.userId", "username displayName avatarUrl");

  const chat = await Chat.findOne({ type: "hangout", hangoutId: id });
  if (chat) {
    await Chat.updateOne({ _id: chat._id }, { $addToSet: { members: me } });
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });

  res.json({ hangout: toHangoutSummary(updated, { includeSharedLocations: true, viewerId: me }) });
});

// POST /hangouts/:id/join-requests/:userId/accept
router.post("/:id/join-requests/:userId/accept", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id, userId } = req.params;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const doc = await Hangout.findById(id);
  if (!doc) return res.status(404).json({ message: "Hangout not found" });
  if (String(doc.creatorId) !== String(me)) {
    return res.status(403).json({ message: "Only creator can approve requests" });
  }
  const hasRequest = (doc.pendingJoinRequests || []).some(
    (entry) => String(entry?.userId || "") === String(userId)
  );
  if (!hasRequest) {
    return res.status(404).json({ message: "Join request not found" });
  }
  if (doc.maxAttendees && doc.attendeeIds.length >= doc.maxAttendees) {
    return res.status(409).json({ message: "Hangout is full" });
  }

  const updated = await Hangout.findByIdAndUpdate(
    id,
    {
      $addToSet: { attendeeIds: userId },
      $pull: { pendingJoinRequests: { userId }, attendeeStatuses: { userId } },
      $push: { attendeeStatuses: { userId, status: "Confirmed", updatedAt: new Date() } },
      $push: {
        approvedJoinEvents: {
          userId,
          approvedById: me,
          approvedAt: new Date(),
        },
      },
    },
    { new: true }
  )
    .populate("creatorId", "username displayName avatarUrl")
    .populate("attendeeIds", "username displayName avatarUrl")
    .populate("pendingJoinRequests.userId", "username displayName avatarUrl");

  const chat = await Chat.findOne({ type: "hangout", hangoutId: id });
  if (chat) {
    await Chat.updateOne({ _id: chat._id }, { $addToSet: { members: userId } });
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });
  emitToUser(userId, "hangout_join_request:accepted", {
    hangoutId: String(id),
    requestUserId: String(userId),
    creatorId: String(me),
  });
  res.json({
    ok: true,
    hangout: toHangoutSummary(updated, { includeSharedLocations: true, viewerId: me }),
  });
});

// POST /hangouts/:id/join-requests/:userId/decline
router.post("/:id/join-requests/:userId/decline", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id, userId } = req.params;
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const doc = await Hangout.findById(id);
  if (!doc) return res.status(404).json({ message: "Hangout not found" });
  if (String(doc.creatorId) !== String(me)) {
    return res.status(403).json({ message: "Only creator can decline requests" });
  }
  const hasRequest = (doc.pendingJoinRequests || []).some(
    (entry) => String(entry?.userId || "") === String(userId)
  );
  if (!hasRequest) {
    return res.status(404).json({ message: "Join request not found" });
  }

  const updated = await Hangout.findByIdAndUpdate(
    id,
    { $pull: { pendingJoinRequests: { userId } } },
    { new: true }
  )
    .populate("creatorId", "username displayName avatarUrl")
    .populate("attendeeIds", "username displayName avatarUrl")
    .populate("pendingJoinRequests.userId", "username displayName avatarUrl");

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });
  res.json({
    ok: true,
    hangout: toHangoutSummary(updated, { includeSharedLocations: true, viewerId: me }),
  });
});

// POST /hangouts/:id/leave
router.post("/:id/leave", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid hangout id" });
  }

  const doc = await Hangout.findById(id);
  if (!doc) return res.status(404).json({ message: "Hangout not found" });

  if (String(doc.creatorId) === String(me)) {
    return res.status(400).json({ message: "Creator cannot leave hangout" });
  }

  const updated = await Hangout.findByIdAndUpdate(
    id,
    {
      $pull: {
        attendeeIds: me,
        attendeeStatuses: { userId: me },
        sharedLocations: { userId: me },
      },
    },
    { new: true }
  )
    .populate("creatorId", "username displayName avatarUrl")
    .populate("attendeeIds", "username displayName avatarUrl");

  const chat = await Chat.findOne({ type: "hangout", hangoutId: id });
  if (chat) {
    await Chat.updateOne({ _id: chat._id }, { $pull: { members: me } });
    await ChatSetting.deleteOne({ chatId: chat._id, userId: me });
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });

  res.json({ hangout: toHangoutSummary(updated, { includeSharedLocations: true, viewerId: me }) });
});

// POST /hangouts/:id/remove-attendee  { userId }
router.post("/:id/remove-attendee", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;
  const { userId } = req.body || {};

  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(userId)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const doc = await Hangout.findById(id);
  if (!doc) return res.status(404).json({ message: "Hangout not found" });
  if (String(doc.creatorId) !== String(me)) {
    return res.status(403).json({ message: "Only creator can remove attendees" });
  }
  if (String(userId) === String(me)) {
    return res.status(400).json({ message: "Creator cannot remove themselves" });
  }

  const isAttendee = (doc.attendeeIds || []).some((uid) => String(uid) === String(userId));
  if (!isAttendee) {
    await doc.populate("creatorId", "username displayName avatarUrl");
    await doc.populate("attendeeIds", "username displayName avatarUrl");
    await doc.populate("pendingJoinRequests.userId", "username displayName avatarUrl");
    return res.json({
      ok: true,
      removedAlready: true,
      hangout: toHangoutSummary(doc, { includeSharedLocations: true, viewerId: me }),
    });
  }

  const updated = await Hangout.findByIdAndUpdate(
    id,
    {
      $pull: {
        attendeeIds: userId,
        attendeeStatuses: { userId },
        sharedLocations: { userId },
        pendingJoinRequests: { userId },
      },
    },
    { new: true }
  )
    .populate("creatorId", "username displayName avatarUrl")
    .populate("attendeeIds", "username displayName avatarUrl")
    .populate("pendingJoinRequests.userId", "username displayName avatarUrl");

  const chat = await Chat.findOne({ type: "hangout", hangoutId: id });
  if (chat) {
    await Chat.updateOne({ _id: chat._id }, { $pull: { members: userId } });
    await ChatSetting.deleteOne({ chatId: chat._id, userId });
  }

  if (chat) {
    try {
      const [creatorUser, removedUser] = await Promise.all([
        User.findById(me).select("username displayName"),
        User.findById(userId).select("username displayName"),
      ]);
      const creatorName =
        creatorUser?.displayName || creatorUser?.username || "Creator";
      const removedName =
        removedUser?.displayName || removedUser?.username || "User";
      const systemText = `${creatorName} removed ${removedName} from the chat and hangout.`;
      await emitSystemMessage(chat._id, me, systemText);
    } catch (err) {
      console.error("Failed to emit hangout removal system message:", err);
    }
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id, attendeeRemovedUserId: String(userId) });

  res.json({ ok: true, hangout: toHangoutSummary(updated, { includeSharedLocations: true, viewerId: me }) });
});

// PATCH /hangouts/:id/attendees/me/status
router.patch("/:id/attendees/me/status", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;
  const cleanStatus = String(req.body?.status || "").trim();

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid hangout id" });
  }
  if (!ATTENDEE_STATUS_OPTIONS.has(cleanStatus)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const doc = await Hangout.findById(id);
  if (!doc) return res.status(404).json({ message: "Hangout not found" });

  const isAttendee = (doc.attendeeIds || []).some((uid) => String(uid) === String(me));
  if (!isAttendee) {
    return res.status(403).json({ message: "Only attendees can update status" });
  }

  const updatedAt = new Date();
  const filtered = (doc.attendeeStatuses || []).filter(
    (entry) => String(entry?.userId || "") !== String(me)
  );
  filtered.push({ userId: me, status: cleanStatus, updatedAt });
  doc.attendeeStatuses = filtered;
  await doc.save();
  await doc.populate("creatorId", "username displayName avatarUrl");
  await doc.populate("attendeeIds", "username displayName avatarUrl");
  await doc.populate("pendingJoinRequests.userId", "username displayName avatarUrl");

  const io = getIO();
  if (io) {
    io.to(`hangout:${String(id)}`).emit("hangout:attendeeStatusUpdated", {
      hangoutId: String(id),
      userId: String(me),
      status: cleanStatus,
      updatedAt,
    });
  }

  return res.json({
    ok: true,
    attendee: { userId: String(me), status: cleanStatus, updatedAt },
    hangout: toHangoutSummary(doc, { includeSharedLocations: true, viewerId: me }),
  });
});

// DELETE /hangouts/:id
router.delete("/:id", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid hangout id" });
  }

  const doc = await Hangout.findById(id);
  if (!doc) return res.status(404).json({ message: "Hangout not found" });

  if (String(doc.creatorId) !== String(me)) {
    return res.status(403).json({ message: "Only creator can delete" });
  }

  await Hangout.deleteOne({ _id: id });

  const chat = await Chat.findOne({ type: "hangout", hangoutId: id });
  if (chat) {
    await Message.deleteMany({ chatId: chat._id });
    await ChatSetting.deleteMany({ chatId: chat._id });
    await Chat.deleteOne({ _id: chat._id });
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id, deleted: true });

  res.json({ ok: true });
});

// PATCH /hangouts/:id
router.patch("/:id", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid hangout id" });
  }

  const doc = await Hangout.findById(id);
  if (!doc) return res.status(404).json({ message: "Hangout not found" });

  if (String(doc.creatorId) !== String(me)) {
    return res.status(403).json({ message: "Only creator can edit" });
  }

  const {
    title,
    description,
    visibility,
    location,
    lng,
    lat,
    anyoneCanJoin,
    joinPolicy: requestedJoinPolicy,
  } = req.body;
  const prevTitle = doc.title;
  const previousStartsAtMs = new Date(doc.startsAt).getTime();
  let startsAtChanged = false;
  let nextStartsAtValue = null;
  if (title !== undefined) {
    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Title is required" });
    }
    doc.title = title.trim();
  }
  if (description !== undefined) {
    doc.description = description?.trim() || "";
  }
  if (visibility) {
    if (!["friends", "public"].includes(visibility)) {
      return res.status(400).json({ message: "Invalid visibility" });
    }
    doc.visibility = visibility;
  }
  if (requestedJoinPolicy !== undefined || anyoneCanJoin !== undefined) {
    doc.joinPolicy = normalizeJoinPolicy(
      requestedJoinPolicy !== undefined ? requestedJoinPolicy : anyoneCanJoin
    );
  }

  if (location || lng !== undefined || lat !== undefined) {
    const parsedLng = asNumber(location?.lng ?? lng);
    const parsedLat = asNumber(location?.lat ?? lat);
    if (parsedLng === null || parsedLat === null) {
      return res.status(400).json({ message: "Valid lng/lat required" });
    }
    doc.location = { type: "Point", coordinates: [parsedLng, parsedLat] };
  }

  if (req.body.startsAt || req.body.endsAt || req.body.durationMinutes) {
    const { start, end, error } = parseStartsEnds(req.body);
    if (error) return res.status(400).json({ message: error });
    doc.startsAt = start;
    doc.endsAt = end;
    nextStartsAtValue = start;
    const nextStartsAtMs = new Date(start).getTime();
    startsAtChanged =
      Number.isFinite(previousStartsAtMs) &&
      Number.isFinite(nextStartsAtMs) &&
      previousStartsAtMs !== nextStartsAtMs;
  }

  if (req.body.maxAttendees !== undefined) {
    const maxAttendees =
      req.body.maxAttendees === "" || req.body.maxAttendees === null
        ? null
        : asNumber(req.body.maxAttendees);
    if (maxAttendees !== null && (!Number.isInteger(maxAttendees) || maxAttendees < 1)) {
      return res.status(400).json({ message: "Invalid maxAttendees" });
    }
    if (maxAttendees !== null && doc.attendeeIds.length > maxAttendees) {
      return res
        .status(400)
        .json({ message: "maxAttendees cannot be below current attendees" });
    }
    doc.maxAttendees = maxAttendees;
  }

  await doc.save();
  if (startsAtChanged && nextStartsAtValue) {
    await Hangout.updateOne(
      { _id: id },
      {
        $push: {
          startsAtEditEvents: {
            editedById: me,
            previousStartsAt: new Date(previousStartsAtMs),
            nextStartsAt: nextStartsAtValue,
            editedAt: new Date(),
          },
        },
      }
    );
  }
  await doc.populate("creatorId", "username displayName avatarUrl");
  await doc.populate("attendeeIds", "username displayName avatarUrl");

  if (prevTitle !== doc.title) {
    await Chat.updateOne(
      { type: "hangout", hangoutId: id },
      { $set: { name: doc.title } }
    );
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });

  res.json({ hangout: toHangoutSummary(doc, { includeSharedLocations: true, viewerId: me }) });
});

// PATCH /hangouts/:id/share-location  { lng, lat }
router.patch("/:id/share-location", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid hangout id" });
  }

  const doc = await Hangout.findById(id);
  if (!doc) return res.status(404).json({ message: "Hangout not found" });

  const isMember = doc.attendeeIds.some((uid) => String(uid) === String(me));
  if (!isMember) {
    return res.status(403).json({ message: "Only attendees can share location" });
  }

  const parsedLng = asNumber(req.body?.lng);
  const parsedLat = asNumber(req.body?.lat);
  if (parsedLng === null || parsedLat === null) {
    return res.status(400).json({ message: "Valid lng/lat required" });
  }
  const note =
    typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 20) : undefined;

  const location = { type: "Point", coordinates: [parsedLng, parsedLat] };
  const now = new Date();

  const setPatch = {
    "sharedLocations.$.location": location,
    "sharedLocations.$.updatedAt": now,
  };
  if (note !== undefined) setPatch["sharedLocations.$.note"] = note;

  let updated = await Hangout.findOneAndUpdate(
    { _id: id, "sharedLocations.userId": me },
    { $set: setPatch },
    { new: true }
  )
    .populate("creatorId", "username displayName avatarUrl")
    .populate("attendeeIds", "username displayName avatarUrl");

  if (!updated) {
    updated = await Hangout.findByIdAndUpdate(
      id,
      {
        $push: {
          sharedLocations: {
            userId: me,
            location,
            updatedAt: now,
            note: note || "",
          },
        },
      },
      { new: true }
    )
      .populate("creatorId", "username displayName avatarUrl")
      .populate("attendeeIds", "username displayName avatarUrl");
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });

  res.json({ hangout: toHangoutSummary(updated, { includeSharedLocations: true, viewerId: me }) });
});

// PATCH /hangouts/:id/share-location/note  { note }
router.patch("/:id/share-location/note", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid hangout id" });
  }

  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  if (note.length > 20) {
    return res.status(400).json({ message: "Note too long (max 20)" });
  }

  const updated = await Hangout.findOneAndUpdate(
    { _id: id, "sharedLocations.userId": me },
    { $set: { "sharedLocations.$.note": note } },
    { new: true }
  )
    .populate("creatorId", "username displayName avatarUrl")
    .populate("attendeeIds", "username displayName avatarUrl");

  if (!updated) {
    return res.status(400).json({ message: "Location sharing not enabled" });
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });

  res.json({ hangout: toHangoutSummary(updated, { includeSharedLocations: true, viewerId: me }) });
});

// POST /hangouts/:id/share-location/stop
router.post("/:id/share-location/stop", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid hangout id" });
  }

  const updated = await Hangout.findByIdAndUpdate(
    id,
    { $pull: { sharedLocations: { userId: me } } },
    { new: true }
  )
    .populate("creatorId", "username displayName avatarUrl")
    .populate("attendeeIds", "username displayName avatarUrl");

  if (!updated) return res.status(404).json({ message: "Hangout not found" });

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });

  res.json({ hangout: toHangoutSummary(updated, { includeSharedLocations: true, viewerId: me }) });
});

module.exports = router;
