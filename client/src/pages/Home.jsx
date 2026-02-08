import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { chatsApi } from "../api/chats.api";
import { hangoutsApi } from "../api/hangouts.api";
import { friendsApi } from "../api/friends.api";
import { socket } from "../socket";
import "./Home.css";
import friendsIcon from "../assets/icons/sidebar-icons/friends.png";
import mapIcon from "../assets/icons/sidebar-icons/map.png";
import messengerIcon from "../assets/icons/sidebar-icons/messenger.png";


export default function Home() {
  const { user, accessToken } = useAuth();
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const [chats, setChats] = useState([]);
  const [chatError, setChatError] = useState("");
  const [hangouts, setHangouts] = useState([]);
  const [hangoutsLoading, setHangoutsLoading] = useState(false);
  const [hangoutsError, setHangoutsError] = useState("");
  const [coords, setCoords] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationReady, setLocationReady] = useState(false);
  const [presence, setPresence] = useState({ onlineFriends: 0, totalFriends: 0 });
  const nearbyRadiusKm = 5;

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

  const formatDateTime = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  };

  const toHaversineMeters = (a, b) => {
    if (!a || !b) return null;
    const toRad = (n) => (n * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  const formatDistance = (meters) => {
    const numeric = Number(meters);
    if (!Number.isFinite(numeric)) return "";
    return `${(numeric / 1000).toFixed(1)} km`;
  };

  const getHangoutDistanceText = (hangout) => {
    const metersFromApi = Number(hangout?.distanceMeters);
    if (Number.isFinite(metersFromApi)) return formatDistance(metersFromApi);
    const coordsPair = hangout?.location?.coordinates;
    if (!coords || !Array.isArray(coordsPair) || coordsPair.length < 2) return "Nearby";
    const meters = toHaversineMeters(
      { lng: coords.lng, lat: coords.lat },
      { lng: Number(coordsPair[0]), lat: Number(coordsPair[1]) }
    );
    if (!Number.isFinite(meters)) return "Nearby";
    return formatDistance(meters);
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return "";
    const createdAt = new Date(timestamp).getTime();
    if (Number.isNaN(createdAt)) return "";
    const diffMs = Math.max(0, Date.now() - createdAt);
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;
    const weekMs = 7 * dayMs;
    const monthMs = 30 * dayMs;
    const yearMs = 365 * dayMs;

    if (diffMs < hourMs) {
      const mins = Math.max(1, Math.floor(diffMs / (60 * 1000)));
      return `${mins}m`;
    }
    if (diffMs < dayMs) {
      const hours = Math.max(1, Math.floor(diffMs / hourMs));
      return `${hours}h`;
    }
    if (diffMs < weekMs) {
      const days = Math.max(1, Math.floor(diffMs / dayMs));
      return `${days}d`;
    }
    if (diffMs < monthMs) {
      const weeks = Math.max(1, Math.floor(diffMs / weekMs));
      return `${weeks}w`;
    }
    if (diffMs < yearMs) {
      const months = Math.max(1, Math.floor(diffMs / monthMs));
      return `${months}m`;
    }
    const years = Math.max(1, Math.floor(diffMs / yearMs));
    return `${years}y`;
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

  const getHangoutCreatorAvatar = (hangout) => {
    const avatarUrl = hangout?.creator?.avatarUrl || "";
    if (!avatarUrl) return "";
    return avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")
      ? avatarUrl
      : `${API_BASE}${avatarUrl}`;
  };

  const getHangoutCreatorName = (hangout) =>
    hangout?.creator?.displayName || hangout?.creator?.username || "Unknown";

  const getHangoutMapLink = (hangout) => {
    const id = String(hangout?._id || "");
    if (!id) return "/app/map";
    return `/app/map?hangoutId=${encodeURIComponent(id)}`;
  };

  const formatHangoutTitle = (value) => {
    const title = String(value || "Untitled");
    if (title.length <= 27) return title;
    return `${title.slice(0, 27)}....`;
  };

  const getHangoutJoinedCount = (hangout) => {
    if (Number.isFinite(Number(hangout?.joinedCount))) {
      return Number(hangout.joinedCount);
    }
    if (Number.isFinite(Number(hangout?.attendeeCount))) {
      return Number(hangout.attendeeCount);
    }
    if (Array.isArray(hangout?.attendees)) {
      return hangout.attendees.length;
    }
    return 0;
  };

  const isHangoutOngoing = (hangout) => {
    if (hangout?.ongoing === true) return true;
    if (String(hangout?.status || "").toLowerCase() === "ongoing") return true;
    const startsAt = hangout?.startsAt ? new Date(hangout.startsAt).getTime() : NaN;
    const endsAt = hangout?.endsAt ? new Date(hangout.endsAt).getTime() : NaN;
    const now = Date.now();
    if (!Number.isNaN(startsAt) && !Number.isNaN(endsAt)) {
      return now >= startsAt && now <= endsAt;
    }
    return false;
  };

  const truncateText = (value, maxLength = 52) => {
    const text = String(value || "");
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  };

  const toTimeValue = (value) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  };

  const conversationActivity = chats
    .map((chat, index) => {
      const title = getChatTitle(chat);
      const secondary = truncateText(chat.lastMessageText || "New activity in this chat");
      const timestamp = chat.lastMessageAt || chat.updatedAt || null;
      return {
        id: String(chat?._id || `chat-${index}`),
        primary: title,
        secondary,
        timestamp,
        avatarUrl: getChatAvatar(chat),
      };
    })
    .sort((a, b) => toTimeValue(b.timestamp) - toTimeValue(a.timestamp))
    .slice(0, 8);

  const peoplePlacesActivity = [
    ...(presence.totalFriends > 0 || presence.onlineFriends > 0
      ? [
          {
            id: "friends-presence",
            type: "friends",
            primary: `${presence.onlineFriends} friends online`,
            secondary: `of ${presence.totalFriends} total friends`,
            timestamp: new Date().toISOString(),
          },
        ]
      : []),
    ...hangouts.map((hangout, index) => {
      const creatorName = getHangoutCreatorName(hangout);
      const isLive = isHangoutOngoing(hangout);
      return {
        id: String(hangout?._id || `hangout-${index}`),
        type: "hangout",
        primary: `${creatorName} ${isLive ? "is hosting" : "scheduled"} ${truncateText(hangout?.title || "a hangout", 30)}`,
        secondary: isLive
          ? `${getHangoutDistanceText(hangout)} away • ${getHangoutJoinedCount(hangout)} joined`
          : `Starts ${hangout.timeLabel || formatDateTime(hangout.startsAt) || "soon"}`,
        timestamp: hangout.startsAt || hangout.createdAt || null,
        avatarUrl: getHangoutCreatorAvatar(hangout),
      };
    }),
  ]
    .sort((a, b) => toTimeValue(b.timestamp) - toTimeValue(a.timestamp))
    .slice(0, 8);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationReady(false);
      setLocationLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lng: pos.coords.longitude, lat: pos.coords.latitude });
        setLocationReady(true);
        setLocationLoading(false);
      },
      () => {
        setLocationReady(false);
        setLocationLoading(false);
      }
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
          {(locationLoading || hangoutsLoading) && (
            <div className="home-muted">Loading hangouts...</div>
          )}
          {(locationLoading || hangoutsLoading) && (
            <div className="home-hangout-skeleton-list" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="home-hangout-skeleton-item" />
              ))}
            </div>
          )}
          {!hangoutsLoading && hangouts.length === 0 && (
            <div className="home-muted">
              {locationReady
                ? "No active hangouts nearby yet."
                : "Share your location to see hangouts near you."}
            </div>
          )}
          {hangoutsError && <div className="home-error">{hangoutsError}</div>}
          <div className="home-list">
            {hangouts.slice(0, 5).map((h) => (
              <div key={h._id} className="home-list-item">
                {getHangoutCreatorAvatar(h) ? (
                  <img
                    src={getHangoutCreatorAvatar(h)}
                    alt={getHangoutCreatorName(h)}
                    className="home-hangout-avatar-image"
                  />
                ) : (
                  <div className="home-hangout-avatar-fallback">
                    {getInitial(getHangoutCreatorName(h))}
                  </div>
                )}
                <div className="home-list-content">
                  <div className="home-hangout-title">
                    {formatHangoutTitle(h.title || "Untitled")}
                  </div>
                  <div className="home-hangout-hosted-by">
                    Hosted by {getHangoutCreatorName(h)}
                  </div>
                  <div className="home-hangout-meta">
                    <span>📍 {getHangoutDistanceText(h)}</span>
                    <span>•</span>
                    <span>👥 {getHangoutJoinedCount(h)} joined</span>
                    {isHangoutOngoing(h) ? (
                      <>
                        <span>•</span>
                        <span className="home-hangout-status home-hangout-status-ongoing">
                          <span className="home-hangout-status-dot" />
                          Ongoing
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="home-hangout-time">
                    {isHangoutOngoing(h)
                      ? h.timeLabel || formatDateTime(h.startsAt) || "Time TBD"
                      : `Scheduled: ${h.timeLabel || formatDateTime(h.startsAt) || "Time TBD"}`}
                  </div>
                  <Link to={getHangoutMapLink(h)} className="home-join-btn">
                    {isHangoutOngoing(h) ? "Join now" : "Join"}
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
                <div className="home-chat-avatar-wrap">
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
                  {c.type === "direct" && c.otherUser?.isOnline ? (
                    <span className="home-chat-online-dot" />
                  ) : null}
                </div>
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
          <div className="home-activity-columns">
            <div className="home-activity-column">
              <div className="home-activity-column-title">Conversations</div>
              {conversationActivity.length === 0 ? (
                <div className="home-activity-empty">
                  <img
                    src={messengerIcon}
                    alt=""
                    aria-hidden="true"
                    className="home-activity-empty-icon"
                  />
                  <div className="home-activity-empty-title">No conversation activity yet</div>
                  <div className="home-activity-empty-subtext">
                    Messages from your chats will appear here.
                  </div>
                </div>
              ) : (
                <div className="home-activity-list-modern">
                  {conversationActivity.map((item) => (
                    <div key={item.id} className="home-activity-row">
                      <div className="home-activity-avatar-wrap">
                        {item.avatarUrl ? (
                          <img
                            src={item.avatarUrl}
                            alt={item.primary}
                            className="home-activity-avatar"
                          />
                        ) : (
                          <div className="home-activity-avatar-fallback">
                            {getInitial(item.primary)}
                          </div>
                        )}
                      </div>
                      <div className="home-activity-content">
                        <div className="home-activity-top">
                          <div className="home-activity-primary">{item.primary}</div>
                          <div className="home-activity-time">
                            {formatTimeAgo(item.timestamp) || "--"}
                          </div>
                        </div>
                        <div className="home-activity-secondary">{item.secondary}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="home-activity-column">
              <div className="home-activity-column-title">People & Places</div>
              {peoplePlacesActivity.length === 0 ? (
                <div className="home-activity-empty">
                  <div className="home-activity-empty-icon-combo" aria-hidden="true">
                    <img
                      src={friendsIcon}
                      alt=""
                      className="home-activity-empty-icon home-activity-empty-icon-small"
                    />
                    <img
                      src={mapIcon}
                      alt=""
                      className="home-activity-empty-icon home-activity-empty-icon-small"
                    />
                  </div>
                  <div className="home-activity-empty-title">No people or hangout activity yet</div>
                  <div className="home-activity-empty-subtext">
                    Friend, hangout, and call updates will appear here.
                  </div>
                </div>
              ) : (
                <div className="home-activity-list-modern">
                  {peoplePlacesActivity.map((item) => (
                    <div key={item.id} className="home-activity-row">
                      <div className="home-activity-avatar-wrap">
                        {item.avatarUrl ? (
                          <img
                            src={item.avatarUrl}
                            alt={item.primary}
                            className="home-activity-avatar"
                          />
                        ) : (
                          <div className="home-activity-avatar-fallback home-activity-avatar-fallback-icon">
                            <img
                              src={item.type === "hangout" ? mapIcon : friendsIcon}
                              alt=""
                              aria-hidden="true"
                              className="home-activity-row-icon"
                            />
                          </div>
                        )}
                      </div>
                      <div className="home-activity-content">
                        <div className="home-activity-top">
                          <div className="home-activity-primary">{item.primary}</div>
                          <div className="home-activity-time">
                            {formatTimeAgo(item.timestamp) || "now"}
                          </div>
                        </div>
                        <div className="home-activity-secondary">{item.secondary}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="home-card home-presence-card">
          <div className="home-card-header">
            <h3>Presence Awareness</h3>
          </div>
          <div className="home-presence-modern">
            <Link to="/app/friends" className="home-presence-row">
              <div className="home-presence-icon-wrap">
                <img src={friendsIcon} alt="" aria-hidden="true" className="home-presence-icon" />
              </div>
              <div className="home-presence-main">
                <div className="home-presence-headline">
                  <span className="home-presence-number">{presence.onlineFriends}</span>
                  <span className="home-presence-label">Friends online</span>
                </div>
                <div className="home-presence-subtext">
                  of {presence.totalFriends} total
                </div>
              </div>
              <span className="home-presence-chevron" aria-hidden="true">
                &gt;
              </span>
            </Link>

            <Link to="/app/map" className="home-presence-row">
              <div className="home-presence-icon-wrap">
                <img src={mapIcon} alt="" aria-hidden="true" className="home-presence-icon" />
              </div>
              <div className="home-presence-main">
                <div className="home-presence-headline">
                  <span className="home-presence-number">{hangouts.length}</span>
                  <span className="home-presence-label">Nearby hangouts</span>
                </div>
                <div className="home-presence-subtext">
                  Within {nearbyRadiusKm} km of you
                </div>
              </div>
              <span className="home-presence-chevron" aria-hidden="true">
                &gt;
              </span>
            </Link>

            <Link to="/app/chats" className="home-presence-row">
              <div className="home-presence-icon-wrap">
                <img
                  src={messengerIcon}
                  alt=""
                  aria-hidden="true"
                  className="home-presence-icon"
                />
              </div>
              <div className="home-presence-main">
                <div className="home-presence-headline">
                  <span className="home-presence-number">{chats.length}</span>
                  <span className="home-presence-label">Active chats</span>
                </div>
                <div className="home-presence-subtext">Across your circles</div>
              </div>
              <span className="home-presence-chevron" aria-hidden="true">
                &gt;
              </span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
