// src/components/hangouts/MapSearch.jsx
export default function MapSearch({
  searchRef,
  searchQuery,
  onChangeSearchQuery,
  onSubmitSearch,
  searchError,
  searchResults,
  onSelectResult,
}) {
  return (
    <div className="map-search" ref={searchRef}>
      <form onSubmit={onSubmitSearch} className="d-flex gap-2">
        <input
          className="form-control form-control-sm"
          placeholder="Search a place..."
          value={searchQuery}
          onChange={onChangeSearchQuery}
        />
      </form>
      {searchError && <div className="text-danger small mt-1">{searchError}</div>}
      {searchResults.length > 0 && (
        <div className="list-group mt-2">
          {searchResults.map((f) => (
            <button
              key={f.id}
              type="button"
              className="list-group-item list-group-item-action small"
              onClick={() => onSelectResult(f)}
            >
              {f.place_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
