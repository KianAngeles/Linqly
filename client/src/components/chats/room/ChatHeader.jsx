import { useRef } from "react";
import callIcon from "../../../assets/icons/call.png";

export default function ChatHeader({
  username,
  title = "Chat",
  avatarUrl,
  isMuted,
  showCallButton = false,
  disableCallButton = false,
  onCall,
}) {
  const lastCallRef = useRef(0);
  const handleCall = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastCallRef.current < 500) return;
    lastCallRef.current = now;
    onCall?.();
  };

  return (
    <div className="d-flex justify-content-between align-items-center mb-2 chat-header-row">
      <div className="fw-bold d-flex align-items-center gap-2">
        {avatarUrl && (
          <img src={avatarUrl} alt={`${title} avatar`} className="chat-header-avatar" />
        )}
        <span>{title}</span>
        {isMuted && <span className="badge text-bg-secondary">Muted</span>}
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
      </div>
    </div>
  );
}
