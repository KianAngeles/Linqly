import { useEffect, useRef, useState } from "react";
import CallLogMessage from "./CallLogMessage";
import GroupOngoingCallMessage from "../../calls/GroupOngoingCallMessage";
import GroupCallEndedMessage from "../../calls/GroupCallEndedMessage";
import { GROUP_CALLS_ENABLED } from "../../../constants/featureFlags";

export default function MessageItem({
  message,
  isMine,
  showName,
  showAvatar,
  senderAvatar,
  sameSenderPrev,
  onReplyToggle,
  onReactToggle,
  onMoreToggle,
  onUnsend,
  onDeleteForMe,
  onDownloadFile,
  showPicker,
  showMoreMenu,
  canUnsend,
  canDeleteForMe,
  emojiOptions,
  reactedEmojis,
  onEmojiPick,
  renderMessageText,
  replyIcon,
  reactIcon,
  moreIcon,
  reactions,
  seenIndicator,
  onImageClick,
  onCallBack,
  ongoingGroupCallState,
  onJoinGroupCall,
}) {
  const [showTimestamp, setShowTimestamp] = useState(false);
  const hoverTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const formatBytes = (bytes) => {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const idx = Math.min(
      units.length - 1,
      Math.floor(Math.log(bytes) / Math.log(1024))
    );
    const value = bytes / Math.pow(1024, idx);
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  };
  const isPending = Boolean(message.pending);
  const isCallLog = message.type === "call_log";
  const timestampSource = message.createdAt || message.sentAt || message.updatedAt;
  const formattedTimestamp = timestampSource
    ? new Date(timestampSource).toLocaleString()
    : "";
  const isEmojiOnlyText = (() => {
    const text = String(message.text || "").trim();
    if (!text) return false;
    const emojiLike = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}\uFE0F\u200D\s]+$/u;
    if (!emojiLike.test(text)) return false;
    return /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}]/u.test(text);
  })();

  const handleMouseEnter = () => {
    if (!formattedTimestamp) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setShowTimestamp(true);
    }, 1000);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setShowTimestamp(false);
  };

  return (
    <div>
      <div
        className={`message-row ${
          sameSenderPrev ? "msg-continue" : "msg-start"
        } d-flex align-items-end ${
          isMine ? "justify-content-end" : "justify-content-start"
        }`}
      >
        {!isMine && (
          <div className="me-2 d-flex align-items-end" style={{ width: 38 }}>
            {showAvatar &&
              (senderAvatar ? (
                <img
                  src={senderAvatar}
                  alt={message.displayName || message.sender?.username || "Avatar"}
                  width={38}
                  height={38}
                  className="msg-avatar-img"
                  style={{ borderRadius: "50%", objectFit: "cover" }}
                />
              ) : (
                <div className="msg-avatar-fallback">
                  {String(message.displayName || message.sender?.username || "?")
                    .charAt(0)
                    .toUpperCase()}
                </div>
              ))}
          </div>
        )}
        <div
          className={`msg-wrap position-relative ${isMine ? "mine" : "theirs"}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* name */}
          {showName && (
            <div className="small text-muted mb-1">
              {isMine ? "You" : message.displayName || message.sender?.username || "Unknown"}
            </div>
          )}

          {/* Reply preview */}
          {message.replyPreview?.text && (
            <div className="small text-muted border-start ps-2 mb-1">
              Replying to <b>{message.replyPreview.senderUsername}</b>: {" "}
              {message.replyPreview.text}
            </div>
          )}

          <div className="msg-bubble-wrap">
            {message.type === "image" && message.imageUrl ? (
              <div className="msg-media-wrap">
                <img
                  src={message.imageUrl}
                  alt="Shared"
                  className="msg-image"
                  onClick={() => onImageClick?.(message)}
                />
              </div>
            ) : message.type === "video" && message.fileUrl ? (
              <div className="msg-media-wrap">
                <video className="msg-video" controls preload="metadata">
                  <source
                    src={message.fileUrl}
                    type={message.fileType || "video/mp4"}
                  />
                  Your browser does not support the video tag.
                </video>
              </div>
            ) : message.type === "audio" && message.fileUrl ? (
              <div className="msg-media-wrap">
                <audio className="msg-audio" controls src={message.fileUrl} />
              </div>
            ) : message.type === "file" && message.fileUrl ? (
              <div className="msg-media-wrap">
                <button
                  type="button"
                  className="msg-file"
                  onClick={onDownloadFile}
                  disabled={isPending}
                >
                  <span className="msg-file-name">
                    {message.fileName || "File"}
                  </span>
                  <span className="msg-file-size">
                    {formatBytes(message.fileSize || 0)}
                  </span>
                </button>
              </div>
            ) : message.type === "text" ? (
              isEmojiOnlyText && !message.isDeletedMessage ? (
                <div className="msg-emoji-only">
                  {renderMessageText(message)}
                </div>
              ) : (
                <div
                  className={`msg-bubble ${
                    message.isDeletedMessage
                      ? "msg-bubble-deleted"
                      : isMine
                      ? "bg-primary text-white"
                      : "msg-bubble-other"
                  }`}
                >
                  {renderMessageText(message)}
                </div>
              )
            ) : message.type === "call_log" ? (
              message.meta?.scope === "group" && !GROUP_CALLS_ENABLED ? (
                <div
                  className={`msg-bubble ${
                    isMine ? "bg-primary text-white" : "msg-bubble-other"
                  }`}
                >
                  {renderMessageText(message)}
                </div>
              ) : message.meta?.scope === "group" && message.meta?.status === "ongoing" ? (
                <GroupOngoingCallMessage
                  startedByName={
                    ongoingGroupCallState?.startedByName ||
                    message.meta?.startedByName ||
                    "Unknown"
                  }
                  participantCount={
                    ongoingGroupCallState?.participantCount ??
                    message.meta?.participantCount ??
                    0
                  }
                  participantNames={
                    ongoingGroupCallState?.participants?.map((p) => p.name).filter(Boolean) ||
                    message.meta?.participantNames ||
                    []
                  }
                  createdAt={message.createdAt}
                  onJoin={onJoinGroupCall}
                  canJoin={
                    Boolean(onJoinGroupCall) &&
                    Boolean(ongoingGroupCallState?.callId) &&
                    String(ongoingGroupCallState.callId) ===
                      String(message.meta?.callId || "")
                  }
                  isRinging={
                    Boolean(ongoingGroupCallState?.callId) &&
                    String(ongoingGroupCallState.callId) ===
                      String(message.meta?.callId || "") &&
                    !(ongoingGroupCallState?.joinedUserIds || []).includes(
                      String(ongoingGroupCallState?.currentUserId || "")
                    )
                  }
                />
              ) : message.meta?.scope === "group" && message.meta?.status === "ended" ? (
                <GroupCallEndedMessage
                  endedByName={message.meta?.endedByName || "Unknown"}
                  endedAt={message.meta?.endedAt || message.createdAt}
                  durationSec={message.meta?.durationSec || 0}
                />
              ) : (
                <CallLogMessage
                  status={message.meta?.callStatus}
                  callType={message.meta?.callType || "audio"}
                  durationSec={message.meta?.durationSec || 0}
                  createdAt={message.createdAt}
                  onCallBack={onCallBack}
                />
              )
            ) : (
              <div
                className={`msg-bubble ${
                  message.isDeletedMessage
                    ? "msg-bubble-deleted"
                    : isMine
                    ? "bg-primary text-white"
                    : "msg-bubble-other"
                }`}
              >
                {renderMessageText(message)}
              </div>
            )}
            {isPending && (
              <div className="msg-pending-label">Sending...</div>
            )}
            {formattedTimestamp && showTimestamp && (
              <div
                className={`msg-timestamp-bubble ${
                  isMine ? "msg-timestamp-right" : "msg-timestamp-left"
                }`}
              >
                {formattedTimestamp}
              </div>
            )}
            {reactions && (
              <div className={`msg-reaction-corner ${isMine ? "mine" : "theirs"}`}>
                {reactions}
              </div>
            )}

            {!isCallLog && (
              <div
                className={`msg-actions ${isMine ? "actions-left" : "actions-right"}`}
              >
                {isMine ? (
                  <>
                    <button
                      type="button"
                      className="msg-icon-btn"
                      title="More"
                      data-more-toggle="true"
                      onClick={onMoreToggle}
                    >
                      <img
                        src={moreIcon}
                        alt="More"
                        width={16}
                        height={16}
                        draggable="false"
                        className="msg-more-icon"
                      />
                    </button>
                    <button
                      type="button"
                      className="msg-icon-btn"
                      title="React"
                      data-react-toggle="true"
                      onClick={onReactToggle}
                    >
                      <img
                        src={reactIcon}
                        alt="React"
                        width={16}
                        height={16}
                        draggable="false"
                      />
                    </button>
                    <button
                      type="button"
                      className="msg-icon-btn"
                      title="Reply"
                      onClick={onReplyToggle}
                    >
                      <img
                        src={replyIcon}
                        alt="Reply"
                        width={16}
                        height={16}
                        draggable="false"
                      />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="msg-icon-btn"
                      title="Reply"
                      onClick={onReplyToggle}
                    >
                      <img
                        src={replyIcon}
                        alt="Reply"
                        width={16}
                        height={16}
                        draggable="false"
                      />
                    </button>
                    <button
                      type="button"
                      className="msg-icon-btn"
                      title="React"
                      data-react-toggle="true"
                      onClick={onReactToggle}
                    >
                      <img
                        src={reactIcon}
                        alt="React"
                        width={16}
                        height={16}
                        draggable="false"
                      />
                    </button>
                    <button
                      type="button"
                      className="msg-icon-btn"
                      title="More"
                      data-more-toggle="true"
                      onClick={onMoreToggle}
                    >
                      <img
                        src={moreIcon}
                        alt="More"
                        width={16}
                        height={16}
                        draggable="false"
                        className="msg-more-icon"
                      />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* emoji picker (only opens when emoji icon clicked) */}
            {showPicker && !isCallLog && (
              <div
                className={`msg-react-picker ${
                  isMine ? "picker-left" : "picker-right"
                }`}
              >
                {emojiOptions.map((emo) => {
                  const myReacted = reactedEmojis.has(emo);

                  return (
                    <button
                      key={emo}
                      type="button"
                      className={`msg-react-btn ${myReacted ? "reacted" : ""}`}
                      onClick={() => onEmojiPick(emo)}
                    >
                      {emo}
                    </button>
                  );
                })}
              </div>
            )}

            {showMoreMenu && !isCallLog && (canUnsend || canDeleteForMe) && (
              <div className={`msg-more-menu ${isMine ? "menu-left" : "menu-right"}`}>
                {canUnsend && (
                  <button type="button" onClick={onUnsend}>
                    Unsend
                  </button>
                )}
                {canDeleteForMe && (
                  <button type="button" onClick={onDeleteForMe}>
                    Delete for me
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {seenIndicator && (
        <div className={`msg-seen ${isMine ? "msg-seen-mine" : "msg-seen-theirs"}`}>
          {seenIndicator}
        </div>
      )}
    </div>
  );
}
