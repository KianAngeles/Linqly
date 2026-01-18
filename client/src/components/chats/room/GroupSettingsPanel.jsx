export default function GroupSettingsPanel({
  groupSettings,
  isGroupAdmin,
  groupAvatarUploading,
  onUploadAvatar,
  groupNameDraft,
  onGroupNameDraftChange,
  onSaveGroupName,
  onRemoveMember,
  onApproveJoin,
  onRejectJoin,
  API_BASE,
  currentUserId,
  allowAddMembers,
  showAddMembers,
  onToggleAddMembers,
  onLeaveGroup,
  leaveLabel,
  editIcon,
}) {
  const groupName = groupSettings.name || "Group chat";
  const avatarSrc = groupSettings.avatarUrl
    ? groupSettings.avatarUrl.startsWith("http://") ||
      groupSettings.avatarUrl.startsWith("https://")
      ? groupSettings.avatarUrl
      : `${API_BASE}${groupSettings.avatarUrl}`
    : "";
  return (
    <div className="border rounded p-3">
      <div className="chat-settings-header">
        <div className="chat-settings-avatar-wrap">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt="Group avatar"
              className="chat-settings-avatar"
            />
          ) : (
            <div className="chat-settings-avatar chat-settings-avatar-fallback">
              {groupName.trim().charAt(0).toUpperCase()}
            </div>
          )}
          {isGroupAdmin && (
            <>
              <label
                htmlFor="group-avatar-upload"
                className="chat-settings-avatar-edit"
                aria-label="Update group avatar"
              >
                <img src={editIcon} alt="Edit" />
              </label>
              <input
                id="group-avatar-upload"
                type="file"
                accept="image/*"
                className="chat-settings-avatar-input"
                disabled={groupAvatarUploading}
                onChange={(e) => onUploadAvatar(e.target.files?.[0])}
              />
            </>
          )}
        </div>
        <div className="chat-settings-name">{groupName}</div>
      </div>

      <div className="mb-3">
        <label className="form-label">Group name</label>
        <div className="d-flex gap-2">
          <input
            className="form-control form-control-sm"
            value={groupNameDraft}
            onChange={onGroupNameDraftChange}
            disabled={!isGroupAdmin}
          />
          {isGroupAdmin && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onSaveGroupName}
            >
              Save
            </button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <div className="fw-semibold mb-2">Members</div>
        <div className="list-group">
          {(groupSettings.members || []).map((m) => {
            const isCreator = String(m.id) === String(groupSettings.creator?.id);
            const canRemove =
              isGroupAdmin && !isCreator && String(m.id) !== String(currentUserId);

            return (
              <div
                key={m.id}
                className="list-group-item d-flex justify-content-between align-items-center"
              >
                <div className="d-flex align-items-center gap-2">
                  {m.avatarUrl && (
                    <img
                      src={
                        m.avatarUrl.startsWith("http://") ||
                        m.avatarUrl.startsWith("https://")
                          ? m.avatarUrl
                          : `${API_BASE}${m.avatarUrl}`
                      }
                      alt={m.username}
                      width={28}
                      height={28}
                      style={{ borderRadius: "50%", objectFit: "cover" }}
                    />
                  )}
                  <div>
                    <div className="fw-semibold">{m.username}</div>
                    {isCreator && <div className="small text-muted">Creator</div>}
                  </div>
                </div>
                {canRemove && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => onRemoveMember(m.id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {allowAddMembers && (
        <button
          type="button"
          className="btn btn-outline-primary btn-sm w-100 mb-2"
          onClick={onToggleAddMembers}
        >
          {showAddMembers ? "Hide add members" : "Add members"}
        </button>
      )}

      <button
        type="button"
        className="btn btn-outline-danger btn-sm w-100 mb-3"
        onClick={onLeaveGroup}
      >
        {leaveLabel}
      </button>

      {isGroupAdmin && (groupSettings.pendingJoinRequests || []).length > 0 && (
        <div>
          <div className="fw-semibold mb-2">Join requests</div>
          <div className="list-group">
            {groupSettings.pendingJoinRequests.map((r) => (
              <div
                key={r.user.id}
                className="list-group-item d-flex justify-content-between align-items-center"
              >
                <div className="d-flex align-items-center gap-2">
                  {r.user.avatarUrl && (
                    <img
                      src={
                        r.user.avatarUrl.startsWith("http://") ||
                        r.user.avatarUrl.startsWith("https://")
                          ? r.user.avatarUrl
                          : `${API_BASE}${r.user.avatarUrl}`
                      }
                      alt={r.user.username}
                      width={28}
                      height={28}
                      style={{ borderRadius: "50%", objectFit: "cover" }}
                    />
                  )}
                  <div className="fw-semibold">{r.user.username}</div>
                </div>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={() => onApproveJoin(r.user.id)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => onRejectJoin(r.user.id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
