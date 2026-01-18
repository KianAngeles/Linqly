import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import Friends from "./Friends";
import ChatsPanel from "./ChatsPanel";

export default function AppShell() {
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("chats"); // default

  async function handleLogout() {
    await logout();
    nav("/", { replace: true });
  }

  return (
    <div className="container py-4" style={{ maxWidth: 1100 }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <div className="fw-bold">Linqly</div>
          <div className="text-muted small">Welcome, {user?.username}</div>
        </div>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => nav("/app/settings")}
          >
            Settings
          </button>
          <button type="button" className="btn btn-outline-danger" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="d-flex gap-2 mb-3">
        <button
          className={`btn ${tab === "chats" ? "btn-primary" : "btn-outline-primary"}`}
          onClick={() => setTab("chats")}
        >
          Chats
        </button>
        <button
          className={`btn ${tab === "friends" ? "btn-primary" : "btn-outline-primary"}`}
          onClick={() => setTab("friends")}
        >
          Friends
        </button>
        <button
          className="btn btn-outline-primary"
          onClick={() => nav("/app/hangouts")}
        >
          Hangouts
        </button>
      </div>

      {tab === "chats" ? <ChatsPanel /> : <Friends />}
    </div>
  );
}
