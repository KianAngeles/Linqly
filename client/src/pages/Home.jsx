import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { chatsApi } from "../api/chats.api";
import { hangoutsApi } from "../api/hangouts.api";
import { friendsApi } from "../api/friends.api";
import { socket } from "../socket";
import "./Home.css";


export default function Home() {
  const { user, accessToken } = useAuth();
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const [chats, setChats] = useState([]);
  const [chatError, setChatError] = useState("");
  const [hangouts, setHangouts] = useState([]);
  const [hangoutsLoading, setHangoutsLoading] = useState(false);
  const [hangoutsError, setHangoutsError] = useState("");
  const [coords, setCoords] = useState(null);
  const [presence, setPresence] = useState({ onlineFriends: 0, totalFriends: 0 });

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const getInitial = (value) => {
    if (!value) return "H";
    return value.trim().charAt(0).toUpperCase();
  };

  const formatDistance = (meters) => {
    if (typeof meters !== "number") return "";
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${meters} m`;
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return "";
    const diffMinutes = Math.max(
      1,
      Math.round((Date.now() - new Date(timestamp).getTime()) / 60000)
    );
    if (diffMinutes < 60) return `${diffMinutes}m`;
    const diffHours = Math.round(diffMinutes / 60);
    return `${diffHours}h`;
  };

  const getChatTitle = (chat) =>
    chat.displayName ||
    chat.name ||
    chat.otherUser?.username ||
    (chat.type ? `${chat.type} chat` : "Direct chat");

  const getChatAvatar = (chat) => {
    const avatarUrl =
      chat.type === "group" || chat.type === "hangout"
        ? chat.avatarUrl || ""
        : chat.otherUser?.avatarUrl || "";
    if (!avatarUrl) return "";
    return avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")
      ? avatarUrl
      : `${API_BASE}${avatarUrl}`;
  };

  const getChatLink = (chat) => {
    const id = chat?._id ? String(chat._id) : "";
    return id ? `/app/chats/${id}` : "/app/chats";
  };

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lng: pos.coords.longitude, lat: pos.coords.latitude });
      },
      () => {}
    );
  }, []);

  const loadChats = () => {
    if (!accessToken) return;
    chatsApi
      .list(accessToken)
      .then((data) => setChats(data.chats || []))
      .catch((err) => setChatError(err.message || "Failed to load chats"));
  };

  useEffect(() => {
    loadChats();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    const onNewMessage = () => {
      loadChats();
    };

    socket.on("message:new", onNewMessage);
    return () => socket.off("message:new", onNewMessage);
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !coords) return;
    setHangoutsLoading(true);
    hangoutsApi
      .feed(accessToken, { ...coords, radius: 5000 })
      .then((data) => setHangouts(data.hangouts || []))
      .catch((err) => setHangoutsError(err.message || "Failed to load hangouts"))
      .finally(() => setHangoutsLoading(false));
  }, [accessToken, coords]);

  useEffect(() => {
    if (!accessToken) return;
    friendsApi
      .presence(accessToken)
      .then((data) =>
        setPresence({
          onlineFriends: data.onlineFriends || 0,
          totalFriends: data.totalFriends || 0,
        })
      )
      .catch(() => {});
  }, [accessToken]);

  return (
    <div className="home-dashboard">

      <div className="home-hero">
        <div>
          <h2 className="home-greeting">
            {greeting}, {user?.username || "there"}
          </h2>
          <div className="home-subtext">
            Here is what is happening around you
          </div>
        </div>
      </div>

      <div className="home-grid">
        <section className="home-card home-hangouts">
          <div className="home-card-header">
            <h3>Active Hangouts Near Me</h3>
          </div>
          {hangoutsLoading && (
            <div className="home-muted">Loading hangouts...</div>
          )}
          {!hangoutsLoading && hangouts.length === 0 && (
            <div className="home-muted">
              {coords
                ? "No active hangouts nearby yet."
                : "Share your location to see hangouts near you."}
            </div>
          )}
          {hangoutsError && <div className="home-error">{hangoutsError}</div>}
          <div className="home-list">
            {hangouts.slice(0, 5).map((h) => (
              <div key={h._id} className="home-list-item">
                <div className="home-avatar">
                  {getInitial(h.title || h.creator?.username)}
                </div>
                <div className="home-list-content">
                  <div className="home-list-title">{h.title || "Untitled"}</div>
                  <div className="home-list-subtitle">
                    {h.creator?.username || "Unknown"}
                  </div>
                  <div className="home-list-meta">
                    <span>{formatDistance(h.distanceMeters) || "Nearby"}</span>
                    <span>{h.timeLabel || "Time TBD"}</span>
                  </div>
                  <Link to="/app/map" className="home-join-btn">
                    Join
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="home-card home-map-card home-map">
          <div className="home-card-header">
            <h3>Map Preview</h3>
            <span className="home-chip">Within 5km</span>
          </div>
          <div className="home-map-preview">
            <span className="home-map-pin home-map-pin-blue" />
            <span className="home-map-pin home-map-pin-blue home-map-pin-two" />
            <span className="home-map-pin home-map-pin-green" />
            <div className="home-map-overlay">Nearby hangouts</div>
          </div>
          <div className="home-map-footer">
            Preview only. Open the map to explore live pins.
          </div>
        </section>

        <section className="home-card home-chats">
          <div className="home-card-header">
            <h3>Recent Chats</h3>
          </div>
          {chatError && <div className="home-error">{chatError}</div>}
          {chats.length === 0 && (
            <div className="home-muted">No recent chats yet.</div>
          )}
          <div className="home-chat-list">
            {chats.slice(0, 6).map((c, index) => (
              <Link
                key={c._id || index}
                to={getChatLink(c)}
                className="home-chat"
              >
                {getChatAvatar(c) ? (
                  <img
                    src={getChatAvatar(c)}
                    alt={getChatTitle(c)}
                    className="home-avatar-image"
                  />
                ) : (
                  <div className="home-avatar home-avatar-muted">
                    {getInitial(getChatTitle(c))}
                  </div>
                )}
                <div className="home-chat-body">
                  <div className="home-chat-title">
                    {getChatTitle(c)}
                  </div>
                  <div className="home-chat-subtitle">
                    {(c.lastMessageText || "No messages yet").length > 20
                      ? `${(c.lastMessageText || "No messages yet").slice(0, 20)}...`
                      : c.lastMessageText || "No messages yet"}
                  </div>
                </div>
                <div className="home-chat-meta">
                  <div className="home-chat-time">
                    {formatTimeAgo(c.lastMessageAt || c.updatedAt) || "--"}
                  </div>
                  <span className="home-chat-badge">
                    {index === 0 ? "2" : index === 2 ? "1" : ""}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="home-card home-span-2 card-activity">
          <div className="home-card-header">
            <h3>Activity Feed</h3>
          </div>
          <div className="home-muted">No recent activity yet.</div>
        </section>

        <section className="home-card">
          <div className="home-card-header">
            <h3>Presence Awareness</h3>
          </div>
          <div className="home-presence">
            <div className="home-presence-item">
              <div className="home-presence-title">
                {presence.onlineFriends} friends online
              </div>
              <div className="home-presence-subtitle">
                {presence.totalFriends} total friends
              </div>
            </div>
            <div className="home-presence-item">
              <div className="home-presence-title">
                {hangouts.length} nearby hangouts
              </div>
              <div className="home-presence-subtitle">Within 5 km of you</div>
            </div>
            <div className="home-presence-item">
              <div className="home-presence-title">{chats.length} active chats</div>
              <div className="home-presence-subtitle">Messages across your circles</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
