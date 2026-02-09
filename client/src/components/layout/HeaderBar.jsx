import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../store/AuthContext";
import { useCall } from "../../store/CallContext";
import { usersApi } from "../../api/users.api";
import NotificationsList from "../notifications/NotificationsList";
import {
  formatNotificationTime,
  getNotificationMessage,
  resolveAvatarUrl,
  useNotificationsDropdownData,
} from "../../hooks/useNotificationsDropdownData";
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
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [soundSilenceNotice, setSoundSilenceNotice] = useState("");
  const searchWrapRef = useRef(null);
  const notificationsWrapRef = useRef(null);
  const requestIdRef = useRef(0);
  const {
    visibleNotifications,
    hasMoreNotifications,
    unreadCount,
    notificationActionLoadingIds,
    bannerNotification,
    isBannerVisible,
    dismissBanner,
    dismissNotification,
    handleNotificationRowClick,
    handleJoinGroupCallFromNotification,
    handleFriendRequestAction,
    handleHangoutJoinRequestAction,
  } = useNotificationsDropdownData({
    accessToken,
    nav,
    joinGroupCall,
    limit: 8,
    enableBanner: true,
    onInteraction: () => setIsNotificationsOpen(false),
  });

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

  useEffect(() => {
    let hideTimer = null;
    const onSoundSilenced = (event) => {
      const message =
        event?.detail?.message ||
        "Notifications silenced temporarily (too many messages).";
      setSoundSilenceNotice(message);
      if (hideTimer) {
        window.clearTimeout(hideTimer);
      }
      hideTimer = window.setTimeout(() => {
        setSoundSilenceNotice("");
        hideTimer = null;
      }, 3500);
    };
    window.addEventListener("message-sound:silenced", onSoundSilenced);
    return () => {
      window.removeEventListener("message-sound:silenced", onSoundSilenced);
      if (hideTimer) {
        window.clearTimeout(hideTimer);
      }
    };
  }, []);

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

              <NotificationsList
                notifications={visibleNotifications}
                notificationActionLoadingIds={notificationActionLoadingIds}
                onRowClick={handleNotificationRowClick}
                onFriendRequestAction={handleFriendRequestAction}
                onHangoutJoinRequestAction={handleHangoutJoinRequestAction}
                onJoinGroupCall={handleJoinGroupCallFromNotification}
                onDismissNotification={dismissNotification}
                emptyText="No notifications yet"
              />

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
      {soundSilenceNotice ? (
        <div className="app-header-sound-banner" role="status" aria-live="polite">
          {soundSilenceNotice}
        </div>
      ) : null}
    </header>
  );
}
