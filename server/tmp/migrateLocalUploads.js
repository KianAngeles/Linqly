require("dotenv").config({ path: ".env" });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const cloudinary = require("../src/utils/cloudinary");
const User = require("../src/models/User");
const Chat = require("../src/models/Chat");
const Hangout = require("../src/models/Hangout");

const like = /\/uploads\//;
const uploadsRoot = path.join(__dirname, "..", "uploads");

async function uploadLocalFile(localRelPath, folder) {
  const absolutePath = path.join(uploadsRoot, localRelPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing file: ${absolutePath}`);
  }
  const res = await cloudinary.uploader.upload(absolutePath, {
    folder,
    resource_type: "image",
  });
  return res;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const cache = new Map();
  const updates = [];

  const users = await User.find({ avatarUrl: { $regex: like } }).select("avatarUrl");
  for (const user of users) {
    const localUrl = user.avatarUrl;
    const rel = localUrl.replace(/^\/uploads\//, "");
    if (!cache.has(rel)) {
      const result = await uploadLocalFile(rel, "avatars");
      cache.set(rel, result);
    }
    const result = cache.get(rel);
    user.avatarUrl = result.secure_url;
    user.avatarPublicId = result.public_id;
    await user.save();
    updates.push({ model: "User", id: user._id.toString(), url: result.secure_url });
  }

  const chats = await Chat.find({ avatarUrl: { $regex: like } }).select("avatarUrl");
  for (const chat of chats) {
    const localUrl = chat.avatarUrl;
    const rel = localUrl.replace(/^\/uploads\//, "");
    if (!cache.has(rel)) {
      const result = await uploadLocalFile(rel, "group-avatars");
      cache.set(rel, result);
    }
    const result = cache.get(rel);
    chat.avatarUrl = result.secure_url;
    chat.avatarPublicId = result.public_id;
    await chat.save();
    updates.push({ model: "Chat", id: chat._id.toString(), url: result.secure_url });
  }

  const hangouts = await Hangout.find({ avatarUrl: { $regex: like } }).select("avatarUrl");
  for (const hangout of hangouts) {
    const localUrl = hangout.avatarUrl;
    const rel = localUrl.replace(/^\/uploads\//, "");
    if (!cache.has(rel)) {
      const result = await uploadLocalFile(rel, "group-avatars");
      cache.set(rel, result);
    }
    const result = cache.get(rel);
    hangout.avatarUrl = result.secure_url;
    hangout.avatarPublicId = result.public_id;
    await hangout.save();
    updates.push({ model: "Hangout", id: hangout._id.toString(), url: result.secure_url });
  }

  console.log("Migrated records:");
  updates.forEach((u) => console.log(`- ${u.model} ${u.id}: ${u.url}`));
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});