const express = require("express");
const Friendship = require("../models/Friendship");
const Hangout = require("../models/Hangout");
const Chat = require("../models/Chat");
const MessageRequest = require("../models/MessageRequest");
const GroupCallNotification = require("../models/GroupCallNotification");
const NotificationState = require("../models/NotificationState");
const { authRequired } = require("../middleware/authRequired");

const router = express.Router();
const GROUP_CALLS_ENABLED =
  String(process.env.GROUP_CALLS_ENABLED || "").toLowerCase() === "true";

async function getFriendIds(userId) {
  const docs = await Friendship.find({
    status: "accepted",
    $or: [{ requesterId: userId }, { receiverId: userId }],
  }).select("requesterId receiverId");

  return docs.map((d) =>
    String(d.requesterId) === String(userId) ? d.receiverId : d.requesterId
  );
}

function toActor(user) {
  if (!user) return null;
  return {
    _id: user._id,
    displayName: user.displayName || user.username || "User",
    username: user.username || "",
    avatarUrl: user.avatarUrl || "",
  };
}

// GET /notifications
router.get("/", authRequired, async (req, res) => {
  const me = req.user.userId;

  const [
    friendIds,
    incomingRequests,
    acceptedOutgoing,
    myHangouts,
    incomingMessageRequests,
    outgoingMessageRequestUpdates,
    acceptedHangoutJoinEvents,
    attendedHangoutsWithStartEdits,
    groupMemberAddedToChatEvents,
    groupInviteRequestEvents,
    groupCallNotifications,
    notificationState,
  ] =
    await Promise.all([
      getFriendIds(me),
      Friendship.find({ receiverId: me, status: "pending" })
        .sort({ updatedAt: -1 })
        .limit(30)
        .populate("requesterId", "username displayName avatarUrl"),
      Friendship.find({ requesterId: me, status: "accepted" })
        .sort({ updatedAt: -1 })
        .limit(30)
        .populate("receiverId", "username displayName avatarUrl"),
      Hangout.find({ creatorId: me })
        .sort({ updatedAt: -1 })
        .limit(30)
        .populate("attendeeIds", "username displayName avatarUrl")
        .populate("pendingJoinRequests.userId", "username displayName avatarUrl"),
      MessageRequest.find({ toUserId: me, status: "pending" })
        .sort({ updatedAt: -1 })
        .limit(30)
        .populate("fromUserId", "username displayName avatarUrl")
        .select("fromUserId chatId status lastMessageText createdAt updatedAt"),
      MessageRequest.find({
        fromUserId: me,
        status: { $in: ["accepted", "declined"] },
      })
        .sort({ updatedAt: -1 })
        .limit(30)
        .populate("toUserId", "username displayName avatarUrl")
        .select("toUserId chatId status lastMessageText createdAt updatedAt"),
      Hangout.find({ "approvedJoinEvents.userId": me })
        .sort({ updatedAt: -1 })
        .limit(30)
        .populate("creatorId", "username displayName avatarUrl")
        .select("title creatorId approvedJoinEvents createdAt updatedAt"),
      Hangout.find({
        attendeeIds: me,
        creatorId: { $ne: me },
        "startsAtEditEvents.0": { $exists: true },
      })
        .sort({ updatedAt: -1 })
        .limit(40)
        .populate("creatorId", "username displayName avatarUrl")
        .select("title creatorId startsAtEditEvents createdAt updatedAt"),
      Chat.find({
        type: "group",
        "groupMemberAddEvents.addedUserId": me,
      })
        .sort({ updatedAt: -1 })
        .limit(40)
        .populate("groupMemberAddEvents.addedByUserId", "username displayName avatarUrl")
        .select("name groupMemberAddEvents createdAt updatedAt"),
      Chat.find({
        type: "group",
        $or: [{ creatorId: me }, { admins: me }],
        "groupJoinInviteRequestEvents.status": "pending",
      })
        .sort({ updatedAt: -1 })
        .limit(40)
        .populate(
          "groupJoinInviteRequestEvents.requestedByUserId",
          "username displayName avatarUrl"
        )
        .populate("groupJoinInviteRequestEvents.targetUserId", "username displayName avatarUrl")
        .select("name creatorId admins groupJoinInviteRequestEvents createdAt updatedAt"),
      GROUP_CALLS_ENABLED
        ? GroupCallNotification.find({ userId: me, callStatus: "started" })
            .sort({ createdAt: -1 })
            .limit(40)
            .populate("actorId", "username displayName avatarUrl")
            .select("actorId chatId callId chatName actorName createdAt")
        : Promise.resolve([]),
      NotificationState.findOne({ userId: me }).select(
        "readNotificationIds hiddenNotificationIds markAllReadAt"
      ),
    ]);

  let friendCreatedHangouts = [];
  if (friendIds.length > 0) {
    friendCreatedHangouts = await Hangout.find({ creatorId: { $in: friendIds } })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate("creatorId", "username displayName avatarUrl");
  }

  const notifications = [];

  incomingRequests.forEach((doc) => {
    const actor = toActor(doc.requesterId);
    if (!actor) return;
    notifications.push({
      _id: `friend-request-${doc._id}`,
      type: "friend_request",
      actor,
      createdAt: doc.updatedAt,
      isRead: false,
      meta: { requesterId: actor._id },
    });
  });

  incomingMessageRequests.forEach((doc) => {
    const actor = toActor(doc.fromUserId);
    if (!actor) return;
    notifications.push({
      _id: `message-request-${doc._id}`,
      type: "message_request",
      actor,
      createdAt: doc.updatedAt || doc.createdAt,
      isRead: false,
      meta: {
        requestId: String(doc._id),
        chatId: doc.chatId ? String(doc.chatId) : "",
        requestStatus: doc.status,
        preview: doc.lastMessageText || "",
      },
    });
  });

  outgoingMessageRequestUpdates.forEach((doc) => {
    const actor = toActor(doc.toUserId);
    if (!actor) return;
    const type =
      doc.status === "accepted"
        ? "message_request_accepted"
        : "message_request_declined";
    notifications.push({
      _id: `${type}-${doc._id}`,
      type,
      actor,
      createdAt: doc.updatedAt || doc.createdAt,
      isRead: false,
      meta: {
        requestId: String(doc._id),
        chatId: doc.chatId ? String(doc.chatId) : "",
        requestStatus: doc.status,
        preview: doc.lastMessageText || "",
      },
    });
  });

  groupCallNotifications.forEach((doc) => {
    const actor = toActor(doc.actorId) || {
      _id: doc.actorId || null,
      displayName: doc.actorName || "User",
      username: "",
      avatarUrl: "",
    };
    notifications.push({
      _id: `group-call-started-${doc._id}`,
      type: "group_call_started",
      actor,
      createdAt: doc.createdAt,
      isRead: false,
      meta: {
        chatId: doc.chatId ? String(doc.chatId) : "",
        callId: String(doc.callId || ""),
        chatName: doc.chatName || "",
      },
    });
  });

  acceptedHangoutJoinEvents.forEach((doc) => {
    const actor = toActor(doc.creatorId);
    if (!actor) return;
    const events = Array.isArray(doc.approvedJoinEvents) ? doc.approvedJoinEvents : [];
    events
      .filter((entry) => String(entry?.userId || "") === String(me))
      .forEach((entry) => {
        notifications.push({
          _id: `hangout-join-request-accepted-${doc._id}-${entry._id || entry.approvedAt?.toString() || "event"}`,
          type: "hangout_join_request_accepted",
          actor,
          hangout: { _id: doc._id, title: doc.title || "Hangout" },
          createdAt: entry?.approvedAt || doc.updatedAt || doc.createdAt,
          isRead: false,
          meta: {
            hangoutId: String(doc._id),
            requestUserId: String(me),
            approvedById: actor._id,
            hangoutJoinRequestStatus: "accepted",
          },
        });
      });
  });

  attendedHangoutsWithStartEdits.forEach((doc) => {
    const actor = toActor(doc.creatorId);
    if (!actor) return;
    const events = Array.isArray(doc.startsAtEditEvents) ? doc.startsAtEditEvents : [];
    events.forEach((entry) => {
      const eventId = String(entry?._id || "").trim();
      notifications.push({
        _id: `hangout-starts-at-updated-${doc._id}-${eventId || String(entry?.editedAt || "event")}`,
        type: "hangout_starts_at_updated",
        actor,
        hangout: { _id: doc._id, title: doc.title || "Hangout" },
        createdAt: entry?.editedAt || doc.updatedAt || doc.createdAt,
        isRead: false,
        meta: {
          hangoutId: String(doc._id),
          previousStartsAt: entry?.previousStartsAt || null,
          nextStartsAt: entry?.nextStartsAt || null,
        },
      });
    });
  });

  groupMemberAddedToChatEvents.forEach((doc) => {
    const events = Array.isArray(doc.groupMemberAddEvents) ? doc.groupMemberAddEvents : [];
    events
      .filter((entry) => String(entry?.addedUserId || "") === String(me))
      .forEach((entry) => {
        const actor = toActor(entry?.addedByUserId);
        if (!actor) return;
        notifications.push({
          _id: `group-chat-added-you-${doc._id}-${entry?._id || entry?.addedAt || "event"}`,
          type: "group_chat_added_you",
          actor,
          createdAt: entry?.addedAt || doc.updatedAt || doc.createdAt,
          isRead: false,
          meta: {
            chatId: String(doc._id),
            chatName: String(doc?.name || "Group chat"),
          },
        });
      });
  });

  groupInviteRequestEvents.forEach((doc) => {
    const isAdminOrCreator =
      String(doc?.creatorId || "") === String(me) ||
      (Array.isArray(doc?.admins)
        ? doc.admins.some((adminId) => String(adminId) === String(me))
        : false);
    if (!isAdminOrCreator) return;
    const events = Array.isArray(doc.groupJoinInviteRequestEvents)
      ? doc.groupJoinInviteRequestEvents
      : [];
    events
      .filter((entry) => String(entry?.status || "") === "pending")
      .forEach((entry) => {
        const actor = toActor(entry?.requestedByUserId);
        if (!actor) return;
        const targetName =
          entry?.targetUserId?.displayName || entry?.targetUserId?.username || "someone";
        notifications.push({
          _id: `group-chat-add-request-${doc._id}-${entry?._id || entry?.requestedAt || "event"}`,
          type: "group_chat_add_request",
          actor,
          createdAt: entry?.requestedAt || doc.updatedAt || doc.createdAt,
          isRead: false,
          meta: {
            chatId: String(doc._id),
            chatName: String(doc?.name || "Group chat"),
            targetDisplayName: String(targetName),
          },
        });
      });
  });

  acceptedOutgoing.forEach((doc) => {
    const actor = toActor(doc.receiverId);
    if (!actor) return;
    notifications.push({
      _id: `friend-accept-${doc._id}`,
      type: "friend_accept",
      actor,
      createdAt: doc.updatedAt,
      isRead: false,
    });
  });

  friendCreatedHangouts.forEach((doc) => {
    const actor = toActor(doc.creatorId);
    if (!actor) return;
    notifications.push({
      _id: `hangout-created-${doc._id}`,
      type: "hangout_created",
      actor,
      hangout: { _id: doc._id, title: doc.title || "Hangout" },
      createdAt: doc.createdAt,
      isRead: false,
    });
  });

  myHangouts.forEach((doc) => {
    const pending = Array.isArray(doc.pendingJoinRequests)
      ? doc.pendingJoinRequests
      : [];
    pending.forEach((entry) => {
      const actor = toActor(entry?.userId);
      if (!actor) return;
      notifications.push({
        _id: `hangout-join-request-${doc._id}-${actor._id}`,
        type: "hangout_join_request",
        actor,
        hangout: { _id: doc._id, title: doc.title || "Hangout" },
        createdAt: entry?.requestedAt || doc.updatedAt || doc.createdAt,
        isRead: false,
        meta: {
          hangoutId: String(doc._id),
          requestUserId: String(actor._id),
          hangoutJoinRequestStatus: "pending",
        },
      });
    });

    const attendees = Array.isArray(doc.attendeeIds) ? doc.attendeeIds : [];
    const joinedUsers = attendees.filter((u) => String(u?._id) !== String(me));
    if (joinedUsers.length === 0) return;
    // Latest joined user is approximated by array append order.
    const actor = toActor(joinedUsers[joinedUsers.length - 1]);
    if (!actor) return;
    notifications.push({
      _id: `hangout-joined-${doc._id}-${actor._id}`,
      type: "hangout_joined",
      actor,
      hangout: { _id: doc._id, title: doc.title || "Hangout" },
      createdAt: doc.updatedAt || doc.createdAt,
      isRead: false,
    });
  });

  notifications.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const readIds = new Set(notificationState?.readNotificationIds || []);
  const hiddenIds = new Set(notificationState?.hiddenNotificationIds || []);
  const markAllReadAtMs = notificationState?.markAllReadAt
    ? new Date(notificationState.markAllReadAt).getTime()
    : 0;

  const merged = notifications
    .filter((item) => !hiddenIds.has(String(item._id)))
    .map((item) => {
      const createdAtMs = new Date(item.createdAt).getTime();
      const readByMarkAll =
        Number.isFinite(createdAtMs) &&
        markAllReadAtMs > 0 &&
        createdAtMs <= markAllReadAtMs;
      return {
        ...item,
        isRead:
          item.isRead === true ||
          readIds.has(String(item._id)) ||
          readByMarkAll,
      };
    });

  return res.json({ notifications: merged.slice(0, 80) });
});

// POST /notifications/read
router.post("/read", authRequired, async (req, res) => {
  const me = req.user.userId;
  const notificationId = String(req.body?.notificationId || "").trim();
  if (!notificationId) {
    return res.status(400).json({ message: "notificationId is required" });
  }

  await NotificationState.findOneAndUpdate(
    { userId: me },
    {
      $addToSet: { readNotificationIds: notificationId },
      $pull: { hiddenNotificationIds: notificationId },
    },
    { upsert: true, new: false }
  );

  return res.json({ ok: true });
});

// POST /notifications/read-all
router.post("/read-all", authRequired, async (req, res) => {
  const me = req.user.userId;
  await NotificationState.findOneAndUpdate(
    { userId: me },
    { $set: { markAllReadAt: new Date() } },
    { upsert: true, new: false }
  );
  return res.json({ ok: true });
});

// POST /notifications/clear-read
router.post("/clear-read", authRequired, async (req, res) => {
  const me = req.user.userId;
  const notificationIds = Array.isArray(req.body?.notificationIds)
    ? req.body.notificationIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (notificationIds.length === 0) {
    return res.json({ ok: true, cleared: 0 });
  }

  await NotificationState.findOneAndUpdate(
    { userId: me },
    {
      $addToSet: { hiddenNotificationIds: { $each: notificationIds } },
      $pullAll: { readNotificationIds: notificationIds },
    },
    { upsert: true, new: false }
  );

  return res.json({ ok: true, cleared: notificationIds.length });
});

module.exports = router;
