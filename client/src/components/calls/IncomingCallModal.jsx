import { useEffect, useRef } from "react";
import { useCall } from "../../store/CallContext";
import { GROUP_CALLS_ENABLED } from "../../constants/featureFlags";
import "./IncomingCallModal.css";

export default function IncomingCallModal() {
  const { incomingCall, acceptCall, declineCall } = useCall();
  const audioRef = useRef(null);

  useEffect(() => {
    if (!incomingCall) return;
    const audio = new Audio("/sounds/ringtone.mp3");
    audio.loop = true;
    audio.volume = 0.6;
    audioRef.current = audio;
    const tryPlay = () => {
      if (!audioRef.current) return;
      audioRef.current.play().catch(() => {});
    };
    tryPlay();

    const unlock = () => {
      tryPlay();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
    };
  }, [incomingCall]);

  if (!incomingCall) return null;
  if (incomingCall.scope === "group" && !GROUP_CALLS_ENABLED) return null;

  const initial =
    incomingCall.peerName?.trim().charAt(0).toUpperCase() || "?";
  const isGroupCall = incomingCall.scope === "group";
  const callText = isGroupCall
    ? `${incomingCall.peerName} started a group call`
    : `${incomingCall.peerName} is calling you`;

  return (
    <div className="incoming-call-backdrop">
      <div className="incoming-call-modal">
        <div className="incoming-call-avatar">
          {incomingCall.peerAvatar ? (
            <img
              src={incomingCall.peerAvatar}
              alt={`${incomingCall.peerName} avatar`}
            />
          ) : (
            <div className="incoming-call-avatar-fallback">{initial}</div>
          )}
        </div>
        <div className="incoming-call-text">
          {callText}
        </div>
        <div className="incoming-call-actions">
          <button
            type="button"
            className="incoming-call-btn accept"
            onClick={acceptCall}
          >
            Accept
          </button>
          <button
            type="button"
            className="incoming-call-btn decline"
            onClick={declineCall}
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
