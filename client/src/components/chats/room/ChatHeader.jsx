import { useRef } from "react";
import callIcon from "../../../assets/icons/call.png";
import muteIcon from "../../../assets/icons/mute.png";

export default function ChatHeader({
  username,
  title = "Chat",
  avatarUrl,
  isOnline,
  isMuted,
  showBackButton = false,
  onBack,
  showCallButton = false,
  disableCallButton = false,
  onCall,
  showSettingsToggle = false,
  isSettingsVisible = true,
  onToggleSettings,
  moreIcon,
  groupCallBanner = null,
}) {
  const lastCallRef = useRef(0);
  const avatarInitial = String(title || username || "?").trim().charAt(0).toUpperCase();
  const handleCall = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastCallRef.current < 500) return;
    lastCallRef.current = now;
    onCall?.();
  };

  return (
    <div className="chat-header-wrap">
      <div className="d-flex justify-content-between align-items-center mb-2 chat-header-row">
        <div className="fw-bold d-flex align-items-center gap-2">
          {showBackButton && (
            <button
              type="button"
              className="chat-header-back-btn"
              onClick={onBack}
              aria-label="Back to chats"
              title="Back to chats"
            >
              <span aria-hidden="true">&lt;</span>
            </button>
          )}
          <div className="chat-header-avatar-wrap">
            {avatarUrl ? (
              <img src={avatarUrl} alt={`${title} avatar`} className="chat-header-avatar" />
            ) : (
              <div
                className="chat-header-avatar chat-header-avatar-fallback"
                aria-label={`${title} avatar placeholder`}
              >
                {avatarInitial}
              </div>
            )}
            {isOnline && <span className="chat-list-online-dot" />}
          </div>
          <span>{title}</span>
          {isMuted && (
            <img
              src={muteIcon}
              alt="Muted"
              className="chat-header-muted-icon"
              width={16}
              height={16}
            />
          )}
        </div>
        <div className="d-flex align-items-center gap-2">
          {showCallButton && (
            <button
              type="button"
              className="chat-header-call-btn"
              onPointerDown={handleCall}
              onClick={handleCall}
              disabled={disableCallButton}
              title="Start call"
            >
              <img src={callIcon} alt="Start call" />
            </button>
          )}
          <div className="text-muted small">You: {username}</div>
          {showSettingsToggle && (
            <button
              type="button"
              className="chat-header-settings-btn"
              onClick={onToggleSettings}
              aria-label={
                isSettingsVisible ? "Hide chat settings" : "Show chat settings"
              }
              title={isSettingsVisible ? "Hide chat settings" : "Show chat settings"}
            >
              {moreIcon ? (
                <img src={moreIcon} alt="" aria-hidden="true" />
              ) : (
                <span aria-hidden="true">...</span>
              )}
            </button>
          )}
        </div>
      </div>
      {groupCallBanner}
    </div>
  );
}
