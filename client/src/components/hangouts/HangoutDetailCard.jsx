// src/components/hangouts/HangoutDetailCard.jsx
export default function HangoutDetailCard({
  selected,
  userLocation,
  isCreator,
  isJoined,
  isFull,
  isDetailLoading,
  shareEnabled,
  shareError,
  shareNote,
  shareNoteError,
  driveDistanceLoading,
  driveDistanceKm,
  driveDistanceError,
  routeLoading,
  routeVisible,
  routeError,
  formatDateTime,
  resolveAvatar,
  distanceKm,
  onClose,
  onJoinLeave,
  onDelete,
  onEdit,
  onToggleShareLocation,
  onToggleRoute,
  onShareNoteChange,
}) {
  if (!selected) return null;

  return (
    <div className="card hangouts-detail-card shadow-sm">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <div className="fw-bold">{selected.title}</div>
            <div className="text-muted small">
              Hosted by {selected.creator?.username || "Unknown"}
            </div>
          </div>
          <button type="button" className="btn-close" onClick={onClose} />
        </div>

        <div className="small mt-3">
          <div className="text-muted">Starts</div>
          <div>{formatDateTime(selected.startsAt)}</div>
          <div className="text-muted mt-2">Ends</div>
          <div>{formatDateTime(selected.endsAt)}</div>
          <div className="text-muted mt-2">Visibility</div>
          <div>{selected.visibility || "friends"}</div>
          {selected?.location?.coordinates?.length === 2 && userLocation && (
            <>
              <div className="text-muted mt-2">Distance</div>
              <div>
                {driveDistanceLoading
                  ? "Calculating..."
                  : driveDistanceKm !== null
                    ? `${driveDistanceKm.toFixed(2)} km (driving)`
                    : `${distanceKm(userLocation, {
                        lng: selected.location.coordinates[0],
                        lat: selected.location.coordinates[1],
                      })?.toFixed(2)} km (straight-line)`}
              </div>
              {driveDistanceError && (
                <div className="text-muted small">{driveDistanceError}</div>
              )}
            </>
          )}
        </div>

        {selected.description && (
          <div className="small mt-3">{selected.description}</div>
        )}

        <div className="mt-3">
          <div className="text-muted small">Attendees ({selected.attendeeCount})</div>
          {selected.maxAttendees && (
            <div className="text-muted small">Max attendees: {selected.maxAttendees}</div>
          )}
          <div className="d-flex flex-wrap gap-2 mt-2">
            {(selected.attendees || []).map((a) => {
              const src = resolveAvatar(a.avatarUrl);
              return src ? (
                <img key={a.id} src={src} alt={a.username} className="attendee-avatar" />
              ) : (
                <div key={a.id} className="attendee-fallback">
                  {(a.username || "?").slice(0, 1).toUpperCase()}
                </div>
              );
            })}
          </div>
        </div>

        {isJoined && (
          <div className="mt-3">
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                id="shareLocationToggle"
                checked={shareEnabled}
                onChange={onToggleShareLocation}
              />
              <label className="form-check-label" htmlFor="shareLocationToggle">
                Share my location with this hangout
              </label>
            </div>
            {shareError && <div className="text-danger small mt-1">{shareError}</div>}
            {shareEnabled && (
              <div className="mt-2">
                <label className="form-label small mb-1">Status note</label>
                <input
                  className="form-control form-control-sm"
                  maxLength={20}
                  placeholder="On the way"
                  value={shareNote}
                  onChange={onShareNoteChange}
                />
                {shareNoteError && (
                  <div className="text-danger small mt-1">{shareNoteError}</div>
                )}
              </div>
            )}
          </div>
        )}

        {selected?.location?.coordinates?.length === 2 && userLocation && (
          <div className="mt-3">
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={onToggleRoute}
              disabled={routeLoading}
            >
              {routeLoading
                ? "Loading route..."
                : routeVisible
                  ? "Hide route"
                  : "Show route"}
            </button>
            {routeError && <div className="text-muted small mt-1">{routeError}</div>}
          </div>
        )}

        {selected.sharedLocations?.length > 0 && (
          <div className="mt-3">
            <div className="text-muted small mb-1">Shared locations</div>
            <div className="d-grid gap-1">
              {selected.sharedLocations
                .filter((entry) => entry.user?.id)
                .map((entry, idx) => {
                  const coords = entry.location?.coordinates;
                  const loc =
                    coords && coords.length === 2
                      ? { lng: coords[0], lat: coords[1] }
                      : null;
                  const km = distanceKm(userLocation, loc);
                  return (
                    <div key={entry.user?.id || idx} className="small">
                      {entry.user?.username || "Someone"}
                      {km !== null ? ` - ${km.toFixed(2)} km away` : ""}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {isDetailLoading ? (
          <div className="text-muted small mt-3">Loading details...</div>
        ) : (
          <div className="d-grid gap-2 mt-3">
            <button
              type="button"
              className={`btn ${isJoined ? "btn-outline-secondary" : "btn-primary"}`}
              onClick={onJoinLeave}
              disabled={isCreator || isFull}
            >
              {isCreator
                ? "You created this hangout"
                : isJoined
                  ? "Leave"
                  : isFull
                    ? "Hangout full"
                    : "Join"}
            </button>
            {isCreator && (
              <button type="button" className="btn btn-outline-danger" onClick={onDelete}>
                Delete hangout
              </button>
            )}
            {isCreator && (
              <button type="button" className="btn btn-outline-primary" onClick={onEdit}>
                Edit hangout
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
