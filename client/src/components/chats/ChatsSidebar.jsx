import { useCallback, useEffect, useMemo, useState } from "react";
import lightMoreIcon from "../../assets/icons/light-more.png";
import darkSearchIcon from "../../assets/icons/chat-settings-icons/dark-search.png";

export default function ChatsSidebar({
  userId,
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
  pinnedIcon,
  moreIcon,
  onTogglePin,
  muteOptions,
  onSetMuteDuration,
  onClearMute,
  onToggleIgnore,
  onDeleteChat,
  formatTime,
}) {
  const [muteOpenFor, setMuteOpenFor] = useState(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const closeDropdown = useCallback((event) => {
    const dropdownEl = event?.currentTarget?.closest(".dropdown");
    const toggle = dropdownEl?.querySelector('[data-bs-toggle="dropdown"]');
    if (!toggle) return;
    const bootstrap = window?.bootstrap;
    if (bootstrap?.Dropdown) {
      bootstrap.Dropdown.getOrCreateInstance(toggle).hide();
    } else {
      toggle.click();
    }
  }, []);
  const getInitial = (label) => {
    if (!label) return "?";
    return String(label).trim().charAt(0).toUpperCase();
  };

  const formatPreviewText = (value) => {
    if (!value) return "No messages yet";
    const text = String(value).trim();
    return text;
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(String(query || "").trim().toLowerCase());
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const filteredChats = useMemo(() => {
    if (!debouncedQuery) return chats;
    return chats.filter((c) => {
      const title = String(c.displayName || c.type || "").toLowerCase();
      const lastText = String(c.lastMessageText || c.lastMessage?.text || "").toLowerCase();
      return title.includes(debouncedQuery) || lastText.includes(debouncedQuery);
    });
  }, [chats, debouncedQuery]);

  const filteredFriends = groupSearch
    ? friends.filter((f) => {
        const label = String(f.user?.username || f.user?.email || "").toLowerCase();
        return label.includes(groupSearch.toLowerCase());
      })
    : friends;

  return (
    <div className="border rounded p-3 chats-sidebar-panel">
        <div className="fw-bold mb-2">Chats</div>

        <form className="mb-2 chat-search-form" onSubmit={onSearch}>
          <div className="chat-search-input">
            <img
              src={darkSearchIcon}
              alt=""
              className="chat-search-icon"
            />
            <input
              className="form-control chat-search-field"
              placeholder="Search username/email..."
              value={query}
              onChange={onQueryChange}
            />
          </div>
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
            {showGroupForm ? "Close" : "Create group"}
          </button>

          {showGroupForm && (
            <div
              className="chat-group-modal-overlay"
              onClick={(e) => {
                if (e.target === e.currentTarget) onToggleGroupForm();
              }}
            >
              <div className="chat-group-modal">
                <div className="chat-group-modal-header">
                  <div className="fw-semibold">Create group</div>
                  <button
                    type="button"
                    className="btn btn-sm btn-link"
                    onClick={onToggleGroupForm}
                  >
                    Close
                  </button>
                </div>
                <form onSubmit={createGroup}>
                  <input
                    className="form-control form-control-sm mb-2"
                    placeholder="Group name"
                    value={groupName}
                    onChange={onGroupNameChange}
                  />
                  <input
                    className="form-control form-control-sm mb-2"
                    placeholder="Search friends..."
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                  />

                  {filteredFriends.length === 0 ? (
                    <div className="text-muted small">No friends found.</div>
                  ) : (
                    <div
                      className="list-group"
                      style={{ maxHeight: 260, overflowY: "auto" }}
                    >
                      {filteredFriends.map((f) => {
                        const id = f.user?.id;
                        const label = f.user?.username || "Unknown";
                        const avatarUrl = f.user?.avatarUrl || "";
                        const avatarSrc = avatarUrl
                          ? avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")
                            ? avatarUrl
                            : `${API_BASE}${avatarUrl}`
                          : "";

                        return (
                          <label
                            key={id}
                            className="list-group-item d-flex align-items-center gap-2"
                          >
                            <input
                              className="form-check-input m-0 chat-group-checkbox"
                              type="checkbox"
                              checked={groupMembers.has(id)}
                              onChange={() => onToggleGroupMember(id)}
                            />
                            {avatarSrc ? (
                              <img
                                src={avatarSrc}
                                alt={label}
                                className="chat-group-member-avatar"
                              />
                            ) : (
                              <div className="chat-group-member-avatar chat-group-member-fallback">
                                {String(label || "?").charAt(0).toUpperCase()}
                              </div>
                            )}
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
              </div>
            </div>
          )}
        </div>

        <div className="list-group chats-sidebar-list">
          {filteredChats.length === 0 ? (
            <div className="text-muted small py-3 text-center">No results</div>
          ) : (
            filteredChats.map((c) => {
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
            const lastText = c.lastMessageText || c.lastMessage?.text || "";
            const rawLast = String(lastText || "").trim();
            const lowerLast = rawLast.toLowerCase();
            const previewText = formatPreviewText(rawLast);
            const previewShort =
              previewText.length > 18
                ? `${previewText.slice(0, 18)}...`
                : previewText;
            const lastMessageAt = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
            const lastReadAt = c.lastReadAt ? new Date(c.lastReadAt).getTime() : 0;
            const lastSenderId = c.lastMessageSenderId ? String(c.lastMessageSenderId) : "";
            const isUnread =
              lastMessageAt > lastReadAt &&
              (!userId || lastSenderId !== String(userId));

            return (
              <div
                key={c._id}
                className={`list-group-item d-flex justify-content-between align-items-center chat-row ${
                  isUnread ? "unread" : ""
                } ${
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
                        {isUnread ? <span className="chat-unread-dot" aria-hidden="true" /> : null}
                        {c.settings?.isPinned ? (
                          <img
                            src={pinnedIcon}
                            alt="Pinned"
                            width={14}
                            height={14}
                            style={{ opacity: 0.8 }}
                          />
                        ) : null}
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
                    <img
                      src={
                        String(c._id) === String(selectedChatId)
                          ? lightMoreIcon
                          : moreIcon
                      }
                      alt="More"
                      width={18}
                      height={18}
                    />
                  </button>

                  <ul className="dropdown-menu dropdown-menu-end" data-bs-auto-close="outside">
                    {String(muteOpenFor) === String(c._id) ? (
                      <>
                        {muteOptions.map((opt) => (
                          <li key={opt.key}>
                            <button
                              className="dropdown-item chat-sidebar-mute-option"
                              onClick={(event) => {
                                onSetMuteDuration(c, opt.ms);
                                setMuteOpenFor(null);
                                closeDropdown(event);
                              }}
                            >
                              {opt.label}
                            </button>
                          </li>
                        ))}
                        {c.settings?.isMuted && (
                          <li>
                            <button
                              className="dropdown-item chat-sidebar-mute-option text-danger"
                              onClick={(event) => {
                                onClearMute(c);
                                setMuteOpenFor(null);
                                closeDropdown(event);
                              }}
                            >
                              Turn off mute
                            </button>
                          </li>
                        )}
                      </>
                    ) : (
                      <>
                        <li>
                          <button className="dropdown-item" onClick={() => onTogglePin(c)}>
                            {c.settings?.isPinned ? "Unpin" : "Pin"}
                          </button>
                        </li>
                        <li>
                          <button
                            className="dropdown-item"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (c.settings?.isMuted) {
                                onClearMute(c);
                                setMuteOpenFor(null);
                                closeDropdown(e);
                                return;
                              }
                              setMuteOpenFor(c._id);
                            }}
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
                      </>
                    )}
                  </ul>
                </div>
              </div>
            );
          }))}
        </div>
    </div>
  );
}
