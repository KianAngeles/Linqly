export default function NicknamesModal({
  isOpen,
  selectedChatId,
  nicknameMembers,
  nicknamesMap,
  editingUserId,
  nicknameDraft,
  setEditingUserId,
  setNicknameDraft,
  onSaveNickname,
  onClose,
  resolveAvatarUrl,
  editIcon,
}) {
  if (!isOpen || !selectedChatId) return null;

  return (
    <div
      className="chat-modal-overlay"
      onClick={() => {
        onClose();
        setEditingUserId(null);
        setNicknameDraft("");
      }}
    >
      <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chat-modal-header">
          <div className="fw-semibold">Edit nicknames</div>
          <button
            type="button"
            className="chat-modal-close"
            onClick={() => {
              onClose();
              setEditingUserId(null);
              setNicknameDraft("");
            }}
          >
            x
          </button>
        </div>
        <div className="chat-nicknames-list">
          {nicknameMembers.map((member) => {
            const currentNick = String(nicknamesMap[member.id] || "");
            const isEditing = String(editingUserId) === String(member.id);
            return (
              <div key={member.id} className="chat-nickname-row">
                {member.avatarUrl ? (
                  <img
                    src={resolveAvatarUrl(member.avatarUrl)}
                    alt={member.username}
                    className="chat-settings-member-avatar"
                  />
                ) : (
                  <div className="chat-settings-member-fallback">
                    {String(member.username || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="chat-nickname-main">
                  <div className="chat-nickname-username">
                    {member.username || "Unknown"}
                  </div>
                  {isEditing ? (
                    <div className="chat-nickname-edit">
                      <input
                        className="form-control form-control-sm"
                        value={nicknameDraft}
                        onChange={(e) => setNicknameDraft(e.target.value)}
                      />
                      <div className="chat-nickname-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() =>
                            onSaveNickname(member.id, nicknameDraft)
                          }
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => {
                            setEditingUserId(null);
                            setNicknameDraft("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="chat-nickname-value">
                      {currentNick ? currentNick : "Set nickname"}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="chat-nickname-edit-btn"
                  onClick={() => {
                    setEditingUserId(member.id);
                    setNicknameDraft(currentNick);
                  }}
                  title="Edit nickname"
                >
                  <img src={editIcon} alt="Edit" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
