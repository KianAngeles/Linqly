import ongoingCallIcon from "../../assets/icons/chat-panel-icons/ongoing-call.png";
import "./groupCallMessages.css";

function formatTime(createdAt) {
  if (!createdAt) return "";
  const dt = new Date(createdAt);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatParticipantSummary(participantNames, participantCount) {
  const names = Array.isArray(participantNames)
    ? participantNames.filter(Boolean)
    : [];
  if (names.length === 0) return `${participantCount || 0} in call`;
  const firstTwo = names.slice(0, 2);
  const remaining = Math.max(0, (participantCount || names.length) - firstTwo.length);
  return remaining > 0
    ? `${firstTwo.join(", ")} +${remaining}`
    : `${firstTwo.join(", ")}`;
}

export default function GroupOngoingCallMessage({
  startedByName,
  participantCount = 0,
  participantNames = [],
  createdAt,
  onJoin,
  canJoin = true,
  isRinging = false,
}) {
  return (
    <div className="group-call-log-bubble">
      <div className="group-call-log-head">
        <div className="group-call-log-icon">
          <img src={ongoingCallIcon} alt="Ongoing call" />
        </div>
        <div>
          <div className="group-call-log-title">Ongoing Call</div>
          <div className="group-call-log-subline">started by {startedByName || "Unknown"}</div>
          <div className="group-call-log-subline">{participantCount || 0} in call</div>
          <div className="group-call-log-subline">
            {formatParticipantSummary(participantNames, participantCount)}
          </div>
          {isRinging && <div className="group-call-log-subline">Ringing...</div>}
          {!!createdAt && <div className="group-call-log-subline">{formatTime(createdAt)}</div>}
        </div>
      </div>
      <button
        type="button"
        className="group-call-log-join-btn"
        onClick={onJoin}
        disabled={!canJoin || !onJoin}
      >
        Join
      </button>
    </div>
  );
}
