import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../store/AuthContext";
import { usersApi } from "../../api/users.api";
import { API_BASE } from "../../api/http";
import searchIcon from "../../assets/icons/friends-icons/search.png";

const pageTitles = [
  { pattern: "/app", title: "Home" },
  { pattern: "/app/chats/*", title: "Messenger" },
  { pattern: "/app/map", title: "Map" },
  { pattern: "/app/friends", title: "Friends" },
  { pattern: "/app/profile/*", title: "Profile" },
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

function resolveAvatarUrl(rawUrl) {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
  return `${API_BASE}${rawUrl}`;
}

export default function HeaderBar() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { user, logout, accessToken } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchWrapRef = useRef(null);
  const requestIdRef = useRef(0);

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
      if (!searchWrapRef.current) return;
      if (searchWrapRef.current.contains(event.target)) return;
      setIsDropdownOpen(false);
      setHighlightedIndex(-1);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
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

  const handleSearchKeyDown = (e) => {
    const itemCount = dropdownItems.length;
    if (e.key === "Escape") {
      setIsDropdownOpen(false);
      setHighlightedIndex(-1);
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
    if (e.key === "Enter") {
      if (highlightedIndex < 0 || highlightedIndex >= itemCount) return;
      e.preventDefault();
      selectUser(dropdownItems[highlightedIndex]);
    }
  };

  const avatarLetter = (user?.username || "?").slice(0, 1).toUpperCase();

  return (
    <header className="app-header border-bottom bg-white">
      <div className="app-header-row px-4 py-3">
        <div className="app-header-title">
          <div className="h5 mb-0 fw-semibold">{title}</div>
          <div className="text-muted small">Linqly workspace</div>
        </div>

        <div className="app-header-user-search-wrap" ref={searchWrapRef}>
          <span className="app-header-user-search-icon" aria-hidden="true">
            <img src={searchIcon} alt="" />
          </span>
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
          <button type="button" className="btn btn-outline-secondary btn-sm">
            <span className="me-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
                <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
              </svg>
            </span>
            Notifications
          </button>

          <Link to="/app/map" className="btn btn-primary btn-sm">
            Create Hangout
          </Link>

          <div className="dropdown">
            <button
              className="btn btn-outline-secondary btn-sm dropdown-toggle d-flex align-items-center gap-2"
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              <span className="avatar-pill">{avatarLetter}</span>
              <span className="d-none d-md-inline">{user?.username || "Account"}</span>
            </button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li>
                <Link className="dropdown-item" to="/app/settings">
                  Profile / Settings
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
    </header>
  );
}
