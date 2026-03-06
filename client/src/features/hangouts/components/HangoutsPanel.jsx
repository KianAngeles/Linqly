import MapSearch from "./MapSearch";

export default function HangoutsPanel({
  searchRef,
  searchQuery,
  onChangeSearchQuery,
  onSubmitSearch,
  searchError,
  searchResults,
  onSelectResult,
  radiusMeters,
  showWithinList,
  onToggleWithinList,
  showIcon,
  hiddenIcon,
  listContent,
  showHint = true,
  className = "",
}) {
  return (
    <div className={`map-panel-stack map-overlay ${className}`.trim()}>
      {showHint && <div className="map-hint">Click on the map to drop a new hangout pin.</div>}

      <MapSearch
        searchRef={searchRef}
        searchQuery={searchQuery}
        onChangeSearchQuery={onChangeSearchQuery}
        onSubmitSearch={onSubmitSearch}
        searchError={searchError}
        searchResults={searchResults}
        onSelectResult={onSelectResult}
      />

      <div className="map-within-panel">
        <div className="map-within-header">
          <div className="map-within-meta">
            <div className="fw-semibold small">Within radius</div>
            <div className="text-muted small">{Math.round(radiusMeters / 1000)} km around you</div>
          </div>
          <button
            type="button"
            className="map-toggle-icon-btn"
            onClick={onToggleWithinList}
            aria-label={showWithinList ? "Hide list" : "Show list"}
            title={showWithinList ? "Hide" : "Show"}
          >
            <img src={showWithinList ? hiddenIcon : showIcon} alt="" />
          </button>
        </div>
        {showWithinList && <div className="map-within-body">{listContent}</div>}
      </div>
    </div>
  );
}
