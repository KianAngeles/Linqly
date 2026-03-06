export default function GroupNameModal({
  isOpen,
  isGroupChat,
  isHangoutChat,
  isGroupAdmin,
  groupNameDraft,
  onGroupNameDraftChange,
  onSave,
  onClose,
}) {
  if (!isOpen || !isGroupChat) return null;

  return (
    <div className="chat-modal-overlay">
      <div className="chat-modal">
        <div className="chat-modal-header">
          <div className="fw-semibold">Change group name</div>
          <button
            type="button"
            className="chat-modal-close"
            onClick={onClose}
          >
            x
          </button>
        </div>
        <div className="d-flex gap-2">
          <input
            className="form-control form-control-sm"
            value={groupNameDraft}
            onChange={onGroupNameDraftChange}
            disabled={isHangoutChat && !isGroupAdmin}
          />
          {(!isHangoutChat || isGroupAdmin) && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onSave}
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
