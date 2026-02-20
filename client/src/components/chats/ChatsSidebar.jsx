import { useCallback, useEffect, useMemo, useState } from "react";
import lightMoreIcon from "../../assets/icons/light-more.png";
import darkSearchIcon from "../../assets/icons/chat-settings-icons/dark-search.png";
import requestIcon from "../../assets/icons/chat-settings-icons/request.png";
import ChatSidebarHeader from "./ChatSidebarHeader";
import ChatModeToggle from "./ChatModeToggle";
import { GROUP_CALLS_ENABLED } from "../../constants/featureFlags";

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
  messageRequests,
  selectedChatId,
  onSelectChat,
  onSelectRequest,
  API_BASE,
  muteIcon,
  pinnedIcon,
  moreIcon,
  onTogglePin,
  muteOptions,
  onSetMuteDuration,
  onClearMute,
  onDeleteChat,
  formatTime,
}) {
  const [muteOpenFor, setMuteOpenFor] = useState(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sidebarMode, setSidebarMode] = useState("chats");
  const [archivedChatIds, setArchivedChatIds] = useState(new Set());

  const isChatsMode = sidebarMode === "chats";
  const isArchiveMode = sidebarMode === "archive";
  const isRequestsMode = sidebarMode === "requests";

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

  const archiveChat = useCallback((chat) => {
    const chatId = String(chat?._id || "");
    if (!chatId) return;
    setArchivedChatIds((prev) => {
      const next = new Set(prev);
      next.add(chatId);
      return next;
    });
    // TODO: Persist archive state in backend once API support is available.
  }, []);

  const unarchiveChat = useCallback((chat) => {
    const chatId = String(chat?._id || "");
    if (!chatId) return;
    setArchivedChatIds((prev) => {
      const next = new Set(prev);
      next.delete(chatId);
      return next;
    });
    // TODO: Persist archive state in backend once API support is available.
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(String(query || "").trim().toLowerCase());
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const activeChats = useMemo(
    () =>
      (chats || []).filter((chat) => {
        const chatId = String(chat?._id || "");
        return !archivedChatIds.has(chatId);
      }),
    [archivedChatIds, chats]
  );

  const archivedChats = useMemo(
    () =>
      (chats || []).filter((chat) => {
        const chatId = String(chat?._id || "");
        return archivedChatIds.has(chatId);
      }),
    [archivedChatIds, chats]
  );

  const filteredChats = useMemo(() => {
    if (!debouncedQuery) return activeChats;
    return activeChats.filter((c) => {
      const title = String(c.displayName || c.type || "").toLowerCase();
      const lastText = String(c.lastMessageText || c.lastMessage?.text || "").toLowerCase();
      return title.includes(debouncedQuery) || lastText.includes(debouncedQuery);
    });
  }, [activeChats, debouncedQuery]);

  const filteredFriends = groupSearch
    ? friends.filter((f) => {
        const label = String(f.user?.username || f.user?.email || "").toLowerCase();
        return label.includes(groupSearch.toLowerCase());
      })
    : friends;

  const renderChatRows = (items, emptyLabel, listMode = "chats") => {
    const isArchivedList = listMode === "archive";
    if (items.length === 0) {
      return <div className="text-muted small py-3 text-center">{emptyLabel}</div>;
    }

    return items.map((c) => {
      const avatarUrl =
        c.type === "group" || c.type === "hangout"
          ? c.avatarUrl || ""
          : c.otherUser?.avatarUrl || "";
      const avatarSrc = avatarUrl
        ? avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")
          ? avatarUrl
          : `${API_BASE}${avatarUrl}`
        : "";
      const lastTime = formatTime ? formatTime(c.lastMessageAt || c.updatedAt) : "";
      const lastText = c.lastMessageText || c.lastMessage?.text || "";
      const rawLast = String(lastText || "").trim();
      const requestStatus = String(c.requestStatus || "accepted");
      const isPendingOutgoing = requestStatus === "pending_outgoing";
      const isDeclinedOutgoing = requestStatus === "declined_outgoing";
      const previewText = isPendingOutgoing
        ? "Message request sent"
        : isDeclinedOutgoing
          ? "Message request declined"
          : formatPreviewText(rawLast);
      const previewShort =
        previewText.length > 18 ? `${previewText.slice(0, 18)}...` : previewText;
      const rawTitle = String(c.displayName || c.type || "");
      const titleShort = rawTitle.length > 21 ? `${rawTitle.slice(0, 21)}...` : rawTitle;
      const lastMessageAt = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
      const lastReadAt = c.lastReadAt ? new Date(c.lastReadAt).getTime() : 0;
      const lastSenderId = c.lastMessageSenderId ? String(c.lastMessageSenderId) : "";
      const isUnread = lastMessageAt > lastReadAt && (!userId || lastSenderId !== String(userId));

      return (
        <div
          key={c._id}
          className={`list-group-item d-flex justify-content-between align-items-center chat-row ${
            isUnread ? "unread" : ""
          } ${String(c._id) === String(selectedChatId) ? "active" : ""}`}
        >
          <button
            type="button"
            className="chat-row-main-btn flex-grow-1"
            onClick={() => onSelectChat(String(c._id))}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="d-flex align-items-center gap-2">
              <div className="chat-list-avatar-wrap">
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
                {c.type === "direct" && c.otherUser?.isOnline && (
                  <span className="chat-list-online-dot" />
                )}
              </div>
              <div>
                <div className="chat-list-title d-flex align-items-center gap-2">
                  <span>{titleShort}</span>
                  {isPendingOutgoing ? (
                    <img src={requestIcon} alt="Pending request" className="chat-request-icon" />
                  ) : null}
                  {isDeclinedOutgoing ? (
                    <img src={requestIcon} alt="Declined request" className="chat-request-icon" />
                  ) : null}
                  {isUnread ? <span className="chat-unread-dot" aria-hidden="true" /> : null}
                  {GROUP_CALLS_ENABLED &&
                  (c.type === "group" || c.type === "hangout") &&
                  c.ongoingCall?.callId ? (
                    <span className="chat-ongoing-call-badge">Ongoing call</span>
                  ) : null}
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
              aria-label="More chat actions"
            >
              <img
                src={String(c._id) === String(selectedChatId) ? lightMoreIcon : moreIcon}
                alt="More"
                width={18}
                height={18}
              />
            </button>

            <ul className="dropdown-menu dropdown-menu-end" data-bs-auto-close="outside">
              {String(muteOpenFor) === String(c._id) ? (
                <>
                  <li>
                    <button
                      className="dropdown-item chat-sidebar-mute-back"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setMuteOpenFor(null);
                      }}
                    >
                      Back
                    </button>
                  </li>
                  <li>
                    <hr className="dropdown-divider my-1" />
                  </li>
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
                      onClick={(event) => {
                        if (isArchivedList) {
                          unarchiveChat(c);
                        } else {
                          archiveChat(c);
                        }
                        setMuteOpenFor(null);
                        closeDropdown(event);
                      }}
                    >
                      {isArchivedList ? "Unarchive" : "Archive"}
                    </button>
                  </li>
                  <li>
                    <hr className="dropdown-divider" />
                  </li>
                  <li>
                    <button
                      className="dropdown-item text-danger"
                      onClick={(event) => {
                        onDeleteChat(c);
                        closeDropdown(event);
                      }}
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
    });
  };

  const renderRequestRows = (items, emptyLabel) => {
    if (!items.length) {
      return <div className="text-muted small py-3 text-center">{emptyLabel}</div>;
    }

    return items.map((request) => {
      const sender = request.fromUser || {};
      const label = sender.username || "Unknown";
      const avatarUrl = sender.avatarUrl || "";
      const avatarSrc = avatarUrl
        ? avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")
          ? avatarUrl
          : `${API_BASE}${avatarUrl}`
        : "";
      const lastTime = formatTime
        ? formatTime(request.lastMessageAt || request.updatedAt || request.createdAt)
        : "";
      const previewText = formatPreviewText(request.lastMessageText || "Message request");
      const previewShort =
        previewText.length > 24 ? `${previewText.slice(0, 24)}...` : previewText;
      const isActive = String(request.chatId || "") === String(selectedChatId || "");

      return (
        <button
          key={request.id}
          type="button"
          className={`list-group-item d-flex align-items-center gap-2 chat-row text-start ${
            isActive ? "active" : ""
          }`}
          onClick={() => onSelectRequest?.(request)}
        >
          <div className="chat-list-avatar-wrap">
            {avatarSrc ? (
              <img src={avatarSrc} alt={label} className="chat-list-avatar" />
            ) : (
              <div className="chat-list-avatar chat-list-avatar-fallback">
                {getInitial(label)}
              </div>
            )}
          </div>
          <div className="flex-grow-1">
            <div className="chat-list-title d-flex align-items-center gap-2">
              <span>{label}</span>
              <img src={requestIcon} alt="Message request" className="chat-request-icon" />
            </div>
            <div className="chat-list-preview opacity-75">
              <span>{previewShort}</span>
              {lastTime && <span className="chat-list-time">{lastTime}</span>}
            </div>
          </div>
        </button>
      );
    });
  };

  return (
    <div className="border rounded p-3 chats-sidebar-panel">
      <ChatSidebarHeader
        mode={sidebarMode}
        onModeChange={setSidebarMode}
        hasRequests={(messageRequests || []).length > 0}
      />
      {!isChatsMode && <ChatModeToggle mode={sidebarMode} onModeChange={setSidebarMode} />}

      {isChatsMode && (
        <>
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
            className="btn btn-sm chat-sidebar-create-btn w-100"
            onClick={onToggleGroupForm}
          >
            {showGroupForm ? "Close" : "Create Group"}
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
                    className="chat-group-close"
                    aria-label="Close create group"
                    onClick={onToggleGroupForm}
                  >
                    ✕
                  </button>
                </div>
                <form onSubmit={createGroup}>
                  <input
                    className="form-control chat-group-input chat-group-input-primary"
                    placeholder="Group name"
                    value={groupName}
                    onChange={onGroupNameChange}
                  />
                  <input
                    className="form-control chat-group-input"
                    placeholder="Search friends..."
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                  />

                  {filteredFriends.length === 0 ? (
                    <div className="text-muted small">No friends found.</div>
                  ) : (
                    <div className="chat-group-list">
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
                          <label key={id} className="chat-group-row">
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
                            <span className="chat-group-name">{label}</span>
                            <input
                              className="m-0 chat-group-checkbox ms-auto"
                              type="checkbox"
                              checked={groupMembers.has(id)}
                              onChange={() => onToggleGroupMember(id)}
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <button type="submit" className="btn chat-group-primary-btn w-100">
                    Create group
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        <div className="list-group chats-sidebar-list">
          {renderChatRows(filteredChats, "No results", "chats")}
        </div>
        </>
      )}

      {isArchiveMode && (
        <div className="list-group chats-sidebar-list chats-sidebar-mode-list">
          {renderChatRows(archivedChats, "No archived chats", "archive")}
        </div>
      )}

      {isRequestsMode && (
        <div className="list-group chats-sidebar-list chats-sidebar-mode-list">
          {renderRequestRows(messageRequests || [], "No message requests")}
        </div>
      )}
    </div>
  );
}
