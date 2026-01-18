export default function ReplyPreviewBar({ replyingTo, onClose }) {
  if (!replyingTo) return null;

  return (
    <div className="alert alert-light py-2 d-flex justify-content-between align-items-center">
      <div>
        <div className="small text-muted">Replying to {replyingTo.senderName}</div>
        <div className="small">{replyingTo.text}</div>
      </div>
      <button
        className="btn btn-sm btn-outline-secondary"
        type="button"
        onClick={onClose}
      >
        X
      </button>
    </div>
  );
}
