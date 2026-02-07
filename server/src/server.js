require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const { connectDB } = require("./config/db");
const mongoose = require("mongoose");
const Friendship = require("./models/Friendship");
const Chat = require("./models/Chat");
const Message = require("./models/Message");
const ChatRead = require("./models/ChatRead");
const User = require("./models/User");
const { onlineUsers, setIO, getSharedLocation, clearSharedLocation } = require("./realtime");

const activeCalls = new Map();
const userCallIndex = new Map();

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

setIO(io); // makes io available everywhere via realtime.js

function emitToUser(userId, event, payload) {
  if (!userId) return;
  const socketIds = onlineUsers.get(String(userId));
  if (!socketIds || socketIds.size === 0) return;
  socketIds.forEach((socketId) => {
    io.to(socketId).emit(event, payload);
  });
}

async function emitPresenceUpdate(userId, isOnline) {
  if (!userId) return;
  try {
    const uid = String(userId);
    io.emit("presence:update", { userId: uid, isOnline: !!isOnline });
  } catch (err) {
    console.error("Presence update failed:", err);
  }
}

function isUserBusy(userId) {
  return userCallIndex.has(String(userId));
}

function setCallSession(callId, callerId, calleeId, chatId) {
  activeCalls.set(callId, {
    callId,
    callerId: String(callerId),
    calleeId: String(calleeId),
    chatId,
  });
  userCallIndex.set(String(callerId), callId);
  userCallIndex.set(String(calleeId), callId);
}

function clearCallSession(callId) {
  const call = activeCalls.get(callId);
  if (!call) return;
  const { callerId, calleeId } = call;
  if (userCallIndex.get(String(callerId)) === callId) {
    userCallIndex.delete(String(callerId));
  }
  if (userCallIndex.get(String(calleeId)) === callId) {
    userCallIndex.delete(String(calleeId));
  }
  activeCalls.delete(callId);
}

function getOtherParty(callId, senderId) {
  const call = activeCalls.get(callId);
  if (!call) return null;
  if (String(call.callerId) === String(senderId)) return call.calleeId;
  if (String(call.calleeId) === String(senderId)) return call.callerId;
  return null;
}

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);
  socket.onAny((event, ...args) => {
    if (String(event).startsWith("call:")) {
      console.log("socket event", event, args[0]);
    }
  });

  socket.on("auth:online", async (userId) => {
    if (!userId) return;
    const uid = String(userId);
    socket.data.userId = uid;
    if (!onlineUsers.has(uid)) {
      onlineUsers.set(uid, new Set());
    }
    const set = onlineUsers.get(uid);
    const wasOnline = set.size > 0;
    set.add(socket.id);
    if (!wasOnline) {
      console.log("User online:", userId);
      await emitPresenceUpdate(uid, true);
    }
  });

  socket.on("auth:offline", async (userId) => {
    const uid = String(userId || socket.data.userId || "");
    if (!uid) return;
    const set = onlineUsers.get(uid);
    let wentOffline = false;
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        onlineUsers.delete(uid);
        wentOffline = true;
      }
    }
    if (wentOffline) {
      console.log("User offline:", uid);
      await emitPresenceUpdate(uid, false);
    }
  });

  socket.on("chat:join", ({ chatId }) => {
    if (!chatId) return;
    socket.join(String(chatId));
  });

  socket.on("chat:read", async ({ chatId, lastReadMessageId }) => {
    const userId = socket.data.userId;
    if (!userId || !chatId) return;
    if (!mongoose.isValidObjectId(chatId)) return;
    if (lastReadMessageId && !mongoose.isValidObjectId(lastReadMessageId)) return;

    try {
      const chat = await Chat.findById(chatId).select("members");
      if (!chat) return;
      const isMember = chat.members.some((m) => String(m) === String(userId));
      if (!isMember) return;
      if (!lastReadMessageId) return;

      const existing = await ChatRead.findOne({ chatId, userId }).select(
        "lastReadMessageId"
      );
      if (existing && String(existing.lastReadMessageId) === String(lastReadMessageId)) {
        return;
      }
      if (existing?.lastReadMessageId) {
        const [prevMsg, nextMsg] = await Promise.all([
          Message.findById(existing.lastReadMessageId).select("createdAt"),
          Message.findById(lastReadMessageId).select("createdAt"),
        ]);
        if (!nextMsg) return;
        if (
          prevMsg &&
          new Date(nextMsg.createdAt).getTime() <= new Date(prevMsg.createdAt).getTime()
        ) {
          return;
        }
      }

      const readAt = new Date();
      await ChatRead.findOneAndUpdate(
        { chatId, userId },
        { $set: { lastReadMessageId, readAt } },
        { upsert: true, new: true }
      );

      io.to(String(chatId)).emit("chat:readUpdate", {
        chatId,
        userId,
        lastReadMessageId,
        readAt,
      });
    } catch (err) {
      console.error("chat:read failed", err);
    }
  });

  socket.on("typing:start", async ({ chatId, user }) => {
    if (!chatId) return;
    const userId = socket.data.userId || user?.id;
    if (!userId) return;
    let payloadUser = user;
    if (!payloadUser?.id) {
      try {
        const doc = await User.findById(userId).select("username avatarUrl");
        if (doc) {
          payloadUser = {
            id: String(doc._id),
            username: doc.username,
            avatarUrl: doc.avatarUrl || null,
          };
        }
      } catch {
        return;
      }
    }
    socket.to(String(chatId)).emit("typing:start", {
      chatId,
      user: payloadUser,
    });
  });

  socket.on("typing:stop", ({ chatId, user }) => {
    if (!chatId) return;
    const userId = socket.data.userId || user?.id;
    if (!userId) return;
    socket.to(String(chatId)).emit("typing:stop", {
      chatId,
      user: user || { id: String(userId) },
    });
  });

  socket.on("call:start", (payload) => {
    const callerId = socket.data.userId || payload?.caller?.id;
    const calleeId = payload?.calleeId;
    const callId = payload?.callId;
    if (!callerId || !calleeId || !callId) return;
    console.log("call:start", { callId, callerId, calleeId });

    if (isUserBusy(callerId) || isUserBusy(calleeId)) {
      emitToUser(callerId, "call:decline", { callId, reason: "busy" });
      return;
    }

    const calleeSockets = onlineUsers.get(String(calleeId));
    if (!calleeSockets || calleeSockets.size === 0) {
      console.log("call:start callee offline", { callId, calleeId });
      emitToUser(callerId, "call:decline", { callId, reason: "offline" });
      return;
    }

    setCallSession(callId, callerId, calleeId, payload?.chatId);
    console.log("call:incoming -> callee", { callId, calleeId, sockets: Array.from(calleeSockets) });

    emitToUser(calleeId, "call:incoming", {
      callId,
      chatId: payload?.chatId,
      callerId,
      callerName: payload?.caller?.username,
      callerAvatar: payload?.caller?.avatarUrl,
      caller: payload?.caller,
    });
  });

  socket.on("call:accept", ({ callId }) => {
    const call = activeCalls.get(callId);
    if (!call) return;
    emitToUser(call.callerId, "call:accept", { callId, calleeId: call.calleeId });
  });

  socket.on("call:ready", ({ callId, role }) => {
    const call = activeCalls.get(callId);
    if (!call) return;
    socket.join(`call:${callId}`);
    const otherId = getOtherParty(callId, socket.data.userId);
    if (otherId) {
      emitToUser(otherId, "call:ready", { callId, role });
    }
  });

  socket.on("call:decline", ({ callId, reason }) => {
    const senderId = socket.data.userId;
    const call = activeCalls.get(callId);
    if (!call) return;
    const otherId = getOtherParty(callId, senderId);
    if (otherId) {
      emitToUser(otherId, "call:decline", { callId, reason: reason || "declined" });
    }
    emitToUser(call.callerId, "call:end", { callId, reason: "declined" });
    emitToUser(call.calleeId, "call:end", { callId, reason: "declined" });
    clearCallSession(callId);
  });

  socket.on("call:end", ({ callId, reason }) => {
    const call = activeCalls.get(callId);
    if (!call) return;
    emitToUser(call.callerId, "call:end", { callId, reason: reason || "ended" });
    emitToUser(call.calleeId, "call:end", { callId, reason: reason || "ended" });
    clearCallSession(callId);
  });

  socket.on("call:offer", ({ callId, offer }) => {
    if (!callId || !offer) return;
    socket.to(`call:${callId}`).emit("call:offer", { callId, offer });
  });

  socket.on("call:answer", ({ callId, answer }) => {
    if (!callId || !answer) return;
    socket.to(`call:${callId}`).emit("call:answer", { callId, answer });
  });

  socket.on("call:ice", ({ callId, candidate }) => {
    if (!callId || !candidate) return;
    socket.to(`call:${callId}`).emit("call:ice", { callId, candidate });
  });

  socket.on("call:renegotiate", ({ callId }) => {
    if (!callId) return;
    socket.to(`call:${callId}`).emit("call:renegotiate", { callId });
  });

  socket.on("call:audio-state", ({ callId, enabled }) => {
    const senderId = socket.data.userId;
    const otherId = getOtherParty(callId, senderId);
    if (!otherId) return;
    emitToUser(otherId, "call:audio-state", { callId, enabled });
  });

  socket.on("call:video-state", ({ callId, enabled }) => {
    const senderId = socket.data.userId;
    const otherId = getOtherParty(callId, senderId);
    if (!otherId) return;
    emitToUser(otherId, "call:video-state", { callId, enabled });
  });

  socket.on("disconnect", async () => {
    if (socket.data.userId) {
      const uid = socket.data.userId;
      const activeCallId = userCallIndex.get(String(uid));
      if (activeCallId) {
        const call = activeCalls.get(activeCallId);
        if (call) {
          emitToUser(call.callerId, "call:end", { callId: activeCallId, reason: "ended" });
          emitToUser(call.calleeId, "call:end", { callId: activeCallId, reason: "ended" });
          clearCallSession(activeCallId);
        }
      }
      const set = onlineUsers.get(uid);
      let wentOffline = false;
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          onlineUsers.delete(uid);
          wentOffline = true;
        }
      }

      if (getSharedLocation(uid)) {
        clearSharedLocation(uid);
        try {
          const docs = await Friendship.find({
            status: "accepted",
            $or: [{ requesterId: uid }, { receiverId: uid }],
          }).select("requesterId receiverId");
          const friendIds = docs.map((d) =>
            String(d.requesterId) === String(uid) ? d.receiverId : d.requesterId
          );
          friendIds.forEach((friendId) => {
            emitToUser(friendId, "friends:location:stop", { userId: String(uid) });
          });
        } catch (err) {
          console.error("Failed to clear shared location on disconnect:", err);
        }
      }
      if (wentOffline) {
        console.log("User offline:", socket.data.userId);
        await emitPresenceUpdate(uid, false);
      }
    }
    console.log("Socket disconnected:", socket.id);
  });
});

(async () => {
  try {
    await connectDB(process.env.MONGODB_URI);
    server.listen(PORT, () => console.log(`Server running on ${PORT}`));
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
})();
