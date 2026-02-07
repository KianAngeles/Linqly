const express = require("express");
const mongoose = require("mongoose");
const Hangout = require("../models/Hangout");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const ChatSetting = require("../models/ChatSetting");
const Friendship = require("../models/Friendship");
const { authRequired } = require("../middleware/authRequired");
const { getIO } = require("../realtime");

const router = express.Router();

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toUserSummary(user) {
  if (!user) return null;
  return {
    id: user._id,
    username: user.username,
    avatarUrl: user.avatarUrl || null,
  };
}

function toHangoutSummary(doc, opts = {}) {
  const { includeSharedLocations = false } = opts;
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

  return {
    _id: doc._id,
    title: doc.title,
    description: doc.description || "",
    location: doc.location,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt,
    maxAttendees: doc.maxAttendees ?? null,
    visibility: doc.visibility || "friends",
    avatarUrl: doc.avatarUrl || null,
    creator: toUserSummary(doc.creatorId),
    attendees: (doc.attendeeIds || []).map(toUserSummary),
    attendeeCount: (doc.attendeeIds || []).length,
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
  const { title, description, visibility, location, lng, lat, createGroupChat } = req.body;

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
    maxAttendees,
    attendeeIds: [me],
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

  await doc.populate("creatorId", "username avatarUrl");
  await doc.populate("attendeeIds", "username avatarUrl");

  const io = getIO();
  if (io) io.emit("hangout:new", { hangoutId: doc._id.toString() });

  res.status(201).json({ hangout: toHangoutSummary(doc) });
});

// GET /hangouts/mine
router.get("/mine", authRequired, async (req, res) => {
  const me = req.user.userId;
  const docs = await Hangout.find({
    $or: [{ creatorId: me }, { attendeeIds: me }],
  })
    .sort({ startsAt: -1 })
    .populate("creatorId", "username avatarUrl")
    .populate("attendeeIds", "username avatarUrl");

  return res.json({ hangouts: docs.map((doc) => toHangoutSummary(doc)) });
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
    .populate("creatorId", "username avatarUrl")
    .populate("attendeeIds", "username avatarUrl");

  docs.sort((a, b) => {
    const aStart = new Date(a.startsAt).getTime();
    const bStart = new Date(b.startsAt).getTime();
    if (aStart !== bStart) return aStart - bStart;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  res.json({ hangouts: docs.map(toHangoutSummary) });
});

// GET /hangouts/:id
router.get("/:id", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: "Invalid hangout id" });
  }

  const doc = await Hangout.findById(id)
    .populate("creatorId", "username avatarUrl")
    .populate("attendeeIds", "username avatarUrl");

  if (!doc) return res.status(404).json({ message: "Hangout not found" });

  const friendIds = await getFriendIds(me);
  const isCreator = String(doc.creatorId?._id) === String(me);
  const isFriend = friendIds.some((fid) => String(fid) === String(doc.creatorId?._id));
  const isPublic = doc.visibility === "public";

  if (!isCreator && !isFriend && !isPublic) {
    return res.status(403).json({ message: "Not allowed" });
  }

  res.json({ hangout: toHangoutSummary(doc, { includeSharedLocations: true }) });
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
  if (!alreadyJoined && doc.maxAttendees && doc.attendeeIds.length >= doc.maxAttendees) {
    return res.status(409).json({ message: "Hangout is full" });
  }

  const updated = await Hangout.findByIdAndUpdate(
    id,
    { $addToSet: { attendeeIds: me } },
    { new: true }
  )
    .populate("creatorId", "username avatarUrl")
    .populate("attendeeIds", "username avatarUrl");

  const chat = await Chat.findOne({ type: "hangout", hangoutId: id });
  if (chat) {
    await Chat.updateOne({ _id: chat._id }, { $addToSet: { members: me } });
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });

  res.json({ hangout: toHangoutSummary(updated, { includeSharedLocations: true }) });
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
    { $pull: { attendeeIds: me, sharedLocations: { userId: me } } },
    { new: true }
  )
    .populate("creatorId", "username avatarUrl")
    .populate("attendeeIds", "username avatarUrl");

  const chat = await Chat.findOne({ type: "hangout", hangoutId: id });
  if (chat) {
    await Chat.updateOne({ _id: chat._id }, { $pull: { members: me } });
    await ChatSetting.deleteOne({ chatId: chat._id, userId: me });
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });

  res.json({ hangout: toHangoutSummary(updated, { includeSharedLocations: true }) });
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

  const { title, description, visibility, location, lng, lat } = req.body;
  const prevTitle = doc.title;
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
  await doc.populate("creatorId", "username avatarUrl");
  await doc.populate("attendeeIds", "username avatarUrl");

  if (prevTitle !== doc.title) {
    await Chat.updateOne(
      { type: "hangout", hangoutId: id },
      { $set: { name: doc.title } }
    );
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });

  res.json({ hangout: toHangoutSummary(doc, { includeSharedLocations: true }) });
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
    .populate("creatorId", "username avatarUrl")
    .populate("attendeeIds", "username avatarUrl");

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
      .populate("creatorId", "username avatarUrl")
      .populate("attendeeIds", "username avatarUrl");
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });

  res.json({ hangout: toHangoutSummary(updated, { includeSharedLocations: true }) });
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
    .populate("creatorId", "username avatarUrl")
    .populate("attendeeIds", "username avatarUrl");

  if (!updated) {
    return res.status(400).json({ message: "Location sharing not enabled" });
  }

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });

  res.json({ hangout: toHangoutSummary(updated, { includeSharedLocations: true }) });
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
    .populate("creatorId", "username avatarUrl")
    .populate("attendeeIds", "username avatarUrl");

  if (!updated) return res.status(404).json({ message: "Hangout not found" });

  const io = getIO();
  if (io) io.emit("hangout:update", { hangoutId: id });

  res.json({ hangout: toHangoutSummary(updated, { includeSharedLocations: true }) });
});

module.exports = router;
