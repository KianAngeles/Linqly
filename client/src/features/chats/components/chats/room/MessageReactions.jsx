export default function MessageReactions({
  isMine,
  reactionsSummary,
  onOpenReactions,
}) {
  const totalCount = reactionsSummary.reduce((acc, [, count]) => acc + (count || 0), 0);
  return (
    <div className="message-reactions">
      <button
        type="button"
        className="message-reactions-button"
        onClick={onOpenReactions}
      >
        <span className="message-reaction-emojis">
          {reactionsSummary.map(([emoji]) => (
            <span key={emoji} className="message-reaction-emoji">
              {emoji}
            </span>
          ))}
        </span>
        <span className="message-reaction-total">{totalCount}</span>
      </button>
    </div>
  );
}
