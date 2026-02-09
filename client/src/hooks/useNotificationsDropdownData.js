import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GROUP_CALLS_ENABLED } from "../constants/featureFlags";
import { notificationsApi } from "../api/notifications.api";
import { friendsApi } from "../api/friends.api";
import { hangoutsApi } from "../api/hangouts.api";
import { API_BASE } from "../api/http";
import { socket } from "../socket";

const BANNER_AUTO_HIDE_MS = 3000;
const BANNER_EXIT_MS = 220;
const DEFAULT_LIMIT = 8;
const CLOSED_HANGOUT_STATUSES = new Set([
  "closed",
  "ended",
  "completed",
  "cancelled",
  "canceled",
  "done",
  "inactive",
]);
const localReadNotificationIds = new Set();
const localHiddenNotificationIds = new Set();
let localMarkAllReadAtMs = 0;
const notificationSyncListeners = new Set();

function byCreatedDesc(a, b) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function subscribeNotificationSync(listener) {
  notificationSyncListeners.add(listener);
  return () => {
    notificationSyncListeners.delete(listener);
  };
}

function emitNotificationSync(event) {
  for (const listener of notificationSyncListeners) {
    listener(event);
  }
}

function resetLocalNotificationState() {
  localReadNotificationIds.clear();
  localHiddenNotificationIds.clear();
  localMarkAllReadAtMs = 0;
}

function applyLocalNotificationState(item) {
  const id = String(item?._id || "");
  const createdAtMs = new Date(item?.createdAt || 0).getTime();
  const readByMarkAll =
    Number.isFinite(createdAtMs) &&
    createdAtMs > 0 &&
    localMarkAllReadAtMs > 0 &&
    createdAtMs <= localMarkAllReadAtMs;
  const isRead =
    item?.isRead === true || localReadNotificationIds.has(id) || readByMarkAll;
  return { ...item, isRead };
}

export function resolveAvatarUrl(rawUrl) {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
  return `${API_BASE}${rawUrl}`;
}

function normalizeNotification(raw, fallbackIndex = 0) {
  if (!raw || typeof raw !== "object") return null;
  const actorRaw = raw.actor || {};
  const actorId = actorRaw._id || actorRaw.id || raw.meta?.requesterId || `actor-${fallbackIndex}`;
  const actorUsername = actorRaw.username ? String(actorRaw.username).replace(/^@+/, "") : "";
  const type =
    raw.type === "friend_request" ||
    raw.type === "friend_accept" ||
    raw.type === "message_request" ||
    raw.type === "message_request_accepted" ||
    raw.type === "message_request_declined" ||
    raw.type === "hangout_join_request" ||
    raw.type === "hangout_join_request_accepted" ||
    raw.type === "hangout_created" ||
    raw.type === "hangout_joined" ||
    raw.type === "hangout_starts_at_updated" ||
    raw.type === "group_chat_added_you" ||
    raw.type === "group_chat_add_request" ||
    raw.type === "group_call_started"
      ? raw.type
      : "friend_accept";
  const status = raw.meta?.friendRequestStatus
    ? String(raw.meta.friendRequestStatus)
    : type === "friend_request"
      ? "pending"
      : null;

  return {
    _id: raw._id || raw.id || `${type}-${actorId}-${fallbackIndex}`,
    type,
    actor: {
      _id: actorId,
      displayName: actorRaw.displayName || actorRaw.name || actorRaw.username || "User",
      username: actorUsername,
      avatarUrl: actorRaw.avatarUrl || "",
    },
    hangout: raw.hangout
      ? {
          _id: raw.hangout._id || raw.hangout.id || "",
          title: raw.hangout.title || "",
        }
      : null,
    createdAt: raw.createdAt || new Date().toISOString(),
    isRead: raw.isRead === true,
    meta: {
      ...(raw.meta || {}),
      requesterId: raw.meta?.requesterId || actorId,
      friendRequestStatus: status,
    },
  };
}

export function formatNotificationTime(createdAt) {
  const time = new Date(createdAt).getTime();
  if (!Number.isFinite(time)) return "";
  const diff = Date.now() - time;
  if (diff < 60 * 1000) return "Just now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d ago`;
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function getNotificationMessage(notification) {
  const hangoutTitle = notification?.hangout?.title || "a hangout";
  if (notification?.type === "friend_request") {
    const status = notification?.meta?.friendRequestStatus;
    if (status === "accepted") return "Friend request accepted.";
    if (status === "declined") return "Friend request declined.";
    return "sent you a friend request.";
  }
  if (notification?.type === "friend_accept") {
    return "accepted your friend request.";
  }
  if (notification?.type === "message_request") {
    return "sent you a message request.";
  }
  if (notification?.type === "message_request_accepted") {
    return "accepted your message request.";
  }
  if (notification?.type === "message_request_declined") {
    return "declined your message request.";
  }
  if (notification?.type === "hangout_created") {
    return `created a hangout: ${hangoutTitle}.`;
  }
  if (notification?.type === "hangout_join_request") {
    return `has requested to join your hangout ${hangoutTitle}.`;
  }
  if (notification?.type === "hangout_join_request_accepted") {
    return `has accepted your request to join ${hangoutTitle}.`;
  }
  if (notification?.type === "hangout_joined") {
    return `joined your hangout: ${hangoutTitle}.`;
  }
  if (notification?.type === "hangout_starts_at_updated") {
    return `updated the start time for ${hangoutTitle}.`;
  }
  if (notification?.type === "group_chat_added_you") {
    return `added you to group chat ${notification?.meta?.chatName || "Group chat"}.`;
  }
  if (notification?.type === "group_chat_add_request") {
    return `requested to add ${notification?.meta?.targetDisplayName || "someone"} to ${notification?.meta?.chatName || "Group chat"}.`;
  }
  if (notification?.type === "group_call_started") {
    return `started an ongoing call in ${notification?.meta?.chatName || "a group chat"}.`;
  }
  return "sent a notification.";
}

function isHangoutClosed(hangout) {
  if (!hangout || typeof hangout !== "object") return true;
  const status = String(hangout.status || "").toLowerCase().trim();
  if (CLOSED_HANGOUT_STATUSES.has(status)) return true;
  const endsAtMs = hangout?.endsAt ? new Date(hangout.endsAt).getTime() : NaN;
  if (Number.isFinite(endsAtMs) && endsAtMs < new Date().getTime()) return true;
  return false;
}

export function useNotificationsDropdownData({
  accessToken,
  nav,
  joinGroupCall,
  limit = DEFAULT_LIMIT,
  enableBanner = false,
  onInteraction = null,
}) {
  const [notifications, setNotifications] = useState([]);
  const [bannerNotification, setBannerNotification] = useState(null);
  const [isBannerVisible, setIsBannerVisible] = useState(false);
  const [notificationActionLoadingIds, setNotificationActionLoadingIds] = useState([]);
  const hasBootstrappedNotificationsRef = useRef(false);
  const seenNotificationIdsRef = useRef(new Set());
  const bannerAutoHideTimerRef = useRef(null);
  const bannerRemoveTimerRef = useRef(null);

  const clearBannerTimers = useCallback(() => {
    if (bannerAutoHideTimerRef.current) {
      window.clearTimeout(bannerAutoHideTimerRef.current);
      bannerAutoHideTimerRef.current = null;
    }
    if (bannerRemoveTimerRef.current) {
      window.clearTimeout(bannerRemoveTimerRef.current);
      bannerRemoveTimerRef.current = null;
    }
  }, []);

  const dismissBanner = useCallback(() => {
    if (!enableBanner) return;
    if (bannerAutoHideTimerRef.current) {
      window.clearTimeout(bannerAutoHideTimerRef.current);
      bannerAutoHideTimerRef.current = null;
    }
    setIsBannerVisible(false);
    if (bannerRemoveTimerRef.current) {
      window.clearTimeout(bannerRemoveTimerRef.current);
    }
    bannerRemoveTimerRef.current = window.setTimeout(() => {
      setBannerNotification(null);
      bannerRemoveTimerRef.current = null;
    }, BANNER_EXIT_MS);
  }, [enableBanner]);

  const showBanner = useCallback(
    (notification) => {
      if (!enableBanner) return;
      if (!notification) return;
      clearBannerTimers();
      setBannerNotification(notification);
      setIsBannerVisible(false);
      window.requestAnimationFrame(() => {
        setIsBannerVisible(true);
      });
      bannerAutoHideTimerRef.current = window.setTimeout(() => {
        dismissBanner();
      }, BANNER_AUTO_HIDE_MS);
    },
    [clearBannerTimers, dismissBanner, enableBanner]
  );

  useEffect(() => {
    const unsubscribe = subscribeNotificationSync((event) => {
      if (!event?.type) return;
      if (event.type === "mark_read") {
        const id = String(event.payload?.id || "");
        if (!id) return;
        setNotifications((prev) =>
          prev.map((item) =>
            String(item._id) === id ? { ...item, isRead: true } : item
          )
        );
        return;
      }
      if (event.type === "mark_all_read") {
        setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
        return;
      }
      if (event.type === "clear_read") {
        setNotifications((prev) => prev.filter((item) => item.isRead === false));
        return;
      }
      if (event.type === "dismiss") {
        const id = String(event.payload?.id || "");
        if (!id) return;
        setNotifications((prev) =>
          prev.filter((item) => String(item._id) !== id)
        );
      }
    });
    return unsubscribe;
  }, []);

  const loadNotifications = useCallback(
    async ({ announceNew = true } = {}) => {
      if (!accessToken) return;
      try {
        const data = await notificationsApi.list(accessToken);
        const backendItems = Array.isArray(data?.notifications) ? data.notifications : [];
        const normalized = backendItems
          .map((item, idx) => normalizeNotification(item, idx))
          .filter(Boolean)
          .filter((item) => GROUP_CALLS_ENABLED || item.type !== "group_call_started")
          .map((item) => applyLocalNotificationState(item))
          .filter((item) => !localHiddenNotificationIds.has(String(item._id)))
          .sort(byCreatedDesc);

        const seenIds = seenNotificationIdsRef.current;
        if (!hasBootstrappedNotificationsRef.current) {
          normalized.forEach((item) => seenIds.add(String(item._id)));
          hasBootstrappedNotificationsRef.current = true;
          setNotifications(normalized);
          return;
        }

        const unseen = normalized.filter((item) => !seenIds.has(String(item._id)));
        normalized.forEach((item) => seenIds.add(String(item._id)));
        setNotifications(normalized);

        if (announceNew && unseen.length > 0) {
          unseen.sort(byCreatedDesc);
          showBanner(unseen[0]);
        }
      } catch {
        setNotifications([]);
      }
    },
    [accessToken, showBanner]
  );

  useEffect(() => {
    if (!accessToken) {
      resetLocalNotificationState();
      clearBannerTimers();
      setNotifications([]);
      setBannerNotification(null);
      setIsBannerVisible(false);
      hasBootstrappedNotificationsRef.current = false;
      seenNotificationIdsRef.current = new Set();
      return;
    }

    loadNotifications({ announceNew: false });
    const intervalId = window.setInterval(() => {
      loadNotifications({ announceNew: true });
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [accessToken, clearBannerTimers, loadNotifications]);

  useEffect(() => {
    if (!accessToken) return;
    const refreshNotifications = () => {
      loadNotifications({ announceNew: true });
    };

    socket.on("friends:request", refreshNotifications);
    socket.on("friends:accepted", refreshNotifications);
    socket.on("friends:updated", refreshNotifications);
    socket.on("hangout:new", refreshNotifications);
    socket.on("hangout:update", refreshNotifications);
    socket.on("hangout_join_request:accepted", refreshNotifications);
    socket.on("message_request:new", refreshNotifications);
    socket.on("message_request:accepted", refreshNotifications);
    socket.on("message_request:declined", refreshNotifications);
    socket.on("chat:activated", refreshNotifications);
    socket.on("notifications:refresh", refreshNotifications);
    if (GROUP_CALLS_ENABLED) {
      socket.on("group_call:notification", refreshNotifications);
    }

    return () => {
      socket.off("friends:request", refreshNotifications);
      socket.off("friends:accepted", refreshNotifications);
      socket.off("friends:updated", refreshNotifications);
      socket.off("hangout:new", refreshNotifications);
      socket.off("hangout:update", refreshNotifications);
      socket.off("hangout_join_request:accepted", refreshNotifications);
      socket.off("message_request:new", refreshNotifications);
      socket.off("message_request:accepted", refreshNotifications);
      socket.off("message_request:declined", refreshNotifications);
      socket.off("chat:activated", refreshNotifications);
      socket.off("notifications:refresh", refreshNotifications);
      if (GROUP_CALLS_ENABLED) {
        socket.off("group_call:notification", refreshNotifications);
      }
    };
  }, [accessToken, loadNotifications]);

  useEffect(() => {
    return () => {
      clearBannerTimers();
    };
  }, [clearBannerTimers]);

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [notifications]
  );
  const visibleNotifications = useMemo(
    () => sortedNotifications.slice(0, limit),
    [limit, sortedNotifications]
  );
  const hasMoreNotifications = sortedNotifications.length > limit;
  const unreadCount = sortedNotifications.filter((n) => n.isRead === false).length;

  const markNotificationRead = useCallback((notificationId) => {
    const id = String(notificationId || "");
    if (id) {
      localReadNotificationIds.add(id);
    }
    setNotifications((prev) =>
      prev.map((item) =>
        String(item._id) === id ? { ...item, isRead: true } : item
      )
    );
    if (accessToken && id) {
      notificationsApi.markRead(accessToken, id).catch(() => {});
    }
    emitNotificationSync({ type: "mark_read", payload: { id } });
  }, [accessToken]);

  const markAllRead = useCallback(() => {
    localMarkAllReadAtMs = new Date().getTime();
    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    if (accessToken) {
      notificationsApi.markAllRead(accessToken).catch(() => {});
    }
    emitNotificationSync({ type: "mark_all_read" });
  }, [accessToken]);

  const clearRead = useCallback(() => {
    const readIds = [];
    setNotifications((prev) => {
      const keep = [];
      for (const item of prev) {
        if (item.isRead === false) {
          keep.push(item);
        } else {
          const id = String(item._id);
          localHiddenNotificationIds.add(id);
          readIds.push(id);
        }
      }
      return keep;
    });
    if (accessToken && readIds.length > 0) {
      notificationsApi.clearRead(accessToken, readIds).catch(() => {});
    }
    emitNotificationSync({ type: "clear_read" });
  }, [accessToken]);

  const dismissNotification = useCallback((notificationId) => {
    const id = String(notificationId || "");
    if (!id) return;
    localReadNotificationIds.add(id);
    localHiddenNotificationIds.add(id);
    setNotifications((prev) =>
      prev.filter((item) => String(item._id) !== id)
    );
    if (accessToken) {
      notificationsApi.markRead(accessToken, id).catch(() => {});
      notificationsApi.clearRead(accessToken, [id]).catch(() => {});
    }
    emitNotificationSync({ type: "dismiss", payload: { id } });
  }, [accessToken]);

  const handleNotificationRowClick = useCallback(
    async (notification) => {
      if (!notification) return;
      markNotificationRead(notification._id);
      onInteraction?.();

      if (notification.type === "friend_request") {
        const username = notification.actor?.username
          ? encodeURIComponent(notification.actor.username)
          : "";
        if (username) {
          nav(`/app/profile/${username}`);
          return;
        }
        nav("/app/friends");
        return;
      }
      if (notification.type === "friend_accept") {
        nav("/app/friends");
        return;
      }
      if (
        notification.type === "message_request" ||
        notification.type === "message_request_accepted"
      ) {
        const chatId = String(notification?.meta?.chatId || "").trim();
        if (chatId) {
          nav(`/app/chats/${chatId}`);
        } else {
          nav("/app/chats");
        }
        return;
      }
      if (notification.type === "message_request_declined") {
        nav("/app/chats");
        return;
      }
      if (
        notification.type === "hangout_join_request" ||
        notification.type === "hangout_join_request_accepted" ||
        notification.type === "hangout_created" ||
        notification.type === "hangout_joined" ||
        notification.type === "hangout_starts_at_updated" ||
        notification.type === "group_chat_added_you" ||
        notification.type === "group_chat_add_request"
      ) {
        const hangoutId = String(
          notification?.meta?.hangoutId || notification?.hangout?._id || ""
        ).trim();
        const chatId = String(notification?.meta?.chatId || "").trim();
        if (notification.type === "group_chat_added_you" || notification.type === "group_chat_add_request") {
          if (chatId) {
            nav(`/app/chats/${chatId}`);
          } else {
            nav("/app/chats");
          }
          return;
        }
        if (!hangoutId) {
          nav("/app/map");
          return;
        }
        if (!accessToken) {
          nav(`/app/map?hangoutId=${encodeURIComponent(hangoutId)}`);
          return;
        }
        try {
          const data = await hangoutsApi.get(accessToken, hangoutId);
          if (isHangoutClosed(data?.hangout)) {
            throw new Error("hangout_closed");
          }
          nav(`/app/map?hangoutId=${encodeURIComponent(hangoutId)}`);
        } catch {
          const params = new URLSearchParams();
          params.set("hangoutClosed", "1");
          params.set("hangoutId", hangoutId);
          if (notification?.hangout?.title) {
            params.set("hangoutTitle", String(notification.hangout.title));
          }
          nav(`/app/map?${params.toString()}`);
        }
        return;
      }
      if (notification.type === "group_call_started") {
        const chatId = String(notification?.meta?.chatId || "").trim();
        if (chatId) {
          nav(`/app/chats/${chatId}`);
        } else {
          nav("/app/chats");
        }
        return;
      }
      nav("/app/notifications");
    },
    [accessToken, markNotificationRead, nav, onInteraction]
  );

  const handleJoinGroupCallFromNotification = useCallback(
    async (notification) => {
      if (!GROUP_CALLS_ENABLED) return;
      if (!notification) return;
      const chatId = String(notification?.meta?.chatId || "").trim();
      if (!chatId) return;
      const callId = String(notification?.meta?.callId || "").trim();
      await joinGroupCall?.({
        chatId,
        callId,
        chatName: notification?.meta?.chatName || "",
        startedByName: notification?.actor?.displayName || notification?.actor?.username || "",
      });
      nav(`/app/chats/${chatId}`);
      markNotificationRead(notification._id);
      onInteraction?.();
    },
    [joinGroupCall, markNotificationRead, nav, onInteraction]
  );

  const handleFriendRequestAction = useCallback(
    async (notification, action) => {
      const notificationId = notification?._id;
      const requesterId = notification?.meta?.requesterId || notification?.actor?._id;
      if (!notificationId || !requesterId) return;
      if (!accessToken) return;

      const idKey = String(notificationId);
      const applyLocalStatus = () => {
        localReadNotificationIds.add(idKey);
        setNotifications((prev) =>
          prev.map((item) =>
            String(item._id) === idKey
              ? {
                  ...item,
                  isRead: true,
                  meta: {
                    ...(item.meta || {}),
                    friendRequestStatus: action === "accept" ? "accepted" : "declined",
                  },
                }
              : item
          )
        );
        emitNotificationSync({ type: "mark_read", payload: { id: idKey } });
      };

      setNotificationActionLoadingIds((prev) =>
        prev.includes(idKey) ? prev : [...prev, idKey]
      );

      try {
        if (action === "accept") {
          await friendsApi.accept(accessToken, requesterId);
        } else {
          await friendsApi.reject(accessToken, requesterId);
        }
        applyLocalStatus();
      } catch {
        // keep current notification state when action fails
      } finally {
        setNotificationActionLoadingIds((prev) =>
          prev.filter((loadingId) => loadingId !== idKey)
        );
      }
    },
    [accessToken]
  );

  const handleHangoutJoinRequestAction = useCallback(
    async (notification, action) => {
      const notificationId = notification?._id;
      const hangoutId = String(
        notification?.meta?.hangoutId || notification?.hangout?._id || ""
      ).trim();
      const requestUserId = String(
        notification?.meta?.requestUserId || notification?.actor?._id || ""
      ).trim();
      if (!notificationId || !hangoutId || !requestUserId) return;
      if (!accessToken) return;

      const idKey = String(notificationId);
      const applyLocalStatus = () => {
        localReadNotificationIds.add(idKey);
        setNotifications((prev) =>
          prev.map((item) =>
            String(item._id) === idKey
              ? {
                  ...item,
                  isRead: true,
                  meta: {
                    ...(item.meta || {}),
                    hangoutJoinRequestStatus: action === "accept" ? "accepted" : "declined",
                  },
                }
              : item
          )
        );
        emitNotificationSync({ type: "mark_read", payload: { id: idKey } });
      };

      setNotificationActionLoadingIds((prev) =>
        prev.includes(idKey) ? prev : [...prev, idKey]
      );

      try {
        if (action === "accept") {
          await hangoutsApi.acceptJoinRequest(accessToken, hangoutId, requestUserId);
        } else {
          await hangoutsApi.declineJoinRequest(accessToken, hangoutId, requestUserId);
        }
        applyLocalStatus();
      } catch {
        // keep current notification state when action fails
      } finally {
        setNotificationActionLoadingIds((prev) =>
          prev.filter((loadingId) => loadingId !== idKey)
        );
      }
    },
    [accessToken]
  );

  return {
    notifications,
    sortedNotifications,
    visibleNotifications,
    hasMoreNotifications,
    unreadCount,
    notificationActionLoadingIds,
    bannerNotification,
    isBannerVisible,
    dismissBanner,
    markNotificationRead,
    handleNotificationRowClick,
    handleJoinGroupCallFromNotification,
    handleFriendRequestAction,
    handleHangoutJoinRequestAction,
    markAllRead,
    clearRead,
    dismissNotification,
    reloadNotifications: loadNotifications,
  };
}
