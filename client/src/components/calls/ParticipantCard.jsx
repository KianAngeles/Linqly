import { useEffect, useMemo, useRef, useState } from "react";
import micIcon from "../../assets/icons/call-window-icons/mic.png";
import videoIcon from "../../assets/icons/call-window-icons/video.png";
import ParticipantMoreMenu from "./ParticipantMoreMenu";

export default function ParticipantCard({
  userId,
  name,
  role,
  avatarUrl,
  isMuted,
  isVideoOff,
  isMutedForMe,
  isVideoHiddenForMe,
  onToggleMuteForMe,
  onToggleHideVideoForMe,
  onViewProfile,
  isSpeaking,
  isLocal,
  media,
  auxMedia,
  showAdminActions = false,
  canForceMute = false,
  canRemoveFromCall = false,
  onForceMuteParticipant,
  onRemoveParticipant,
}) {
  const initial = useMemo(() => {
    const trimmed = String(name || "").trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
  }, [name]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointer = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      if (buttonRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    };

    const handleKey = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const id = requestAnimationFrame(() => {
      const rect = menuRef.current?.getBoundingClientRect();
      if (!rect) return;
      const overflowRight = rect.right > window.innerWidth - 12;
      setAlignLeft(overflowRight);
    });
    return () => cancelAnimationFrame(id);
  }, [menuOpen]);

  const showVideo = !isVideoHiddenForMe;
  const showOverlay = isVideoOff || isVideoHiddenForMe;

  return (
    <div className={`call-card ${isSpeaking ? "is-speaking" : ""}`}>
      <div className="call-card-top">
        <div className="call-card-indicators">
          <div className={`call-indicator ${isMuted ? "is-off" : ""}`} aria-label="Microphone">
            <img src={micIcon} alt="" />
          </div>
          <div className={`call-indicator ${isVideoOff ? "is-off" : ""}`} aria-label="Camera">
            <img src={videoIcon} alt="" />
          </div>
          {isMutedForMe && <div className="call-indicator-badge">Muted</div>}
          {isVideoHiddenForMe && <div className="call-indicator-badge">Hidden</div>}
        </div>
        {!isLocal && (
          <>
            <button
              ref={buttonRef}
              type="button"
              className="call-card-more"
              aria-label="More options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <span />
              <span />
              <span />
            </button>
            <div
              ref={menuRef}
              className={`call-card-menu ${alignLeft ? "align-left" : "align-right"} ${
                menuOpen ? "is-open" : ""
              }`}
            >
              <ParticipantMoreMenu
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
                isMutedForMe={isMutedForMe}
                isVideoHiddenForMe={isVideoHiddenForMe}
                onToggleMuteForMe={() => onToggleMuteForMe(userId)}
                onToggleHideVideoForMe={() => onToggleHideVideoForMe(userId)}
                onViewProfile={() => onViewProfile(userId)}
                showAdminActions={showAdminActions}
                canForceMute={canForceMute}
                canRemoveFromCall={canRemoveFromCall}
                onForceMute={() => onForceMuteParticipant?.(userId)}
                onRemoveFromCall={() => onRemoveParticipant?.(userId)}
              />
            </div>
          </>
        )}
      </div>

      <div className="call-card-media">
        {showVideo && media}
        {auxMedia}
        {showOverlay && (
          <div className="call-card-video-off">
            <div className="call-card-avatar call-card-avatar-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt={`${name} avatar`} />
              ) : (
                <div className="call-card-avatar-fallback">{initial}</div>
              )}
            </div>
            <div className="call-card-off-name">{name}</div>
            <div className="call-card-off-role">{role}</div>
          </div>
        )}
      </div>

      {!isVideoOff && (
        <div className="call-card-footer">
          <div className="call-card-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt={`${name} avatar`} />
            ) : (
              <div className="call-card-avatar-fallback">{initial}</div>
            )}
          </div>
          <div className="call-card-info">
            <div className="call-card-name">{name}</div>
            <div className="call-card-role">{role}</div>
          </div>
        </div>
      )}
    </div>
  );
}
