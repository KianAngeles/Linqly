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
  headerActions,
  showMembersSection = true,
  renderMembers,
  accordionSections,
}) {
  const groupName = groupSettings.name || "Group chat";
  const avatarSrc = groupSettings.avatarUrl
    ? groupSettings.avatarUrl.startsWith("http://") ||
      groupSettings.avatarUrl.startsWith("https://")
      ? groupSettings.avatarUrl
      : `${API_BASE}${groupSettings.avatarUrl}`
    : "";
  return (
    <div className="chat-settings-group-panel">
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
                onChange={(e) => {
                  onUploadAvatar(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
        <div className="chat-settings-name">{groupName}</div>
        {headerActions}
      </div>

      {accordionSections}

      {showMembersSection && renderMembers}

      <div className="chat-settings-footer">
        <button
          type="button"
          className="btn btn-outline-danger btn-sm w-100 mb-3"
          onClick={onLeaveGroup}
        >
          {leaveLabel}
        </button>
      </div>

    </div>
  );
}
