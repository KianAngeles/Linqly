require("dotenv").config();

const mongoose = require("mongoose");
const { connectDB } = require("../src/config/db");
const Message = require("../src/models/Message");
const Chat = require("../src/models/Chat");
const MessageRequest = require("../src/models/MessageRequest");
const {
  encryptText,
  isEncryptedText,
  isEncryptionEnabled,
} = require("../src/utils/messageCrypto");

const BATCH_SIZE = 500;

async function flushBulk(model, ops) {
  if (!ops.length) return 0;
  const result = await model.bulkWrite(ops, { ordered: false });
  return result.modifiedCount || 0;
}

async function migrateMessages() {
  const cursor = Message.find({})
    .select("_id text replyPreview")
    .cursor();

  const ops = [];
  let scanned = 0;
  let modified = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const set = {};

    const text = typeof doc.text === "string" ? doc.text : "";
    if (text && !isEncryptedText(text)) {
      set.text = encryptText(text);
    }

    const replyText =
      doc.replyPreview && typeof doc.replyPreview.text === "string"
        ? doc.replyPreview.text
        : "";
    if (replyText && !isEncryptedText(replyText)) {
      set["replyPreview.text"] = encryptText(replyText);
    }

    if (Object.keys(set).length > 0) {
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: set },
        },
      });
    }

    if (ops.length >= BATCH_SIZE) {
      modified += await flushBulk(Message, ops);
      ops.length = 0;
    }
  }

  modified += await flushBulk(Message, ops);
  return { scanned, modified };
}

async function migrateChats() {
  const cursor = Chat.find({}).select("_id lastMessageText").cursor();

  const ops = [];
  let scanned = 0;
  let modified = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const text = typeof doc.lastMessageText === "string" ? doc.lastMessageText : "";
    if (!text || isEncryptedText(text)) continue;

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { lastMessageText: encryptText(text) } },
      },
    });

    if (ops.length >= BATCH_SIZE) {
      modified += await flushBulk(Chat, ops);
      ops.length = 0;
    }
  }

  modified += await flushBulk(Chat, ops);
  return { scanned, modified };
}

async function migrateMessageRequests() {
  const cursor = MessageRequest.find({}).select("_id lastMessageText").cursor();

  const ops = [];
  let scanned = 0;
  let modified = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const text = typeof doc.lastMessageText === "string" ? doc.lastMessageText : "";
    if (!text || isEncryptedText(text)) continue;

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { lastMessageText: encryptText(text) } },
      },
    });

    if (ops.length >= BATCH_SIZE) {
      modified += await flushBulk(MessageRequest, ops);
      ops.length = 0;
    }
  }

  modified += await flushBulk(MessageRequest, ops);
  return { scanned, modified };
}

async function main() {
  if (!isEncryptionEnabled()) {
    throw new Error("Set MESSAGE_ENCRYPTION_KEY before running migration.");
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("Set MONGODB_URI before running migration.");
  }

  await connectDB(process.env.MONGODB_URI);

  const [messages, chats, requests] = await Promise.all([
    migrateMessages(),
    migrateChats(),
    migrateMessageRequests(),
  ]);

  console.log("Migration complete:");
  console.log("messages:", messages);
  console.log("chats:", chats);
  console.log("messageRequests:", requests);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Migration failed:", err.message || err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
