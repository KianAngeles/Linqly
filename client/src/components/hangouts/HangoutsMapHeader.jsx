// src/components/hangouts/HangoutsMapHeader.jsx
export default function HangoutsMapHeader({ user, onBack, onLogout }) {
  return (
    <div className="d-flex justify-content-between align-items-center mb-3">
      <div>
        <div className="fw-bold">Linqly Hangouts</div>
        <div className="text-muted small">Welcome, {user?.username}</div>
      </div>
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-outline-danger" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}
