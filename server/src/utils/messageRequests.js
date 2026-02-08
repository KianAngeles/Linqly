const Friendship = require("../models/Friendship");
const Message = require("../models/Message");
const MessageRequest = require("../models/MessageRequest");
const { makePairKey } = require("./pairKey");

const MAX_PENDING_REQUEST_MESSAGES = 1;

function toIdString(value) {
  return String(value?._id || value || "");
}

function getOtherMemberId(chat, userId) {
  const me = String(userId || "");
  const members = Array.isArray(chat?.members) ? chat.members : [];
  const other = members.find((member) => String(member?._id || member) !== me);
  return String(other?._id || other || "");
}

function getLastMessagePreview({ messageType, messageText, fallbackText = "" }) {
  const text = String(messageText || "").trim();
  if (text) return text;
  if (messageType === "image") return "[Image]";
  if (messageType === "video") return "[Video]";
  if (messageType === "file") return "[File]";
  if (messageType === "audio") return "[Voice]";
  return String(fallbackText || "").trim();
}

async function getFriendshipForPair(userA, userB) {
  const pairKey = makePairKey(userA, userB);
  return Friendship.findOne({ pairKey }).select("status blockedBy requesterId receiverId");
}

function getRequestStatusForViewer(requestDoc, viewerId) {
  if (!requestDoc) return "accepted";
  const viewer = String(viewerId || "");
  const from = String(requestDoc.fromUserId || "");
  const to = String(requestDoc.toUserId || "");
  if (requestDoc.status === "accepted") return "accepted";
  if (requestDoc.status === "pending") {
    if (viewer && viewer === to) return "pending_incoming";
    if (viewer && viewer === from) return "pending_outgoing";
    return "pending";
  }
  if (requestDoc.status === "declined") {
    if (viewer && viewer === from) return "declined_outgoing";
    if (viewer && viewer === to) return "declined_incoming";
    return "declined";
  }
  return String(requestDoc.status || "accepted");
}

async function resolveDirectMessagePolicy({ chat, senderId }) {
  if (!chat || chat.type !== "direct") {
    return {
      allowed: true,
      request: null,
      otherUserId: "",
      friendship: null,
      shouldCreatePendingRequest: false,
      requestStatusForSender: "accepted",
    };
  }

  const sender = String(senderId || "");
  const otherUserId = getOtherMemberId(chat, senderId);
  if (!otherUserId) {
    return {
      allowed: false,
      code: 400,
      message: "Invalid direct chat",
      request: null,
      otherUserId: "",
      friendship: null,
      shouldCreatePendingRequest: false,
      requestStatusForSender: "accepted",
    };
  }

  const friendship = await getFriendshipForPair(sender, otherUserId);
  if (friendship?.status === "blocked") {
    const blockedByMe = String(friendship.blockedBy || "") === sender;
    return {
      allowed: false,
      code: 403,
      message: blockedByMe
        ? "You blocked this user"
        : "You have been blocked by this user",
      request: null,
      otherUserId,
      friendship,
      shouldCreatePendingRequest: false,
      requestStatusForSender: "blocked",
    };
  }

  if (friendship?.status === "accepted") {
    return {
      allowed: true,
      request: null,
      otherUserId,
      friendship,
      shouldCreatePendingRequest: false,
      requestStatusForSender: "accepted",
    };
  }

  const request = await MessageRequest.findOne({ chatId: chat._id }).select(
    "_id fromUserId toUserId status requesterMessageCount chatId"
  );

  if (!request) {
    return {
      allowed: true,
      request: null,
      otherUserId,
      friendship,
      shouldCreatePendingRequest: true,
      requestStatusForSender: "pending_outgoing",
    };
  }

  const senderRequestStatus = getRequestStatusForViewer(request, sender);
  if (request.status === "accepted") {
    return {
      allowed: true,
      request,
      otherUserId,
      friendship,
      shouldCreatePendingRequest: false,
      requestStatusForSender: senderRequestStatus,
    };
  }

  if (request.status === "declined") {
    return {
      allowed: false,
      code: 403,
      message: "Message request was declined",
      request,
      otherUserId,
      friendship,
      shouldCreatePendingRequest: false,
      requestStatusForSender: senderRequestStatus,
    };
  }

  const fromUserId = String(request.fromUserId || "");
  const toUserId = String(request.toUserId || "");
  if (sender === toUserId) {
    return {
      allowed: false,
      code: 403,
      message: "Accept the message request before replying",
      request,
      otherUserId,
      friendship,
      shouldCreatePendingRequest: false,
      requestStatusForSender: senderRequestStatus,
    };
  }

  if (
    sender === fromUserId &&
    Number(request.requesterMessageCount || 0) >= MAX_PENDING_REQUEST_MESSAGES
  ) {
    return {
      allowed: false,
      code: 429,
      message: "Message request sent. Wait for recipient to accept",
      request,
      otherUserId,
      friendship,
      shouldCreatePendingRequest: false,
      requestStatusForSender: senderRequestStatus,
    };
  }

  return {
    allowed: true,
    request,
    otherUserId,
    friendship,
    shouldCreatePendingRequest: false,
    requestStatusForSender: senderRequestStatus,
  };
}

async function upsertRequestAfterDirectMessage({
  chat,
  policy,
  senderId,
  messageType,
  messageText,
  messageCreatedAt,
}) {
  if (!chat || chat.type !== "direct") return null;
  if (policy?.friendship?.status === "accepted") return policy?.request || null;
  const sender = String(senderId || "");
  const otherUserId = String(policy?.otherUserId || "");
  if (!otherUserId) return policy?.request || null;

  const lastMessageText = getLastMessagePreview({
    messageType,
    messageText,
    fallbackText: chat?.lastMessageText || "",
  });
  const lastMessageAt = messageCreatedAt || new Date();

  if (policy?.shouldCreatePendingRequest) {
    try {
      const created = await MessageRequest.create({
        fromUserId: sender,
        toUserId: otherUserId,
        status: "pending",
        chatId: chat._id,
        lastMessageAt,
        lastMessageText,
        requesterMessageCount: 1,
      });
      return created;
    } catch (err) {
      // Race-safe fallback if another request doc was created in parallel.
      const existing = await MessageRequest.findOne({ chatId: chat._id });
      return existing || null;
    }
  }

  if (policy?.request && String(policy.request.status) === "pending") {
    const inc = String(policy.request.fromUserId || "") === sender ? 1 : 0;
    await MessageRequest.updateOne(
      { _id: policy.request._id },
      {
        $set: { lastMessageAt, lastMessageText },
        ...(inc ? { $inc: { requesterMessageCount: inc } } : {}),
      }
    );
    return MessageRequest.findById(policy.request._id);
  }

  return policy?.request || null;
}

async function migrateLegacyDirectRequests(chats) {
  const directChats = (Array.isArray(chats) ? chats : []).filter(
    (chat) => chat?.type === "direct" && Array.isArray(chat.members) && chat.members.length >= 2
  );
  if (directChats.length === 0) return new Map();

  const chatIds = directChats.map((chat) => chat._id);
  const existingRequests = await MessageRequest.find({ chatId: { $in: chatIds } }).select(
    "_id chatId status fromUserId toUserId"
  );
  const requestByChatId = new Map(
    existingRequests.map((doc) => [String(doc.chatId), doc])
  );
  const chatById = new Map(directChats.map((chat) => [String(chat._id), chat]));

  const pairKeys = directChats.map((chat) => {
    const m0 = toIdString(chat.members[0]);
    const m1 = toIdString(chat.members[1]);
    return makePairKey(m0, m1);
  });
  const friendships = await Friendship.find({ pairKey: { $in: pairKeys } }).select(
    "pairKey status"
  );
  const friendshipMap = new Map(
    friendships.map((doc) => [String(doc.pairKey), doc])
  );

  const toAcceptRequestIds = existingRequests
    .filter((requestDoc) => {
      const chat = chatById.get(String(requestDoc.chatId));
      if (!chat) return false;
      const m0 = toIdString(chat.members[0]);
      const m1 = toIdString(chat.members[1]);
      const pairKey = makePairKey(m0, m1);
      const rel = friendshipMap.get(String(pairKey));
      return rel?.status === "accepted" && requestDoc.status !== "accepted";
    })
    .map((requestDoc) => requestDoc._id);
  if (toAcceptRequestIds.length > 0) {
    await MessageRequest.updateMany(
      { _id: { $in: toAcceptRequestIds } },
      { $set: { status: "accepted" } }
    );
  }

  const candidates = directChats.filter((chat) => {
    if (requestByChatId.has(String(chat._id))) return false;
    const m0 = toIdString(chat.members[0]);
    const m1 = toIdString(chat.members[1]);
    const pairKey = makePairKey(m0, m1);
    const rel = friendshipMap.get(String(pairKey));
    if (!rel) return true;
    return rel.status !== "accepted" && rel.status !== "blocked";
  });
  if (candidates.length === 0) return requestByChatId;

  const statsRows = await Message.aggregate([
    {
      $match: {
        chatId: { $in: candidates.map((chat) => chat._id) },
        type: { $ne: "system" },
      },
    },
    { $sort: { chatId: 1, createdAt: 1 } },
    {
      $group: {
        _id: "$chatId",
        senders: { $addToSet: "$senderId" },
        firstSenderId: { $first: "$senderId" },
        lastMessageAt: { $last: "$createdAt" },
        lastMessageType: { $last: "$type" },
        lastMessageText: { $last: "$text" },
        messageCount: { $sum: 1 },
      },
    },
  ]);
  const statsMap = new Map(statsRows.map((row) => [String(row._id), row]));

  const createDocs = [];
  candidates.forEach((chat) => {
    const stats = statsMap.get(String(chat._id));
    if (!stats || !stats.firstSenderId || Number(stats.messageCount || 0) <= 0) return;

    const memberA = toIdString(chat.members[0]);
    const memberB = toIdString(chat.members[1]);
    const firstSender = toIdString(stats.firstSenderId);
    if (!firstSender || (firstSender !== memberA && firstSender !== memberB)) return;
    const recipient = firstSender === memberA ? memberB : memberA;
    if (!recipient) return;

    const senderCount = Array.isArray(stats.senders) ? stats.senders.length : 0;
    const status = senderCount > 1 ? "accepted" : "pending";
    const lastMessageText = getLastMessagePreview({
      messageType: stats.lastMessageType,
      messageText: stats.lastMessageText,
      fallbackText: chat.lastMessageText || "",
    });

    createDocs.push({
      fromUserId: firstSender,
      toUserId: recipient,
      status,
      chatId: chat._id,
      lastMessageAt: stats.lastMessageAt || chat.lastMessageAt || new Date(),
      lastMessageText,
      requesterMessageCount: status === "pending" ? Number(stats.messageCount || 0) : 0,
    });
  });

  if (createDocs.length > 0) {
    await MessageRequest.insertMany(createDocs, { ordered: false }).catch(() => {});
  }

  const merged = await MessageRequest.find({ chatId: { $in: chatIds } }).select(
    "_id chatId status fromUserId toUserId requesterMessageCount lastMessageAt lastMessageText"
  );
  return new Map(merged.map((doc) => [String(doc.chatId), doc]));
}

module.exports = {
  MAX_PENDING_REQUEST_MESSAGES,
  getRequestStatusForViewer,
  resolveDirectMessagePolicy,
  upsertRequestAfterDirectMessage,
  migrateLegacyDirectRequests,
  getFriendshipForPair,
  getLastMessagePreview,
};
