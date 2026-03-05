import ChatNotice from "./ChatNotice";

export default function ReplyPreviewBar({ replyingTo, onClose }) {
  if (!replyingTo) return null;

  return (
    <ChatNotice tone="muted" className="chat-reply-preview">
      <div className="chat-reply-preview-body">
        <div className="chat-reply-preview-label">
          Replying to {replyingTo.senderName}
        </div>
        <div className="chat-reply-preview-text">{replyingTo.text}</div>
      </div>
      <button
        className="chat-reply-preview-close"
        type="button"
        onClick={onClose}
        aria-label="Cancel reply"
      >
        x
      </button>
    </ChatNotice>
  );
}
