import "./groupCallMessages.css";

export default function GroupCallHeaderBanner({
  startedByName,
  participantCount = 0,
  onJoin,
  canJoin = true,
}) {
  return (
    <div className="group-call-header-banner">
      <div className="group-call-header-banner-text">
        Ongoing call - started by {startedByName || "Unknown"} - {participantCount || 0} in
        call
      </div>
      <button
        type="button"
        className="group-call-header-banner-btn"
        onClick={onJoin}
        disabled={!canJoin || !onJoin}
      >
        Join
      </button>
    </div>
  );
}
