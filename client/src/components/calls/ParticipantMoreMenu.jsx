import { useEffect } from "react";

export default function ParticipantMoreMenu({
  open,
  onClose,
  isMutedForMe,
  isVideoHiddenForMe,
  onToggleMuteForMe,
  onToggleHideVideoForMe,
  onViewProfile,
  showAdminActions = false,
  canForceMute = false,
  canRemoveFromCall = false,
  onForceMute,
  onRemoveFromCall,
}) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="call-more-menu" role="menu">
      <button
        type="button"
        className={`call-more-item ${isMutedForMe ? "is-active" : ""}`}
        role="menuitem"
        onClick={() => {
          onToggleMuteForMe();
          onClose();
        }}
      >
        {isMutedForMe ? "Unmute for me" : "Mute for me"}
        {isMutedForMe && <span className="call-more-check">v</span>}
      </button>
      <button
        type="button"
        className={`call-more-item ${isVideoHiddenForMe ? "is-active" : ""}`}
        role="menuitem"
        onClick={() => {
          onToggleHideVideoForMe();
          onClose();
        }}
      >
        {isVideoHiddenForMe ? "Show video" : "Hide video for me"}
        {isVideoHiddenForMe && <span className="call-more-check">v</span>}
      </button>
      <div className="call-more-divider" />
      <button
        type="button"
        className="call-more-item"
        role="menuitem"
        onClick={() => {
          onViewProfile();
          onClose();
        }}
      >
        View profile
      </button>
      {showAdminActions && (
        <>
          <div className="call-more-divider" />
          <button
            type="button"
            className="call-more-item"
            role="menuitem"
            onClick={() => {
              onForceMute?.();
              onClose();
            }}
            disabled={!canForceMute}
          >
            Mute participant
          </button>
          <button
            type="button"
            className="call-more-item"
            role="menuitem"
            onClick={() => {
              onRemoveFromCall?.();
              onClose();
            }}
            disabled={!canRemoveFromCall}
          >
            Remove from call
          </button>
        </>
      )}
    </div>
  );
}
