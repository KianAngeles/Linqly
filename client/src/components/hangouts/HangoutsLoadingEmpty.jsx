// src/components/hangouts/HangoutsLoadingEmpty.jsx
export default function HangoutsLoadingEmpty({ isLoading, mapReady, feedLength }) {
  return (
    <>
      {isLoading && (
        <div className="map-loading badge text-bg-light">Loading hangouts...</div>
      )}
      {!isLoading && mapReady && feedLength === 0 && (
        <div className="map-empty">
          No hangouts in this area yet. Try increasing the radius or searching.
        </div>
      )}
    </>
  );
}
