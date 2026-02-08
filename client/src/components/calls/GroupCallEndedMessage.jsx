import callEndedIcon from "../../assets/icons/chat-panel-icons/accept-call.png";
import "./groupCallMessages.css";

function formatDuration(durationSec) {
  const total = Math.max(0, Number(durationSec) || 0);
  const mins = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, "0");
  return `${mins}m ${secs}s`;
}

function formatTime(value) {
  if (!value) return "";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function GroupCallEndedMessage({
  endedByName,
  endedAt,
  durationSec = 0,
}) {
  return (
    <div className="group-call-log-bubble">
      <div className="group-call-log-head">
        <div className="group-call-log-icon">
          <img src={callEndedIcon} alt="Call ended" />
        </div>
        <div>
          <div className="group-call-log-title">Call ended</div>
          <div className="group-call-log-subline">Ended by {endedByName || "Unknown"}</div>
          <div className="group-call-log-subline">{formatTime(endedAt)}</div>
          {durationSec > 0 && (
            <div className="group-call-log-subline">{formatDuration(durationSec)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
