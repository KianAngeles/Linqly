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
const MessageRequest = require("./models/MessageRequest");
const GroupCallNotification = require("./models/GroupCallNotification");
const User = require("./models/User");
const { onlineUsers, setIO, getSharedLocation, clearSharedLocation } = require("./realtime");

const activeCalls = new Map();
const userCallIndex = new Map();
const activeGroupCalls = new Map();
const groupCallByChatId = new Map();
const userGroupCallIndex = new Map();

const PORT = process.env.PORT || 5000;
const GROUP_CALLS_ENABLED =
  String(process.env.GROUP_CALLS_ENABLED || "").toLowerCase() === "true";

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
  const key = String(userId);
  return userCallIndex.has(key) || (GROUP_CALLS_ENABLED && userGroupCallIndex.has(key));
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

function isAdminOrCreator(chat, userId) {
  if (!chat || !userId) return false;
  if (String(chat.creatorId || "") === String(userId)) return true;
  return (chat.admins || []).some((id) => String(id) === String(userId));
}

function serializeGroupParticipants(call) {
  const participants = Array.from(call.participants.values());
  return participants.map((participant) => ({
    userId: participant.userId,
    name: participant.name || "Unknown",
    avatarUrl: participant.avatarUrl || "",
    audioEnabled: participant.audioEnabled !== false,
    videoEnabled: participant.videoEnabled !== false,
    joinedAt: participant.joinedAt,
    isAdmin: participant.isAdmin === true,
  }));
}

function buildGroupCallPayload(call) {
  const participants = serializeGroupParticipants(call);
  return {
    callId: call.callId,
    chatId: call.chatId,
    chatName: call.chatName || "",
    callType: call.callType || "audio",
    startedByUserId: call.startedByUserId,
    startedByName: call.startedByName || "Unknown",
    startedAt: call.startedAt,
    participantCount: participants.length,
    participants,
  };
}

async function syncChatOngoingCall(call) {
  const participants = serializeGroupParticipants(call);
  const participantUserIds = participants
    .map((participant) => participant.userId)
    .filter(Boolean);
  const participantNames = participants
    .map((participant) => participant.name || "Unknown")
    .filter(Boolean);
  await Chat.updateOne(
    { _id: call.chatId },
    {
      $set: {
        ongoingCall: {
          callId: call.callId,
          callType: call.callType || "audio",
          startedByUserId: call.startedByUserId,
          startedByName: call.startedByName || "Unknown",
          startedAt: call.startedAt || new Date(),
          participantUserIds,
          participantNames,
          participantCount: participants.length,
        },
      },
    }
  );
}

async function clearChatOngoingCall(chatId) {
  await Chat.updateOne({ _id: chatId }, { $set: { ongoingCall: null } });
}

async function createGroupCallLogMessage({
  chatId,
  senderId,
  callId,
  status,
  startedByUserId,
  startedByName,
  participantCount = 0,
  participantNames = [],
  endedByUserId,
  endedByName,
  durationSec = 0,
}) {
  const cleanStatus = status === "ended" ? "ended" : "ongoing";
  const cleanText = cleanStatus === "ongoing" ? "Ongoing Call" : "Call ended";
  const meta = {
    scope: "group",
    status: cleanStatus,
    callType: "audio",
    callId: String(callId || ""),
    chatId: String(chatId || ""),
    startedByUserId: startedByUserId ? String(startedByUserId) : "",
    startedByName: startedByName || "Unknown",
    participantCount: Math.max(0, Number(participantCount) || 0),
    participantNames: Array.isArray(participantNames) ? participantNames : [],
  };

  if (cleanStatus === "ended") {
    meta.endedByUserId = endedByUserId ? String(endedByUserId) : "";
    meta.endedByName = endedByName || "Unknown";
    meta.endedAt = new Date().toISOString();
    meta.durationSec = Math.max(0, Math.floor(Number(durationSec) || 0));
    meta.totalParticipants = meta.participantCount;
  }

  const msg = await Message.create({
    chatId,
    senderId,
    type: "call_log",
    text: cleanText,
    replyTo: null,
    replyPreview: { text: "", senderUsername: "" },
    reactions: [],
    mentions: [],
    meta,
  });

  await Chat.updateOne(
    { _id: chatId },
    {
      $set: {
        lastMessageAt: msg.createdAt,
        lastMessageText: cleanText,
        lastMessageId: msg._id,
        lastMessageSenderId: senderId,
      },
    }
  );

  const sender = await User.findById(senderId).select("username avatarUrl");
  io.to(String(chatId)).emit("message:new", {
    id: msg._id,
    chatId: String(chatId),
    sender: {
      id: senderId,
      username: sender?.username || "User",
      avatarUrl: sender?.avatarUrl || "",
    },
    type: msg.type,
    text: msg.text,
    meta: msg.meta || null,
    createdAt: msg.createdAt,
    replyTo: msg.replyTo,
    replyPreview: msg.replyPreview,
    reactions: msg.reactions,
    mentions: msg.mentions || [],
  });
}

function emitGroupCallToUser(userId, event, payload) {
  emitToUser(userId, event, payload);
}

function setGroupCallParticipant(callId, participant) {
  const call = activeGroupCalls.get(callId);
  if (!call) return null;
  call.participants.set(String(participant.userId), {
    ...participant,
    userId: String(participant.userId),
    audioEnabled: participant.audioEnabled !== false,
    videoEnabled: participant.videoEnabled !== false,
  });
  userGroupCallIndex.set(String(participant.userId), callId);
  return call;
}

function removeGroupCallParticipant(callId, userId) {
  const call = activeGroupCalls.get(callId);
  if (!call) return null;
  call.participants.delete(String(userId));
  if (userGroupCallIndex.get(String(userId)) === callId) {
    userGroupCallIndex.delete(String(userId));
  }
  return call;
}

async function emitGroupCallStarted(call) {
  const payload = buildGroupCallPayload(call);
  io.to(String(call.chatId)).emit("group_call:started", payload);
  io.to(String(call.chatId)).emit("group_call:updated", payload);
}

async function emitGroupCallUpdated(call) {
  const payload = buildGroupCallPayload(call);
  io.to(String(call.chatId)).emit("group_call:updated", payload);
}

async function emitGroupCallEnded(call, extra = {}) {
  const payload = {
    ...buildGroupCallPayload(call),
    reason: extra.reason || "ended",
    endedByUserId: extra.endedByUserId ? String(extra.endedByUserId) : "",
    endedByName: extra.endedByName || "Unknown",
    endedAt: new Date().toISOString(),
    durationSec: Math.max(0, Math.floor(Number(extra.durationSec) || 0)),
  };
  io.to(String(call.chatId)).emit("group_call:ended", payload);
  for (const participant of call.participants.values()) {
    if (!participant?.userId) continue;
    if (extra.excludeUserId && String(extra.excludeUserId) === String(participant.userId)) {
      continue;
    }
    emitGroupCallToUser(participant.userId, "group_call:ended", payload);
  }
}

function clearGroupCall(callId) {
  const call = activeGroupCalls.get(callId);
  if (!call) return null;
  for (const participant of call.participants.values()) {
    if (userGroupCallIndex.get(String(participant.userId)) === callId) {
      userGroupCallIndex.delete(String(participant.userId));
    }
  }
  if (groupCallByChatId.get(String(call.chatId)) === callId) {
    groupCallByChatId.delete(String(call.chatId));
  }
  activeGroupCalls.delete(callId);
  return call;
}

async function finalizeGroupCall(call, options = {}) {
  if (!call) return;
  const endedByUserId = options.endedByUserId
    ? String(options.endedByUserId)
    : String(call.startedByUserId || "");
  const endedByName = options.endedByName || call.startedByName || "Unknown";
  const durationSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000)
  );
  const participants = serializeGroupParticipants(call);

  await createGroupCallLogMessage({
    chatId: call.chatId,
    senderId: endedByUserId || call.startedByUserId,
    callId: call.callId,
    status: "ended",
    startedByUserId: call.startedByUserId,
    startedByName: call.startedByName,
    participantCount: participants.length,
    participantNames: participants.map((item) => item.name || "Unknown"),
    endedByUserId,
    endedByName,
    durationSec,
  });

  await clearChatOngoingCall(call.chatId);
  await emitGroupCallEnded(call, {
    reason: options.reason || "ended",
    endedByUserId,
    endedByName,
    durationSec,
    excludeUserId: options.excludeUserId || "",
  });
  clearGroupCall(call.callId);
}

async function canUseRealtimeChatSignals(chatId, userId) {
  if (!chatId || !mongoose.isValidObjectId(chatId) || !userId) return false;
  const chat = await Chat.findById(chatId).select("members type");
  if (!chat) return false;
  const isMember = chat.members.some((m) => String(m) === String(userId));
  if (!isMember) return false;
  if (chat.type !== "direct") return true;
  const requestDoc = await MessageRequest.findOne({ chatId }).select("status");
  if (!requestDoc) return true;
  return requestDoc.status === "accepted";
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

  socket.on("hangout:join", ({ hangoutId }) => {
    if (!hangoutId) return;
    socket.join(`hangout:${String(hangoutId)}`);
  });

  socket.on("hangout:leave", ({ hangoutId }) => {
    if (!hangoutId) return;
    socket.leave(`hangout:${String(hangoutId)}`);
  });

  socket.on("chat:read", async ({ chatId, lastReadMessageId }) => {
    const userId = socket.data.userId;
    if (!userId || !chatId) return;
    if (!mongoose.isValidObjectId(chatId)) return;
    if (lastReadMessageId && !mongoose.isValidObjectId(lastReadMessageId)) return;

    try {
      const chat = await Chat.findById(chatId).select("members type");
      if (!chat) return;
      const isMember = chat.members.some((m) => String(m) === String(userId));
      if (!isMember) return;
      if (chat.type === "direct") {
        const requestDoc = await MessageRequest.findOne({ chatId }).select("status");
        if (requestDoc && requestDoc.status !== "accepted") return;
      }
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
    if (!(await canUseRealtimeChatSignals(chatId, userId))) return;
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

  socket.on("typing:stop", async ({ chatId, user }) => {
    if (!chatId) return;
    const userId = socket.data.userId || user?.id;
    if (!userId) return;
    if (!(await canUseRealtimeChatSignals(chatId, userId))) return;
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

  socket.on("group_call:start", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!GROUP_CALLS_ENABLED) {
      reply({ ok: false, message: "Group calls are disabled" });
      return;
    }
    const starterId = String(socket.data.userId || payload?.starterId || "");
    const chatId = String(payload?.chatId || "");
    const callId = String(payload?.callId || `group_call_${Date.now()}`);
    const callType = "audio";
    if (!starterId || !chatId) {
      reply({ ok: false, message: "Missing call or chat payload" });
      return;
    }
    if (!mongoose.isValidObjectId(chatId)) {
      reply({ ok: false, message: "Invalid chatId" });
      return;
    }

    try {
      const chat = await Chat.findById(chatId).select(
        "type name members creatorId admins allowAnyoneCall ongoingCall"
      );
      if (!chat) {
        reply({ ok: false, message: "Chat not found" });
        return;
      }
      if (!["group", "hangout"].includes(chat.type)) {
        reply({ ok: false, message: "Group calls are only available in group chats" });
        return;
      }
      const isMember = (chat.members || []).some(
        (memberId) => String(memberId) === starterId
      );
      if (!isMember) {
        reply({ ok: false, message: "Not a member of this chat" });
        return;
      }
      const canStart = chat.allowAnyoneCall !== false || isAdminOrCreator(chat, starterId);
      if (!canStart) {
        reply({ ok: false, message: "Only admins can start a call in this chat" });
        return;
      }
      if (isUserBusy(starterId)) {
        reply({ ok: false, message: "You are already in another call" });
        return;
      }

      const existingCallId = groupCallByChatId.get(chatId);
      if (existingCallId) {
        const existing = activeGroupCalls.get(existingCallId);
        if (existing) {
          reply({ ok: true, existing: true, payload: buildGroupCallPayload(existing) });
          return;
        }
      }
      if (chat.ongoingCall?.callId && activeGroupCalls.has(String(chat.ongoingCall.callId))) {
        const existing = activeGroupCalls.get(String(chat.ongoingCall.callId));
        reply({ ok: true, existing: true, payload: buildGroupCallPayload(existing) });
        return;
      }

      const starterUser = await User.findById(starterId).select("username avatarUrl");
      const startedByName = starterUser?.username || "Unknown";
      const now = new Date();
      const call = {
        callId,
        chatId,
        chatName: chat.name || "Group chat",
        callType,
        startedByUserId: starterId,
        startedByName,
        startedAt: now,
        participants: new Map(),
      };
      activeGroupCalls.set(callId, call);
      groupCallByChatId.set(chatId, callId);

      setGroupCallParticipant(callId, {
        userId: starterId,
        name: startedByName,
        avatarUrl: starterUser?.avatarUrl || "",
        audioEnabled: true,
        videoEnabled: true,
        joinedAt: now.toISOString(),
        isAdmin: isAdminOrCreator(chat, starterId),
      });
      socket.join(`call:${callId}`);

      await syncChatOngoingCall(call);
      await createGroupCallLogMessage({
        chatId,
        senderId: starterId,
        callId,
        status: "ongoing",
        startedByUserId: starterId,
        startedByName,
        participantCount: 1,
        participantNames: [startedByName],
      });

      const notificationTargets = (chat.members || [])
        .map((memberId) => String(memberId))
        .filter((memberId) => memberId && memberId !== starterId);
      if (notificationTargets.length > 0) {
        const notificationRows = notificationTargets.map((memberId) => ({
          userId: memberId,
          actorId: starterId,
          chatId,
          callId,
          chatName: chat.name || "Group chat",
          actorName: startedByName,
          callStatus: "started",
        }));
        await GroupCallNotification.insertMany(notificationRows, { ordered: false }).catch(() => {});
        notificationTargets.forEach((memberId) => {
          emitGroupCallToUser(memberId, "group_call:notification", {
            callId,
            chatId,
            chatName: chat.name || "Group chat",
            starterId,
            starterName: startedByName,
            starterAvatar: starterUser?.avatarUrl || "",
          });
        });
      }

      await emitGroupCallStarted(call);
      reply({ ok: true, payload: buildGroupCallPayload(call) });
    } catch (err) {
      console.error("group_call:start failed", err);
      reply({ ok: false, message: "Failed to start group call" });
    }
  });

  socket.on("group_call:join", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!GROUP_CALLS_ENABLED) {
      reply({ ok: false, message: "Group calls are disabled" });
      return;
    }
    const userId = String(socket.data.userId || "");
    const chatId = String(payload?.chatId || "");
    const callId = String(payload?.callId || "");
    if (!userId || !chatId || !callId) {
      reply({ ok: false, message: "Missing call join payload" });
      return;
    }

    try {
      const call = activeGroupCalls.get(callId);
      if (!call || String(call.chatId) !== chatId) {
        reply({ ok: false, message: "Call is no longer active" });
        return;
      }
      const chat = await Chat.findById(chatId).select(
        "type name members creatorId admins allowAnyoneCall"
      );
      if (!chat) {
        reply({ ok: false, message: "Chat not found" });
        return;
      }
      const isMember = (chat.members || []).some(
        (memberId) => String(memberId) === userId
      );
      if (!isMember) {
        reply({ ok: false, message: "Not a member of this chat" });
        return;
      }

      const currentGroupCall = userGroupCallIndex.get(userId);
      if (currentGroupCall && currentGroupCall !== callId) {
        reply({ ok: false, message: "You are already in another group call" });
        return;
      }
      if (userCallIndex.has(userId)) {
        reply({ ok: false, message: "You are already in another call" });
        return;
      }

      const participantExists = call.participants.has(userId);
      if (!participantExists) {
        const joinedUser = await User.findById(userId).select("username avatarUrl");
        setGroupCallParticipant(callId, {
          userId,
          name: joinedUser?.username || "Unknown",
          avatarUrl: joinedUser?.avatarUrl || "",
          audioEnabled: true,
          videoEnabled: true,
          joinedAt: new Date().toISOString(),
          isAdmin: isAdminOrCreator(chat, userId),
        });
      }
      socket.join(`call:${callId}`);
      await syncChatOngoingCall(call);
      await emitGroupCallUpdated(call);
      reply({ ok: true, payload: buildGroupCallPayload(call) });
    } catch (err) {
      console.error("group_call:join failed", err);
      reply({ ok: false, message: "Failed to join call" });
    }
  });

  socket.on("group_call:leave", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!GROUP_CALLS_ENABLED) {
      reply({ ok: false, message: "Group calls are disabled" });
      return;
    }
    const userId = String(socket.data.userId || "");
    const callId = String(payload?.callId || "");
    const reason = String(payload?.reason || "left");
    if (!userId || !callId) {
      reply({ ok: false, message: "Missing leave payload" });
      return;
    }
    const call = activeGroupCalls.get(callId);
    if (!call) {
      reply({ ok: true });
      return;
    }
    if (!call.participants.has(userId)) {
      reply({ ok: true });
      return;
    }

    try {
      const leavingParticipant = call.participants.get(userId);
      removeGroupCallParticipant(callId, userId);
      socket.leave(`call:${callId}`);
      if (call.participants.size === 0) {
        await finalizeGroupCall(call, {
          endedByUserId: userId,
          endedByName: leavingParticipant?.name || "User",
          reason,
          excludeUserId: userId,
        });
        reply({ ok: true, ended: true });
        return;
      }
      await syncChatOngoingCall(call);
      await emitGroupCallUpdated(call);
      reply({ ok: true, ended: false });
    } catch (err) {
      console.error("group_call:leave failed", err);
      reply({ ok: false, message: "Failed to leave call" });
    }
  });

  socket.on("group_call:end", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!GROUP_CALLS_ENABLED) {
      reply({ ok: false, message: "Group calls are disabled" });
      return;
    }
    const userId = String(socket.data.userId || "");
    const callId = String(payload?.callId || "");
    const reason = String(payload?.reason || "ended");
    if (!userId || !callId) {
      reply({ ok: false, message: "Missing end payload" });
      return;
    }
    const call = activeGroupCalls.get(callId);
    if (!call) {
      reply({ ok: true });
      return;
    }

    try {
      const chat = await Chat.findById(call.chatId).select("creatorId admins");
      const canEnd =
        String(call.startedByUserId) === userId || isAdminOrCreator(chat, userId);
      if (!canEnd) {
        reply({ ok: false, message: "Only admins can end this call" });
        return;
      }
      const userDoc = await User.findById(userId).select("username");
      await finalizeGroupCall(call, {
        endedByUserId: userId,
        endedByName: userDoc?.username || "Unknown",
        reason,
      });
      reply({ ok: true });
    } catch (err) {
      console.error("group_call:end failed", err);
      reply({ ok: false, message: "Failed to end group call" });
    }
  });

  socket.on("group_call:audio_state", async (payload) => {
    if (!GROUP_CALLS_ENABLED) return;
    const userId = String(socket.data.userId || "");
    const callId = String(payload?.callId || "");
    const enabled = payload?.enabled !== false;
    const call = activeGroupCalls.get(callId);
    if (!userId || !call || !call.participants.has(userId)) return;
    const participant = call.participants.get(userId);
    participant.audioEnabled = enabled;
    call.participants.set(userId, participant);
    await syncChatOngoingCall(call);
    await emitGroupCallUpdated(call);
  });

  socket.on("group_call:video_state", async (payload) => {
    if (!GROUP_CALLS_ENABLED) return;
    const userId = String(socket.data.userId || "");
    const callId = String(payload?.callId || "");
    const enabled = payload?.enabled !== false;
    const call = activeGroupCalls.get(callId);
    if (!userId || !call || !call.participants.has(userId)) return;
    const participant = call.participants.get(userId);
    participant.videoEnabled = enabled;
    call.participants.set(userId, participant);
    await syncChatOngoingCall(call);
    await emitGroupCallUpdated(call);
  });

  socket.on("group_call:offer", (payload) => {
    if (!GROUP_CALLS_ENABLED) return;
    const userId = String(socket.data.userId || "");
    const callId = String(payload?.callId || "");
    const targetUserId = String(payload?.targetUserId || "");
    const call = activeGroupCalls.get(callId);
    if (!userId || !targetUserId || !call || !call.participants.has(userId)) return;
    emitGroupCallToUser(targetUserId, "group_call:offer", {
      callId,
      fromUserId: userId,
      offer: payload?.offer || null,
      renegotiate: payload?.renegotiate === true,
    });
  });

  socket.on("group_call:answer", (payload) => {
    if (!GROUP_CALLS_ENABLED) return;
    const userId = String(socket.data.userId || "");
    const callId = String(payload?.callId || "");
    const targetUserId = String(payload?.targetUserId || "");
    const call = activeGroupCalls.get(callId);
    if (!userId || !targetUserId || !call || !call.participants.has(userId)) return;
    emitGroupCallToUser(targetUserId, "group_call:answer", {
      callId,
      fromUserId: userId,
      answer: payload?.answer || null,
      renegotiate: payload?.renegotiate === true,
    });
  });

  socket.on("group_call:ice", (payload) => {
    if (!GROUP_CALLS_ENABLED) return;
    const userId = String(socket.data.userId || "");
    const callId = String(payload?.callId || "");
    const targetUserId = String(payload?.targetUserId || "");
    const call = activeGroupCalls.get(callId);
    if (!userId || !targetUserId || !call || !call.participants.has(userId)) return;
    emitGroupCallToUser(targetUserId, "group_call:ice", {
      callId,
      fromUserId: userId,
      candidate: payload?.candidate || null,
    });
  });

  socket.on("group_call:remove_participant", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!GROUP_CALLS_ENABLED) {
      reply({ ok: false, message: "Group calls are disabled" });
      return;
    }
    const actorId = String(socket.data.userId || "");
    const callId = String(payload?.callId || "");
    const targetUserId = String(payload?.targetUserId || "");
    const call = activeGroupCalls.get(callId);
    if (!actorId || !targetUserId || !call) {
      reply({ ok: false, message: "Invalid moderation payload" });
      return;
    }

    try {
      const chat = await Chat.findById(call.chatId).select("creatorId admins");
      if (!isAdminOrCreator(chat, actorId)) {
        reply({ ok: false, message: "Admin only" });
        return;
      }
      if (!call.participants.has(targetUserId)) {
        reply({ ok: false, message: "Participant not found" });
        return;
      }
      if (targetUserId === actorId) {
        reply({ ok: false, message: "Use leave call for yourself" });
        return;
      }

      const actor = await User.findById(actorId).select("username");
      removeGroupCallParticipant(callId, targetUserId);
      emitGroupCallToUser(targetUserId, "group_call:removed", {
        callId,
        chatId: call.chatId,
        targetUserId,
        removedByUserId: actorId,
        removedByName: actor?.username || "Admin",
      });

      if (call.participants.size === 0) {
        await finalizeGroupCall(call, {
          endedByUserId: actorId,
          endedByName: actor?.username || "Admin",
          reason: "ended",
        });
        reply({ ok: true, ended: true });
        return;
      }

      await syncChatOngoingCall(call);
      await emitGroupCallUpdated(call);
      reply({ ok: true, ended: false });
    } catch (err) {
      console.error("group_call:remove_participant failed", err);
      reply({ ok: false, message: "Failed to remove participant" });
    }
  });

  socket.on("group_call:force_mute", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!GROUP_CALLS_ENABLED) {
      reply({ ok: false, message: "Group calls are disabled" });
      return;
    }
    const actorId = String(socket.data.userId || "");
    const callId = String(payload?.callId || "");
    const targetUserId = String(payload?.targetUserId || "");
    const call = activeGroupCalls.get(callId);
    if (!actorId || !targetUserId || !call) {
      reply({ ok: false, message: "Invalid mute payload" });
      return;
    }

    try {
      const chat = await Chat.findById(call.chatId).select("creatorId admins");
      if (!isAdminOrCreator(chat, actorId)) {
        reply({ ok: false, message: "Admin only" });
        return;
      }
      const target = call.participants.get(targetUserId);
      if (!target) {
        reply({ ok: false, message: "Participant not found" });
        return;
      }
      if (target.audioEnabled === false) {
        reply({ ok: false, message: "Participant is already muted" });
        return;
      }

      target.audioEnabled = false;
      call.participants.set(targetUserId, target);
      const actor = await User.findById(actorId).select("username");
      emitGroupCallToUser(targetUserId, "group_call:force_mute", {
        callId,
        byUserId: actorId,
        byName: actor?.username || "Admin",
      });
      await syncChatOngoingCall(call);
      await emitGroupCallUpdated(call);
      reply({ ok: true });
    } catch (err) {
      console.error("group_call:force_mute failed", err);
      reply({ ok: false, message: "Failed to mute participant" });
    }
  });

  socket.on("group_call:mute_all", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!GROUP_CALLS_ENABLED) {
      reply({ ok: false, message: "Group calls are disabled" });
      return;
    }
    const actorId = String(socket.data.userId || "");
    const callId = String(payload?.callId || "");
    const call = activeGroupCalls.get(callId);
    if (!actorId || !call) {
      reply({ ok: false, message: "Invalid mute all payload" });
      return;
    }

    try {
      const chat = await Chat.findById(call.chatId).select("creatorId admins");
      if (!isAdminOrCreator(chat, actorId)) {
        reply({ ok: false, message: "Admin only" });
        return;
      }

      const actor = await User.findById(actorId).select("username");
      let mutedCount = 0;
      for (const participant of call.participants.values()) {
        if (String(participant.userId) === actorId) continue;
        if (participant.audioEnabled === false) continue;
        participant.audioEnabled = false;
        call.participants.set(String(participant.userId), participant);
        mutedCount += 1;
        emitGroupCallToUser(participant.userId, "group_call:force_mute", {
          callId,
          byUserId: actorId,
          byName: actor?.username || "Admin",
        });
      }
      await syncChatOngoingCall(call);
      await emitGroupCallUpdated(call);
      reply({ ok: true, mutedCount });
    } catch (err) {
      console.error("group_call:mute_all failed", err);
      reply({ ok: false, message: "Failed to mute all participants" });
    }
  });

  socket.on("group_call:ask_unmute", async (payload, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};
    if (!GROUP_CALLS_ENABLED) {
      reply({ ok: false, message: "Group calls are disabled" });
      return;
    }
    const actorId = String(socket.data.userId || "");
    const callId = String(payload?.callId || "");
    const targetUserId = String(payload?.targetUserId || "");
    const call = activeGroupCalls.get(callId);
    if (!actorId || !targetUserId || !call) {
      reply({ ok: false, message: "Invalid ask to unmute payload" });
      return;
    }

    try {
      const chat = await Chat.findById(call.chatId).select("creatorId admins");
      if (!isAdminOrCreator(chat, actorId)) {
        reply({ ok: false, message: "Admin only" });
        return;
      }
      if (!call.participants.has(targetUserId)) {
        reply({ ok: false, message: "Participant not found" });
        return;
      }
      const targetParticipant = call.participants.get(targetUserId);
      if (targetParticipant?.audioEnabled !== false) {
        reply({ ok: false, message: "Participant is not muted" });
        return;
      }
      const actor = await User.findById(actorId).select("username");
      emitGroupCallToUser(targetUserId, "group_call:ask_unmute", {
        callId,
        byUserId: actorId,
        byName: actor?.username || "Admin",
        text: "Admin requests you to unmute",
      });
      reply({ ok: true });
    } catch (err) {
      console.error("group_call:ask_unmute failed", err);
      reply({ ok: false, message: "Failed to send request" });
    }
  });

  socket.on("disconnect", async () => {
    if (socket.data.userId) {
      const uid = socket.data.userId;
      const set = onlineUsers.get(uid);
      let stillOnline = false;
      let wentOffline = false;
      if (set) {
        set.delete(socket.id);
        stillOnline = set.size > 0;
        if (!stillOnline) {
          onlineUsers.delete(uid);
          wentOffline = true;
        }
      }

      // Only end an active call when this disconnect was the user's last socket.
      // This prevents unrelated tab closures from killing calls running in another tab/window.
      if (!stillOnline) {
        const activeCallId = userCallIndex.get(String(uid));
        if (activeCallId) {
          const call = activeCalls.get(activeCallId);
          if (call) {
            emitToUser(call.callerId, "call:end", { callId: activeCallId, reason: "ended" });
            emitToUser(call.calleeId, "call:end", { callId: activeCallId, reason: "ended" });
            clearCallSession(activeCallId);
          }
        }
        const activeGroupCallId =
          GROUP_CALLS_ENABLED ? userGroupCallIndex.get(String(uid)) : null;
        if (activeGroupCallId) {
          const groupCall = activeGroupCalls.get(activeGroupCallId);
          if (groupCall) {
            removeGroupCallParticipant(activeGroupCallId, uid);
            if (groupCall.participants.size === 0) {
              await finalizeGroupCall(groupCall, {
                endedByUserId: uid,
                endedByName: "User",
                reason: "ended",
                excludeUserId: uid,
              });
            } else {
              await syncChatOngoingCall(groupCall);
              await emitGroupCallUpdated(groupCall);
            }
          }
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
