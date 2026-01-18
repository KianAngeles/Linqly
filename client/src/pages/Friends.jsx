import { useEffect, useState } from "react";
import { useAuth } from "../store/AuthContext";
import { friendsApi } from "../api/friends.api";
import { usersApi } from "../api/users.api";
import { socket } from "../socket";

function SearchAction({ u, onAdd }) {
  if (u.relationship === "friends")
    return <span className="badge bg-success">Friends</span>;

  if (u.relationship === "pending_outgoing")
    return <span className="badge bg-secondary">Request sent</span>;

  if (u.relationship === "pending_incoming")
    return <span className="badge bg-warning text-dark">Requested you</span>;

  if (u.relationship === "blocked")
    return <span className="badge bg-dark">Blocked</span>;

  return (
    <button
      type="button"
      className="btn btn-outline-primary btn-sm"
      onClick={() => onAdd(u.id)}
    >
      Add
    </button>
  );
}

export default function Friends() {
  const { accessToken } = useAuth();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const [friends, setFriends] = useState([]);
  const [pendingIncoming, setPendingIncoming] = useState([]);
  const [pendingOutgoing, setPendingOutgoing] = useState([]);

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

  useEffect(() => {
    if (!accessToken) return;

    const refresh = async () => {
      await loadList();
      if (query.trim()) {
        const data = await usersApi.search(accessToken, query);
        setSearchResults(data.users);
      }
    };

    socket.on("friends:request", refresh);
    socket.on("friends:accepted", refresh);

    return () => {
      socket.off("friends:request", refresh);
      socket.off("friends:accepted", refresh);
    };
  }, [accessToken, query]);

  async function onSearch(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await usersApi.search(accessToken, query);
      setSearchResults(data.users);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function sendRequest(userId) {
    setErr("");
    try {
      await friendsApi.request(accessToken, userId);
      await loadList();
      // refresh search results so badges update
      if (query.trim()) {
        const data = await usersApi.search(accessToken, query);
        setSearchResults(data.users);
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
    } catch (e) {
      setErr(e.message);
    }
  }

  async function reject(userId) {
    setErr("");
    try {
      await friendsApi.reject(accessToken, userId);
      await loadList();
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
        const data = await usersApi.search(accessToken, query);
        setSearchResults(data.users);
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
        const data = await usersApi.search(accessToken, query);
        setSearchResults(data.users);
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <h3 className="fw-bold mb-3">Friends</h3>
      {err && <div className="alert alert-danger">{err}</div>}

      {/* Search */}
      <form className="d-flex gap-2 mb-4" onSubmit={onSearch}>
        <input
          className="form-control"
          placeholder="Search username or email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn-primary" type="submit">
          Search
        </button>
      </form>

      {searchResults.length > 0 && (
        <div className="mb-4">
          <h5 className="fw-bold">Search results</h5>
          <div className="list-group">
            {searchResults.map((u) => (
              <div
                key={u.id}
                className="list-group-item d-flex justify-content-between align-items-center"
              >
                <div>
                  <div className="fw-semibold">{u.username}</div>
                  <div className="text-muted small">{u.email}</div>
                </div>

                <SearchAction u={u} onAdd={sendRequest} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Incoming */}
      <div className="mb-4">
        <h5 className="fw-bold">Requests (incoming)</h5>
        {pendingIncoming.length === 0 ? (
          <div className="text-muted">No incoming requests.</div>
        ) : (
          <div className="list-group">
            {pendingIncoming.map((x) => (
              <div
                key={x.friendshipId}
                className="list-group-item d-flex justify-content-between align-items-center"
              >
                <div>
                  <div className="fw-semibold">{x.user.username}</div>
                  <div className="text-muted small">{x.user.email}</div>
                </div>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    onClick={() => accept(x.user.id)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => reject(x.user.id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Friends */}
      <div className="mb-4">
        <h5 className="fw-bold">Your friends</h5>
        {friends.length === 0 ? (
          <div className="text-muted">No friends yet.</div>
        ) : (
          <div className="list-group">
            {friends.map((x) => (
              <div
                key={x.friendshipId}
                className="list-group-item d-flex justify-content-between align-items-center"
              >
                <div>
                  <div className="fw-semibold">{x.user.username}</div>
                  <div className="text-muted small">{x.user.email}</div>
                </div>

                <div className="d-flex gap-2">
                  <span className="badge bg-success align-self-center">
                    Friends
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => removeFriend(x.user.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Outgoing */}
      <div className="mb-4">
        <h5 className="fw-bold">Requests (sent)</h5>
        {pendingOutgoing.length === 0 ? (
          <div className="text-muted">No outgoing requests.</div>
        ) : (
          <div className="list-group">
            {pendingOutgoing.map((x) => (
              <div
                key={x.friendshipId}
                className="list-group-item d-flex justify-content-between align-items-center"
              >
                <div>
                  <div className="fw-semibold">{x.user.username}</div>
                  <div className="text-muted small">{x.user.email}</div>
                </div>

                <div className="d-flex gap-2">
                  <span className="badge bg-secondary align-self-center">
                    Pending
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={() => cancel(x.user.id)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
