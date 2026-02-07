import { useMemo, useState } from "react";

export default function EditInterestsModal({
  isOpen,
  onClose,
  options,
  selected,
  onChange,
  onSave,
}) {
  const [query, setQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, query]);

  if (!isOpen) return null;

  const toggleInterest = (item) => {
    if (selected.includes(item)) {
      onChange(selected.filter((i) => i !== item));
      return;
    }
    onChange([...selected, item]);
  };

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="profile-modal-header">
          <div className="fw-semibold">Edit Interests</div>
          <button type="button" className="btn btn-sm btn-link" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="profile-modal-body">
          <div className="profile-modal-row">
            <label className="form-label">Search interests</label>
            <input
              type="text"
              className="form-control"
              placeholder="Search interests"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="profile-interests-options">
            {filteredOptions.map((option) => {
              const isSelected = selected.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  className={`profile-interest-option ${
                    isSelected ? "is-selected" : ""
                  }`}
                  onClick={() => toggleInterest(option)}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <div className="profile-modal-row">
            <div className="d-flex align-items-center justify-content-between">
              <div className="fw-semibold">Selected</div>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => onChange([])}
                disabled={!selected.length}
              >
                Clear all
              </button>
            </div>
            {selected.length ? (
              <div className="profile-tag-list">
                {selected.map((tag) => (
                  <span key={tag} className="profile-tag is-removable">
                    {tag}
                    <button
                      type="button"
                      className="profile-tag-remove"
                      aria-label={`Remove ${tag}`}
                      onClick={() => onChange(selected.filter((i) => i !== tag))}
                    />
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-muted small">No interests selected.</div>
            )}
          </div>
        </div>

        <div className="profile-modal-footer">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => onSave(selected)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
