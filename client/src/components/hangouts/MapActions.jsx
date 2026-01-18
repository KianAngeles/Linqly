// src/components/hangouts/MapActions.jsx
export default function MapActions({ onRecenter, disabled }) {
  return (
    <div className="map-actions">
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        onClick={onRecenter}
        disabled={disabled}
      >
        Recenter
      </button>
    </div>
  );
}
