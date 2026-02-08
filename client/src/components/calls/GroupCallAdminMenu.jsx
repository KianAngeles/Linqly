import { useState } from "react";
import "./groupCallMessages.css";

export default function GroupCallAdminMenu({
  isVisible,
  canMuteAll = false,
  onMuteAll,
  participants = [],
  onAskUnmute,
}) {
  const [targetUserId, setTargetUserId] = useState("");
  const askUnmuteTargets = (participants || []).filter(
    (participant) => participant?.isMuted === true
  );

  if (!isVisible) return null;

  return (
    <div className="group-call-admin-menu">
      <button
        type="button"
        className="group-call-admin-btn"
        onClick={onMuteAll}
        disabled={!canMuteAll || !onMuteAll}
      >
        Mute all
      </button>
      <select
        className="group-call-admin-btn"
        value={targetUserId}
        onChange={(e) => setTargetUserId(e.target.value)}
        disabled={askUnmuteTargets.length === 0}
      >
        <option value="">Ask muted user...</option>
        {askUnmuteTargets.map((participant) => (
          <option key={participant.userId} value={participant.userId}>
            {participant.displayName || participant.name || "User"}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="group-call-admin-btn"
        onClick={() => {
          if (!targetUserId) return;
          onAskUnmute?.(targetUserId);
          setTargetUserId("");
        }}
        disabled={!targetUserId || !onAskUnmute}
      >
        Ask unmute
      </button>
    </div>
  );
}
