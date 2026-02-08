import micIcon from "../../assets/icons/call-window-icons/mic.png";
import videoIcon from "../../assets/icons/call-window-icons/video.png";
import callEndIcon from "../../assets/icons/call-window-icons/callend.png";

export default function CallControls({
  isMuted,
  isVideoOff,
  onToggleMute,
  onToggleVideo,
  onEndCall,
  disabled,
}) {
  return (
    <div className="call-controls">
      <button
        type="button"
        className={`call-control-btn ${isMuted ? "is-off" : ""}`}
        onClick={onToggleMute}
        disabled={disabled}
        aria-pressed={isMuted}
        aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
      >
        <img src={micIcon} alt="" />
      </button>
      <button
        type="button"
        className={`call-control-btn ${isVideoOff ? "is-off" : ""}`}
        onClick={onToggleVideo}
        disabled={disabled}
        aria-pressed={isVideoOff}
        aria-label={isVideoOff ? "Enable camera" : "Disable camera"}
      >
        <img src={videoIcon} alt="" />
      </button>
      <button
        type="button"
        className="call-control-end"
        onClick={onEndCall}
        aria-label="End call"
      >
        <img src={callEndIcon} alt="" />
      </button>
    </div>
  );
}
