import { useEffect, useMemo, useState } from "react";
import { usersApi } from "../../api/users.api";

const BIO_LIMIT = 150;

export default function EditProfileModal({
  isOpen,
  onClose,
  profile,
  accessToken,
  onSaved,
}) {
  const initialInterests = useMemo(() => profile?.interests || [], [profile]);
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [usernameInput, setUsernameInput] = useState(
    profile?.username ? `@${profile.username}` : ""
  );
  const [usernameNormalized, setUsernameNormalized] = useState(
    profile?.username || ""
  );
  const [usernameStatus, setUsernameStatus] = useState({
    state: "idle",
    message: "",
  });
  const [bio, setBio] = useState(profile?.bio || "");
  const [about, setAbout] = useState(profile?.about || "");
  const [interests, setInterests] = useState(initialInterests);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setDisplayName(profile?.displayName || "");
    setUsernameInput(profile?.username ? `@${profile.username}` : "");
    setUsernameNormalized(profile?.username || "");
    setUsernameStatus({ state: "idle", message: "" });
    setBio(profile?.bio || "");
    setAbout(profile?.about || "");
    setInterests(profile?.interests || []);
    setTagInput("");
    setErr("");
  }, [isOpen, profile]);

  const displayNameError = !displayName.trim()
    ? "Display name is required."
    : "";
  const bioError = bio.length > BIO_LIMIT ? "Bio is too long." : "";

  useEffect(() => {
    if (usernameStatus.state !== "checking" || !usernameNormalized) return;
    const handle = setTimeout(() => {
      usersApi
        .checkUsername(usernameNormalized)
        .then((data) => {
          setUsernameStatus({
            state: data.available ? "available" : "taken",
            message: data.available
              ? "Username is available"
              : "Username is already taken",
          });
        })
        .catch(() => {
          setUsernameStatus({
            state: "invalid",
            message: "Unable to check username",
          });
        });
    }, 400);
    return () => clearTimeout(handle);
  }, [usernameNormalized, usernameStatus.state]);

  if (!isOpen) return null;

  const addTag = () => {
    const clean = tagInput.trim();
    if (!clean) return;
    if (interests.includes(clean)) {
      setTagInput("");
      return;
    }
    setInterests((prev) => [...prev, clean]);
    setTagInput("");
  };

  const removeTag = (tag) => {
    setInterests((prev) => prev.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    if (displayNameError || bioError) return;
    if (!usernameNormalized) {
      setErr("Username is required.");
      return;
    }
    if (
      usernameStatus.state === "invalid" ||
      usernameStatus.state === "taken" ||
      usernameStatus.state === "checking"
    ) {
      setErr("Please choose a valid username.");
      return;
    }
    if (!accessToken) {
      setErr("Missing access token.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const payload = {
        displayName: displayName.trim(),
        bio: bio.trim(),
        about: about.trim(),
        interests,
      };
      if (usernameNormalized && usernameNormalized !== profile?.username) {
        payload.username = usernameNormalized;
      }
      const data = await usersApi.updateMe(accessToken, payload);
      if (data?.user) {
        onSaved?.(data.user);
      }
      onClose();
    } catch (e) {
      setErr(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div
        className="profile-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-modal-header">
          <div className="fw-semibold">Edit Profile</div>
          <button
            type="button"
            className="profile-modal-close-x"
            aria-label="Close"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <div className="profile-modal-body">
          {err && <div className="alert alert-danger">{err}</div>}
          <div className="profile-modal-row">
            <label className="form-label">Display name</label>
            <input
              type="text"
              className={`form-control ${displayNameError ? "is-invalid" : ""}`}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            {displayNameError && <div className="invalid-feedback">{displayNameError}</div>}
          </div>

          <div className="profile-modal-row">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-control"
              value={usernameInput}
              onChange={(e) => {
                const raw = e.target.value;
                const trimmed = raw.trim();
                if (!trimmed) {
                  setUsernameInput("");
                  setUsernameNormalized("");
                  setUsernameStatus({ state: "idle", message: "" });
                  return;
                }
                const hasInvalid = /[^a-zA-Z0-9_@]/.test(trimmed);
                let next = trimmed.replace(/^@+/, "");
                next = next.toLowerCase().replace(/[^a-z0-9_]/g, "");
                const normalized = next;
                const display = normalized ? `@${normalized}` : "";
                setUsernameInput(display);
                setUsernameNormalized(normalized);
                if (normalized === profile?.username) {
                  setUsernameStatus({ state: "idle", message: "" });
                  return;
                }
                if (hasInvalid || !/^[a-z0-9_]{3,30}$/.test(normalized)) {
                  setUsernameStatus({
                    state: "invalid",
                    message:
                      "Username must be 3-30 characters and contain only letters, numbers, or underscore.",
                  });
                } else {
                  setUsernameStatus({
                    state: "checking",
                    message: "Checking username...",
                  });
                }
              }}
            />
            {usernameStatus.state !== "idle" && (
              <div
                className={`small mt-1 ${
                  usernameStatus.state === "available"
                    ? "text-success"
                    : usernameStatus.state === "checking"
                    ? "text-muted"
                    : "text-danger"
                }`}
              >
                {usernameStatus.message}
              </div>
            )}
          </div>

          <div className="profile-modal-row">
            <label className="form-label">Bio</label>
            <textarea
              className={`form-control ${bioError ? "is-invalid" : ""}`}
              rows={3}
              value={bio}
              onChange={(e) => {
                const next = e.target.value;
                if (next.length <= BIO_LIMIT) {
                  setBio(next);
                }
              }}
            />
            <div className="profile-bio-footer">
              <div className="profile-char-count">
                {bio.length}/{BIO_LIMIT}
              </div>
            </div>
            {bioError && <div className="invalid-feedback">{bioError}</div>}
          </div>

        </div>

        <div className="profile-modal-footer">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-dark" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}


