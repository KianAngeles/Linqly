import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { friendsApi } from "../api/friends.api";
import { chatsApi } from "../api/chats.api";
import { usersApi } from "../api/users.api";
import { API_BASE } from "../api/http";
import { socket } from "../socket";
import chatBubbleIcon from "../assets/icons/friends-icons/chat-bubble.png";
import vertiMoreIcon from "../assets/icons/friends-icons/verti-more.png";
import friendsIcon from "../assets/icons/friends-icons/friends.png";
import searchIcon from "../assets/icons/friends-icons/search.png";
import addFriendIcon from "../assets/icons/friends-icons/add-friend.png";
import pendingIcon from "../assets/icons/friends-icons/pending.png";
import peopleWavingIcon from "../assets/icons/friends-icons/people-waving.png";
import emptyMailIcon from "../assets/icons/friends-icons/empty-mail.png";
import "./Friends.css";

function SearchAction({ u, onAdd, onAccept, onReject }) {
  if (u.relationship === "friends")
    return <span className="friends-status-badge">Friends</span>;

  if (u.relationship === "pending_outgoing")
    return (
      <span className="friends-pending-badge">
        <img src={pendingIcon} alt="" />
        Pending
      </span>
    );

  if (u.relationship === "pending_incoming")
    return (
      <>
        <button
          type="button"
          className="btn btn-dark btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            if (onAccept) onAccept(u.id);
          }}
        >
          Accept
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={(e) => {
            e.stopPropagation();
            if (onReject) onReject(u.id);
          }}
        >
          Decline
        </button>
      </>
    );

  if (u.relationship === "blocked")
    return <span className="badge bg-dark">Blocked</span>;

  return (
    <button
      type="button"
      className="friends-add-btn"
      onClick={() => onAdd(u.id)}
    >
      <img src={addFriendIcon} alt="" />
      Add Friend
    </button>
  );
}

function calcAge(birthday) {
  const date = new Date(birthday);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDiff = now.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return Math.max(age, 0);
}

export default function Friends() {
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [friendsQuery, setFriendsQuery] = useState("");
  const [activeTab, setActiveTab] = useState("requests");

  const [friends, setFriends] = useState([]);
  const [pendingIncoming, setPendingIncoming] = useState([]);
  const [pendingOutgoing, setPendingOutgoing] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState(null);
  const [previewUserData, setPreviewUserData] = useState(null);
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [confirmUnfriend, setConfirmUnfriend] = useState(null);
  const [confirmBlock, setConfirmBlock] = useState(null);

  const [err, setErr] = useState("");

  async function loadList() {
    const data = await friendsApi.list(accessToken);
    setFriends(data.friends);
    setPendingIncoming(data.pendingIncoming);
    setPendingOutgoing(data.pendingOutgoing);
  }

  useEffect(() => {
    if (!accessToken) return;
    loadList().catch((e) => setErr(e.message));
  }, [accessToken]);

  const SEARCH_LIMIT = 8;

  const fetchSearch = async (nextPage = 1) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchTotal(0);
      return;
    }
    const data = await usersApi.search(accessToken, query, nextPage, SEARCH_LIMIT);
    setSearchResults(data.users || []);
    setSearchTotal(Number.isFinite(data.total) ? data.total : data.users?.length || 0);
  };

  useEffect(() => {
    if (!accessToken) return;

    const refresh = async () => {
      await loadList();
      if (query.trim()) {
        await fetchSearch(searchPage);
      }
    };

    socket.on("friends:request", refresh);
    socket.on("friends:accepted", refresh);

    return () => {
      socket.off("friends:request", refresh);
      socket.off("friends:accepted", refresh);
    };
  }, [accessToken, query, searchPage]);

  useEffect(() => {
    if (!accessToken) return;
    const handlePresence = ({ userId, isOnline }) => {
      if (!userId) return;
      setFriends((prev) =>
        prev.map((x) =>
          String(x.user?.id) === String(userId)
            ? { ...x, user: { ...x.user, isOnline: !!isOnline } }
            : x
        )
      );
      setPreviewUserData((prev) => {
        if (!prev || String(prev.id) !== String(userId)) return prev;
        return { ...prev, isOnline: !!isOnline };
      });
    };
    socket.on("presence:update", handlePresence);
    return () => {
      socket.off("presence:update", handlePresence);
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const q = query.trim();
    setSearchPage(1);
    if (!q) {
      setSearchResults([]);
      setSearchTotal(0);
      return;
    }
    const t = setTimeout(() => {
      fetchSearch(1).catch((e) => setErr(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [accessToken, query]);

  useEffect(() => {
    if (!accessToken) return;
    if (!query.trim()) return;
    fetchSearch(searchPage).catch((e) => setErr(e.message));
  }, [accessToken, searchPage]);

  async function sendRequest(userId) {
    setErr("");
    try {
      await friendsApi.request(accessToken, userId);
      await loadList();
      // refresh search results so badges update
      if (query.trim()) {
        await fetchSearch(searchPage);
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  async function accept(userId) {
    setErr("");
    try {
      await friendsApi.accept(accessToken, userId);
      await loadList();
      if (query.trim()) {
        await fetchSearch(searchPage);
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  async function reject(userId) {
    setErr("");
    try {
      await friendsApi.reject(accessToken, userId);
      await loadList();
      if (query.trim()) {
        await fetchSearch(searchPage);
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  async function cancel(userId) {
    setErr("");
    try {
      await friendsApi.cancel(accessToken, userId);
      await loadList();
      // refresh search results so badges update
      if (query.trim()) {
        await fetchSearch(searchPage);
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  async function removeFriend(userId) {
    setErr("");
    try {
      await friendsApi.remove(accessToken, userId);
      await loadList();
      // refresh search results so badges update
      if (query.trim()) {
        await fetchSearch(searchPage);
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  async function blockFriend(userId) {
    try {
      await friendsApi.block(accessToken, userId);
      await loadList();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function messageFriend(userId) {
    if (!userId) return;
    setErr("");
    try {
      const data = await chatsApi.createDirect(accessToken, userId);
      const nextId = String(data?.chatId || "");
      if (!nextId) {
        navigate("/app/chats");
        return;
      }
      navigate(`/app/chats/${nextId}`);
    } catch (e) {
      setErr(e.message);
    }
  }

  const resolveAvatarUrl = (rawUrl) => {
    if (!rawUrl) return "";
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
    return `${API_BASE}${rawUrl}`;
  };

  const filteredFriends = friends.filter((x) => {
    if (!friendsQuery.trim()) return true;
    const label = String(x.user?.username || x.user?.email || "").toLowerCase();
    return label.includes(friendsQuery.trim().toLowerCase());
  });

  const selectedFriend = friends.find((x) => String(x.user?.id) === String(selectedFriendId));
  const previewUser = previewUserData || selectedFriend?.user || user || {};
  const isPreviewingFriend = !!selectedFriendId;
  const searchTotalPages = Math.max(
    1,
    Math.ceil(searchTotal / SEARCH_LIMIT)
  );
  const clampedSearchPage = Math.min(searchPage, searchTotalPages);
  const searchPageButtons = useMemo(() => {
    if (searchTotalPages <= 5) {
      return Array.from({ length: searchTotalPages }).map((_, idx) => idx + 1);
    }
    const pages = [];
    let start = Math.max(2, clampedSearchPage - 2);
    let end = Math.min(searchTotalPages - 1, clampedSearchPage + 2);
    if (clampedSearchPage <= 3) {
      start = 2;
      end = 5;
    } else if (clampedSearchPage >= searchTotalPages - 2) {
      start = searchTotalPages - 4;
      end = searchTotalPages - 1;
    }
    pages.push(1);
    if (start > 2) pages.push("ellipsis-left");
    for (let i = start; i <= end; i += 1) pages.push(i);
    if (end < searchTotalPages - 1) pages.push("ellipsis-right");
    pages.push(searchTotalPages);
    return pages;
  }, [searchTotalPages, clampedSearchPage]);
  const displayName =
    previewUser?.displayName ||
    previewUser?.name ||
    (previewUser?.username ? previewUser.username.replace(/^@/, "") : "User");
  const usernameClean = previewUser?.username ? String(previewUser.username).replace(/^@+/, "") : "";
  const handle = usernameClean ? `@${usernameClean}` : "@user";
  const avatarSrc = resolveAvatarUrl(previewUser?.avatarUrl || "");
  const bioText = previewUser?.bio ? String(previewUser.bio) : "";
  const isOnline =
    typeof previewUser?.isOnline === "boolean" ? previewUser.isOnline : !isPreviewingFriend;
  const friendsCount = Number.isFinite(previewUser?.friendsCount)
    ? previewUser.friendsCount
    : friends.length;
  const joinedLabel = previewUser?.createdAt
    ? new Date(previewUser.createdAt).toLocaleString("en-US", {
        month: "short",
        year: "numeric",
      })
    : "";

  useEffect(() => {
    if (!accessToken) return;
    if (!selectedFriendId) {
      setPreviewUserData(null);
      return;
    }
    const friend = selectedFriend?.user;
    const uname = friend?.username ? String(friend.username).replace(/^@+/, "") : "";
    if (!uname) {
      setPreviewUserData(null);
      return;
    }
    let cancelled = false;
    usersApi
      .getByUsername(accessToken, uname)
      .then((data) => {
        if (cancelled) return;
        if (data?.user) setPreviewUserData(data.user);
      })
      .catch(() => {
        if (!cancelled) setPreviewUserData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedFriendId, selectedFriend]);

  return (
    <div className="container-fluid py-4 friends-page">
      <h3 className="fw-bold mb-3">Friends</h3>
      {err && <div className="alert alert-danger">{err}</div>}

      <div className="row g-4">
        <div className="col-12 col-lg-3">
          <div className="friends-card">
            <div className="friends-profile">
              <div className="friends-avatar-wrap">
                {avatarSrc ? (
                  <img src={avatarSrc} alt={displayName} className="friends-avatar" />
                ) : (
                  <div className="friends-avatar friends-avatar-fallback">
                    {String(displayName || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                {isOnline && <span className="friends-online-dot profile-avatar-card" />}
              </div>
              <div className="friends-profile-name-wrap">
                <div className="friends-profile-name">{displayName}</div>
                {isPreviewingFriend && (
                  <button
                    type="button"
                    className="friends-back-btn"
                    onClick={() => {
                      setSelectedFriendId(null);
                      setPreviewUserData(null);
                    }}
                  >
                    Back
                  </button>
                )}
              </div>
              <div className="friends-profile-handle">{handle}</div>
              <div className="friends-profile-bio">
                {bioText || "No bio yet."}
              </div>
              <div className="friends-profile-meta" />
              <hr className="friends-divider" />
              <div className="friends-profile-stats">
                <div>
                  <div className="friends-profile-label">Friends</div>
                  <div className="fw-semibold">{friendsCount}</div>
                </div>
                <div>
                  <div className="friends-profile-label">Joined</div>
                  <div className="fw-semibold">{joinedLabel || "\u2014"}</div>
                </div>
                <div className="text-end">
                  <div className="friends-profile-label">Status</div>
                  <div className={`fw-semibold ${isOnline ? "text-success" : "text-muted"}`}>
                    {isOnline ? "Online" : "Offline"}
                  </div>
                </div>
              </div>
              <div className="friends-profile-actions">
                <button
                  type="button"
                  className="btn btn-dark w-100"
                  onClick={() => {
                    if (!usernameClean) return;
                    navigate(`/app/profile/${usernameClean}`);
                  }}
                >
                  View Full Profile
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-5">
          <div className="friends-card">
            <div className="friends-card-header">
              <h5 className="fw-semibold mb-3">Your Friends</h5>
              <div className="friends-search-input">
                <span className="friends-search-icon" aria-hidden="true">
                  <img src={searchIcon} alt="" />
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search friends..."
                  value={friendsQuery}
                  onChange={(e) => setFriendsQuery(e.target.value)}
                />
              </div>
            </div>
              <div className="friends-list">
              {filteredFriends.length === 0 ? (
                <div className="friends-empty">
                  <img src={peopleWavingIcon} alt="" />
                  <div className="friends-empty-text">
                    Start connecting by adding people you know.
                  </div>
                </div>
              ) : (
                filteredFriends.map((x) => {
                  const friend = x.user || {};
                  const friendAvatar = resolveAvatarUrl(friend.avatarUrl || "");
                  return (
                    <div
                      key={x.friendshipId}
                      className={`friends-list-item friends-list-item-clickable ${
                        String(selectedFriendId) === String(friend.id) ? "is-active" : ""
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        {
                          setPreviewUserData(null);
                          setSelectedFriendId((prev) =>
                            String(prev) === String(friend.id) ? null : friend.id
                          );
                        }
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setPreviewUserData(null);
                          setSelectedFriendId((prev) =>
                            String(prev) === String(friend.id) ? null : friend.id
                          );
                        }
                      }}
                    >
                      <div className="friends-list-left">
                        <div className="friends-avatar-wrap-sm">
                          {friendAvatar ? (
                            <img
                              src={friendAvatar}
                              alt={friend.username}
                              className="friends-list-avatar"
                            />
                          ) : (
                            <div className="friends-list-avatar friends-avatar-fallback">
                              {String(friend.username || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                          {friend?.isOnline && (
                            <span className="friends-online-dot friends-online-dot-sm" />
                          )}
                        </div>
                        <div className="friends-list-name">{friend.username}</div>
                      </div>
                      <div
                        className="friends-list-actions"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="friends-list-action"
                          onClick={() => {
                            messageFriend(friend.id);
                          }}
                          aria-label="Message"
                        >
                          <img src={chatBubbleIcon} alt="" />
                          <span>Message</span>
                        </button>
                        <button
                          type="button"
                          className="friends-list-action-icon"
                          aria-label="More options"
                          onClick={() =>
                            setMenuOpenFor((prev) =>
                              String(prev) === String(friend.id) ? null : friend.id
                            )
                          }
                        >
                          <img src={vertiMoreIcon} alt="" />
                        </button>
                        {String(menuOpenFor) === String(friend.id) && (
                          <div className="friends-list-menu">
                            <button
                              type="button"
                              className="friends-list-menu-item"
                              onClick={() => {
                                if (!friend.username) return;
                                setMenuOpenFor(null);
                                navigate(`/app/profile/${friend.username}`);
                              }}
                            >
                              View Profile
                            </button>
                            <button
                              type="button"
                              className="friends-list-menu-item"
                              onClick={() => {
                                setMenuOpenFor(null);
                                setConfirmUnfriend(friend);
                              }}
                            >
                              Unfriend
                            </button>
                            <button
                              type="button"
                              className="friends-list-menu-item text-danger"
                              onClick={() => {
                                setMenuOpenFor(null);
                                setConfirmBlock(friend);
                              }}
                            >
                              Block
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
      </div>

      {confirmUnfriend && (
        <div
          className="friends-modal-overlay"
          onClick={() => setConfirmUnfriend(null)}
        >
          <div
            className="friends-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Unfriend user"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="friends-modal-header">
              <div className="fw-semibold">
                Unfriend {confirmUnfriend.username}?
              </div>
              <button
                type="button"
                className="friends-modal-close-x"
                aria-label="Close"
                onClick={() => setConfirmUnfriend(null)}
              >
                x
              </button>
            </div>
            <div className="friends-modal-body">
              <div className="text-muted">
                You'll be removed from each other's friends list.
              </div>
            </div>
            <div className="friends-modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setConfirmUnfriend(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  const id = confirmUnfriend?.id;
                  setConfirmUnfriend(null);
                  if (!id) return;
                  await removeFriend(id);
                  if (String(selectedFriendId) === String(id)) {
                    setSelectedFriendId(null);
                    setPreviewUserData(null);
                  }
                }}
              >
                Unfriend
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmBlock && (
        <div
          className="friends-modal-overlay"
          onClick={() => setConfirmBlock(null)}
        >
          <div
            className="friends-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Block user"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="friends-modal-header">
              <div className="fw-semibold">Block {confirmBlock.username}?</div>
              <button
                type="button"
                className="friends-modal-close-x"
                aria-label="Close"
                onClick={() => setConfirmBlock(null)}
              >
                x
              </button>
            </div>
            <div className="friends-modal-body">
              <div className="text-muted">
                This user will no longer be able to interact with you.
              </div>
            </div>
            <div className="friends-modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setConfirmBlock(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-dark"
                onClick={async () => {
                  const id = confirmBlock?.id;
                  setConfirmBlock(null);
                  if (!id) return;
                  await blockFriend(id);
                  if (String(selectedFriendId) === String(id)) {
                    setSelectedFriendId(null);
                    setPreviewUserData(null);
                  }
                }}
              >
                Block
              </button>
            </div>
          </div>
        </div>
      )}
        <div className="col-12 col-lg-4">
          <div className="friends-card">
            <div className="friends-tabs">
              <button
                type="button"
                className={`friends-tab ${activeTab === "requests" ? "is-active" : ""}`}
                onClick={() => setActiveTab("requests")}
              >
                Friend Requests
                <span className="friends-tab-badge">{pendingIncoming.length}</span>
              </button>
              <button
                type="button"
                className={`friends-tab ${activeTab === "add" ? "is-active" : ""}`}
                onClick={() => setActiveTab("add")}
              >
                Add Friends
              </button>
            </div>
            <div className="friends-tab-content">
              {activeTab === "requests" ? (
                pendingIncoming.length === 0 ? (
                  <div className="friends-empty">
                    <img src={emptyMailIcon} alt="" />
                    <div className="friends-empty-text">
                      When someone sends you a request, it’ll appear here.
                    </div>
                  </div>
                ) : (
                  pendingIncoming.map((x) => {
                    const requester = x.user || {};
                    const requesterAvatar = resolveAvatarUrl(requester.avatarUrl || "");
                    const requesterName =
                      requester.displayName ||
                      requester.name ||
                      requester.username ||
                      "User";
                    const requesterUsername = requester.username
                      ? `@${String(requester.username).replace(/^@+/, "")}`
                      : "@user";
                    const mutualCount =
                      Number.isFinite(requester.mutualFriendsCount)
                        ? requester.mutualFriendsCount
                        : 0;
                    return (
                      <div
                        key={x.friendshipId}
                        className="friends-request-item friends-request-item-clickable"
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          const uname = requester.username
                            ? String(requester.username).replace(/^@+/, "")
                            : "";
                          if (!uname) return;
                          navigate(`/app/profile/${uname}`);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            const uname = requester.username
                              ? String(requester.username).replace(/^@+/, "")
                              : "";
                            if (!uname) return;
                            navigate(`/app/profile/${uname}`);
                          }
                        }}
                      >
                        <div className="friends-request-left">
                          <div className="friends-avatar-wrap-sm">
                            {requesterAvatar ? (
                              <img
                                src={requesterAvatar}
                                alt={requesterName}
                                className="friends-list-avatar friends-request-avatar"
                              />
                            ) : (
                              <div className="friends-list-avatar friends-avatar-fallback">
                                {String(requesterName || "?").charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="friends-request-text">
                            <div className="friends-request-name">{requesterName}</div>
                            <div className="friends-request-handle">
                              {requesterUsername}
                            </div>
                            <div className="friends-request-mutual">
                              <img src={friendsIcon} alt="" />
                              {mutualCount} mutual friends
                            </div>
                          </div>
                        </div>
                        <div className="friends-request-actions">
                          <button
                            type="button"
                            className="btn btn-dark btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              accept(requester.id);
                            }}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              reject(requester.id);
                            }}
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                <>
                  <form className="friends-search-input" onSubmit={(e) => e.preventDefault()}>
                    <span className="friends-search-icon" aria-hidden="true">
                      <img src={searchIcon} alt="" />
                    </span>
                    <input
                      className="form-control"
                      placeholder="Search users by their username"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </form>
                  {searchResults.length === 0 ? (
                    <div className="text-muted small">No results yet.</div>
                  ) : (
                    <>
                      <div className="friends-search-results">
                        {searchResults.map((u) => {
                          const userAvatar = resolveAvatarUrl(u.avatarUrl || "");
                          const displayName =
                            u.displayName || u.name || u.username || "User";
                          const handle = u.username
                            ? `@${String(u.username).replace(/^@+/, "")}`
                            : "@user";
                          const mutualCount = Number.isFinite(u.mutualFriendsCount)
                            ? u.mutualFriendsCount
                            : 0;
                          return (
                            <div
                              key={u.id}
                              className="friends-request-item friends-request-item-clickable"
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                const uname = u.username
                                  ? String(u.username).replace(/^@+/, "")
                                  : "";
                                if (!uname) return;
                                navigate(`/app/profile/${uname}`);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  const uname = u.username
                                    ? String(u.username).replace(/^@+/, "")
                                    : "";
                                  if (!uname) return;
                                  navigate(`/app/profile/${uname}`);
                                }
                              }}
                            >
                              <div className="friends-request-left">
                                <div className="friends-avatar-wrap-sm">
                                  {userAvatar ? (
                                    <img
                                      src={userAvatar}
                                      alt={displayName}
                                      className="friends-list-avatar friends-request-avatar"
                                    />
                                  ) : (
                                    <div className="friends-list-avatar friends-avatar-fallback">
                                      {String(displayName || "?")
                                        .charAt(0)
                                        .toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                <div className="friends-request-text">
                                  <div className="friends-request-name">
                                    {displayName}
                                  </div>
                                  <div className="friends-request-handle">{handle}</div>
                                  <div className="friends-request-mutual">
                                    <img src={friendsIcon} alt="" />
                                    {mutualCount} mutual friends
                                  </div>
                                </div>
                              </div>
                              <div
                                className="friends-request-actions"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <SearchAction
                                  u={u}
                                  onAdd={sendRequest}
                                  onAccept={accept}
                                  onReject={reject}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {searchTotalPages > 1 && (
                        <div className="friends-search-pagination">
                          <button
                            type="button"
                            className="btn btn-outline-dark btn-sm"
                            onClick={() =>
                              setSearchPage((prev) => Math.max(1, prev - 1))
                            }
                            disabled={clampedSearchPage === 1}
                          >
                            Prev
                          </button>
                          <div className="friends-search-pages">
                            {searchPageButtons.map((item, idx) => {
                              if (typeof item !== "number") {
                                return (
                                  <span
                                    key={`search-ellipsis-${idx}`}
                                    className="friends-search-ellipsis"
                                  >
                                    …
                                  </span>
                                );
                              }
                              const isActive = item === clampedSearchPage;
                              return (
                                <button
                                  key={`search-page-${item}`}
                                  type="button"
                                  className={`friends-search-page-btn ${
                                    isActive ? "is-active" : ""
                                  }`}
                                  onClick={() => setSearchPage(item)}
                                >
                                  {item}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline-dark btn-sm"
                            onClick={() =>
                              setSearchPage((prev) =>
                                Math.min(searchTotalPages, prev + 1)
                              )
                            }
                            disabled={clampedSearchPage === searchTotalPages}
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  <div className="friends-subtitle">Requests (sent)</div>
                  {pendingOutgoing.length === 0 ? (
                    <div className="text-muted small">No outgoing requests.</div>
                  ) : (
                    <div className="friends-search-results">
                      {pendingOutgoing.map((x) => {
                        const user = x.user || {};
                        const userAvatar = resolveAvatarUrl(user.avatarUrl || "");
                        const displayName =
                          user.displayName || user.name || user.username || "User";
                        const handle = user.username
                          ? `@${String(user.username).replace(/^@+/, "")}`
                          : "@user";
                        const mutualCount = Number.isFinite(user.mutualFriendsCount)
                          ? user.mutualFriendsCount
                          : 0;
                        return (
                          <div
                            key={x.friendshipId}
                            className="friends-request-item friends-request-item-clickable"
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              const uname = user.username
                                ? String(user.username).replace(/^@+/, "")
                                : "";
                              if (!uname) return;
                              navigate(`/app/profile/${uname}`);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                const uname = user.username
                                  ? String(user.username).replace(/^@+/, "")
                                  : "";
                                if (!uname) return;
                                navigate(`/app/profile/${uname}`);
                              }
                            }}
                          >
                            <div className="friends-request-left">
                              <div className="friends-avatar-wrap-sm">
                                {userAvatar ? (
                                  <img
                                    src={userAvatar}
                                    alt={displayName}
                                    className="friends-list-avatar friends-request-avatar"
                                  />
                                ) : (
                                  <div className="friends-list-avatar friends-avatar-fallback">
                                    {String(displayName || "?")
                                      .charAt(0)
                                      .toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="friends-request-text">
                                <div className="friends-request-name">{displayName}</div>
                                <div className="friends-request-handle">{handle}</div>
                                <div className="friends-request-mutual">
                                  <img src={friendsIcon} alt="" />
                                  {mutualCount} mutual friends
                                </div>
                              </div>
                            </div>
                            <div
                              className="friends-request-actions"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <SearchAction u={{ ...user, relationship: "pending_outgoing" }} onAdd={sendRequest} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
