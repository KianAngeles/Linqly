export default function SharedOverlay({
  panel,
  selectedChatId,
  onClose,
  openSharedPanel,
  attachmentsData,
  sharedMediaGroups,
  sharedFileGroups,
  sharedLinkGroups,
  resolveAttachmentUrl,
  formatFileSize,
  onMediaClick,
}) {
  if (!panel || !selectedChatId) return null;

  return (
    <div className="chat-settings-search-overlay">
      <div className="chat-settings-find-header">
        <div className="chat-settings-find-title">
          {panel === "media"
            ? "Shared media"
            : panel === "files"
            ? "Shared files"
            : "Shared links"}
        </div>
        <button
          type="button"
          className="chat-settings-find-close"
          onClick={onClose}
        >
          x
        </button>
      </div>
      {(() => {
        const tabs = ["media", "files", "links"];
        const labels = {
          media: "Shared media",
          files: "Shared files",
          links: "Shared links",
        };
        const active = tabs.includes(panel) ? panel : "media";
        const activeIndex = tabs.indexOf(active);
        return (
          <div className="chat-shared-switch mb-2" data-active={active}>
            <div
              className="chat-shared-switch-indicator"
              style={{
                transform: `translateX(calc(${activeIndex} * (100% + var(--switch-gap))))`,
              }}
            />
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`chat-shared-switch-btn ${
                  active === tab ? "is-active" : ""
                }`}
                onClick={() => openSharedPanel(tab)}
              >
                {labels[tab]}
              </button>
            ))}
          </div>
        );
      })()}
      {panel === "media" && (
        <div className="chat-shared-body">
          {attachmentsData.media.loading && (
            <div className="text-muted small">Loading...</div>
          )}
          {!attachmentsData.media.loading &&
            sharedMediaGroups.length === 0 && (
              <div className="text-muted small">No media yet.</div>
            )}
          {sharedMediaGroups.map((group) => (
            <div key={group.label} className="chat-shared-group">
              <div className="chat-shared-title">{group.label}</div>
              <div className="chat-shared-grid">
                {group.items.map((item) => {
                  const url = resolveAttachmentUrl(item.url);
                  const isImage = item.type === "image";
                  return (
                    <div key={item.id} className="chat-shared-tile">
                      {isImage ? (
                        <img
                          src={url}
                          alt="Shared media"
                          onClick={() => onMediaClick?.(url)}
                        />
                      ) : (
                        <video
                          src={url}
                          muted
                          playsInline
                          onClick={() => onMediaClick?.(url)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {panel === "files" && (
        <div className="chat-shared-body">
          {attachmentsData.files.loading && (
            <div className="text-muted small">Loading...</div>
          )}
          {!attachmentsData.files.loading &&
            sharedFileGroups.length === 0 && (
              <div className="text-muted small">No files yet.</div>
            )}
          {sharedFileGroups.map((group) => (
            <div key={group.label} className="chat-shared-group">
              <div className="chat-shared-title">{group.label}</div>
              <div className="chat-shared-list">
                {group.items.map((item) => (
                  <div key={item.id} className="chat-shared-row">
                    <div className="chat-shared-row-main">
                      <a
                        href={resolveAttachmentUrl(item.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        className="chat-shared-link"
                      >
                        {item.fileName || "file"}
                      </a>
                      <div className="chat-shared-meta">
                        {formatFileSize(item.fileSize)}
                      </div>
                    </div>
                    <div className="chat-shared-date">
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {panel === "links" && (
        <div className="chat-shared-body">
          {attachmentsData.links.loading && (
            <div className="text-muted small">Loading...</div>
          )}
          {!attachmentsData.links.loading &&
            sharedLinkGroups.length === 0 && (
              <div className="text-muted small">No links yet.</div>
            )}
          {sharedLinkGroups.map((group) => (
            <div key={group.label} className="chat-shared-group">
              <div className="chat-shared-title">{group.label}</div>
              <div className="chat-shared-list">
                {group.items.map((item) => (
                  <div key={`${item.id}-${item.url}`} className="chat-shared-row">
                    <div className="chat-shared-row-main">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="chat-shared-link"
                      >
                        {item.url}
                      </a>
                    </div>
                    <div className="chat-shared-date">
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
