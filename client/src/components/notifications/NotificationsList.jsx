import { GROUP_CALLS_ENABLED } from "../../constants/featureFlags";
import {
  formatNotificationTime,
  getNotificationMessage,
  resolveAvatarUrl,
} from "../../hooks/useNotificationsDropdownData";

export default function NotificationsList({
  notifications = [],
  notificationActionLoadingIds = [],
  onRowClick,
  onFriendRequestAction,
  onHangoutJoinRequestAction,
  onJoinGroupCall,
  emptyText = "No notifications yet",
  className = "",
}) {
  if (!notifications.length) {
    return <div className="app-header-notifications-empty">{emptyText}</div>;
  }

  return (
    <div className={`app-header-notifications-list ${className}`.trim()}>
      {notifications.map((notification) => {
        const actorName =
          notification.actor?.displayName ||
          notification.actor?.username ||
          "User";
        const avatarUrl = resolveAvatarUrl(notification.actor?.avatarUrl || "");
        const message = getNotificationMessage(notification);
        const timestamp = formatNotificationTime(notification.createdAt);
        const requestStatus = notification?.meta?.friendRequestStatus;
        const hangoutRequestStatus =
          notification?.meta?.hangoutJoinRequestStatus ||
          notification?.meta?.joinRequestStatus;
        const showFriendRequestActions =
          notification.type === "friend_request" &&
          requestStatus !== "accepted" &&
          requestStatus !== "declined";
        const showHangoutJoinRequestActions =
          notification.type === "hangout_join_request" &&
          hangoutRequestStatus !== "accepted" &&
          hangoutRequestStatus !== "declined";
        const showGroupCallJoinAction =
          GROUP_CALLS_ENABLED && notification.type === "group_call_started";
        const actionLoading = notificationActionLoadingIds.includes(
          String(notification._id)
        );

        return (
          <div
            key={notification._id}
            role="button"
            tabIndex={0}
            className="app-header-notification-row"
            onClick={() => onRowClick?.(notification)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick?.(notification);
              }
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={actorName}
                className="app-header-notification-avatar"
              />
            ) : (
              <div className="app-header-notification-avatar app-header-notification-avatar-fallback">
                {String(actorName || "?").charAt(0).toUpperCase()}
              </div>
            )}

            <div className="app-header-notification-body">
              <div className="app-header-notification-name">{actorName}</div>
              <div className="app-header-notification-message">{message}</div>
              <div className="app-header-notification-time">{timestamp}</div>
              {showFriendRequestActions && (
                <div
                  className="app-header-notification-actions"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="btn btn-dark btn-sm app-header-notification-action-btn"
                    onClick={() =>
                      onFriendRequestAction?.(notification, "accept")
                    }
                    disabled={actionLoading}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm app-header-notification-action-btn"
                    onClick={() =>
                      onFriendRequestAction?.(notification, "decline")
                    }
                    disabled={actionLoading}
                  >
                    Decline
                  </button>
                </div>
              )}
              {showHangoutJoinRequestActions && (
                <div
                  className="app-header-notification-actions"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="btn btn-dark btn-sm app-header-notification-action-btn"
                    onClick={() =>
                      onHangoutJoinRequestAction?.(notification, "accept")
                    }
                    disabled={actionLoading}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm app-header-notification-action-btn"
                    onClick={() =>
                      onHangoutJoinRequestAction?.(notification, "decline")
                    }
                    disabled={actionLoading}
                  >
                    Decline
                  </button>
                </div>
              )}
              {showGroupCallJoinAction && (
                <div
                  className="app-header-notification-actions"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="btn btn-dark btn-sm app-header-notification-action-btn"
                    onClick={() => onJoinGroupCall?.(notification)}
                    disabled={actionLoading}
                  >
                    Join
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
