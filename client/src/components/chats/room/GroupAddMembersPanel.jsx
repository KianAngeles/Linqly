import { useMemo, useState } from "react";

export default function GroupAddMembersPanel({
  friends,
  onAddMember,
  existingMemberIds = new Set(),
  API_BASE,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selectableFriends = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return friends.filter((f) => {
      const id = String(f.user?.id || "");
      if (existingMemberIds.has(id)) return false;
      if (!query) return true;
      const name = String(f.user?.username || "").toLowerCase();
      return name.includes(query);
    });
  }, [friends, existingMemberIds, searchQuery]);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    if (selectedIds.size === 0) return;
    onAddMember(Array.from(selectedIds));
  };

  return (
    <div className="chat-add-members-panel">
      <div className="chat-add-member-search">
        <input
          type="text"
          placeholder="Search friends..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="list-group" style={{ maxHeight: 260, overflowY: "auto" }}>
        {selectableFriends.length === 0 ? (
          <div className="text-muted small px-2 py-2">
            {friends.length === 0 ? "No friends to add." : "No matches found."}
          </div>
        ) : (
          selectableFriends.map((f) => {
            const id = f.user?.id;
            const label = f.user?.username || "Unknown";
            const avatarUrl = f.user?.avatarUrl
              ? f.user.avatarUrl.startsWith("http://") ||
                f.user.avatarUrl.startsWith("https://")
                ? f.user.avatarUrl
                : `${API_BASE}${f.user.avatarUrl}`
              : "";
            const isSelected = selectedIds.has(String(id));

            return (
              <button
                key={id}
                type="button"
                className="list-group-item list-group-item-action chat-add-member-row"
                onClick={() => toggleSelected(String(id))}
              >
                <div className="d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center gap-2">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={label}
                        className="chat-add-member-avatar"
                      />
                    ) : (
                      <div className="chat-add-member-avatar chat-add-member-avatar-fallback">
                        {String(label).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span>{label}</span>
                  </div>
                  <span
                    className={`chat-add-member-check ${
                      isSelected ? "is-selected" : ""
                    }`}
                  />
                </div>
              </button>
            );
          })
        )}
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm w-100 mt-3"
        onClick={handleAdd}
        disabled={selectedIds.size === 0 || selectableFriends.length === 0}
      >
        Add people
      </button>
    </div>
  );
}
