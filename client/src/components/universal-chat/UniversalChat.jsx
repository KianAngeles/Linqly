import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../store/AuthContext";
import { chatsApi } from "../../api/chats.api";
import { friendsApi } from "../../api/friends.api";
import { messagesApi } from "../../api/messages.api";
import { socket } from "../../socket";
import { getDisplayName } from "../../utils/chats/users";
import { formatTimeLabel } from "../../utils/chats/formatting";
import { REACTION_EMOJIS, getMessageTimestamp, renderMessageText } from "../../utils/chats/messages";
import useReadReceipts, { resolveSeenByMessage } from "../../hooks/chats/useReadReceipts";
import { loadChatSettings } from "../../utils/chatSettings";
import MessageItem from "../chats/room/MessageItem";
import MessageReactions from "../chats/room/MessageReactions";
import ReplyPreviewBar from "../chats/ReplyPreviewBar";
import MessageComposer from "../chats/MessageComposer";
import reactIcon from "../../assets/icons/react.png";
import replyIcon from "../../assets/icons/reply.png";
import moreIcon from "../../assets/icons/more.png";
import darkMessageIcon from "../../assets/icons/dark-message.png";
import imageIcon from "../../assets/icons/image.png";
import micIcon from "../../assets/icons/mic.png";
import sendIcon from "../../assets/icons/send.png";
import callIcon from "../../assets/icons/call.png";
import "../../pages/ChatsPanel.css";
import "./UniversalChat.css";
import { useNavigate } from "react-router-dom";
import { useCall } from "../../store/CallContext";
import { isChatUnread, markChatRead, useChatsStore } from "../../store/chatsStore";

const MAX_OPEN = 3;

function resolveAvatarUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${import.meta.env.VITE_API_URL}${url}`;
}

function MiniChatWindow({
  chatId,
  title,
  avatarUrl,
  isDirect,
  peerId,
  peerName,
  peerAvatar,
  accessToken,
  user,
  isMinimized,
  expandedIndex,
  isMinimizing,
  isClosing,
  onMinimize,
  onClose,
}) {
  const navigate = useNavigate();
  const { startCall, isInCall } = useCall();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [reactOpenFor, setReactOpenFor] = useState(null);
  const [moreOpenFor, setMoreOpenFor] = useState(null);
  const [hiddenMessageIds, setHiddenMessageIds] = useState(new Set());
  const [stickToBottom, setStickToBottom] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const listRef = useRef(null);
  const pendingQueueRef = useRef([]);
  const pendingUrlsRef = useRef(new Map());
  const lastCallRef = useRef(0);

  useEffect(() => {
    if (!accessToken || !chatId) return;
    messagesApi
      .list(accessToken, chatId)
      .then((data) => {
        const ordered = [...(data.messages || [])].reverse();
        setMessages(ordered);
      })
      .catch(() => {});
  }, [accessToken, chatId]);

  useEffect(() => {
    if (!chatId) return;
    socket.emit("chat:join", { chatId });
    const onNew = (msg) => {
      if (String(msg.chatId) !== String(chatId)) return;
      const senderId = msg.sender?.id || msg.senderId;
      const isMine = String(senderId) === String(user?.id);
      const msgType = msg.type || "text";
      if (isMine && pendingQueueRef.current.length > 0) {
        const pendingIdx = pendingQueueRef.current.findIndex(
          (item) => (item.type || "text") === msgType
        );
        if (pendingIdx !== -1) {
          const [{ tempId }] = pendingQueueRef.current.splice(pendingIdx, 1);
          const tempUrl = pendingUrlsRef.current.get(tempId);
          if (tempUrl) {
            URL.revokeObjectURL(tempUrl);
            pendingUrlsRef.current.delete(tempId);
          }
          setMessages((prev) => {
            const hasTemp = prev.some(
              (m) => String(m.id || m._id) === String(tempId)
            );
            const replaced = prev.map((m) =>
              String(m.id || m._id) === String(tempId) ? msg : m
            );
            return hasTemp ? replaced : [...prev, msg];
          });
          return;
        }
      }
      setMessages((prev) => [...prev, msg]);
    };
    socket.on("message:new", onNew);
    return () => socket.off("message:new", onNew);
  }, [chatId]);

  useEffect(() => {
    const onReaction = (payload) => {
      if (String(payload.chatId) !== String(chatId)) return;
      setMessages((prev) =>
        prev.map((m) =>
          String(m.id || m._id) === String(payload.messageId)
            ? { ...m, reactions: payload.reactions }
            : m
        )
      );
    };
    const onDeleted = (payload) => {
      if (String(payload.chatId) !== String(chatId)) return;
      setMessages((prev) =>
        prev.map((m) =>
          String(m.id || m._id) === String(payload.messageId)
            ? {
                ...m,
                type: "system",
                text: payload.systemText || "Message deleted",
                imageUrl: null,
                replyTo: null,
                replyPreview: null,
                reactions: [],
                mentions: [],
                createdAt: payload.createdAt || m.createdAt,
              }
            : m
        )
      );
    };
    socket.on("message:reaction", onReaction);
    socket.on("message:deleted", onDeleted);
    return () => {
      socket.off("message:reaction", onReaction);
      socket.off("message:deleted", onDeleted);
    };
  }, [chatId]);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!reactOpenFor && !moreOpenFor) return;
      const pickerEl = e.target.closest(".msg-react-picker");
      const toggleBtn = e.target.closest('[data-react-toggle="true"]');
      const moreMenu = e.target.closest(".msg-more-menu");
      const moreToggle = e.target.closest('[data-more-toggle="true"]');
      if (pickerEl || toggleBtn || moreMenu || moreToggle) return;
      setReactOpenFor(null);
      setMoreOpenFor(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [reactOpenFor, moreOpenFor]);

  useEffect(() => {
    if (isMinimized) return;
    const el = listRef.current;
    if (!el || !stickToBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isMinimized, stickToBottom]);

  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickToBottom(distance < 24);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const clean = String(text || "").trim();
    if (!clean) return;
    setText("");
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingQueueRef.current.push({ tempId, type: "text" });
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        chatId,
        sender: { id: user?.id, username: user?.username },
        type: "text",
        text: clean,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    try {
      await messagesApi.send(accessToken, chatId, clean, replyingTo?.id || null);
      setReplyingTo(null);
    } catch {
      pendingQueueRef.current = pendingQueueRef.current.filter(
        (item) => item.tempId !== tempId
      );
      setMessages((prev) =>
        prev.filter((m) => String(m.id || m._id) !== String(tempId))
      );
    }
  };

  const handleSendQuick = async (value) => {
    const clean = String(value || "").trim();
    if (!clean) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingQueueRef.current.push({ tempId, type: "text" });
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        chatId,
        sender: { id: user?.id, username: user?.username },
        type: "text",
        text: clean,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    try {
      await messagesApi.send(accessToken, chatId, clean, null);
    } catch {
      pendingQueueRef.current = pendingQueueRef.current.filter(
        (item) => item.tempId !== tempId
      );
      setMessages((prev) =>
        prev.filter((m) => String(m.id || m._id) !== String(tempId))
      );
    }
  };

  const handleInsertEmoji = ({ native }) => {
    setText((prev) => `${prev}${native || ""}`);
  };

  const handleSendImage = async (file) => {
    if (!file) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);
    const isImage = file.type?.startsWith("image/");
    const isVideo = file.type?.startsWith("video/");
    const attachmentType = isImage ? "image" : isVideo ? "video" : "file";
    pendingQueueRef.current.push({ tempId, type: attachmentType });
    pendingUrlsRef.current.set(tempId, previewUrl);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        chatId,
        sender: { id: user?.id, username: user?.username },
        type: attachmentType,
        imageUrl: isImage ? previewUrl : "",
        fileUrl: !isImage ? previewUrl : "",
        fileName: file.name || "file",
        fileType: file.type || "",
        fileSize: file.size || 0,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    try {
      await messagesApi.sendImage(accessToken, chatId, file, replyingTo?.id || null);
      setReplyingTo(null);
    } catch {
      pendingQueueRef.current = pendingQueueRef.current.filter(
        (item) => item.tempId !== tempId
      );
      const tempUrl = pendingUrlsRef.current.get(tempId);
      if (tempUrl) {
        URL.revokeObjectURL(tempUrl);
        pendingUrlsRef.current.delete(tempId);
      }
      setMessages((prev) =>
        prev.filter((m) => String(m.id || m._id) !== String(tempId))
      );
    }
  };

  const handleSendVoice = async (file) => {
    if (!file) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);
    pendingQueueRef.current.push({ tempId, type: "audio" });
    pendingUrlsRef.current.set(tempId, previewUrl);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        chatId,
        sender: { id: user?.id, username: user?.username },
        type: "audio",
        fileUrl: previewUrl,
        fileName: file.name || "voice",
        fileType: file.type || "",
        fileSize: file.size || 0,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    try {
      await messagesApi.sendVoice(accessToken, chatId, file, replyingTo?.id || null);
      setReplyingTo(null);
    } catch {
      pendingQueueRef.current = pendingQueueRef.current.filter(
        (item) => item.tempId !== tempId
      );
      const tempUrl = pendingUrlsRef.current.get(tempId);
      if (tempUrl) {
        URL.revokeObjectURL(tempUrl);
        pendingUrlsRef.current.delete(tempId);
      }
      setMessages((prev) =>
        prev.filter((m) => String(m.id || m._id) !== String(tempId))
      );
    }
  };

  function myReactionEmoji(m) {
    const mine = (m.reactions || []).find(
      (r) => String(r.userId) === String(user?.id)
    );
    return mine?.emoji || null;
  }

  const handleCall = (e) => {
    e?.preventDefault?.();
    if (!isDirect || !peerId || !chatId) return;
    if (isInCall) return;
    const now = Date.now();
    if (now - lastCallRef.current < 500) return;
    lastCallRef.current = now;
    startCall({
      chatId,
      peerId,
      peerName,
      peerAvatar,
      caller: user,
    });
  };

  async function unsendMessage(messageId) {
    if (!confirm("Unsend this message?")) return;
    try {
      await messagesApi.delete(accessToken, messageId);
      setMoreOpenFor(null);
    } catch {
      // ignore
    }
  }

  function deleteForMe(messageId) {
    setHiddenMessageIds((prev) => {
      const next = new Set(prev);
      next.add(String(messageId));
      return next;
    });
    setMoreOpenFor(null);
  }

  async function downloadFileMessage(messageId, fileName) {
    if (!messageId) return;
    try {
      const blob = await messagesApi.downloadFile(accessToken, messageId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName || "file";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }

  const visibleMessages = messages.filter(
    (m) => !hiddenMessageIds.has(String(m.id || m._id))
  );
  const readReceiptsEnabled = loadChatSettings(chatId)?.readReceipts !== false;
  const { readMapForChat } = useReadReceipts({
    accessToken,
    chatId,
    userId: user?.id,
    messages: visibleMessages,
    isAtBottom: stickToBottom,
    isActive: !isMinimized,
    enabled: readReceiptsEnabled,
  });
  const seenReadersByMessage = useMemo(
    () =>
      resolveSeenByMessage({
        messages: visibleMessages,
        readMapForChat,
        currentUserId: user?.id,
      }),
    [readMapForChat, user?.id, visibleMessages]
  );
  const memberDirectory = useMemo(() => {
    const map = new Map();
    visibleMessages.forEach((m) => {
      const sender = m?.sender || null;
      const sid = sender?.id || sender?._id;
      if (sid) map.set(String(sid), sender);
    });
    if (user?.id) {
      map.set(String(user.id), user);
    }
    return map;
  }, [visibleMessages, user]);

  function renderSeenAvatar(member, size, title) {
    const avatarUrl = resolveAvatarUrl(member?.avatarUrl || "");
    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt={title}
          width={size}
          height={size}
          className="msg-seen-avatar"
          title={title}
        />
      );
    }
    const initial = String(member?.username || "?").charAt(0).toUpperCase();
    return (
      <div className="msg-seen-avatar msg-seen-fallback" title={title}>
        {initial}
      </div>
    );
  }

  const nicknamesMap = {};

  const expandedStyle = !isMinimized
    ? {
        position: "fixed",
        right: `${88 + expandedIndex * (320 + 12)}px`,
        bottom: "20px",
      }
    : undefined;
  const emptyIntroName = String(title || "User").trim() || "User";
  const emptyIntroHandle = emptyIntroName.replace(/\s+/g, "").toLowerCase();

  return (
    <div
      className={`uc-mini ${isMinimized ? "is-minimized" : ""} ${
        isMinimizing ? "is-minimizing" : ""
      } ${isClosing ? "is-closing" : ""} ${
        !isMinimized && visibleMessages.length === 0 ? "is-empty" : ""
      }`}
      style={expandedStyle}
    >
      {isMinimized ? (
        <button type="button" className="uc-mini-avatar-only" onClick={onMinimize}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={title} className="uc-mini-avatar" />
          ) : (
            <div className="uc-mini-avatar uc-mini-fallback">
              {String(title || "?").charAt(0).toUpperCase()}
            </div>
          )}
        </button>
      ) : (
        <>
          <div className="uc-mini-header">
            <div className="uc-mini-header-left">
              {avatarUrl ? (
                <img src={avatarUrl} alt={title} className="uc-mini-avatar" />
              ) : (
                <div className="uc-mini-avatar uc-mini-fallback">
                  {String(title || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                className="uc-mini-title uc-mini-title-link"
                onClick={() => navigate(`/app/chats/${chatId}`)}
              >
                {title}
              </button>
            </div>
            <div className="uc-mini-actions">
              {isDirect && (
                <button
                  type="button"
                  className="uc-mini-call-btn"
                  onClick={handleCall}
                  disabled={isInCall}
                  title="Start call"
                >
                  <img src={callIcon} alt="Start call" />
                </button>
              )}
              <button type="button" onClick={onMinimize} title="Minimize">
                —
              </button>
              <button type="button" onClick={onClose} title="Close">
                ×
              </button>
            </div>
          </div>
          <div className="uc-mini-body" ref={listRef} onScroll={handleListScroll}>
            {visibleMessages.length === 0 ? (
              <div className="chat-empty-intro">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={`${emptyIntroName} avatar`}
                    className="chat-empty-intro-avatar"
                  />
                ) : (
                  <div className="chat-empty-intro-avatar chat-empty-intro-avatar-fallback">
                    {emptyIntroName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="chat-empty-intro-name">{emptyIntroName}</div>
                <div className="chat-empty-intro-handle">@{emptyIntroHandle || "user"}</div>
              </div>
            ) : (
              visibleMessages.map((m, idx) => {
              const isDeletedMessage =
                String(m.type) === "system" ||
                /deleted a message/i.test(String(m.text || ""));

              const isMine = String(m.sender?.id) === String(user?.id);
              const displayName = getDisplayName(m.sender, nicknamesMap);
              const imageUrl = m.imageUrl
                ? m.imageUrl.startsWith("http://") || m.imageUrl.startsWith("https://")
                  ? m.imageUrl
                  : `${import.meta.env.VITE_API_URL}${m.imageUrl}`
                : "";
              const fileUrl = m.fileUrl
                ? m.fileUrl.startsWith("http://") || m.fileUrl.startsWith("https://")
                  ? m.fileUrl
                  : `${import.meta.env.VITE_API_URL}${m.fileUrl}`
                : "";
              const prevMsg = visibleMessages[idx - 1];
              const prevTime = prevMsg ? getMessageTimestamp(prevMsg) : null;
              const currTime = getMessageTimestamp(m);
              const timeDiffMinutes =
                prevTime && currTime
                  ? Math.abs(
                      (new Date(currTime).getTime() - new Date(prevTime).getTime()) / 60000
                    )
                  : null;
              const showTimestamp =
                !prevMsg || (timeDiffMinutes !== null && timeDiffMinutes >= 30);
              const sameSenderPrev =
                prevMsg &&
                prevMsg.type !== "system" &&
                String(prevMsg.sender?.id) === String(m.sender?.id);
              const nextMsg = visibleMessages[idx + 1];
              const nextTime = nextMsg ? getMessageTimestamp(nextMsg) : null;
              const nextTimeDiffMinutes =
                currTime && nextTime
                  ? Math.abs(
                      (new Date(nextTime).getTime() - new Date(currTime).getTime()) / 60000
                    )
                  : null;
              const nextShowTimestamp =
                !nextMsg || (nextTimeDiffMinutes !== null && nextTimeDiffMinutes >= 30);
              const nextIsSystem = nextMsg && String(nextMsg.type) === "system";
              const sameSenderNext =
                nextMsg && String(nextMsg.sender?.id) === String(m.sender?.id);
              const isBlockEnd =
                !nextMsg || nextIsSystem || !sameSenderNext || nextShowTimestamp;
              const showAvatar = !isMine && isBlockEnd;
              const senderAvatar = m.sender?.avatarUrl
                ? m.sender.avatarUrl.startsWith("http://") ||
                  m.sender.avatarUrl.startsWith("https://")
                  ? m.sender.avatarUrl
                  : `${import.meta.env.VITE_API_URL}${m.sender.avatarUrl}`
                : "";
              const hasReactions = (m.reactions || []).length > 0;
              const reactionsSummary = Object.entries(
                (m.reactions || []).reduce((acc, r) => {
                  if (!r?.emoji) return acc;
                  acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                  return acc;
                }, {})
              );
              const messageId = m.id || m._id;
              const showPicker = String(reactOpenFor) === String(messageId);
              const showMoreMenu = String(moreOpenFor) === String(messageId);
              const reactedEmojis = new Set(
                (m.reactions || [])
                  .filter((r) => String(r.userId) === String(user?.id))
                  .map((r) => r.emoji)
                  .filter(Boolean)
              );

              const reactions = hasReactions && reactionsSummary.length > 0 && (
                <MessageReactions
                  isMine={isMine}
                  reactionsSummary={reactionsSummary}
                  onOpenReactions={() => {}}
                />
              );
              let seenIndicator = null;
              if (readReceiptsEnabled && !isDeletedMessage) {
                const readersForMessage =
                  seenReadersByMessage.get(String(messageId)) || [];
                if (readersForMessage.length > 0) {
                const members = readersForMessage.map((r) => {
                  const member = memberDirectory.get(String(r.userId));
                  return (
                    member || {
                      id: r.userId,
                      username: "User",
                      avatarUrl: "",
                    }
                  );
                });
                  const visibleMembers = members.slice(0, 6);
                  const remaining = Math.max(
                    0,
                    members.length - visibleMembers.length
                  );
                  const names = members
                    .map((m) => m?.username || "Someone")
                    .join(", ");
                  if (visibleMembers.length === 1) {
                    const seenTime = readersForMessage[0]?.readAt
                      ? new Date(readersForMessage[0].readAt).toLocaleTimeString(
                          [],
                          {
                            hour: "numeric",
                            minute: "2-digit",
                          }
                        )
                      : "";
                    const title = seenTime ? `Seen at ${seenTime}` : "Seen";
                    seenIndicator = (
                      <div className="msg-seen-single">
                        {renderSeenAvatar(visibleMembers[0], 16, title)}
                      </div>
                    );
                  } else {
                    seenIndicator = (
                      <div
                        className="msg-seen-stack"
                        title={names ? `Seen by ${names}` : "Seen"}
                      >
                        {visibleMembers.map((m) => (
                          <span key={m.id || m._id || m.username}>
                            {renderSeenAvatar(
                              m,
                              14,
                              m.username ? `Seen by ${m.username}` : "Seen"
                            )}
                          </span>
                        ))}
                        {remaining > 0 && (
                          <div className="msg-seen-more">+{remaining}</div>
                        )}
                      </div>
                    );
                  }
                }
              }

              if (String(m.type) === "system") {
                const label = String(m.text || "").trim();
                return (
                  <div key={messageId || idx} className="msg-system">
                    <div className="msg-system-text">{label}</div>
                  </div>
                );
              }

              return (
                <div key={messageId || idx} id={messageId ? `msg-${messageId}` : undefined}>
                  {showTimestamp && (
                    <div className="message-time-divider">{formatTimeLabel(currTime)}</div>
                  )}
                  <MessageItem
                    message={{
                      ...m,
                      imageUrl,
                      fileUrl,
                      isDeletedMessage,
                      displayName,
                    }}
                    isMine={isMine}
                    showName={showTimestamp || !sameSenderPrev}
                    showAvatar={showAvatar}
                    senderAvatar={senderAvatar}
                    sameSenderPrev={sameSenderPrev}
                    onDownloadFile={() =>
                      downloadFileMessage(messageId, m.fileName || "file")
                    }
                    onReplyToggle={() =>
                      setReplyingTo((prev) => {
                        if (prev && String(prev.id) === String(messageId)) return null;
                        return {
                          id: messageId,
                          senderName: displayName || "Unknown",
                          text: m.text,
                        };
                      })
                    }
                    onReactToggle={() =>
                      setReactOpenFor((prev) =>
                        String(prev) === String(messageId) ? null : messageId
                      )
                    }
                    onMoreToggle={() =>
                      setMoreOpenFor((prev) =>
                        String(prev) === String(messageId) ? null : messageId
                      )
                    }
                    onUnsend={() => unsendMessage(messageId)}
                    onDeleteForMe={() => deleteForMe(messageId)}
                    showPicker={showPicker}
                    showMoreMenu={showMoreMenu}
                    canUnsend={isMine}
                    canDeleteForMe
                    emojiOptions={REACTION_EMOJIS}
                    reactedEmojis={reactedEmojis}
                    onEmojiPick={(emoji) => {
                      const current = myReactionEmoji(m);
                      if (current === emoji) {
                        messagesApi.unreact(accessToken, messageId).catch(() => {});
                      } else {
                        messagesApi.react(accessToken, messageId, emoji).catch(() => {});
                      }
                      setReactOpenFor(null);
                    }}
                    renderMessageText={renderMessageText}
                    replyIcon={replyIcon}
                    reactIcon={reactIcon}
                    moreIcon={moreIcon}
                    reactions={reactions}
                    seenIndicator={seenIndicator}
                  />
                </div>
              );
              })
            )}
          </div>
          <ReplyPreviewBar
            replyingTo={replyingTo}
            onClose={() => setReplyingTo(null)}
          />
          <div className="uc-mini-input">
            <MessageComposer
              text={text}
              onChangeText={setText}
              onInputBlur={() => {}}
              showMentions={false}
              mentionCandidates={[]}
              onInsertMention={() => {}}
              showEmojiPicker={showEmojiPicker}
              onToggleEmojiPicker={() => setShowEmojiPicker((v) => !v)}
              reactIcon={reactIcon}
              imageIcon={imageIcon}
              micIcon={micIcon}
              sendIcon={sendIcon}
              onInsertEmoji={handleInsertEmoji}
              API_BASE={import.meta.env.VITE_API_URL}
              onSend={handleSend}
              onSendQuick={handleSendQuick}
              onSendImage={handleSendImage}
              onSendVoice={handleSendVoice}
              placeholder="Aa"
              hideMicWhenTyping
            />
          </div>
        </>
      )}
    </div>
  );
}

export default function UniversalChat() {
  const { user, accessToken } = useAuth();
  const [panelOpen, setPanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { chats, setChats, unreadChatsCount } = useChatsStore(user?.id);
  const [friends, setFriends] = useState([]);
  const [openChats, setOpenChats] = useState([]);
  const minimizeTimersRef = useRef(new Map());
  const closeTimersRef = useRef(new Map());

  useEffect(() => {
    if (!accessToken) return;
    chatsApi
      .list(accessToken)
      .then((data) => setChats(data.chats || []))
      .catch(() => {});
    friendsApi
      .list(accessToken)
      .then((data) => setFriends(data.friends || []))
      .catch(() => {});
  }, [accessToken]);

  const filteredChats = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => {
      const title = String(c.displayName || "").toLowerCase();
      const lastText = String(c.lastMessageText || "").toLowerCase();
      return title.includes(q) || lastText.includes(q);
    });
  }, [chats, search]);

  const filteredFriends = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => {
      const label = String(f.user?.username || f.user?.email || "").toLowerCase();
      return label.includes(q);
    });
  }, [friends, search]);

  const openChat = (chat) => {
    if (!chat?._id) return;
    const isDirect = chat.type === "direct";
    const peerUser = isDirect ? chat.otherUser || null : null;
    setOpenChats((prev) => {
      const existing = prev.find((c) => String(c.chatId) === String(chat._id));
      const nextChat = existing
        ? { ...existing, isMinimized: false }
        : {
            chatId: String(chat._id),
            title: chat.displayName || "Chat",
            avatarUrl:
              chat.type === "direct"
                ? resolveAvatarUrl(chat.otherUser?.avatarUrl || "")
                : resolveAvatarUrl(chat.avatarUrl || ""),
            isDirect,
            peerId: peerUser?.id || peerUser?._id || "",
            peerName: peerUser?.username || peerUser?.displayName || "",
            peerAvatar: resolveAvatarUrl(peerUser?.avatarUrl || ""),
            isMinimized: false,
          };

      const withoutExisting = prev.filter((c) => String(c.chatId) !== String(chat._id));
      const ordered = [...withoutExisting, nextChat];
      if (ordered.length <= MAX_OPEN) return ordered;
      return ordered.slice(1);
    });
    markChatRead(
      chat._id,
      chat.lastMessageAt || chat.updatedAt || new Date().toISOString(),
      chat.lastReadMessageId
    );
  };

  const openDirectWithFriend = async (friend) => {
    if (!accessToken || !friend?.user?.id) return;
    try {
      const data = await chatsApi.createDirect(accessToken, friend.user.id);
      const chatId = data.chatId;
      const nextChat =
        chats.find((c) => String(c._id) === String(chatId)) ||
        (await chatsApi.list(accessToken)).chats.find(
          (c) => String(c._id) === String(chatId)
        );
      if (nextChat) {
        setChats((prev) => {
          const exists = prev.some((c) => String(c._id) === String(nextChat._id));
          return exists ? prev : [nextChat, ...prev];
        });
        openChat(nextChat);
      }
    } catch {
      // ignore
    }
  };

  if (!user || !accessToken) return null;

  return (
    <div className="universal-chat">
      <button
        type="button"
        className="uc-fab"
        onClick={() => setPanelOpen((v) => !v)}
      >
        <img src={darkMessageIcon} alt="Chat" className="uc-fab-icon" />
        {unreadChatsCount > 0 && (
          <span className="uc-fab-badge">{unreadChatsCount}</span>
        )}
      </button>

      {panelOpen && (
        <>
          <div
            className="uc-panel-backdrop"
            onClick={() => setPanelOpen(false)}
          />
          <div className="uc-panel">
            <div className="uc-panel-header">Chats</div>
            <div className="uc-panel-search">
              <input
                className="form-control form-control-sm"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="uc-panel-list">
              <div className="uc-panel-section">
                <div className="uc-panel-section-title">Recent chats</div>
                {filteredChats.length === 0 ? (
                  <div className="uc-empty">No results</div>
                ) : (
                  filteredChats.map((c) => {
                    const avatarUrl =
                      c.type === "direct"
                        ? resolveAvatarUrl(c.otherUser?.avatarUrl || "")
                        : resolveAvatarUrl(c.avatarUrl || "");
                    return (
                      <button
                        key={c._id}
                        type="button"
                        className="uc-list-item"
                        onClick={() => {
                          openChat(c);
                          setPanelOpen(false);
                        }}
                      >
                        <div className="uc-list-avatar-wrap">
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={c.displayName || "Chat"}
                              className="uc-list-avatar"
                            />
                          ) : (
                            <div className="uc-list-avatar uc-list-fallback">
                              {String(c.displayName || "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                          {c.type === "direct" && c.otherUser?.isOnline ? (
                            <span className="uc-list-online-dot" />
                          ) : null}
                        </div>
                        <span className="uc-list-title">
                          {c.displayName || "Chat"}
                        </span>
                        {isChatUnread(c, user?.id) ? (
                          <span className="uc-unread-dot" />
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="uc-panel-section">
                <div className="uc-panel-section-title">Friends</div>
                {filteredFriends.length === 0 ? (
                  <div className="uc-empty">No results</div>
                ) : (
                  filteredFriends.map((f) => {
                    const avatarUrl = resolveAvatarUrl(f.user?.avatarUrl || "");
                    return (
                      <button
                        key={f.user?.id}
                        type="button"
                        className="uc-list-item"
                        onClick={() => {
                          openDirectWithFriend(f);
                          setPanelOpen(false);
                        }}
                      >
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={f.user?.username || "Friend"}
                            className="uc-list-avatar"
                          />
                        ) : (
                          <div className="uc-list-avatar uc-list-fallback">
                            {String(f.user?.username || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="uc-list-title">
                          {f.user?.username || "Friend"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="uc-mini-stack">
        {openChats.map((c) => {
          const expandedIndex = openChats.filter((x) => !x.isMinimized).findIndex(
            (x) => x.chatId === c.chatId
          );
          return (
          <MiniChatWindow
            key={c.chatId}
            chatId={c.chatId}
            title={c.title}
            avatarUrl={c.avatarUrl}
            isDirect={c.isDirect}
            peerId={c.peerId}
            peerName={c.peerName}
            peerAvatar={c.peerAvatar}
            accessToken={accessToken}
            user={user}
            isMinimized={c.isMinimized}
            expandedIndex={Math.max(0, expandedIndex)}
            isMinimizing={c.isMinimizing}
            isClosing={c.isClosing}
            onMinimize={() => {
              if (c.isMinimized) {
                setOpenChats((prev) =>
                  prev.map((x) =>
                    x.chatId === c.chatId
                      ? { ...x, isMinimized: false, isMinimizing: false }
                      : x
                  )
                );
                return;
              }
              setOpenChats((prev) =>
                prev.map((x) =>
                  x.chatId === c.chatId ? { ...x, isMinimizing: true } : x
                )
              );
              const existing = minimizeTimersRef.current.get(c.chatId);
              if (existing) clearTimeout(existing);
              const timer = setTimeout(() => {
                setOpenChats((prev) =>
                  prev.map((x) =>
                    x.chatId === c.chatId
                      ? { ...x, isMinimized: true, isMinimizing: false }
                      : x
                  )
                );
                minimizeTimersRef.current.delete(c.chatId);
              }, 160);
              minimizeTimersRef.current.set(c.chatId, timer);
            }}
            onClose={() => {
              setOpenChats((prev) =>
                prev.map((x) =>
                  x.chatId === c.chatId ? { ...x, isClosing: true } : x
                )
              );
              const existing = closeTimersRef.current.get(c.chatId);
              if (existing) clearTimeout(existing);
              const timer = setTimeout(() => {
                setOpenChats((prev) => prev.filter((x) => x.chatId !== c.chatId));
                closeTimersRef.current.delete(c.chatId);
              }, 180);
              closeTimersRef.current.set(c.chatId, timer);
            }}
          />
          );
        })}
      </div>
    </div>
  );
}
