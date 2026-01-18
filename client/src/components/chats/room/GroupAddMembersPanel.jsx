export default function GroupAddMembersPanel({ friends, onAddMember }) {
  return (
    <div className="mb-2 border rounded p-2">
      <div className="small text-muted mb-1">Add your friends to this group</div>
      {friends.length === 0 ? (
        <div className="text-muted small">No friends to add.</div>
      ) : (
        <div className="list-group" style={{ maxHeight: 160, overflowY: "auto" }}>
          {friends.map((f) => {
            const id = f.user?.id;
            const label = f.user?.username || "Unknown";
            return (
              <button
                key={id}
                type="button"
                className="list-group-item list-group-item-action"
                onClick={() => onAddMember(id)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
