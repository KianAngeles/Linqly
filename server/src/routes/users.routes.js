const express = require("express");
const multer = require("multer");
const User = require("../models/User");
const Friendship = require("../models/Friendship");
const { authRequired } = require("../middleware/authRequired");
const { makePairKey } = require("../utils/pairKey");
const { resolveAvatar } = require("../utils/avatar");
const cloudinary = require("../utils/cloudinary");

const router = express.Router();

const upload = multer({
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

function uploadAvatarToCloudinary(fileBuffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "linqly/avatars/users", resource_type: "image" },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
}

// GET /users/search?query=...
router.get("/search", authRequired, async (req, res) => {
  const q = (req.query.query || "").trim();
  if (!q) return res.json({ users: [] });

  const me = req.user.userId;

  const users = await User.find({
    _id: { $ne: me },
    $or: [
      { username: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ],
  })
    .select("_id username email avatarUrl avatarChoice")
    .limit(10);

  // Build pairKeys for all results
  const pairKeys = users.map((u) => makePairKey(me, u._id));

  // Fetch relationships for those users
  const rels = await Friendship.find({ pairKey: { $in: pairKeys } }).select(
    "pairKey status requesterId receiverId blockedBy"
  );

  const relMap = new Map(rels.map((r) => [r.pairKey, r]));

  const result = users.map((u) => {
    const pk = makePairKey(me, u._id);
    const rel = relMap.get(pk);

    let relationship = "none";

    if (rel) {
      if (rel.status === "accepted") relationship = "friends";
      else if (rel.status === "blocked") relationship = "blocked";
      else if (rel.status === "pending") {
        if (rel.receiverId.toString() === me) relationship = "pending_incoming";
        else relationship = "pending_outgoing";
      }
    }

    return {
      id: u._id,
      username: u.username,
      email: u.email,
      avatarUrl: resolveAvatar(u),
      avatarChoice: u.avatarChoice || null,
      relationship,
    };
  });

  res.json({ users: result });
});

// POST /users/me/avatar  (multipart/form-data, field: avatar)
router.post("/me/avatar", authRequired, (req, res) => {
  upload.single("avatar")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || "Upload failed" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "avatar file required" });
    }

    const userId = req.user.userId;
    const existingUser = await User.findById(userId).select(
      "_id username email avatarUrl avatarChoice avatarPublicId"
    );
    if (!existingUser) return res.status(404).json({ message: "User not found" });

    let uploadResult;
    try {
      uploadResult = await uploadAvatarToCloudinary(req.file.buffer);
    } catch (uploadErr) {
      return res
        .status(500)
        .json({ message: uploadErr.message || "Upload failed" });
    }

    const avatarUrl = uploadResult.secure_url || uploadResult.url;
    const avatarPublicId = uploadResult.public_id || null;
    if (existingUser.avatarPublicId) {
      try {
        await cloudinary.uploader.destroy(existingUser.avatarPublicId);
      } catch (destroyErr) {
        return res
          .status(500)
          .json({ message: destroyErr.message || "Failed to delete old avatar" });
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { avatarUrl, avatarPublicId } },
      { new: true }
    ).select("_id username email avatarUrl avatarChoice");

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      avatarUrl,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: resolveAvatar(user),
        avatarChoice: user.avatarChoice || null,
      },
    });
  });
});

// PATCH /users/me { username?, avatarChoice?, avatarUrl? }
router.patch("/me", authRequired, async (req, res) => {
  const me = req.user.userId;
  const { username, avatarChoice, avatarUrl } = req.body || {};

  const update = {};

  if (typeof username === "string") {
    const clean = username.trim();
    if (clean.length < 3 || clean.length > 30) {
      return res
        .status(400)
        .json({ message: "Username must be 3-30 characters" });
    }
    const existing = await User.findOne({
      username: clean,
      _id: { $ne: me },
    });
    if (existing) {
      return res.status(409).json({ message: "Username already taken" });
    }
    update.username = clean;
  }

  if (avatarChoice !== undefined) {
    if (avatarChoice !== "man" && avatarChoice !== "girl" && avatarChoice !== null) {
      return res.status(400).json({ message: "Invalid avatarChoice" });
    }
    update.avatarChoice = avatarChoice;
  }

  if (avatarUrl !== undefined) {
    update.avatarUrl = avatarUrl;
  }

  const user = await User.findByIdAndUpdate(me, { $set: update }, { new: true })
    .select("_id username email avatarUrl avatarChoice");
  if (!user) return res.status(404).json({ message: "User not found" });

  return res.json({
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      avatarUrl: resolveAvatar(user),
      avatarChoice: user.avatarChoice || null,
    },
  });
});

module.exports = router;
