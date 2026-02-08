import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import NotificationsList from "../components/notifications/NotificationsList";
import { useAuth } from "../store/AuthContext";
import { useNotificationsDropdownData } from "../hooks/useNotificationsDropdownData";
import messengerIcon from "../assets/icons/sidebar-icons/messenger.png";
import "./Notifications.css";

const FILTERS = ["all", "unread", "requests", "hangouts", "messages"];

function normalizeDayStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getBucketLabel(ts) {
  const nowStart = normalizeDayStart(Date.now());
  const createdStart = normalizeDayStart(ts);
  const diffDays = Math.floor((nowStart - createdStart) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "Today";
  if (diffDays <= 7) return "This week";
  return "Earlier";
}

function matchesFilter(notification, filter) {
  if (filter === "all") return true;
  if (filter === "unread") return notification?.isRead === false;
  if (filter === "requests") {
    return (
      notification?.type === "friend_request" ||
      notification?.type === "hangout_join_request" ||
      notification?.type === "group_chat_add_request"
    );
  }
  if (filter === "hangouts") {
    return (
      notification?.type === "hangout_created" ||
      notification?.type === "hangout_joined" ||
      notification?.type === "hangout_join_request" ||
      notification?.type === "hangout_join_request_accepted" ||
      notification?.type === "hangout_starts_at_updated"
    );
  }
  if (filter === "messages") {
    return (
      notification?.type === "message_request" ||
      notification?.type === "message_request_accepted" ||
      notification?.type === "message_request_declined"
    );
  }
  return true;
}

export default function Notifications() {
  const nav = useNavigate();
  const { accessToken } = useAuth();
  const [activeFilter, setActiveFilter] = useState("all");
  const {
    sortedNotifications,
    notificationActionLoadingIds,
    handleNotificationRowClick,
    handleJoinGroupCallFromNotification,
    handleFriendRequestAction,
    handleHangoutJoinRequestAction,
    markAllRead,
    clearRead,
  } = useNotificationsDropdownData({
    accessToken,
    nav,
    joinGroupCall: null,
    limit: 500,
    enableBanner: false,
  });

  const filteredNotifications = useMemo(
    () => sortedNotifications.filter((n) => matchesFilter(n, activeFilter)),
    [activeFilter, sortedNotifications]
  );

  const grouped = useMemo(() => {
    const buckets = {
      Today: [],
      "This week": [],
      Earlier: [],
    };
    for (const item of filteredNotifications) {
      const ts = new Date(item.createdAt).getTime();
      const label = Number.isFinite(ts) ? getBucketLabel(ts) : "Earlier";
      buckets[label].push(item);
    }
    return buckets;
  }, [filteredNotifications]);

  const unreadCount = useMemo(
    () => sortedNotifications.filter((n) => n.isRead === false).length,
    [sortedNotifications]
  );

  const pendingActionsCount = useMemo(
    () =>
      sortedNotifications.filter((n) => {
        const friendPending =
          n.type === "friend_request" &&
          n?.meta?.friendRequestStatus !== "accepted" &&
          n?.meta?.friendRequestStatus !== "declined";
        const hangoutPending =
          n.type === "hangout_join_request" &&
          n?.meta?.hangoutJoinRequestStatus !== "accepted" &&
          n?.meta?.hangoutJoinRequestStatus !== "declined" &&
          n?.meta?.joinRequestStatus !== "accepted" &&
          n?.meta?.joinRequestStatus !== "declined";
        return friendPending || hangoutPending;
      }).length,
    [sortedNotifications]
  );

  return (
    <div className="notifications-page">
      <div className="notifications-topbar">
        <h3 className="notifications-title">Notifications</h3>
        <div className="notifications-topbar-actions">
          <button
            type="button"
            className="notifications-action-btn"
            onClick={markAllRead}
            disabled={sortedNotifications.length === 0}
          >
            Mark all as read
          </button>
          <button
            type="button"
            className="notifications-action-btn notifications-action-btn-secondary"
            onClick={clearRead}
            disabled={sortedNotifications.length === 0}
          >
            Clear read
          </button>
        </div>
      </div>

      <div className="notifications-filters" role="tablist" aria-label="Notification filters">
        {FILTERS.map((filterKey) => (
          <button
            key={filterKey}
            type="button"
            role="tab"
            aria-selected={activeFilter === filterKey}
            className={`notifications-filter-chip ${
              activeFilter === filterKey ? "is-active" : ""
            }`}
            onClick={() => setActiveFilter(filterKey)}
          >
            {filterKey === "all"
              ? "All"
              : filterKey === "unread"
                ? "Unread"
                : filterKey === "requests"
                  ? "Requests"
                  : filterKey === "hangouts"
                    ? "Hangouts"
                    : "Messages"}
          </button>
        ))}
      </div>

      <div className="notifications-layout">
        <section className="notifications-main" aria-label="Notification list">
          {filteredNotifications.length === 0 ? (
            <div className="notifications-empty">
              <img
                src={messengerIcon}
                alt=""
                aria-hidden="true"
                className="notifications-empty-icon"
              />
              <div className="notifications-empty-title">No updates yet</div>
              <div className="notifications-empty-subtext">
                Friend, hangout, and request updates will appear here.
              </div>
            </div>
          ) : (
            <div className="notifications-groups">
              {Object.entries(grouped).map(([label, items]) => {
                if (!items.length) return null;
                return (
                  <div key={label} className="notifications-group">
                    <div className="notifications-group-heading">{label}</div>
                    <NotificationsList
                      notifications={items}
                      notificationActionLoadingIds={notificationActionLoadingIds}
                      onRowClick={handleNotificationRowClick}
                      onFriendRequestAction={handleFriendRequestAction}
                      onHangoutJoinRequestAction={handleHangoutJoinRequestAction}
                      onJoinGroupCall={handleJoinGroupCallFromNotification}
                      emptyText=""
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="notifications-summary" aria-label="Notification summary">
          <div className="notifications-summary-card">
            <div className="notifications-summary-label">Unread</div>
            <div className="notifications-summary-value">{unreadCount}</div>
          </div>
          <div className="notifications-summary-card">
            <div className="notifications-summary-label">Pending actions</div>
            <div className="notifications-summary-value">{pendingActionsCount}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
