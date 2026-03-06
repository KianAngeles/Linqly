import MapGate from "./MapGate";

export default function MapCanvas({
  mapReady,
  locating,
  locationEnabled,
  mapContainerRef,
  onLoadMap,
  children,
}) {
  return (
    <div className={`hangouts-map ${locationEnabled === false ? "is-disabled" : ""}`}>
      {!mapReady && <MapGate onLoadMap={onLoadMap} />}

      <div ref={mapContainerRef} className="hangouts-map-canvas" />

      {mapReady && locating && (
        <div className="map-locating map-overlay">
          <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
          Locating...
        </div>
      )}

      {mapReady && locationEnabled === false && (
        <div className="map-location-disabled map-overlay">
          <div className="map-location-disabled-title">
            We can&apos;t access your location. Please enable location services to view the map.
          </div>
          <div className="map-location-disabled-subtitle">
            Enable location in your browser settings to continue.
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
