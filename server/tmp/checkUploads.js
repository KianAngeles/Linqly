require("dotenv").config({ path: ".env" });
const mongoose = require("mongoose");
const uri = process.env.MONGODB_URI;
const models = {
  User: require("../src/models/User"),
  Chat: require("../src/models/Chat"),
  Message: require("../src/models/Message"),
  Hangout: require("../src/models/Hangout"),
};
const checks = [
  { name: "User", field: "avatarUrl" },
  { name: "Chat", field: "avatarUrl" },
  { name: "Hangout", field: "avatarUrl" },
  { name: "Message", field: "imageUrl" },
  { name: "Message", field: "fileUrl" },
];
const like = /\/uploads\//;

async function run() {
  await mongoose.connect(uri);
  for (const c of checks) {
    const Model = models[c.name];
    const count = await Model.countDocuments({
      [c.field]: { $regex: like },
    });
    console.log(`${c.name}.${c.field}: ${count}`);
  }
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});