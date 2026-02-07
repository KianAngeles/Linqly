import { useMemo, useState } from "react";

export default function GroupAddMembersPanel({
  friends,
  onAddMember,
  existingMembers = [],
  API_BASE,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const query = searchQuery.trim().toLowerCase();
  const friendsList = useMemo(
    () =>
      (friends || [])
        .map((f) => f?.user || f)
        .filter(Boolean)
        .map((f) => ({
          id: String(f.id || f._id || ""),
          username: f.username || "Unknown",
          avatarUrl: f.avatarUrl || "",
        }))
        .filter((f) => f.id),
    [friends]
  );
  const existingList = useMemo(
    () =>
      (existingMembers || [])
        .map((m) => m?.user || m)
        .filter(Boolean)
        .map((m) => ({
          id: String(m.id || m._id || ""),
          username: m.username || "Unknown",
          avatarUrl: m.avatarUrl || "",
        }))
        .filter((m) => m.id),
    [existingMembers]
  );
  const existingIds = useMemo(
    () => new Set(existingList.map((m) => m.id)),
    [existingList]
  );
  const friendsById = useMemo(() => {
    const map = new Map();
    friendsList.forEach((f) => map.set(f.id, f));
    return map;
  }, [friendsList]);
  const matchesQuery = (label) => {
    if (!query) return true;
    return String(label || "").toLowerCase().includes(query);
  };
  const selectedMembers = useMemo(
    () =>
      Array.from(selectedIds)
        .map((id) => friendsById.get(id))
        .filter(Boolean),
    [friendsById, selectedIds]
  );
  const filteredExisting = useMemo(
    () => existingList.filter((m) => matchesQuery(m.username)),
    [existingList, query]
  );
  const suggestedFriends = useMemo(
    () =>
      friendsList.filter(
        (f) => !existingIds.has(f.id) && matchesQuery(f.username)
      ),
    [friendsList, existingIds, query]
  );

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

  const resolveAvatarUrl = (rawUrl) => {
    if (!rawUrl) return "";
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl;
    return `${API_BASE}${rawUrl}`;
  };

  return (
    <div className="chat-add-members-panel">
      <div className="chat-add-member-search">
        <input
          type="text"
          placeholder="Search friends"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="chat-add-members-section">
        <div className="chat-add-members-section-title">Selected</div>
        {selectedMembers.length === 0 ? (
          <div className="text-muted small">No selected members yet.</div>
        ) : (
          <div className="chat-add-member-chips">
            {selectedMembers.map((m) => {
              const avatarUrl = resolveAvatarUrl(m.avatarUrl);
              return (
                <div key={m.id} className="chat-add-member-chip">
                  <div className="chat-add-member-chip-avatar-wrap">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={m.username}
                        className="chat-add-member-chip-avatar"
                      />
                    ) : (
                      <div className="chat-add-member-chip-avatar chat-add-member-avatar-fallback">
                        {String(m.username || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <button
                      type="button"
                      className="chat-add-member-chip-remove"
                      onClick={() => toggleSelected(m.id)}
                      aria-label={`Remove ${m.username}`}
                      title="Remove"
                    >
                      x
                    </button>
                  </div>
                  <span className="chat-add-member-chip-label">{m.username}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="chat-add-members-scroll">
        <div className="chat-add-members-section">
          <div className="chat-add-members-section-title">Added Members</div>
          {filteredExisting.length === 0 ? (
            <div className="text-muted small">No added members found.</div>
          ) : (
            <div className="list-group">
              {filteredExisting.map((m) => {
                const avatarUrl = resolveAvatarUrl(m.avatarUrl);
                return (
                  <div key={m.id} className="list-group-item chat-add-member-row">
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="d-flex align-items-center gap-2">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={m.username}
                            className="chat-add-member-avatar"
                          />
                        ) : (
                          <div className="chat-add-member-avatar chat-add-member-avatar-fallback">
                            {String(m.username || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span>{m.username}</span>
                      </div>
                      <span className="chat-add-member-added">Added</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="chat-add-members-section">
          <div className="chat-add-members-section-title">Suggested Friends</div>
          {suggestedFriends.length === 0 ? (
            <div className="text-muted small">No friends found.</div>
          ) : (
            <div className="list-group">
              {suggestedFriends.map((f) => {
                const avatarUrl = resolveAvatarUrl(f.avatarUrl);
                const isSelected = selectedIds.has(f.id);
                return (
                  <div
                    key={f.id}
                    className="list-group-item chat-add-member-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleSelected(f.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSelected(f.id);
                      }
                    }}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="d-flex align-items-center gap-2">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={f.username}
                            className="chat-add-member-avatar"
                          />
                        ) : (
                          <div className="chat-add-member-avatar chat-add-member-avatar-fallback">
                            {String(f.username || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span>{f.username}</span>
                      </div>
                      <button
                        type="button"
                        className={`chat-add-member-toggle ${
                          isSelected ? "is-selected" : ""
                        }`}
                        aria-pressed={isSelected}
                        title={isSelected ? "Remove" : "Add"}
                      >
                        <span className="visually-hidden">Add</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm w-100 mt-3"
        onClick={handleAdd}
        disabled={selectedIds.size === 0}
      >
        Add people
      </button>
    </div>
  );
}
