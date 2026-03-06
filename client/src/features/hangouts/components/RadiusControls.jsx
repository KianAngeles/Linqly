// src/components/hangouts/RadiusControls.jsx
export default function RadiusControls({ radiusMeters, onChangeRadius }) {
  return (
    <div className="radius-controls">
      <div className="fw-semibold small">
        Radius <span className="text-muted">{(radiusMeters / 1000).toFixed(1)} km</span>
      </div>
      <input
        type="range"
        min="1000"
        max="30000"
        step="500"
        value={radiusMeters}
        onChange={onChangeRadius}
      />
    </div>
  );
}
