import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../store/AuthContext";
import { useCall } from "../../store/CallContext";
import { GROUP_CALLS_ENABLED } from "../../constants/featureFlags";
import { usersApi } from "../../api/users.api";
import { notificationsApi } from "../../api/notifications.api";
import { friendsApi } from "../../api/friends.api";
import { hangoutsApi } from "../../api/hangouts.api";
import { API_BASE } from "../../api/http";
import { socket } from "../../socket";
import searchIcon from "../../assets/icons/friends-icons/search.png";
import notificationBellIcon from "../../assets/icons/Header-icons/notification-bell.png";
import moreIcon from "../../assets/icons/more.png";

const pageTitles = [
  { pattern: "/app", title: "Home" },
  { pattern: "/app/chats/*", title: "Messenger" },
  { pattern: "/app/map", title: "Map" },
  { pattern: "/app/friends", title: "Friends" },
  { pattern: "/app/search", title: "Search" },
  { pattern: "/app/profile/*", title: "Profile" },
  { pattern: "/app/notifications", title: "Notifications" },
  { pattern: "/app/settings", title: "Settings" },
];

const RECENT_USER_SEARCH_KEY = "linqly.header.recentUserSearches";
const RECENT_USER_SEARCH_LIMIT = 4;
const NOTIFICATION_DROPDOWN_LIMIT = 8;
const BANNER_AUTO_HIDE_MS = 3000;
const BANNER_EXIT_MS = 220;

function byCreatedDesc(a, b) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function normalizeSearchUser(raw) {
  if (!raw) return null;
  const id = raw.id || raw._id;
  if (!id) return null;
  const username = raw.username ? String(raw.username).replace(/^@+/, "") : "";
  return {
    id,
    username,
    displayName: raw.displayName || raw.name || raw.username || "User",
    avatarUrl: raw.avatarUrl || "",
    isFriend: raw.isFriend === true || raw.relationship === "friends",
    mutualFriendsCount: Number.isFinite(raw.mutualFriendsCount) ? raw.mutualFriendsCount : 0,
  };
}

function resolveAvatarUrl(rawUrl) {
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

function formatNotificationTime(createdAt) {
  const time = new Date(createdAt).getTime();
  if (!Number.isFinite(time)) return "";
  const diff = Date.now() - time;
  if (diff < 60 * 1000) return "Just now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d ago`;
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getNotificationMessage(notification) {
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
  if (notification?.type === "group_call_started") {
    return `started an ongoing call in ${notification?.meta?.chatName || "a group chat"}.`;
  }
  return "sent a notification.";
}

export default function HeaderBar() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { user, logout, accessToken } = useAuth();
  const { joinGroupCall } = useCall();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [bannerNotification, setBannerNotification] = useState(null);
  const [isBannerVisible, setIsBannerVisible] = useState(false);
  const [notificationActionLoadingIds, setNotificationActionLoadingIds] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchWrapRef = useRef(null);
  const notificationsWrapRef = useRef(null);
  const requestIdRef = useRef(0);
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
  }, []);

  const showBanner = useCallback(
    (notification) => {
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
    [clearBannerTimers, dismissBanner]
  );

  const title = useMemo(() => {
    for (const entry of pageTitles) {
      if (matchPath(entry.pattern, pathname)) return entry.title;
    }
    return "Home";
  }, [pathname]);

  async function handleLogout() {
    await logout();
    nav("/", { replace: true });
  }

  const addRecentSearch = (rawUser) => {
    const normalized = normalizeSearchUser(rawUser);
    if (!normalized) return;
    setRecentSearches((prev) => {
      const deduped = prev.filter((x) => String(x.id) !== String(normalized.id));
      const next = [normalized, ...deduped].slice(0, RECENT_USER_SEARCH_LIMIT);
      localStorage.setItem(RECENT_USER_SEARCH_KEY, JSON.stringify(next));
      return next;
    });
  };

  const removeRecentSearch = (userId) => {
    setRecentSearches((prev) => {
      const next = prev.filter((x) => String(x.id) !== String(userId));
      localStorage.setItem(RECENT_USER_SEARCH_KEY, JSON.stringify(next));
      if (highlightedIndex >= next.length) {
        setHighlightedIndex(next.length - 1);
      }
      return next;
    });
  };

  const selectUser = (rawUser) => {
    const normalized = normalizeSearchUser(rawUser);
    if (!normalized) return;
    addRecentSearch(normalized);
    setSearchQuery(normalized.displayName);
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    if (!normalized.username) return;
    nav(`/app/profile/${encodeURIComponent(normalized.username)}`);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_USER_SEARCH_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setRecentSearches(
        parsed.map((x) => normalizeSearchUser(x)).filter(Boolean).slice(0, RECENT_USER_SEARCH_LIMIT)
      );
    } catch {
      // ignore bad local cache
    }
  }, []);

  useEffect(() => {
    function handleOutsideClick(event) {
      const target = event.target;
      const isSearchClick = !!searchWrapRef.current?.contains(target);
      const isNotificationClick = !!notificationsWrapRef.current?.contains(target);
      if (!isSearchClick) {
        setIsDropdownOpen(false);
        setHighlightedIndex(-1);
      }
      if (!isNotificationClick) {
        setIsNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
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

  useEffect(() => {
    if (!accessToken) return;
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setHighlightedIndex(-1);
      return;
    }
    const nextRequestId = requestIdRef.current + 1;
    requestIdRef.current = nextRequestId;
    const timer = setTimeout(async () => {
      try {
        const data = await usersApi.search(accessToken, query, 1, 8);
        if (requestIdRef.current !== nextRequestId) return;
        const users = Array.isArray(data?.users) ? data.users : [];
        const normalizedUsers = users.map((u) => normalizeSearchUser(u)).filter(Boolean);
        const selfNormalized = normalizeSearchUser(user);
        const queryLower = query.toLowerCase();
        const selfMatches =
          selfNormalized &&
          (
            selfNormalized.displayName.toLowerCase().includes(queryLower) ||
            selfNormalized.username.toLowerCase().includes(queryLower)
          );
        const hasSelfAlready =
          selfNormalized &&
          normalizedUsers.some((u) => String(u.id) === String(selfNormalized.id));
        if (selfNormalized && selfMatches && !hasSelfAlready) {
          normalizedUsers.unshift(selfNormalized);
        }
        setSearchResults(normalizedUsers);
        setHighlightedIndex(-1);
      } catch {
        if (requestIdRef.current !== nextRequestId) return;
        setSearchResults([]);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [accessToken, searchQuery, user]);

  const dropdownItems = searchQuery.trim() ? searchResults : recentSearches;
  const showRecentHeader = !searchQuery.trim();
  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [notifications]
  );
  const visibleNotifications = useMemo(
    () => sortedNotifications.slice(0, NOTIFICATION_DROPDOWN_LIMIT),
    [sortedNotifications]
  );
  const hasMoreNotifications = sortedNotifications.length > NOTIFICATION_DROPDOWN_LIMIT;
  const unreadCount = sortedNotifications.filter((n) => n.isRead === false).length;

  const submitSearch = () => {
    const query = String(searchQuery || "").trim();
    if (!query) return;
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    nav(`/app/search?query=${encodeURIComponent(query)}`);
  };

  const handleSearchKeyDown = (e) => {
    const itemCount = dropdownItems.length;
    if (e.key === "Escape") {
      setIsDropdownOpen(false);
      setHighlightedIndex(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (searchQuery.trim()) {
        submitSearch();
        return;
      }
      if (!isDropdownOpen || itemCount === 0) return;
      if (highlightedIndex < 0 || highlightedIndex >= itemCount) return;
      selectUser(dropdownItems[highlightedIndex]);
      return;
    }
    if (!isDropdownOpen || itemCount === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % itemCount);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? itemCount - 1 : prev - 1));
      return;
    }
  };

  const toggleNotifications = () => {
    setIsNotificationsOpen((prev) => !prev);
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
  };

  const markNotificationRead = (notificationId) => {
    setNotifications((prev) =>
      prev.map((item) =>
        String(item._id) === String(notificationId) ? { ...item, isRead: true } : item
      )
    );
  };

  const handleNotificationRowClick = (notification) => {
    if (!notification) return;
    markNotificationRead(notification._id);
    setIsNotificationsOpen(false);

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
    if (notification.type === "message_request") {
      const chatId = String(notification?.meta?.chatId || "").trim();
      if (chatId) {
        nav(`/app/chats/${chatId}`);
      } else {
        nav("/app/chats");
      }
      return;
    }
    if (notification.type === "message_request_accepted") {
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
    if (notification.type === "hangout_join_request") {
      const hangoutId = String(notification?.meta?.hangoutId || notification?.hangout?._id || "").trim();
      if (hangoutId) {
        nav(`/app/map?hangoutId=${encodeURIComponent(hangoutId)}`);
      } else {
        nav("/app/map");
      }
      return;
    }
    if (notification.type === "hangout_join_request_accepted") {
      const hangoutId = String(notification?.meta?.hangoutId || notification?.hangout?._id || "").trim();
      if (hangoutId) {
        nav(`/app/map?hangoutId=${encodeURIComponent(hangoutId)}`);
      } else {
        nav("/app/map");
      }
      return;
    }
    if (notification.type === "hangout_created" || notification.type === "hangout_joined") {
      const hangoutId = String(notification?.hangout?._id || notification?.meta?.hangoutId || "").trim();
      if (hangoutId) {
        nav(`/app/map?hangoutId=${encodeURIComponent(hangoutId)}`);
      } else {
        nav("/app/map");
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
  };

  const handleJoinGroupCallFromNotification = async (notification) => {
    if (!GROUP_CALLS_ENABLED) return;
    if (!notification) return;
    const chatId = String(notification?.meta?.chatId || "").trim();
    if (!chatId) return;
    const callId = String(notification?.meta?.callId || "").trim();
    await joinGroupCall({
      chatId,
      callId,
      chatName: notification?.meta?.chatName || "",
      startedByName: notification?.actor?.displayName || notification?.actor?.username || "",
    });
    nav(`/app/chats/${chatId}`);
    markNotificationRead(notification._id);
    setIsNotificationsOpen(false);
  };

  const handleFriendRequestAction = async (notification, action) => {
    const notificationId = notification?._id;
    const requesterId = notification?.meta?.requesterId || notification?.actor?._id;
    if (!notificationId || !requesterId) return;

    const idKey = String(notificationId);
    const applyLocalStatus = () => {
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
    };

    if (!accessToken) return;

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
  };

  const handleHangoutJoinRequestAction = async (notification, action) => {
    const notificationId = notification?._id;
    const hangoutId = String(notification?.meta?.hangoutId || notification?.hangout?._id || "").trim();
    const requestUserId = String(notification?.meta?.requestUserId || notification?.actor?._id || "").trim();
    if (!notificationId || !hangoutId || !requestUserId) return;
    if (!accessToken) return;

    const idKey = String(notificationId);
    const applyLocalStatus = () => {
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
  };

  const bannerActorName =
    bannerNotification?.actor?.displayName ||
    bannerNotification?.actor?.username ||
    "User";
  const bannerAvatarUrl = resolveAvatarUrl(bannerNotification?.actor?.avatarUrl || "");
  const bannerMessage = bannerNotification
    ? getNotificationMessage(bannerNotification)
    : "";
  const bannerTimestamp = bannerNotification
    ? formatNotificationTime(bannerNotification.createdAt)
    : "";
  const avatarLetter = (user?.username || "?").slice(0, 1).toUpperCase();
  const userAvatarUrl = resolveAvatarUrl(user?.avatarUrl || "");

  return (
    <header className="app-header border-bottom bg-white">
      <div className="app-header-row px-4 py-3">
        <div className="app-header-title">
          <div className="h5 mb-0 fw-semibold">{title}</div>
          <div className="text-muted small">Linqly workspace</div>
        </div>

        <div className="app-header-user-search-wrap" ref={searchWrapRef}>
          <button
            type="button"
            className="app-header-user-search-icon app-header-user-search-icon-btn"
            aria-label="Search users"
            onClick={submitSearch}
          >
            <img src={searchIcon} alt="" />
          </button>
          <input
            type="text"
            className="app-header-user-search-input"
            placeholder="Search User"
            value={searchQuery}
            onFocus={() => setIsDropdownOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onKeyDown={handleSearchKeyDown}
          />
          {searchQuery && (
            <button
              type="button"
              className="app-header-user-search-clear"
              aria-label="Clear search"
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
                setIsDropdownOpen(true);
                setHighlightedIndex(-1);
              }}
            >
              x
            </button>
          )}
          {isDropdownOpen && (
            <div className="app-header-user-search-dropdown">
              {showRecentHeader && (
                <div className="app-header-user-search-label">Recent searches</div>
              )}
              {dropdownItems.length === 0 ? (
                <div className="app-header-user-search-empty">
                  {showRecentHeader ? "No recent searches." : "No users found."}
                </div>
              ) : (
                <div className="app-header-user-search-list">
                  {dropdownItems.map((item, idx) => {
                    const isActive = idx === highlightedIndex;
                    const avatarUrl = resolveAvatarUrl(item.avatarUrl);
                    const isSelf = String(item.id) === String(user?.id || user?._id || "");
                    const usernameText = item.username ? `@${item.username}` : "";
                    const secondaryText = isSelf
                      ? usernameText || "You"
                      : item.isFriend
                        ? "Friend"
                        : `${item.mutualFriendsCount} mutuals`;
                    return (
                      <div
                        key={`header-user-search-${item.id}-${idx}`}
                        role="button"
                        tabIndex={0}
                        className={`app-header-user-search-item ${isActive ? "is-active" : ""}`}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        onClick={() => selectUser(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectUser(item);
                          }
                        }}
                      >
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={item.displayName}
                            className="app-header-user-search-avatar"
                          />
                        ) : (
                          <div className="app-header-user-search-avatar app-header-user-search-avatar-fallback">
                            {String(item.displayName || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="app-header-user-search-item-text">
                          <div className="app-header-user-search-item-name">
                            {item.displayName}
                          </div>
                          <div className="app-header-user-search-item-meta">
                            <span
                              className={`app-header-user-search-indicator ${
                                item.isFriend ? "is-friend" : ""
                              }`}
                            >
                              {secondaryText}
                            </span>
                          </div>
                        </div>
                        {showRecentHeader && (
                          <button
                            type="button"
                            className="app-header-user-search-remove"
                            aria-label="Remove from recent searches"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeRecentSearch(item.id);
                            }}
                          >
                            x
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="d-flex align-items-center gap-2 app-header-actions">
          <div
            className="dropdown app-header-notifications-wrap"
            ref={notificationsWrapRef}
          >
            <button
              type="button"
              className="app-header-notification-btn"
              aria-label="Notifications"
              aria-expanded={isNotificationsOpen}
              onClick={toggleNotifications}
            >
              <img src={notificationBellIcon} alt="" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="app-header-notification-badge" aria-hidden="true" />
              )}
            </button>

            <div
              className={`dropdown-menu dropdown-menu-end app-header-notifications-menu ${
                isNotificationsOpen ? "show" : ""
              }`}
            >
              <div className="app-header-notifications-top">
                <span className="fw-semibold">Notifications</span>
                <button
                  type="button"
                  className="app-header-notifications-more-btn"
                  aria-label="More notification options"
                >
                  <img src={moreIcon} alt="" aria-hidden="true" />
                </button>
              </div>
              <div className="app-header-notifications-divider" />

              {visibleNotifications.length === 0 ? (
                <div className="app-header-notifications-empty">No notifications yet</div>
              ) : (
                <div className="app-header-notifications-list">
                  {visibleNotifications.map((notification) => {
                    const actorName =
                      notification.actor?.displayName ||
                      notification.actor?.username ||
                      "User";
                    const avatarUrl = resolveAvatarUrl(notification.actor?.avatarUrl || "");
                    const message = getNotificationMessage(notification);
                    const timestamp = formatNotificationTime(notification.createdAt);
                    const requestStatus = notification?.meta?.friendRequestStatus;
                    const hangoutRequestStatus =
                      notification?.meta?.hangoutJoinRequestStatus ||
                      notification?.meta?.joinRequestStatus;
                    const showFriendRequestActions =
                      notification.type === "friend_request" &&
                      requestStatus !== "accepted" &&
                      requestStatus !== "declined";
                    const showHangoutJoinRequestActions =
                      notification.type === "hangout_join_request" &&
                      hangoutRequestStatus !== "accepted" &&
                      hangoutRequestStatus !== "declined";
                    const showGroupCallJoinAction =
                      GROUP_CALLS_ENABLED && notification.type === "group_call_started";
                    const actionLoading = notificationActionLoadingIds.includes(
                      String(notification._id)
                    );

                    return (
                      <div
                        key={notification._id}
                        role="button"
                        tabIndex={0}
                        className="app-header-notification-row"
                        onClick={() => handleNotificationRowClick(notification)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleNotificationRowClick(notification);
                          }
                        }}
                      >
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={actorName}
                            className="app-header-notification-avatar"
                          />
                        ) : (
                          <div className="app-header-notification-avatar app-header-notification-avatar-fallback">
                            {String(actorName || "?").charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className="app-header-notification-body">
                          <div className="app-header-notification-name">{actorName}</div>
                          <div className="app-header-notification-message">{message}</div>
                          <div className="app-header-notification-time">{timestamp}</div>
                          {showFriendRequestActions && (
                            <div
                              className="app-header-notification-actions"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="btn btn-dark btn-sm app-header-notification-action-btn"
                                onClick={() =>
                                  handleFriendRequestAction(notification, "accept")
                                }
                                disabled={actionLoading}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm app-header-notification-action-btn"
                                onClick={() =>
                                  handleFriendRequestAction(notification, "decline")
                                }
                                disabled={actionLoading}
                              >
                                Decline
                              </button>
                            </div>
                          )}
                          {showHangoutJoinRequestActions && (
                            <div
                              className="app-header-notification-actions"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="btn btn-dark btn-sm app-header-notification-action-btn"
                                onClick={() =>
                                  handleHangoutJoinRequestAction(notification, "accept")
                                }
                                disabled={actionLoading}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm app-header-notification-action-btn"
                                onClick={() =>
                                  handleHangoutJoinRequestAction(notification, "decline")
                                }
                                disabled={actionLoading}
                              >
                                Decline
                              </button>
                            </div>
                          )}
                          {showGroupCallJoinAction && (
                            <div
                              className="app-header-notification-actions"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="btn btn-dark btn-sm app-header-notification-action-btn"
                                onClick={() =>
                                  handleJoinGroupCallFromNotification(notification)
                                }
                                disabled={actionLoading}
                              >
                                Join
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {hasMoreNotifications && (
                <>
                  <div className="app-header-notifications-divider" />
                  <div className="app-header-notifications-footer">
                    <button
                      type="button"
                      className="btn btn-link btn-sm app-header-notifications-see-all"
                      onClick={() => {
                        setIsNotificationsOpen(false);
                        nav("/app/notifications");
                      }}
                    >
                      See all
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="dropdown">
            <button
              className="btn btn-outline-secondary btn-sm dropdown-toggle d-flex align-items-center gap-2"
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              <span className="avatar-pill">
                {userAvatarUrl ? (
                  <img
                    src={userAvatarUrl}
                    alt={user?.username || "Account"}
                    className="avatar-pill-image"
                  />
                ) : (
                  avatarLetter
                )}
              </span>
              <span className="d-none d-md-inline">{user?.username || "Account"}</span>
            </button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li>
                <Link className="dropdown-item" to="/app/profile">
                  Profile
                </Link>
              </li>
              <li>
                <Link className="dropdown-item" to="/app/settings">
                  Settings
                </Link>
              </li>
              <li>
                <button className="dropdown-item" type="button" onClick={handleLogout}>
                  Logout
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
      {bannerNotification && (
        <div
          className={`app-header-notification-banner ${
            isBannerVisible ? "is-visible" : "is-hiding"
          }`}
          role="status"
          aria-live="polite"
        >
          <button
            type="button"
            className="app-header-notification-banner-close"
            aria-label="Dismiss notification banner"
            onClick={dismissBanner}
          >
            x
          </button>
          <div className="app-header-notification-banner-content">
            {bannerAvatarUrl ? (
              <img
                src={bannerAvatarUrl}
                alt={bannerActorName}
                className="app-header-notification-banner-avatar"
              />
            ) : (
              <div className="app-header-notification-banner-avatar app-header-notification-banner-avatar-fallback">
                {String(bannerActorName || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="app-header-notification-banner-text">
              <div className="app-header-notification-banner-name">{bannerActorName}</div>
              <div className="app-header-notification-banner-message">{bannerMessage}</div>
              <div className="app-header-notification-banner-time">{bannerTimestamp}</div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
