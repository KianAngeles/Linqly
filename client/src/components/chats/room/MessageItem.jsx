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
}) {
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
            {showAvatar && (
              <img
                src={senderAvatar}
                alt={message.sender?.username || "Avatar"}
                width={38}
                height={38}
                style={{ borderRadius: "50%", objectFit: "cover" }}
              />
            )}
          </div>
        )}
        <div className={`msg-wrap position-relative ${isMine ? "mine" : "theirs"}`}>
          {/* name */}
          {showName && (
            <div className="small text-muted mb-1">
              {isMine ? "You" : message.sender?.username || "Unknown"}
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
                />
                {isPending && <span className="msg-pending">Sending...</span>}
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
                {isPending && <span className="msg-pending">Sending...</span>}
              </div>
            ) : message.type === "audio" && message.fileUrl ? (
              <div className="msg-media-wrap">
                <audio className="msg-audio" controls src={message.fileUrl} />
                {isPending && <span className="msg-pending">Sending...</span>}
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
                {isPending && <span className="msg-pending">Sending...</span>}
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
            )}

            {/* hover actions */}
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
                    />
                  </button>
                </>
              )}
            </div>

            {/* emoji picker (only opens when emoji icon clicked) */}
            {showPicker && (
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

            {showMoreMenu && (canUnsend || canDeleteForMe) && (
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
      {reactions}
    </div>
  );
}
