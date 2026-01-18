export default function ChatHeader({ username }) {
  return (
    <div className="d-flex justify-content-between align-items-center mb-2">
      <div className="fw-bold">Chat</div>
      <div className="d-flex align-items-center gap-2">
        <div className="text-muted small">You: {username}</div>
      </div>
    </div>
  );
}
