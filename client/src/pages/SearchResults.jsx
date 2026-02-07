import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { usersApi } from "../api/users.api";
import { friendsApi } from "../api/friends.api";
import { chatsApi } from "../api/chats.api";
import { API_BASE } from "../api/http";
import "./SearchResults.css";

function normalizeSearchResult(raw) {
  if (!raw) return null;
  const id = raw.id || raw._id;
  if (!id) return null;
  const username = String(raw.username || "").replace(/^@+/, "");
  if (!username) return null;
  const mutualFriendsCount = Number.isFinite(raw.mutualFriendsCount)
    ? raw.mutualFriendsCount
    : 0;
  return {
    _id: String(id),
    id: String(id),
    avatarUrl: raw.avatarUrl || "",
    displayName: raw.displayName || username,
    username,
    location: raw.location || "",
    mutualFriendsCount,
    friendStatus: raw.friendStatus || raw.relationship || "none",
  };
}

function resolveAvatarUrl(rawUrl) {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
  return `${API_BASE}${rawUrl}`;
}

function getActionState(userRow) {
  if (!userRow) return { label: "Add Friend", disabled: false, type: "add" };
  const status = String(userRow.friendStatus || "none");
  if (status === "friends") return { label: "Message", disabled: false, type: "message" };
  if (status === "pending_outgoing" || status === "pending_incoming") {
    return { label: "Pending", disabled: true, type: "pending" };
  }
  if (status === "blocked") return { label: "Pending", disabled: true, type: "blocked" };
  return { label: "Add Friend", disabled: false, type: "add" };
}

function formatMutualText(count) {
  if (!count) return "No mutual friends";
  if (count === 1) return "1 mutual friend";
  return `${count} mutual friends`;
}

function ResultSkeleton() {
  return (
    <div className="search-results-row border rounded-3 p-3 mb-2">
      <div className="d-flex align-items-center gap-3">
        <div className="placeholder-glow">
          <span className="placeholder rounded-circle search-results-avatar-placeholder" />
        </div>
        <div className="flex-grow-1 placeholder-glow">
          <div className="placeholder col-4 mb-2" />
          <div className="placeholder col-6 mb-2" />
          <div className="placeholder col-3" />
        </div>
        <div className="placeholder-glow">
          <span className="placeholder col-12 search-results-btn-placeholder" />
        </div>
      </div>
    </div>
  );
}

export default function SearchResults() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = useMemo(() => String(searchParams.get("query") || "").trim(), [searchParams]);
  const PAGE_LIMIT = 15;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [messagingUserId, setMessagingUserId] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const clampedPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    async function fetchResults() {
      if (!accessToken) return;
      if (!query) {
        setRows([]);
        setLoading(false);
        setError("");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const data = await usersApi.search(accessToken, query, clampedPage, PAGE_LIMIT);
        if (cancelled) return;
        const users = Array.isArray(data?.users) ? data.users : [];
        setRows(users.map((u) => normalizeSearchResult(u)).filter(Boolean));
        setTotal(Number.isFinite(data?.total) ? data.total : users.length);
      } catch (e) {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setError(e.message || "Failed to search users");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchResults();
    return () => {
      cancelled = true;
    };
  }, [accessToken, query, clampedPage]);

  const handleBack = (e) => {
    e.preventDefault();
    const idx = window.history?.state?.idx;
    if (typeof idx === "number" && idx > 0) {
      navigate(-1);
      return;
    }
    navigate("/app/friends", { replace: true });
  };

  const handleOpenProfile = (username) => {
    if (!username) return;
    navigate(`/app/profile/${encodeURIComponent(String(username).replace(/^@+/, ""))}`);
  };

  const handleAddFriend = async (e, userRow) => {
    e.stopPropagation();
    if (!userRow?._id || !accessToken) return;
    try {
      await friendsApi.request(accessToken, userRow._id);
      setRows((prev) =>
        prev.map((item) =>
          String(item._id) === String(userRow._id)
            ? { ...item, friendStatus: "pending_outgoing" }
            : item
        )
      );
    } catch (err) {
      setError(err.message || "Failed to send request");
    }
  };

  const handleMessage = async (e, userRow) => {
    e.stopPropagation();
    if (!userRow?._id || !accessToken) return;
    try {
      setMessagingUserId(String(userRow._id));
      const data = await chatsApi.createDirect(accessToken, userRow._id);
      const chatId = data?.chatId || data?.chat?._id || data?._id;
      if (!chatId) throw new Error("Failed to open chat");
      navigate(`/app/chats/${chatId}`);
    } catch (err) {
      setError(err.message || "Failed to open chat");
    } finally {
      setMessagingUserId("");
    }
  };

  return (
    <div className="container-fluid py-4 search-results-page">
      <div className="search-results-header mb-3">
        <h3 className="fw-bold mb-1">Search Results</h3>
        <div className="text-muted small">
          {query ? `Results for "${query}"` : "Search for users"}
        </div>
        <Link
          to="/app/friends"
          className="search-results-back-link d-inline-block mt-2"
          onClick={handleBack}
        >
          Back
        </Link>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {!query && <div className="text-muted">Type something to search users.</div>}

      {query && loading && (
        <div>
          <ResultSkeleton />
          <ResultSkeleton />
          <ResultSkeleton />
        </div>
      )}

      {query && !loading && rows.length === 0 && (
        <div className="text-muted">No users found for "{query}"</div>
      )}

      {query && !loading && rows.length > 0 && (
        <>
          <div className="search-results-list">
            {rows.map((userRow) => {
              const action = getActionState(userRow);
              const avatarUrl = resolveAvatarUrl(userRow.avatarUrl);
              return (
                <div
                  key={userRow._id}
                  className="search-results-row border rounded-3 p-3 mb-2"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenProfile(userRow.username)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleOpenProfile(userRow.username);
                    }
                  }}
                >
                  <div className="d-flex align-items-center justify-content-between gap-3">
                    <div className="d-flex align-items-center gap-3 min-w-0">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={userRow.displayName}
                          className="search-results-avatar"
                        />
                      ) : (
                        <div className="search-results-avatar search-results-avatar-fallback">
                          {String(userRow.displayName || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="fw-semibold text-truncate">{userRow.displayName}</div>
                        <div className="text-muted small text-truncate">
                          @{userRow.username}
                          {userRow.location ? `  •  Lives in ${userRow.location}` : ""}
                        </div>
                        <div className="text-muted small">
                          {formatMutualText(userRow.mutualFriendsCount)}
                        </div>
                      </div>
                    </div>

                    <div onClick={(e) => e.stopPropagation()}>
                      {action.type === "message" ? (
                        <button
                          type="button"
                          className="btn btn-dark btn-sm"
                          disabled={messagingUserId === String(userRow._id)}
                          onClick={(e) => handleMessage(e, userRow)}
                        >
                          {messagingUserId === String(userRow._id) ? "Opening..." : action.label}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline-dark btn-sm"
                          disabled={action.disabled}
                          onClick={(e) => handleAddFriend(e, userRow)}
                        >
                          {action.label}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="search-results-pagination d-flex align-items-center justify-content-center gap-2 mt-3">
              <button
                type="button"
                className="btn btn-outline-dark btn-sm"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={clampedPage === 1}
              >
                Prev
              </button>
              <span className="text-muted small">
                Page {clampedPage} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-outline-dark btn-sm"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={clampedPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
