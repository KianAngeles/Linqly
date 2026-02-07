import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { usersApi } from "../api/users.api";
import "./Settings.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function Settings() {
  const { user, accessToken, setUser } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const privacyRef = useRef(null);

  const [username, setUsername] = useState(user?.username || "");
  const [saving, setSaving] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [pendingUrl, setPendingUrl] = useState("");
  const [imgMeta, setImgMeta] = useState(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [privacySettings, setPrivacySettings] = useState({
    gender: "Public",
    birthday: "Friends",
    location: "Friends",
    interests: "Public",
    about: "Public",
    friends: "Friends",
    hangoutsCreated: "Friends",
    hangoutsJoined: "Only me",
  });

  const VIEW_SIZE = 320;
  const CROP_DIAMETER = 240;
  const isPrivacyTab = useMemo(
    () => new URLSearchParams(location.search).get("tab") === "privacy",
    [location.search]
  );

  useEffect(() => {
    if (!isPrivacyTab || !privacyRef.current) return;
    privacyRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isPrivacyTab]);

  useEffect(() => {
    setUsername(user?.username || "");
  }, [user?.username]);

  useEffect(() => {
    if (!accessToken) return;
    usersApi
      .getPrivacy(accessToken)
      .then((data) => {
        if (!data?.privacy) return;
        setPrivacySettings((prev) => ({ ...prev, ...data.privacy }));
      })
      .catch(() => {});
  }, [accessToken]);

  const previewUrl = useMemo(() => {
    if (user?.avatarUrl) {
      if (user.avatarUrl.startsWith("http://") || user.avatarUrl.startsWith("https://")) {
        return user.avatarUrl;
      }
      return `${API_BASE}${user.avatarUrl}`;
    }
    return "";
  }, [user?.avatarUrl]);

  useEffect(() => {
    if (!pendingUrl) return;
    const img = new Image();
    img.onload = () => {
      const minScale = Math.max(
        CROP_DIAMETER / img.naturalWidth,
        CROP_DIAMETER / img.naturalHeight
      );
      setImgMeta({
        width: img.naturalWidth,
        height: img.naturalHeight,
        minScale,
      });
      setScale(minScale);
      setOffset({ x: 0, y: 0 });
    };
    img.src = pendingUrl;
  }, [pendingUrl]);

  useEffect(() => {
    return () => {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    };
  }, [pendingUrl]);

  function clampOffset(next, nextScale, meta) {
    if (!meta) return next;
    const radius = CROP_DIAMETER / 2;
    const dispW = meta.width * nextScale;
    const dispH = meta.height * nextScale;
    const maxX = Math.max(0, dispW / 2 - radius);
    const maxY = Math.max(0, dispH / 2 - radius);
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }

  useEffect(() => {
    if (!imgMeta) return;
    setOffset((prev) => clampOffset(prev, scale, imgMeta));
  }, [scale, imgMeta]);

  async function onSelectAvatar(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErr("");
    setOk("");
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    const url = URL.createObjectURL(file);
    setPendingUrl(url);
    e.target.value = "";
  }

  function handlePointerDown(e) {
    if (!imgMeta) return;
    setIsDragging(true);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      offset,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!isDragging || !dragRef.current || !imgMeta) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    const next = {
      x: dragRef.current.offset.x + dx,
      y: dragRef.current.offset.y + dy,
    };
    setOffset(clampOffset(next, scale, imgMeta));
  }

  function handlePointerUp() {
    setIsDragging(false);
    dragRef.current = null;
  }

  async function getCroppedBlob() {
    if (!imgMeta || !imgRef.current) return null;
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const radius = size / 2;
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const canvasScale = size / CROP_DIAMETER;
    const dispW = imgMeta.width * scale;
    const dispH = imgMeta.height * scale;
    const imgLeft = VIEW_SIZE / 2 - dispW / 2 + offset.x;
    const imgTop = VIEW_SIZE / 2 - dispH / 2 + offset.y;
    const drawX = (imgLeft - (VIEW_SIZE / 2 - CROP_DIAMETER / 2)) * canvasScale;
    const drawY = (imgTop - (VIEW_SIZE / 2 - CROP_DIAMETER / 2)) * canvasScale;
    const drawW = dispW * canvasScale;
    const drawH = dispH * canvasScale;
    ctx.drawImage(imgRef.current, drawX, drawY, drawW, drawH);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png", 0.92);
    });
  }

  async function onConfirmAvatar() {
    if (!pendingUrl || savingAvatar) return;
    setErr("");
    setOk("");
    setSavingAvatar(true);
    try {
      const blob = await getCroppedBlob();
      if (!blob) throw new Error("Failed to crop image");
      const file = new File([blob], "avatar.png", { type: "image/png" });
      const data = await usersApi.uploadAvatar(accessToken, file);
      if (data?.user) setUser(data.user);
      setOk("Avatar updated");
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      setPendingUrl("");
      setImgMeta(null);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSavingAvatar(false);
    }
  }

  function onCancelAvatar() {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingUrl("");
    setImgMeta(null);
  }

  async function updatePrivacy(key, value) {
    setPrivacySettings((prev) => ({ ...prev, [key]: value }));
    if (!accessToken) return;
    try {
      const data = await usersApi.updatePrivacy(accessToken, { [key]: value });
      if (data?.privacy) {
        setUser((prev) => ({ ...(prev || {}), privacy: data.privacy }));
      }
    } catch {
      // keep UI responsive even if save fails
    }
  }


  async function onSave(e) {
    e.preventDefault();
    setErr("");
    setOk("");
    setSaving(true);
    try {
      const data = await usersApi.updateMe(accessToken, {
        username: username.trim(),
      });
      if (data?.user) setUser(data.user);
      setOk("Profile saved");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container py-4" style={{ maxWidth: 720 }}>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h3 className="fw-bold m-0">Settings</h3>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={() => nav("/app")}
        >
          Back to app
        </button>
      </div>

      {err && <div className="alert alert-danger">{err}</div>}
      {ok && <div className="alert alert-success">{ok}</div>}

      <div className="border rounded p-3 mb-4">
        <h5 className="fw-bold mb-3">Profile</h5>

        <div className="d-flex align-items-center gap-3 mb-3">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Avatar"
              width={72}
              height={72}
              style={{ borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <div
              className="chat-settings-avatar chat-settings-avatar-fallback"
              style={{ width: 72, height: 72, fontSize: "1.4rem" }}
            >
              {String(user?.username || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="small text-muted mb-1">Upload avatar</div>
            <input
              type="file"
              accept="image/*"
              onChange={onSelectAvatar}
              className="form-control form-control-sm"
            />
          </div>
        </div>

        {pendingUrl && (
          <div className="avatar-cropper-card mb-4">
            <div className="avatar-cropper-header">
              <div className="fw-semibold">Crop avatar</div>
              <div className="text-muted small">Drag to reposition</div>
            </div>
            <div
              className="avatar-cropper"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              style={{ cursor: isDragging ? "grabbing" : "grab" }}
            >
              <img
                ref={imgRef}
                src={pendingUrl}
                alt="Crop preview"
                style={{
                  "--tx": `${offset.x}px`,
                  "--ty": `${offset.y}px`,
                  "--scale": scale,
                }}
              />
              <div className="avatar-cropper-overlay" />
              <div className="avatar-cropper-ring" />
            </div>
            <div className="avatar-cropper-controls">
              <label className="form-label mb-1">Zoom</label>
              <input
                type="range"
                min={imgMeta?.minScale || 1}
                max={(imgMeta?.minScale || 1) * 3}
                step="0.01"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="form-range"
              />
            </div>
            <div className="avatar-cropper-actions">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={onCancelAvatar}
                disabled={savingAvatar}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onConfirmAvatar}
                disabled={savingAvatar}
              >
                {savingAvatar ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={onSave}>
          <div className="mb-3">
            <label className="form-label">Username</label>
            <input
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Email</label>
            <input
              className="form-control"
              value={user?.email || ""}
              readOnly
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      </div>

      <div ref={privacyRef} className="border rounded p-3 privacy-card">
        <h5 className="fw-bold mb-3">Privacy</h5>
        <div className="privacy-row">
          <div>
            <div className="privacy-label">Gender</div>
            <div className="text-muted small">Control who can see your gender.</div>
          </div>
          <div className="privacy-toggle">
            {["Public", "Friends", "Only me"].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`privacy-option ${privacySettings.gender === opt ? "is-active" : ""}`}
                onClick={() => updatePrivacy("gender", opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="privacy-row">
          <div>
            <div className="privacy-label">Birthday / Age</div>
            <div className="text-muted small">Control who can see your birthday.</div>
          </div>
          <div className="privacy-toggle">
            {["Public", "Friends", "Only me"].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`privacy-option ${privacySettings.birthday === opt ? "is-active" : ""}`}
                onClick={() => updatePrivacy("birthday", opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="privacy-row">
          <div>
            <div className="privacy-label">Location</div>
            <div className="text-muted small">Control who can see your location.</div>
          </div>
          <div className="privacy-toggle">
            {["Public", "Friends", "Only me"].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`privacy-option ${privacySettings.location === opt ? "is-active" : ""}`}
                onClick={() => updatePrivacy("location", opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="privacy-row">
          <div>
            <div className="privacy-label">Interests</div>
            <div className="text-muted small">Control who can see your interests.</div>
          </div>
          <div className="privacy-toggle">
            {["Public", "Friends", "Only me"].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`privacy-option ${privacySettings.interests === opt ? "is-active" : ""}`}
                onClick={() => updatePrivacy("interests", opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="privacy-row">
          <div>
            <div className="privacy-label">About Me</div>
            <div className="text-muted small">Control who can see your about section.</div>
          </div>
          <div className="privacy-toggle">
            {["Public", "Friends", "Only me"].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`privacy-option ${privacySettings.about === opt ? "is-active" : ""}`}
                onClick={() => updatePrivacy("about", opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="privacy-row">
          <div>
            <div className="privacy-label">Friends List</div>
            <div className="text-muted small">Control who can see your friends list.</div>
          </div>
          <div className="privacy-toggle">
            {["Public", "Friends", "Only me"].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`privacy-option ${privacySettings.friends === opt ? "is-active" : ""}`}
                onClick={() => updatePrivacy("friends", opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="privacy-row">
          <div>
            <div className="privacy-label">Created Hangouts</div>
            <div className="text-muted small">
              Control who can see hangouts you created.
            </div>
          </div>
          <div className="privacy-toggle">
            {["Public", "Friends", "Only me"].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`privacy-option ${
                  privacySettings.hangoutsCreated === opt ? "is-active" : ""
                }`}
                onClick={() => updatePrivacy("hangoutsCreated", opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="privacy-row">
          <div>
            <div className="privacy-label">Joined Hangouts</div>
            <div className="text-muted small">
              Control who can see hangouts you joined.
            </div>
          </div>
          <div className="privacy-toggle">
            {["Public", "Friends", "Only me"].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`privacy-option ${
                  privacySettings.hangoutsJoined === opt ? "is-active" : ""
                }`}
                onClick={() => updatePrivacy("hangoutsJoined", opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
