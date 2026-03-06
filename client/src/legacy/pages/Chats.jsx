import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { chatsApi } from "../api/chats.api";

export default function Chats() {
  const { accessToken } = useAuth();
  const nav = useNavigate();

  const [userId, setUserId] = useState("");
  const [chats, setChats] = useState([]);
  const [err, setErr] = useState("");

  async function load() {
    const data = await chatsApi.list(accessToken);
    setChats(data.chats);
  }

  useEffect(() => {
    if (!accessToken) return;
    load().catch((e) => setErr(e.message));
  }, [accessToken]);

  async function createDirect(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await chatsApi.createDirect(accessToken, userId.trim());
      setUserId("");
      await load();
      nav(`/app/chats/${data.chatId}`);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <h3 className="fw-bold mb-3">Chats</h3>
      {err && <div className="alert alert-danger">{err}</div>}

      <form className="d-flex gap-2 mb-4" onSubmit={createDirect}>
        <input
          className="form-control"
          placeholder="Start direct chat: paste userId here"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <button className="btn btn-primary" type="submit">
          Create / Open
        </button>
      </form>

      <div className="list-group">
        {chats.map((c) => (
          <button
            key={c._id}
            className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            onClick={() => nav(`/app/chats/${c._id}`)}
          >
            <div>
              <div className="fw-semibold">{c.type} chat</div>
              <div className="text-muted small">
                {c.lastMessageText || "No messages yet"}
              </div>
            </div>
            <span className="badge bg-secondary">{c.members.length}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
