const express = require("express");
const mongoose = require("mongoose");
const Friendship = require("../models/Friendship");
const User = require("../models/User");
const { authRequired } = require("../middleware/authRequired");
const { makePairKey } = require("../utils/pairKey");
const {
  onlineUsers,
  getIO,
  sharedLocations,
  setSharedLocation,
  clearSharedLocation,
} = require("../realtime");

const router = express.Router();

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getFriendIds(userId) {
  const docs = await Friendship.find({
    status: "accepted",
    $or: [{ requesterId: userId }, { receiverId: userId }],
  }).select("requesterId receiverId");

  return docs.map((d) =>
    String(d.requesterId) === String(userId) ? d.receiverId : d.requesterId
  );
}

// POST /friends/request  { userId }
router.post("/request", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ message: "userId required" });
  if (!mongoose.isValidObjectId(userId))
    return res.status(400).json({ message: "Invalid userId" });
  if (String(userId) === String(me))
    return res.status(400).json({ message: "You cannot friend yourself" });

  const pairKey = makePairKey(me, userId);

  try {
    const doc = await Friendship.create({
      requesterId: me,
      receiverId: userId,
      pairKey,
      status: "pending",
    });

    // ✅ emit BEFORE return
    const io = getIO();
    const targetSockets = onlineUsers.get(String(userId));
    if (io && targetSockets) {
      targetSockets.forEach((sid) => {
        io.to(sid).emit("friends:request", { fromUserId: me });
      });
    }

    return res.status(201).json({ ok: true, friendshipId: doc._id });
  } catch (err) {
    const existing = await Friendship.findOne({ pairKey });

    if (!existing)
      return res.status(500).json({ message: "Failed to create request" });

    if (existing.status === "blocked")
      return res.status(403).json({ message: "Cannot send request (blocked)" });

    if (existing.status === "accepted")
      return res.status(409).json({ message: "Already friends" });

    return res.status(409).json({ message: "Friend request already exists" });
  }
});
// POST /friends/accept { userId }
router.post("/accept", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ message: "userId required" });

  const pairKey = makePairKey(me, userId);

  const doc = await Friendship.findOne({ pairKey });
  if (!doc) return res.status(404).json({ message: "Request not found" });

  if (doc.status === "blocked")
    return res.status(403).json({ message: "Blocked" });
  if (doc.status === "accepted") return res.json({ ok: true });

  // Only receiver can accept
  if (String(doc.receiverId) !== String(me)) {
    return res.status(403).json({ message: "Only the receiver can accept" });
  }

  doc.status = "accepted";
  await doc.save();

  res.json({ ok: true });

  // ✅ notify requester live
  const io = getIO();
  const requesterSockets = onlineUsers.get(String(doc.requesterId));
  if (io && requesterSockets) {
    requesterSockets.forEach((sid) => {
      io.to(sid).emit("friends:accepted", { userId: me });
    });
  }
});

// POST /friends/reject { userId }
router.post("/reject", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ message: "userId required" });

  const pairKey = makePairKey(me, userId);
  const doc = await Friendship.findOne({ pairKey });
  if (!doc) return res.status(404).json({ message: "Request not found" });

  // Only receiver can reject pending
  if (doc.status !== "pending")
    return res.status(400).json({ message: "Not pending" });

  if (String(doc.receiverId) !== String(me)) {
    return res.status(403).json({ message: "Only the receiver can reject" });
  }

  await Friendship.deleteOne({ _id: doc._id });
  res.json({ ok: true });

  // ✅ notify requester live
  const io = getIO();
  const requesterSockets = onlineUsers.get(String(doc.requesterId));
  if (io && requesterSockets) {
    requesterSockets.forEach((sid) => {
      io.to(sid).emit("friends:updated");
    });
  }
});

// POST /friends/cancel { userId }
router.post("/cancel", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ message: "userId required" });

  const pairKey = makePairKey(me, userId);
  const doc = await Friendship.findOne({ pairKey });
  if (!doc) return res.status(404).json({ message: "Request not found" });

  if (doc.status !== "pending")
    return res.status(400).json({ message: "Not pending" });

  // Only requester can cancel
  if (String(doc.requesterId) !== String(me)) {
    return res.status(403).json({ message: "Only requester can cancel" });
  }

  await Friendship.deleteOne({ _id: doc._id });
  res.json({ ok: true });

  // ✅ notify receiver live
  const io = getIO();
  const receiverSockets = onlineUsers.get(String(doc.receiverId));
  if (io && receiverSockets) {
    receiverSockets.forEach((sid) => {
      io.to(sid).emit("friends:updated");
    });
  }
});

// POST /friends/remove { userId }
router.post("/remove", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ message: "userId required" });

  const pairKey = makePairKey(me, userId);
  const doc = await Friendship.findOne({ pairKey });
  if (!doc) return res.status(404).json({ message: "Friendship not found" });

  if (doc.status === "blocked") {
    return res.status(403).json({ message: "Blocked" });
  }

  await Friendship.deleteOne({ _id: doc._id });
  res.json({ ok: true });

  // notify other user live
  const io = getIO();
  const otherId =
    String(doc.requesterId) === String(me)
      ? String(doc.receiverId)
      : String(doc.requesterId);

  const otherSockets = onlineUsers.get(otherId);
  if (io && otherSockets) {
    otherSockets.forEach((sid) => {
      io.to(sid).emit("friends:updated");
    });
  }
});

// POST /friends/block { userId }
router.post("/block", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ message: "userId required" });

  const pairKey = makePairKey(me, userId);

  const doc = await Friendship.findOne({ pairKey });

  if (!doc) {
    // Create as blocked even if no previous relationship
    await Friendship.create({
      requesterId: me,
      receiverId: userId,
      pairKey,
      status: "blocked",
      blockedBy: me,
    });
    return res.json({ ok: true });
  }

  doc.status = "blocked";
  doc.blockedBy = me;
  await doc.save();
  res.json({ ok: true });
});

// POST /friends/unblock { userId }
router.post("/unblock", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ message: "userId required" });

  const pairKey = makePairKey(me, userId);
  const doc = await Friendship.findOne({ pairKey });
  if (!doc) return res.json({ ok: true });

  if (doc.status !== "blocked") return res.json({ ok: true });
  if (String(doc.blockedBy) !== String(me)) {
    return res.status(403).json({ message: "Only blocker can unblock" });
  }

  await Friendship.deleteOne({ _id: doc._id });
  res.json({ ok: true });
});

// GET /friends/list
router.get("/list", authRequired, async (req, res) => {
  const me = req.user.userId;

  const docs = await Friendship.find({
    status: { $in: ["pending", "accepted"] },
    $or: [{ requesterId: me }, { receiverId: me }],
  })
    .populate("requesterId", "username email avatarUrl displayName")
    .populate("receiverId", "username email avatarUrl displayName")
    .sort({ updatedAt: -1 });

  const myFriendIds = await getFriendIds(me);
  const myFriendSet = new Set(myFriendIds.map((id) => String(id)));
  const otherIds = Array.from(
    new Set(
      docs
        .map((d) => {
          const requester = d.requesterId;
          const receiver = d.receiverId;
          const other = requester._id.toString() === me ? receiver : requester;
          return other?._id ? String(other._id) : null;
        })
        .filter(Boolean)
    )
  );

  const mutualMap = new Map();
  await Promise.all(
    otherIds.map(async (otherId) => {
      const otherFriendIds = await getFriendIds(otherId);
      let count = 0;
      otherFriendIds.forEach((id) => {
        if (myFriendSet.has(String(id))) count += 1;
      });
      mutualMap.set(String(otherId), count);
    })
  );

  const pendingIncoming = [];
  const pendingOutgoing = [];
  const friends = [];

  for (const d of docs) {
    const requester = d.requesterId;
    const receiver = d.receiverId;

    const other = requester._id.toString() === me ? receiver : requester;

    const base = {
      user: {
        id: other._id,
        username: other.username,
        displayName: other.displayName || null,
        email: other.email,
        avatarUrl: other.avatarUrl || null,
        isOnline: onlineUsers.has(String(other._id)),
        mutualFriendsCount: mutualMap.get(String(other._id)) || 0,
      },
      friendshipId: d._id,
      updatedAt: d.updatedAt,
    };

    if (d.status === "accepted") friends.push(base);
    else {
      // pending
      if (receiver._id.toString() === me) pendingIncoming.push(base);
      else pendingOutgoing.push(base);
    }
  }

  res.json({ friends, pendingIncoming, pendingOutgoing });
});

// GET /friends/presence
router.get("/presence", authRequired, async (req, res) => {
  const me = req.user.userId;

  const friendIds = await getFriendIds(me);

  const onlineFriends = friendIds.filter((id) =>
    onlineUsers.has(String(id))
  ).length;

  res.json({ totalFriends: friendIds.length, onlineFriends });
});

// GET /friends/locations
router.get("/locations", authRequired, async (req, res) => {
  const me = req.user.userId;
  const friendIds = await getFriendIds(me);
  const activeIds = friendIds.filter((id) => sharedLocations.has(String(id)));

  if (activeIds.length === 0) {
    return res.json({ locations: [] });
  }

  const users = await User.find({ _id: { $in: activeIds } }).select(
    "username avatarUrl"
  );
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const locations = activeIds
    .map((id) => {
      const entry = sharedLocations.get(String(id));
      const user = userMap.get(String(id));
      if (!entry || !user) return null;
      return {
        user: {
          id: String(user._id),
          username: user.username,
          avatarUrl: user.avatarUrl || null,
        },
        location: entry.location,
        note: entry.note || "",
        updatedAt: entry.updatedAt,
      };
    })
    .filter(Boolean);

  return res.json({ locations });
});

// PATCH /friends/location { lng, lat, note }
router.patch("/location", authRequired, async (req, res) => {
  const me = req.user.userId;
  const lng = asNumber(req.body?.lng);
  const lat = asNumber(req.body?.lat);
  const rawNote = typeof req.body?.note === "string" ? req.body.note : "";
  const note = rawNote.trim().slice(0, 16);
  if (lng === null || lat === null) {
    return res.status(400).json({ message: "Valid lng/lat required" });
  }

  const entry = setSharedLocation(me, { lng, lat }, note);
  const user = await User.findById(me).select("username avatarUrl");
  if (!user) return res.status(404).json({ message: "User not found" });

  const payload = {
    user: {
      id: String(user._id),
      username: user.username,
      avatarUrl: user.avatarUrl || null,
    },
    location: entry.location,
    note: entry.note || "",
    updatedAt: entry.updatedAt,
  };

  const friendIds = await getFriendIds(me);
  const io = getIO();
  if (io) {
    friendIds.forEach((friendId) => {
      const sockets = onlineUsers.get(String(friendId));
      if (!sockets) return;
      sockets.forEach((sid) => {
        io.to(sid).emit("friends:location", payload);
      });
    });
  }

  return res.json({
    ok: true,
    location: payload.location,
    note: payload.note,
    updatedAt: payload.updatedAt,
  });
});

// POST /friends/location/stop
router.post("/location/stop", authRequired, async (req, res) => {
  const me = req.user.userId;
  const removed = clearSharedLocation(me);
  if (!removed) return res.json({ ok: true });

  const friendIds = await getFriendIds(me);
  const io = getIO();
  if (io) {
    friendIds.forEach((friendId) => {
      const sockets = onlineUsers.get(String(friendId));
      if (!sockets) return;
      sockets.forEach((sid) => {
        io.to(sid).emit("friends:location:stop", { userId: String(me) });
      });
    });
  }

  return res.json({ ok: true });
});

module.exports = router;
