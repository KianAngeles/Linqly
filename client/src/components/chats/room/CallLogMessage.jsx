import acceptCallIcon from "../../../assets/icons/chat-panel-icons/accept-call.png";
import missCallIcon from "../../../assets/icons/chat-panel-icons/miss-call.png";
import "./CallLogMessage.css";

function formatDuration(durationSec) {
  const total = Math.max(0, Number(durationSec) || 0);
  if (total < 60) return `${total} secs`;
  const mins = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatTime(createdAt) {
  if (!createdAt) return "";
  const dt = new Date(createdAt);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function CallLogMessage({
  status,
  callType,
  durationSec,
  createdAt,
  onCallBack,
}) {
  const isMissed = status === "missed";
  const title = isMissed ? "Missed audio call" : "Audio call";
  const subtitle = isMissed ? formatTime(createdAt) : formatDuration(durationSec);
  const icon = isMissed ? missCallIcon : acceptCallIcon;

  return (
    <div className="call-log-bubble">
      <div className="call-log-head">
        <div className={`call-log-icon ${isMissed ? "is-missed" : "is-completed"}`}>
          <img src={icon} alt={isMissed ? "Missed call" : `${callType || "audio"} call`} />
        </div>
        <div className="call-log-info">
          <div className="call-log-title">{title}</div>
          <div className="call-log-subtitle">{subtitle}</div>
        </div>
      </div>
      <button
        type="button"
        className="call-log-callback-btn"
        onClick={onCallBack}
        disabled={!onCallBack}
      >
        Call back
      </button>
    </div>
  );
}
