import searchIcon from "../../../assets/icons/search.png";

export default function FindMessageOverlay({
  isOpen,
  selectedChatId,
  onClose,
  findQuery,
  onFindQueryChange,
  onClearQuery,
  findResults,
  jumpToMessage,
  highlightMatches,
  resolveAvatarUrl,
}) {
  if (!isOpen || !selectedChatId) return null;

  return (
    <div className="chat-settings-search-overlay">
      <div className="chat-settings-find-header">
        <div className="chat-settings-find-title">Search</div>
        <button
          type="button"
          className="chat-settings-find-close"
          onClick={onClose}
        >
          x
        </button>
      </div>
      <div className="chat-settings-find-input">
        <img src={searchIcon} alt="" />
        <input
          type="text"
          placeholder="Search in conversation"
          value={findQuery}
          onChange={onFindQueryChange}
        />
        {findQuery && (
          <button
            type="button"
            className="chat-settings-find-clear"
            onClick={onClearQuery}
          >
            x
          </button>
        )}
      </div>
      {findQuery && (
        <div className="chat-settings-find-count">
          {findResults.length} results
        </div>
      )}
      {findQuery && (
        <div className="chat-settings-find-results">
          {findResults.length === 0 && (
            <div className="text-muted small">No matches.</div>
          )}
          {findResults.map((m) => (
            <button
              key={m.id || m._id}
              type="button"
              className="chat-settings-find-item"
              onClick={() => jumpToMessage(m.id || m._id)}
            >
              <div className="chat-settings-find-name">
                {m.sender?.username || "Unknown"}
              </div>
              <div className="chat-settings-find-row">
                {m.sender?.avatarUrl ? (
                  <img
                    src={resolveAvatarUrl(m.sender.avatarUrl)}
                    alt={m.sender?.username || "Avatar"}
                    className="chat-settings-find-avatar"
                  />
                ) : (
                  <div className="chat-settings-find-avatar chat-settings-find-avatar-fallback">
                    {String(m.sender?.username || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="chat-settings-find-snippet">
                  {highlightMatches(m.text || "", findQuery).map((part, idx) =>
                    part.isMatch ? (
                      <strong key={`${m.id || m._id}-m-${idx}`}>
                        {part.text}
                      </strong>
                    ) : (
                      <span key={`${m.id || m._id}-t-${idx}`}>{part.text}</span>
                    )
                  )}
                </div>
                <div className="chat-settings-find-date">
                  {new Date(
                    m.createdAt || m.sentAt || m.updatedAt || Date.now()
                  ).toLocaleString()}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
