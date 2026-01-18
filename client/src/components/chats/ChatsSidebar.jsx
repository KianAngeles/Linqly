export default function ChatsSidebar({
  query,
  onQueryChange,
  onSearch,
  results,
  onStartChatWith,
  showGroupForm,
  onToggleGroupForm,
  createGroup,
  groupName,
  onGroupNameChange,
  friends,
  groupMembers,
  onToggleGroupMember,
  chats,
  selectedChatId,
  onSelectChat,
  API_BASE,
  muteIcon,
  moreIcon,
  onTogglePin,
  onToggleMute,
  onToggleIgnore,
  onDeleteChat,
  formatTime,
}) {
  const getInitial = (label) => {
    if (!label) return "?";
    return String(label).trim().charAt(0).toUpperCase();
  };

  return (
    <div className="border rounded p-3 chats-sidebar-panel">
        <div className="fw-bold mb-2">Chats</div>

        <form className="d-flex gap-2 mb-2" onSubmit={onSearch}>
          <input
            className="form-control"
            placeholder="Search username/email..."
            value={query}
            onChange={onQueryChange}
          />
          <button className="btn btn-outline-primary" type="submit">
            Find
          </button>
        </form>

        {results.length > 0 && (
          <div className="list-group mb-3">
            {results.map((u) => (
              <button
                key={u.id}
                type="button"
                className="list-group-item list-group-item-action"
                onClick={() => onStartChatWith(u.id)}
              >
                <div className="fw-semibold">{u.username}</div>
                <div className="text-muted small">{u.email}</div>
              </button>
            ))}
          </div>
        )}

        <div className="mb-3">
          <button
            type="button"
            className="btn btn-sm btn-outline-primary w-100"
            onClick={onToggleGroupForm}
          >
            {showGroupForm ? "Close group builder" : "New group"}
          </button>

          {showGroupForm && (
            <form className="mt-2" onSubmit={createGroup}>
              <input
                className="form-control form-control-sm mb-2"
                placeholder="Group name (optional)"
                value={groupName}
                onChange={onGroupNameChange}
              />

              {friends.length === 0 ? (
                <div className="text-muted small">No friends to add yet.</div>
              ) : (
                <div
                  className="list-group"
                  style={{ maxHeight: 180, overflowY: "auto" }}
                >
                  {friends.map((f) => {
                    const id = f.user?.id;
                    const label = f.user?.username || "Unknown";

                    return (
                      <label
                        key={id}
                        className="list-group-item d-flex align-items-center gap-2"
                      >
                        <input
                          className="form-check-input m-0"
                          type="checkbox"
                          checked={groupMembers.has(id)}
                          onChange={() => onToggleGroupMember(id)}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-sm mt-2 w-100"
              >
                Create group
              </button>
            </form>
          )}
        </div>

        <div className="list-group chats-sidebar-list">
          {chats.map((c) => {
            const avatarUrl =
              c.type === "group" || c.type === "hangout"
                ? c.avatarUrl || ""
                : c.otherUser?.avatarUrl || "";
            const avatarSrc = avatarUrl
              ? avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")
                ? avatarUrl
                : `${API_BASE}${avatarUrl}`
              : "";
            const lastTime = formatTime
              ? formatTime(c.lastMessageAt || c.updatedAt)
              : "";
            const previewText = c.lastMessageText || "No messages yet";
            const previewShort =
              previewText.length > 18
                ? `${previewText.slice(0, 18)}...`
                : previewText;

            return (
              <div
                key={c._id}
                className={`list-group-item d-flex justify-content-between align-items-center ${
                  String(c._id) === String(selectedChatId) ? "active" : ""
                }`}
              >
                <button
                  type="button"
                  className="btn btn-link text-start p-0 flex-grow-1"
                  onClick={() => onSelectChat(String(c._id))}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="d-flex align-items-center gap-2">
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt={c.displayName || "Avatar"}
                        className="chat-list-avatar"
                      />
                    ) : (
                      <div className="chat-list-avatar chat-list-avatar-fallback">
                        {getInitial(c.displayName || c.type)}
                      </div>
                    )}
                    <div>
                      <div className="chat-list-title d-flex align-items-center gap-2">
                        <span>{c.displayName || c.type}</span>
                        {c.settings?.isPinned ? <span>[PIN]</span> : null}
                        {c.settings?.isMuted ? (
                          <img
                            src={muteIcon}
                            alt="Muted"
                            width={14}
                            height={14}
                            style={{ opacity: 0.8 }}
                          />
                        ) : null}
                        {c.settings?.isIgnored ? <span>[IGNORE]</span> : null}
                    </div>
                      <div className="chat-list-preview opacity-75">
                        <span>{previewShort}</span>
                        {lastTime && <span className="chat-list-time">{lastTime}</span>}
                      </div>
                    </div>
                  </div>
                </button>

                <div className="dropdown ms-2">
                  <button
                    className="chat-more-btn"
                    type="button"
                    data-bs-toggle="dropdown"
                  >
                    <img src={moreIcon} alt="More" width={18} height={18} />
                  </button>

                  <ul className="dropdown-menu dropdown-menu-end">
                    <li>
                      <button className="dropdown-item" onClick={() => onTogglePin(c)}>
                        {c.settings?.isPinned ? "Unpin" : "Pin"}
                      </button>
                    </li>
                    <li>
                      <button
                        className="dropdown-item"
                        onClick={() => onToggleMute(c)}
                      >
                        {c.settings?.isMuted ? "Unmute" : "Mute"}
                      </button>
                    </li>
                    <li>
                      <button
                        className="dropdown-item"
                        onClick={() => onToggleIgnore(c)}
                      >
                        {c.settings?.isIgnored ? "Unignore" : "Ignore"}
                      </button>
                    </li>
                    <li>
                      <hr className="dropdown-divider" />
                    </li>
                    <li>
                      <button
                        className="dropdown-item text-danger"
                        onClick={() => onDeleteChat(c)}
                      >
                        Delete
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
    </div>
  );
}
