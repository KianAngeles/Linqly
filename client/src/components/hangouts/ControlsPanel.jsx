import RadiusControls from "./RadiusControls";

export default function ControlsPanel({
  className = "",
  radiusMeters,
  onChangeRadius,
  shareAllEnabled,
  onToggleShareAll,
  shareAllLoading,
  shareAllNote,
  onShareAllNoteChange,
  shareAllError,
  showMyHangouts,
  onToggleMyHangouts,
  showJoinedList,
  onToggleJoinedList,
  joinedHangoutsCount,
  myHangoutsCount,
  showIcon,
  hiddenIcon,
  joinedListContent,
  footer = null,
}) {
  return (
    <div className={`map-controls-stack map-overlay ${className}`.trim()}>
      <RadiusControls radiusMeters={radiusMeters} onChangeRadius={onChangeRadius} />

      <div className="hangouts-location-toggle">
        <div className="fw-semibold small">Friends only</div>
        <div className="form-check form-switch m-0">
          <input
            className="form-check-input"
            type="checkbox"
            id="shareLocationAllToggle"
            checked={shareAllEnabled}
            onChange={onToggleShareAll}
            disabled={shareAllLoading}
          />
          <label className="form-check-label small" htmlFor="shareLocationAllToggle">
            Share with friends
          </label>
        </div>
        <div className="text-muted small">Friends can see you on the map</div>
        <div className="friends-only-note">
          <label className="form-label small mb-1" htmlFor="shareAllNote">
            Note
          </label>
          <input
            id="shareAllNote"
            className="form-control form-control-sm"
            maxLength={16}
            placeholder="On the way"
            value={shareAllNote}
            onChange={onShareAllNoteChange}
          />
        </div>
        {shareAllLoading && (
          <div className="text-muted small d-flex align-items-center gap-2">
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            Updating location...
          </div>
        )}
        {shareAllError && <div className="text-danger small">{shareAllError}</div>}
      </div>

      <div className="map-joined-panel">
        <div className="map-joined-header">
          <div className="map-joined-header-text">
            <div className="fw-semibold small">
              {showMyHangouts ? "Created hangouts" : "Joined hangouts"}
            </div>
            <div className="map-joined-subtitle text-muted small">
              <span>{showMyHangouts ? myHangoutsCount : joinedHangoutsCount} in this area</span>
              <button
                type="button"
                className="map-toggle-icon-btn"
                onClick={onToggleJoinedList}
                aria-label={showJoinedList ? "Hide list" : "Show list"}
                title={showJoinedList ? "Hide" : "Show"}
              >
                <img src={showJoinedList ? hiddenIcon : showIcon} alt="" />
              </button>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={onToggleMyHangouts}
          >
            {showMyHangouts ? "Joined" : "Created"}
          </button>
        </div>
        {showJoinedList && <div className="map-joined-body">{joinedListContent}</div>}
      </div>

      {footer}
    </div>
  );
}
