// src/components/hangouts/HangoutModal.jsx
export default function HangoutModal({
  show,
  isEditing,
  formError,
  formState,
  onClose,
  onSubmit,
  onChangeField,
}) {
  if (!show) return null;

  return (
    <>
      <div className="modal-backdrop show" />
      <div className="modal d-block" tabIndex="-1" role="dialog">
        <div className="modal-dialog">
          <div className="modal-content">
            <form onSubmit={onSubmit}>
              <div className="modal-header">
                <h5 className="modal-title">
                  {isEditing ? "Edit Hangout" : "Create Hangout"}
                </h5>
                <button type="button" className="btn-close" onClick={onClose} />
              </div>
              <div className="modal-body">
                {formError && <div className="alert alert-danger">{formError}</div>}
                <div className="mb-3">
                  <label className="form-label">Title</label>
                  <input
                    className="form-control"
                    value={formState.title}
                    onChange={(e) => onChangeField("title", e.target.value)}
                    maxLength={60}
                    required
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={formState.description}
                    onChange={(e) => onChangeField("description", e.target.value)}
                    maxLength={280}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Starts At</label>
                  <input
                    type="datetime-local"
                    className="form-control"
                    value={formState.startsAt}
                    onChange={(e) => onChangeField("startsAt", e.target.value)}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label">Duration (minutes)</label>
                  <input
                    type="number"
                    min="15"
                    max="720"
                    className="form-control"
                    value={formState.durationMinutes}
                    onChange={(e) =>
                      onChangeField("durationMinutes", e.target.value)
                    }
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label">Visibility</label>
                  <select
                    className="form-select"
                    value={formState.visibility}
                    onChange={(e) => onChangeField("visibility", e.target.value)}
                  >
                    <option value="friends">Friends only</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <div className="mb-2">
                  <label className="form-label">Max Attendees (optional)</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    value={formState.maxAttendees}
                    onChange={(e) => onChangeField("maxAttendees", e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {isEditing ? "Save changes" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
