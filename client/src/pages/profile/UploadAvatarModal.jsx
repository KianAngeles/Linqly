import { useEffect, useRef, useState } from "react";
import { usersApi } from "../../api/users.api";

const CANVAS_SIZE = 220;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

export default function UploadAvatarModal({ isOpen, onClose, accessToken, onSaved }) {
  const [file, setFile] = useState(null);
  const [imageEl, setImageEl] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const canvasRef = useRef(null);

  const clampOffset = (nextOffset, nextZoom = zoom) => {
    if (!imageEl) return nextOffset;
    const baseScale = Math.max(
      CANVAS_SIZE / imageEl.width,
      CANVAS_SIZE / imageEl.height
    );
    const scale = baseScale * nextZoom;
    const drawWidth = imageEl.width * scale;
    const drawHeight = imageEl.height * scale;
    const maxX = Math.max(0, (drawWidth - CANVAS_SIZE) / 2);
    const maxY = Math.max(0, (drawHeight - CANVAS_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nextOffset.x)),
      y: Math.min(maxY, Math.max(-maxY, nextOffset.y)),
    };
  };

  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setImageEl(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    setSaving(false);
    setErr("");
  }, [isOpen]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImageEl(img);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setErr("Failed to load image");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [file]);

  useEffect(() => {
    if (!imageEl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const scale = Math.max(
      CANVAS_SIZE / imageEl.width,
      CANVAS_SIZE / imageEl.height
    ) * zoom;

    const drawWidth = imageEl.width * scale;
    const drawHeight = imageEl.height * scale;
    const dx = (CANVAS_SIZE - drawWidth) / 2 + offset.x;
    const dy = (CANVAS_SIZE - drawHeight) / 2 + offset.y;

    ctx.drawImage(imageEl, dx, dy, drawWidth, drawHeight);
  }, [imageEl, zoom, offset]);

  useEffect(() => {
    if (!imageEl) return;
    setOffset((prev) => clampOffset(prev, zoom));
  }, [imageEl, zoom]);

  if (!isOpen) return null;

  const handleFileChange = (event) => {
    const next = event.target.files?.[0] || null;
    if (!next) return;
    if (!/image\/(jpeg|png)/.test(next.type)) {
      setErr("Only JPG or PNG files are allowed.");
      return;
    }
    setErr("");
    setFile(next);
  };

  const handleSave = async () => {
    if (!accessToken) {
      setErr("Missing access token.");
      return;
    }
    if (!canvasRef.current) {
      setErr("Please choose an image.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const blob = await new Promise((resolve) =>
        canvasRef.current.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Failed to prepare image");
      const outFile = new File([blob], "avatar.png", { type: "image/png" });
      const data = await usersApi.uploadAvatar(accessToken, outFile);
      if (data?.user) onSaved?.(data.user);
      onClose();
    } catch (e) {
      setErr(e.message || "Failed to upload avatar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div
        className="profile-modal profile-avatar-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Upload avatar"
      >
        <div className="profile-modal-header">
          <div className="fw-semibold">Upload Avatar</div>
          <button type="button" className="btn btn-sm btn-link" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="profile-modal-body">
          {err && <div className="alert alert-danger">{err}</div>}
          <div className="profile-modal-row">
            <label className="form-label">Choose image</label>
            <input
              type="file"
              className="form-control"
              accept="image/png,image/jpeg"
              onChange={handleFileChange}
            />
          </div>

          <div className="profile-avatar-preview-wrap">
            <div
              className={`profile-avatar-preview ${dragging ? "is-dragging" : ""}`}
              role="img"
              aria-label="Avatar preview (drag to reposition)"
              onMouseDown={(e) => {
                if (!imageEl) return;
                setDragging(true);
                dragStartRef.current = {
                  x: e.clientX,
                  y: e.clientY,
                  offsetX: offset.x,
                  offsetY: offset.y,
                };
              }}
              onMouseMove={(e) => {
                if (!dragging) return;
                const dx = e.clientX - dragStartRef.current.x;
                const dy = e.clientY - dragStartRef.current.y;
                setOffset(clampOffset({
                  x: dragStartRef.current.offsetX + dx,
                  y: dragStartRef.current.offsetY + dy,
                }));
              }}
              onMouseUp={() => setDragging(false)}
              onMouseLeave={() => setDragging(false)}
              onTouchStart={(e) => {
                if (!imageEl) return;
                const touch = e.touches[0];
                setDragging(true);
                dragStartRef.current = {
                  x: touch.clientX,
                  y: touch.clientY,
                  offsetX: offset.x,
                  offsetY: offset.y,
                };
              }}
              onTouchMove={(e) => {
                if (!dragging) return;
                const touch = e.touches[0];
                const dx = touch.clientX - dragStartRef.current.x;
                const dy = touch.clientY - dragStartRef.current.y;
                setOffset(clampOffset({
                  x: dragStartRef.current.offsetX + dx,
                  y: dragStartRef.current.offsetY + dy,
                }));
              }}
              onTouchEnd={() => setDragging(false)}
            >
              <canvas ref={canvasRef} aria-label="Avatar preview" />
            </div>
          </div>

          <div className="profile-modal-row">
            <label className="form-label">Zoom</label>
            <input
              type="range"
              className="form-range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              disabled={!imageEl}
            />
          </div>
        </div>

        <div className="profile-modal-footer">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-dark"
            onClick={handleSave}
            disabled={saving || !imageEl}
          >
            {saving ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
