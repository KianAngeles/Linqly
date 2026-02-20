// src/components/hangouts/HangoutDetailCard.jsx
import { useMemo, useState } from "react";
import moreIcon from "../../assets/icons/more.png";
export default function HangoutDetailCard({
  selected,
  currentUserId,
  userLocation,
  isCreator,
  isJoined,
  isFull,
  isDetailLoading,
  shareEnabled,
  shareError,
  shareLoading,
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
  joinActionError,
  isJoinApprovalRequired,
  isJoinRequestPending,
  pendingJoinRequests,
  joinRequestActionKey,
  onApproveJoinRequest,
  onDeclineJoinRequest,
  onOpenProfile,
  removeAttendeeIcon,
  onRequestRemoveAttendee,
  onDelete,
  onEdit,
  onToggleShareLocation,
  onToggleRoute,
  onShareNoteChange,
  onUpdateAttendeeStatus,
  attendeeStatusUpdatingId,
  attendeeStatusError,
}) {
  if (!selected) return null;
  const [showShared, setShowShared] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const statusOptions = useMemo(
    () => ["Confirmed", "On the way", "Running late", "Arrived", "Waiting"],
    []
  );

  return (
    <div className="card hangouts-detail-card shadow-sm">
      <div className="hangouts-detail-header">
        <div>
          <div className="hangouts-detail-title">{selected.title}</div>
          <div className="text-muted small">
            Hosted by {selected.creator?.username || "Unknown"}
          </div>
        </div>
        <button type="button" className="btn-close" onClick={onClose} />
      </div>

      <div className="hangouts-detail-body">
        <div className="hangouts-detail-meta">
          <div className="hangouts-detail-meta-row">
            <div className="hangouts-detail-meta-block">
              <div className="hangouts-detail-label">Starts</div>
              <div>{formatDateTime(selected.startsAt)?.split(",")[0]}</div>
              <div className="text-muted small">
                {formatDateTime(selected.startsAt)?.split(",")[1]?.trim() || ""}
              </div>
            </div>
            <div className="hangouts-detail-meta-block">
              <div className="hangouts-detail-label">Ends</div>
              <div>{formatDateTime(selected.endsAt)?.split(",")[0]}</div>
              <div className="text-muted small">
                {formatDateTime(selected.endsAt)?.split(",")[1]?.trim() || ""}
              </div>
            </div>
          </div>
          <div className="hangouts-detail-meta-row">
            <div className="hangouts-detail-meta-block">
              <div className="hangouts-detail-label">Visibility</div>
              <div>{selected.visibility || "friends"}</div>
            </div>
            {selected?.location?.coordinates?.length === 2 && userLocation && (
              <div className="hangouts-detail-meta-block">
                <div className="hangouts-detail-label">Distance</div>
                <div>
                  {driveDistanceLoading
                    ? "Calculating..."
                    : driveDistanceKm !== null
                      ? `${driveDistanceKm.toFixed(2)} km`
                      : `${distanceKm(userLocation, {
                          lng: selected.location.coordinates[0],
                          lat: selected.location.coordinates[1],
                        })?.toFixed(2)} km`}
                </div>
                {driveDistanceError && (
                  <div className="text-muted small">{driveDistanceError}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {selected.description && (
          <div className="small mt-3">
            <div className="hangouts-detail-label">Description</div>
            <div>{selected.description}</div>
          </div>
        )}

        <div className="mt-3">
          <div className="hangouts-detail-label small">Attendees ({selected.attendeeCount})</div>
          {selected.maxAttendees && (
            <div className="text-muted small">Max attendees: {selected.maxAttendees}</div>
          )}
          <div className="attendees-list mt-2">
            {(selected.attendees || []).map((a) => {
              const src = resolveAvatar(a.avatarUrl);
              const isSelf = String(a.id || "") === String(currentUserId || "");
              const name = a.displayName || a.username || "Unknown";
              const currentStatus = a.status || a.attendanceStatus || "Confirmed";
              const canOpenProfile = !!(a.username || a.displayName);
              return (
                <div
                  key={a.id}
                  className="attendee-row"
                  onMouseLeave={() => setOpenMenuId((prev) => (prev === a.id ? null : prev))}
                  onClick={() => {
                    if (!canOpenProfile) return;
                    const handle = a.username || a.displayName;
                    onOpenProfile?.(handle, { newTab: true });
                  }}
                  role={canOpenProfile ? "button" : undefined}
                  tabIndex={canOpenProfile ? 0 : -1}
                  onKeyDown={(e) => {
                    if (!canOpenProfile) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const handle = a.username || a.displayName;
                      onOpenProfile?.(handle, { newTab: true });
                    }
                  }}
                >
                  <div className="attendee-left">
                    {src ? (
                      <img src={src} alt={name} className="attendee-avatar" />
                    ) : (
                      <div className="attendee-fallback">
                        {(name || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="attendee-main">
                    <div className="attendee-name">{name}</div>
                    {isSelf ? (
                      <select
                        className="attendee-status-select"
                        value={currentStatus}
                        onChange={(e) => onUpdateAttendeeStatus?.(a.id, e.target.value)}
                        disabled={String(attendeeStatusUpdatingId || "") === String(a.id || "")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {statusOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="attendee-status-text">{currentStatus}</div>
                    )}
                  </div>
                  {isCreator && !isSelf && (
                    <div className="attendee-more-wrap">
                      <button
                        type="button"
                        className="attendee-more"
                        aria-label="More actions"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId((prev) => (prev === a.id ? null : a.id));
                        }}
                      >
                        <img src={moreIcon} alt="" aria-hidden="true" />
                      </button>
                      {openMenuId === a.id && (
                        <div className="attendee-more-menu">
                          <button
                            type="button"
                            className="attendee-more-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              onRequestRemoveAttendee?.(a);
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {attendeeStatusError && (
            <div className="hangouts-detail-inline-error small mt-2">{attendeeStatusError}</div>
          )}
        </div>

        {isCreator && Array.isArray(pendingJoinRequests) && (
          <div className="mt-3">
            <div className="d-flex justify-content-between align-items-center">
              <div className="hangouts-detail-label small">Join requests ({pendingJoinRequests.length})</div>
            </div>
            {pendingJoinRequests.length === 0 ? (
              <div className="text-muted small mt-1">No pending requests.</div>
            ) : (
              <div className="d-grid gap-2 mt-2">
                {pendingJoinRequests.map((entry, idx) => {
                  const reqUser = entry?.user || null;
                  const reqId = String(reqUser?.id || "");
                  const reqUsername = String(reqUser?.username || "").replace(/^@+/, "").trim();
                  const reqDisplayName = String(
                    reqUser?.displayName || reqUser?.username || "Unknown"
                  ).trim();
                  const reqAvatar = resolveAvatar(reqUser?.avatarUrl);
                  const keyBase = reqId || `row-${idx}`;
                  const accepting = joinRequestActionKey === `accept:${reqId}`;
                  const declining = joinRequestActionKey === `decline:${reqId}`;
                  const canOpenProfile = !!reqUsername;
                  return (
                    <div
                      key={keyBase}
                      className={`hangout-request-row ${canOpenProfile ? "" : "is-disabled-link"}`}
                      onClick={() => {
                        if (!canOpenProfile) return;
                        onOpenProfile?.(reqUsername, { newTab: true });
                      }}
                      role={canOpenProfile ? "button" : undefined}
                      tabIndex={canOpenProfile ? 0 : -1}
                      onKeyDown={(e) => {
                        if (!canOpenProfile) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenProfile?.(reqUsername, { newTab: true });
                        }
                      }}
                    >
                      <div className="hangout-request-avatar-wrap">
                        {reqAvatar ? (
                          <img
                            src={reqAvatar}
                            alt={reqDisplayName}
                            className="hangout-request-avatar"
                          />
                        ) : (
                          <div className="hangout-request-avatar hangout-request-avatar-fallback">
                            {reqDisplayName.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="hangout-request-meta">
                        <div className="hangout-request-name">
                          {reqDisplayName}
                        </div>
                        <div className="hangout-request-time">
                          {entry?.requestedAt
                            ? new Date(entry.requestedAt).toLocaleString()
                            : ""}
                        </div>
                        <div className="hangout-request-actions">
                          <button
                            type="button"
                            className="btn btn-sm btn-dark"
                            disabled={!reqId || accepting || declining}
                            onClick={(e) => {
                              e.stopPropagation();
                              onApproveJoinRequest?.(reqId);
                            }}
                          >
                            {accepting ? "Accepting..." : "Accept"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={!reqId || accepting || declining}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeclineJoinRequest?.(reqId);
                            }}
                          >
                            {declining ? "Declining..." : "Decline"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {isJoined && (
          <div className="mt-3">
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                id="shareLocationToggle"
                checked={shareEnabled}
                onChange={onToggleShareLocation}
                disabled={shareLoading}
              />
              <label className="form-check-label" htmlFor="shareLocationToggle">
                Share my location with this hangout
              </label>
            </div>
            {shareLoading && (
              <div className="text-muted small mt-1 d-flex align-items-center gap-2">
                <span
                  className="spinner-border spinner-border-sm"
                  role="status"
                  aria-hidden="true"
                />
                Updating location...
              </div>
            )}
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
              className="btn btn-sm hangout-route-btn"
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

        {isJoined && selected.sharedLocations?.length > 0 && (
          <div className="mt-3">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <div className="text-muted small">Shared locations</div>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setShowShared((v) => !v)}
              >
                {showShared ? "Hide" : "Show"}
              </button>
            </div>
            {showShared && (
              <div className="d-grid gap-1">
                {selected.sharedLocations
                  .filter((entry) => entry.user?.id)
                  .map((entry, idx) => {
                    const coords = entry.location?.coordinates;
                    const loc =
                      coords && coords.length === 2
                        ? { lng: coords[0], lat: coords[1] }
                        : null;
                    const hangoutCoords = selected.location?.coordinates;
                    const hangoutLoc =
                      hangoutCoords && hangoutCoords.length === 2
                        ? { lng: hangoutCoords[0], lat: hangoutCoords[1] }
                        : null;
                    const km = distanceKm(hangoutLoc, loc);
                    return (
                      <div key={entry.user?.id || idx} className="small">
                        {entry.user?.username || "Someone"}
                        {km !== null ? ` - ${km.toFixed(2)} km from hangout` : ""}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

      </div>

      <div className="hangouts-detail-footer">
        {isDetailLoading ? (
          <div className="text-muted small">Loading details...</div>
        ) : (
          <div className="d-grid gap-2">
            {isCreator ? (
              <button type="button" className="btn btn-dark" onClick={onEdit}>
                Edit hangout
              </button>
            ) : (
            <button
              type="button"
              className={`btn hangout-join-btn ${isJoined ? "is-joined" : ""}`}
              onClick={onJoinLeave}
              disabled={isFull || isJoinRequestPending}
            >
                {isJoined
                  ? "Leave"
                  : isFull
                    ? "Hangout full"
                    : isJoinRequestPending
                      ? "Request sent"
                      : isJoinApprovalRequired
                        ? "Request to join"
                        : "Join"}
              </button>
            )}
            {joinActionError ? (
              <div className="text-danger small">{joinActionError}</div>
            ) : null}
            {isCreator && (
              <button type="button" className="btn btn-outline-danger" onClick={onDelete}>
                Delete hangout
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
