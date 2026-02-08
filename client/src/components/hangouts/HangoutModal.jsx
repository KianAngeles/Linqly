// src/components/hangouts/HangoutModal.jsx
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";

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
        <div className="modal-dialog modal-dialog-centered">
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
                <div className="row g-2 mb-2">
                  <div className="col-12 col-md-7">
                    <label className="form-label">Starts At</label>
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                      <DateTimePicker
                        value={formState.startsAt || null}
                        onChange={(newValue) => onChangeField("startsAt", newValue)}
                        ampm
                        minutesStep={5}
                        disablePast={!isEditing}
                        format="MM/DD/YYYY hh:mm A"
                        enableAccessibleFieldDOMStructure={false}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            size: "small",
                          },
                          field: { clearable: true },
                          actionBar: { actions: ["clear", "accept"] },
                          popper: { placement: "bottom-start" },
                        }}
                      />
                    </LocalizationProvider>
                  </div>
                  <div className="col-12 col-md-5">
                    <label className="form-label">Duration (minutes)</label>
                    <input
                      type="number"
                      min="15"
                      max="720"
                      step="5"
                      className="form-control"
                      value={formState.durationMinutes}
                      onChange={(e) =>
                        onChangeField("durationMinutes", e.target.value)
                      }
                      required
                    />
                  </div>
                </div>
                <div className="row g-2 mb-2">
                  <div className="col-12 col-md-6">
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
                  <div className="col-12 col-md-6">
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
                <div className="mt-2">
                  <div className="form-label mb-1">Hangout Settings</div>
                  <div className="form-check form-switch d-flex align-items-center gap-2 mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="anyone-can-join-toggle"
                      checked={formState.anyoneCanJoin !== false}
                      onChange={(e) =>
                        onChangeField("anyoneCanJoin", e.target.checked)
                      }
                    />
                    <div className="text-muted small">
                      <div className="fw-semibold text-dark">
                        Anyone can join without approval
                      </div>
                      <div>
                        {formState.anyoneCanJoin !== false
                          ? "Anyone can join immediately."
                          : "Users must request to join. You approve or decline requests."}
                      </div>
                    </div>
                  </div>
                  {!isEditing && (
                    <div className="form-check form-switch d-flex align-items-center gap-2">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="create-group-chat-toggle"
                        checked={formState.createGroupChat !== false}
                        onChange={(e) =>
                          onChangeField("createGroupChat", e.target.checked)
                        }
                      />
                      <span className="text-muted small">
                        Automatically creates a group chat and adds all participating members.
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary hangout-cancel-btn"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary hangout-create-btn">
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
