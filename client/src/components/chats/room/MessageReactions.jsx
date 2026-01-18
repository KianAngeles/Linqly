export default function MessageReactions({ isMine, reactionsSummary }) {
  return (
    <div
      className={`message-reactions d-flex ${
        isMine ? "justify-content-end" : "justify-content-start"
      }`}
    >
      {!isMine && <div className="me-2" style={{ width: 32 }} />}
      <div className="small text-muted">
        {reactionsSummary.map(([emoji, count]) => (
          <span key={emoji} className="me-2">
            {emoji} {count}
          </span>
        ))}
      </div>
    </div>
  );
}
