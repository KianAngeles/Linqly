const express = require("express");
const multer = require("multer");
const User = require("../models/User");
const Friendship = require("../models/Friendship");
const Hangout = require("../models/Hangout");
const { authRequired } = require("../middleware/authRequired");
const { makePairKey } = require("../utils/pairKey");
const { resolveAvatar } = require("../utils/avatar");
const cloudinary = require("../utils/cloudinary");
const { normalizeUsername, isUsernameValid } = require("../utils/username");
const { onlineUsers } = require("../realtime");
const { normalizeLocationInput, hasFullLocation } = require("../utils/location");

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

async function getFriendIds(userId) {
  const docs = await Friendship.find({
    status: "accepted",
    $or: [{ requesterId: userId }, { receiverId: userId }],
  }).select("requesterId receiverId");
  return docs.map((d) => {
    const requester = d.requesterId.toString();
    const receiver = d.receiverId.toString();
    return requester === userId ? receiver : requester;
  });
}

function normalizeVisibility(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "public") return "public";
  if (raw === "friends") return "friends";
  if (raw === "only me" || raw === "onlyme" || raw === "only_me") return "only me";
  return "public";
}

function canViewField(visibility, { isOwner, isFriend }) {
  if (isOwner) return true;
  if (visibility === "public") return true;
  if (visibility === "friends") return isFriend;
  return false;
}

// GET /users/by-username/:username
router.get("/by-username/:username", authRequired, async (req, res) => {
  const raw = String(req.params.username || "");
  const normalized = normalizeUsername(raw);
  if (!normalized) {
    return res.status(400).json({ message: "Invalid username" });
  }

  const user = await User.findOne({ usernameLower: normalized }).select(
    "_id username displayName avatarUrl avatarChoice gender bio location birthday interests about createdAt privacy"
  );
  if (!user) return res.status(404).json({ message: "User not found" });

  const viewerId = req.user.userId;
  const isOwner = String(user._id) === String(viewerId);

  let relationship = "none";
  let isFriend = false;
  let rel = null;

  if (!isOwner) {
    const pairKey = makePairKey(viewerId, user._id);
    rel = await Friendship.findOne({ pairKey }).select(
      "status requesterId receiverId blockedBy"
    );

    if (rel) {
      if (rel.status === "accepted") {
        relationship = "friends";
        isFriend = true;
      } else if (rel.status === "blocked") {
        relationship = "blocked";
      } else if (rel.status === "pending") {
        if (rel.receiverId.toString() === String(viewerId)) {
          relationship = "pending_incoming";
        } else {
          relationship = "pending_outgoing";
        }
      }
    }
  }

  const privacy = user.privacy || {};
  const viewContext = { isOwner, isFriend };
  const ignorePrivacy = false;

  const friendsCount = await Friendship.countDocuments({
    status: "accepted",
    $or: [{ requesterId: user._id }, { receiverId: user._id }],
  });

  let mutualFriendsCount = 0;
  let viewerFriends = [];
  let viewerFriendSet = new Set();
  if (!isOwner && relationship !== "blocked") {
    const [viewerFriendsList, userFriends] = await Promise.all([
      getFriendIds(String(viewerId)),
      getFriendIds(String(user._id)),
    ]);
    viewerFriends = viewerFriendsList;
    viewerFriendSet = new Set(viewerFriends.map((id) => String(id)));
    mutualFriendsCount = userFriends.reduce(
      (count, id) => (viewerFriendSet.has(String(id)) ? count + 1 : count),
      0
    );
  } else if (!isOwner) {
    viewerFriends = await getFriendIds(String(viewerId));
    viewerFriendSet = new Set(viewerFriends.map((id) => String(id)));
  }

  const hangoutsCount = await Hangout.countDocuments({
    creatorId: user._id,
  });

  const friendDocs = await Friendship.find({
    status: "accepted",
    $or: [{ requesterId: user._id }, { receiverId: user._id }],
  })
    .select("requesterId receiverId")
    .limit(12);

  const friendIds = friendDocs.map((d) =>
    String(d.requesterId) === String(user._id) ? d.receiverId : d.requesterId
  );

  const friendUsers = await User.find({ _id: { $in: friendIds } })
    .select("_id username displayName avatarUrl avatarChoice")
    .limit(12);

  const friendsPreview = friendUsers.map((u) => ({
    user: {
      id: u._id,
      username: u.username,
      displayName: u.displayName || u.username,
      avatarUrl: resolveAvatar(u),
      avatarChoice: u.avatarChoice || null,
    },
  }));

  const hangoutVisibility = isOwner || isFriend ? ["friends", "public"] : ["public"];
  const createdHangoutDocs = await Hangout.find({
    creatorId: user._id,
    visibility: { $in: hangoutVisibility },
  })
    .sort({ startsAt: -1 })
    .limit(12);

  const joinedHangoutQuery = {
    attendeeIds: user._id,
    creatorId: { $ne: user._id },
  };
  if (!isOwner) {
    joinedHangoutQuery.visibility = isFriend
      ? { $in: ["public", "friends"] }
      : "public";
  }

  const joinedHangoutDocs = await Hangout.find(joinedHangoutQuery)
    .sort({ startsAt: -1 })
    .limit(12);

  const isVisibleToViewer = (doc) => {
    if (isOwner) return true;
    if (doc.visibility === "public") return true;
    if (doc.visibility === "friends") return isFriend;
    return false;
  };

  const hangoutsById = new Map();
  for (const doc of createdHangoutDocs) {
    hangoutsById.set(String(doc._id), doc);
  }
  for (const doc of joinedHangoutDocs) {
    if (!isOwner && !isVisibleToViewer(doc)) continue;
    hangoutsById.set(String(doc._id), doc);
  }

  const combinedHangouts = Array.from(hangoutsById.values())
    .sort((a, b) => {
      const aStart = a.startsAt ? new Date(a.startsAt).getTime() : 0;
      const bStart = b.startsAt ? new Date(b.startsAt).getTime() : 0;
      if (aStart !== bStart) return bStart - aStart;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    })
    .slice(0, 12);

  const hangouts = combinedHangouts.map((h) => ({
    _id: h._id,
    title: h.title,
    description: h.description || "",
    startsAt: h.startsAt || null,
    endsAt: h.endsAt || null,
    visibility: h.visibility,
    location: h.location || null,
    creatorId: h.creatorId || null,
    attendeeIds: h.attendeeIds || [],
    attendingCount: Array.isArray(h.attendeeIds) ? h.attendeeIds.length : 0,
  }));

  const safeUser = {
    id: user._id,
    username: user.username,
    displayName: user.displayName || user.username,
    avatarUrl: resolveAvatar(user),
    avatarChoice: user.avatarChoice || null,
    createdAt: user.createdAt,
    isOnline: onlineUsers.has(String(user._id)),
    friendsCount,
    hangoutsCount,
    mutualFriendsCount,
    friendsPreview,
    hangouts,
    bio:
      ignorePrivacy || canViewField(normalizeVisibility(privacy.bio), viewContext)
        ? user.bio || ""
        : null,
    gender:
      ignorePrivacy || canViewField(normalizeVisibility(privacy.gender), viewContext)
        ? user.gender || ""
        : null,
    location:
      ignorePrivacy || canViewField(normalizeVisibility(privacy.location), viewContext)
        ? normalizeLocationInput(user.location)
        : null,
    birthday:
      ignorePrivacy || canViewField(normalizeVisibility(privacy.birthday), viewContext)
        ? user.birthday || null
        : null,
    interests:
      ignorePrivacy || canViewField(normalizeVisibility(privacy.interests), viewContext)
        ? user.interests || []
        : null,
    about:
      ignorePrivacy || canViewField(normalizeVisibility(privacy.about), viewContext)
        ? user.about || ""
        : null,
    privacy: user.privacy || {},
  };

  return res.json({
    user: safeUser,
    relationship: isOwner ? "self" : relationship,
    isBlockedByViewer:
      !isOwner && relationship === "blocked"
        ? String(rel?.blockedBy || "") === String(viewerId)
        : false,
  });
});

// GET /users/check-username?username=...
router.get("/check-username", async (req, res) => {
  const raw = String(req.query.username || "");
  const normalized = normalizeUsername(raw);
  if (!isUsernameValid(normalized)) {
    return res.json({ available: false });
  }
  const existing = await User.findOne({
    $or: [
      { usernameLower: normalized },
      { username: normalized },
      { username: `@${normalized}` },
    ],
  }).select("_id");
  return res.json({ available: !existing });
});

// GET /users/search?query=...
router.get("/search", authRequired, async (req, res) => {
  const q = (req.query.query || "").trim().replace(/^@+/, "");
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 50);
  const skip = (page - 1) * limit;
  if (!q) return res.json({ users: [], total: 0, page, limit });

  const me = req.user.userId;

  const filter = {
    _id: { $ne: me },
    $or: [
      { username: { $regex: q, $options: "i" } },
      { displayName: { $regex: q, $options: "i" } },
    ],
  };

  const [users, total] = await Promise.all([
    User.find(filter)
    .select("_id username displayName avatarUrl avatarChoice location privacy")
    .skip(skip)
    .limit(limit),
    User.countDocuments(filter),
  ]);

  const myFriendIds = await getFriendIds(me);
  const myFriendSet = new Set(myFriendIds.map((id) => String(id)));
  const candidateIds = users.map((u) => String(u._id));
  const mutualMap = new Map(candidateIds.map((id) => [id, 0]));
  if (candidateIds.length && myFriendSet.size) {
    const candidateFriendships = await Friendship.find({
      status: "accepted",
      $or: [
        { requesterId: { $in: candidateIds } },
        { receiverId: { $in: candidateIds } },
      ],
    }).select("requesterId receiverId");
    const candidateFriendMap = new Map();
    candidateIds.forEach((id) => candidateFriendMap.set(id, new Set()));
    candidateFriendships.forEach((d) => {
      const requester = String(d.requesterId);
      const receiver = String(d.receiverId);
      if (candidateFriendMap.has(requester)) {
        candidateFriendMap.get(requester).add(receiver);
      }
      if (candidateFriendMap.has(receiver)) {
        candidateFriendMap.get(receiver).add(requester);
      }
    });
    candidateFriendMap.forEach((set, id) => {
      let count = 0;
      set.forEach((friendId) => {
        if (myFriendSet.has(String(friendId))) count += 1;
      });
      mutualMap.set(id, count);
    });
  }

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

    const isFriend = relationship === "friends";
    const locationVisibility = normalizeVisibility(u?.privacy?.location);
    const canShowLocation = canViewField(locationVisibility, {
      isOwner: false,
      isFriend,
    });

    return {
      _id: u._id,
      id: u._id,
      username: u.username,
      displayName: u.displayName || u.username,
      avatarUrl: resolveAvatar(u),
      avatarChoice: u.avatarChoice || null,
      location: canShowLocation ? u?.location?.province || "" : "",
      relationship,
      friendStatus: relationship,
      isFriend,
      mutualFriendsCount: mutualMap.get(String(u._id)) || 0,
    };
  });

  res.json({ users: result, total, page, limit });
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
      "_id username displayName email avatarUrl avatarChoice avatarPublicId"
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
    ).select("_id username displayName email avatarUrl avatarChoice");

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      avatarUrl,
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName || user.username,
        email: user.email,
        avatarUrl: resolveAvatar(user),
        avatarChoice: user.avatarChoice || null,
      },
    });
  });
});

// PATCH /users/me { displayName?, username?, avatarChoice?, avatarUrl?, gender?, bio?, location?, birthday?, interests?, about? }
router.patch("/me", authRequired, async (req, res) => {
  const me = req.user.userId;
  const {
    displayName,
    username,
    avatarChoice,
    avatarUrl,
    gender,
    bio,
    location,
    birthday,
    interests,
    about,
  } = req.body || {};

  const update = {};

  if (typeof displayName === "string") {
    const clean = displayName.trim();
    if (!clean) {
      return res.status(400).json({ message: "Display name is required" });
    }
    update.displayName = clean;
  }

  if (typeof username === "string") {
    const normalized = normalizeUsername(username);
    if (!isUsernameValid(normalized)) {
      return res
        .status(400)
        .json({ message: "Username must be 3-30 characters and contain only letters, numbers, or underscore." });
    }
    const existing = await User.findOne({
      $or: [
        { usernameLower: normalized },
        { username: normalized },
        { username: `@${normalized}` },
      ],
      _id: { $ne: me },
    });
    if (existing) {
      return res.status(409).json({ message: "Username already taken" });
    }
    update.username = normalized;
    update.usernameLower = normalized;
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
  if (gender !== undefined) {
    const cleanGender = String(gender || "").toLowerCase();
    if (!["male", "female", "other", ""].includes(cleanGender)) {
      return res.status(400).json({ message: "Invalid gender" });
    }
    update.gender = cleanGender;
  }
  if (bio !== undefined) {
    const cleanBio = String(bio || "").trim();
    if (cleanBio.length > 180) {
      return res.status(400).json({ message: "Bio must be 180 characters or less" });
    }
    update.bio = cleanBio;
  }
  if (location !== undefined) {
    const normalized = normalizeLocationInput(location);
    const hasAny = normalized.country || normalized.province;
    if (hasAny && !hasFullLocation(normalized)) {
      return res
        .status(400)
        .json({ message: "Location must include country and province" });
    }
    update.location = hasAny ? normalized : { country: "", province: "" };
  }
  if (birthday !== undefined) {
    const date = birthday ? new Date(birthday) : null;
    if (date && Number.isNaN(date.getTime())) {
      return res.status(400).json({ message: "Invalid birthday" });
    }
    update.birthday = date;
  }
  if (interests !== undefined) {
    if (!Array.isArray(interests)) {
      return res.status(400).json({ message: "Interests must be an array" });
    }
    const cleaned = interests
      .map((i) => String(i || "").trim())
      .filter((i) => i);
    update.interests = cleaned;
  }
  if (about !== undefined) {
    update.about = String(about || "").trim();
  }

  const user = await User.findByIdAndUpdate(me, { $set: update }, { new: true })
    .select(
      "_id username displayName email avatarUrl avatarChoice gender bio location birthday interests about createdAt privacy"
    );
  if (!user) return res.status(404).json({ message: "User not found" });

  return res.json({
    user: {
      id: user._id,
      username: user.username,
      displayName: user.displayName || user.username,
      email: user.email,
      avatarUrl: resolveAvatar(user),
      avatarChoice: user.avatarChoice || null,
      gender: user.gender || "",
      bio: user.bio || "",
      location: normalizeLocationInput(user.location),
      birthday: user.birthday || null,
      interests: user.interests || [],
      about: user.about || "",
      createdAt: user.createdAt,
      privacy: user.privacy || {},
    },
  });
});

// GET /users/me/privacy
router.get("/me/privacy", authRequired, async (req, res) => {
  const me = req.user.userId;
  const user = await User.findById(me).select("_id privacy");
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({
    privacy: user.privacy || {
      gender: "Public",
      birthday: "Friends",
      location: "Friends",
      interests: "Public",
      bio: "Public",
      about: "Public",
      friends: "Friends",
      hangoutsCreated: "Friends",
      hangoutsJoined: "Only me",
    },
  });
});

// PUT /users/me/privacy
router.put("/me/privacy", authRequired, async (req, res) => {
  const me = req.user.userId;
  const allowed = ["Public", "Friends", "Only me"];
  const incoming = req.body || {};
  const next = {};
  const keys = [
    "gender",
    "birthday",
    "location",
    "interests",
    "bio",
    "about",
    "friends",
    "hangoutsCreated",
    "hangoutsJoined",
  ];
  keys.forEach((key) => {
    const val = incoming[key];
    if (typeof val === "string" && allowed.includes(val)) {
      next[`privacy.${key}`] = val;
    }
  });
  const user = await User.findByIdAndUpdate(me, { $set: next }, { new: true }).select(
    "_id privacy"
  );
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({ privacy: user.privacy || {} });
});

module.exports = router;
