require("dotenv").config({ path: ".env" });
const mongoose = require("mongoose");
const uri = process.env.MONGODB_URI;
const models = {
  User: require("../src/models/User"),
  Chat: require("../src/models/Chat"),
  Hangout: require("../src/models/Hangout"),
};
const like = /\/uploads\//;

async function run() {
  await mongoose.connect(uri);
  const users = await models.User.find({ avatarUrl: { $regex: like } })
    .select("username email avatarUrl")
    .lean();
  const chats = await models.Chat.find({ avatarUrl: { $regex: like } })
    .select("type name avatarUrl")
    .lean();
  const hangouts = await models.Hangout.find({ avatarUrl: { $regex: like } })
    .select("title avatarUrl")
    .lean();

  console.log("Users:");
  users.forEach((u) => {
    console.log(`- ${u.username} (${u.email}): ${u.avatarUrl}`);
  });

  console.log("Chats:");
  chats.forEach((c) => {
    console.log(`- ${c.type} ${c.name || "(no name)"}: ${c.avatarUrl}`);
  });

  console.log("Hangouts:");
  hangouts.forEach((h) => {
    console.log(`- ${h.title}: ${h.avatarUrl}`);
  });

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});