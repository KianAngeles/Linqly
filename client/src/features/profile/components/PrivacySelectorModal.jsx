import { useEffect, useState } from "react";

const OPTIONS = [
  { value: "public", label: "Public" },
  { value: "friends", label: "Friends" },
  { value: "only_me", label: "Only me" },
];

export default function PrivacySelectorModal({ isOpen, title, value, onClose, onSave }) {
  const [selected, setSelected] = useState(value || "public");

  useEffect(() => {
    if (!isOpen) return;
    setSelected(value || "public");
  }, [isOpen, value]);

  if (!isOpen) return null;

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal profile-closed-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal-header">
          <div className="fw-semibold">{title}</div>
          <button type="button" className="btn btn-sm btn-link" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="profile-modal-body">
          <div className="profile-privacy-toggle">
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`profile-privacy-option ${
                  selected === opt.value ? "is-active" : ""
                }`}
                onClick={() => setSelected(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="profile-modal-footer">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-dark" onClick={() => onSave(selected)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
