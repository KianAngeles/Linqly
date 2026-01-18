// src/components/hangouts/MapGate.jsx
export default function MapGate({ onLoadMap }) {
  return (
    <div className="map-gate">
      <div className="fw-bold mb-1">Map is paused</div>
      <div className="text-muted small mb-3">
        Click to load the map only when you need it.
      </div>
      <button type="button" className="btn btn-primary" onClick={onLoadMap}>
        Load map
      </button>
    </div>
  );
}
