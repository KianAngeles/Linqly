const express = require("express");
const mongoose = require("mongoose");
const Friendship = require("../models/Friendship");
const { authRequired } = require("../middleware/authRequired");
const { makePairKey } = require("../utils/pairKey");
const { onlineUsers, getIO } = require("../realtime");

const router = express.Router();

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
    const targetSocket = onlineUsers.get(String(userId));
    if (io && targetSocket) {
      io.to(targetSocket).emit("friends:request", { fromUserId: me });
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
  const requesterSocket = onlineUsers.get(String(doc.requesterId));
  if (io && requesterSocket) {
    io.to(requesterSocket).emit("friends:accepted", { userId: me });
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
  const sid = onlineUsers.get(String(doc.requesterId));
  if (io && sid) {
    io.to(sid).emit("friends:updated");
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
  const receiverSocket = onlineUsers.get(String(doc.receiverId));
  if (io && receiverSocket) {
    io.to(receiverSocket).emit("friends:updated");
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

  const sid = onlineUsers.get(otherId);
  if (io && sid) io.to(sid).emit("friends:updated");
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

// GET /friends/list
router.get("/list", authRequired, async (req, res) => {
  const me = req.user.userId;

  const docs = await Friendship.find({
    status: { $in: ["pending", "accepted"] },
    $or: [{ requesterId: me }, { receiverId: me }],
  })
    .populate("requesterId", "username email avatarUrl")
    .populate("receiverId", "username email avatarUrl")
    .sort({ updatedAt: -1 });

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
        email: other.email,
        avatarUrl: other.avatarUrl || null,
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

  const docs = await Friendship.find({
    status: "accepted",
    $or: [{ requesterId: me }, { receiverId: me }],
  }).select("requesterId receiverId");

  const friendIds = docs.map((d) =>
    String(d.requesterId) === String(me) ? d.receiverId : d.requesterId
  );

  const onlineFriends = friendIds.filter((id) =>
    onlineUsers.has(String(id))
  ).length;

  res.json({ totalFriends: friendIds.length, onlineFriends });
});

module.exports = router;
