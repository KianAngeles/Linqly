import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../store/AuthContext";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { usersApi } from "../api/users.api";
import AuthSplitLayout from "../components/auth/AuthSplitLayout";
import leftArrowIcon from "../assets/icons/left-arrow.png";
import {
  validateDisplayName,
  validateUsername,
  validateEmail,
  validatePassword,
  validateGender,
} from "../validators";

const SUCCESS = {
  displayName: "Looks good",
  email: "Email looks valid",
  password: "Strong enough",
  gender: "Selected",
};

const DIRTY_DEFAULTS = {
  displayName: false,
  username: false,
  email: false,
  password: false,
  gender: false,
};

export default function Register() {
  const nav = useNavigate();
  const location = useLocation();
  const { register } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState("");

  const [genderOpen, setGenderOpen] = useState(false);
  const [dirty, setDirty] = useState(DIRTY_DEFAULTS);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState("idle");
  const [err, setErr] = useState("");

  const genderMenuRef = useRef(null);

  const transition =
    location?.state?.fromAuth && location?.state?.direction === "left"
      ? "left"
      : "";

  const normalizedDisplayName = displayName.trim();
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();

  const displayNameError = validateDisplayName(displayName);
  const usernameError = validateUsername(normalizedUsername);
  const emailError = validateEmail(email);
  const passwordError = validatePassword(password);
  const genderError = validateGender(gender);

  useEffect(() => {
    if (!genderOpen) return;
    const onDocClick = (event) => {
      if (!genderMenuRef.current) return;
      if (!genderMenuRef.current.contains(event.target)) {
        setGenderOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [genderOpen]);

  useEffect(() => {
    if (usernameError || !normalizedUsername) {
      setUsernameStatus("idle");
      return;
    }

    setUsernameStatus("checking");
    let cancelled = false;
    const handle = setTimeout(() => {
      usersApi
        .checkUsername(normalizedUsername)
        .then((data) => {
          if (cancelled) return;
          setUsernameStatus(data?.available ? "available" : "taken");
        })
        .catch(() => {
          if (!cancelled) setUsernameStatus("error");
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [normalizedUsername, usernameError]);

  const canSubmit = useMemo(
    () =>
      !displayNameError &&
      !usernameError &&
      usernameStatus === "available" &&
      !emailError &&
      !passwordError &&
      !genderError,
    [displayNameError, usernameError, usernameStatus, emailError, passwordError, genderError]
  );

  function markDirty(field) {
    setDirty((prev) => ({ ...prev, [field]: true }));
    setErr("");
  }

  function shouldShow(field) {
    return submitAttempted || dirty[field];
  }

  function getFieldState(field) {
    if (!shouldShow(field)) return null;

    if (field === "username") {
      if (usernameError) return { type: "error", text: usernameError };
      if (usernameStatus === "taken" || usernameStatus === "error") {
        return { type: "error", text: "Username is taken" };
      }
      if (usernameStatus === "available") {
        return { type: "success", text: "Username is available" };
      }
      return null;
    }

    const fieldErrors = {
      displayName: displayNameError,
      email: emailError,
      password: passwordError,
      gender: genderError,
    };

    if (fieldErrors[field]) return { type: "error", text: fieldErrors[field] };
    return { type: "success", text: SUCCESS[field] };
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setSubmitAttempted(true);
    setDirty({
      displayName: true,
      username: true,
      email: true,
      password: true,
      gender: true,
    });

    if (!canSubmit) return;

    try {
      await register(
        normalizedDisplayName,
        normalizedUsername,
        normalizedEmail,
        password,
        gender
      );
      nav("/app");
    } catch (e) {
      setErr(e.message);
    }
  }

  const displayNameState = getFieldState("displayName");
  const usernameState = getFieldState("username");
  const emailState = getFieldState("email");
  const passwordState = getFieldState("password");
  const genderState = getFieldState("gender");

  return (
    <AuthSplitLayout
      side="right"
      transition={transition}
      title="Register"
      subtitle="Create your account to get started."
      panelHeading="Join Linqly"
      panelText="Create your profile and start discovering chats, friends, and hangouts."
    >
      <Link className="auth-form-back auth-form-back-right" to="/">
        <img src={leftArrowIcon} alt="" aria-hidden="true" className="auth-form-back-icon" />
        Back
      </Link>
      {err && <div className="auth-register-top-error">{err}</div>}
      <form onSubmit={onSubmit} noValidate>
        <div className="mb-3">
          <label className="form-label">Display Name</label>
          <input
            className="form-control"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              markDirty("displayName");
            }}
          />
          {displayNameState ? (
            <div className={`auth-field-state is-${displayNameState.type}`}>{displayNameState.text}</div>
          ) : null}
        </div>

        <div className="mb-3">
          <label className="form-label">Username</label>
          <input
            className="form-control"
            value={username}
            onChange={(e) => {
              setUsername(String(e.target.value || "").toLowerCase());
              markDirty("username");
            }}
          />
          {usernameState ? (
            <div className={`auth-field-state is-${usernameState.type}`}>{usernameState.text}</div>
          ) : null}
        </div>

        <div className="mb-3">
          <label className="form-label">Email</label>
          <input
            className="form-control"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              markDirty("email");
            }}
          />
          {emailState ? (
            <div className={`auth-field-state is-${emailState.type}`}>{emailState.text}</div>
          ) : null}
        </div>

        <div className="mb-3">
          <label className="form-label">Password</label>
          <input
            type="password"
            className="form-control"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              markDirty("password");
            }}
          />
          {passwordState ? (
            <div className={`auth-field-state is-${passwordState.type}`}>{passwordState.text}</div>
          ) : null}
        </div>

        <div className="mb-3">
          <label className="form-label">Gender</label>
          <div className="auth-custom-select" ref={genderMenuRef}>
            <button
              type="button"
              className={`auth-custom-select-trigger ${genderOpen ? "is-open" : ""}`}
              onClick={() => setGenderOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={genderOpen}
            >
              {gender || "Select gender"}
            </button>
            {genderOpen && (
              <div className="auth-custom-select-menu" role="listbox">
                <button
                  type="button"
                  className={`auth-custom-select-option ${gender === "Male" ? "is-selected" : ""}`}
                  onClick={() => {
                    setGender("Male");
                    setGenderOpen(false);
                    markDirty("gender");
                  }}
                >
                  Male
                </button>
                <button
                  type="button"
                  className={`auth-custom-select-option ${gender === "Female" ? "is-selected" : ""}`}
                  onClick={() => {
                    setGender("Female");
                    setGenderOpen(false);
                    markDirty("gender");
                  }}
                >
                  Female
                </button>
              </div>
            )}
          </div>
          {genderState ? (
            <div className={`auth-field-state is-${genderState.type}`}>{genderState.text}</div>
          ) : null}
        </div>

        <button className="btn btn-auth-primary" disabled={!canSubmit}>
          Create account
        </button>
      </form>
      <div className="mt-3">
        Already have an account?{" "}
        <Link
          className="auth-inline-link"
          to="/login"
          state={{ fromAuth: true, direction: "right" }}
        >
          Login
        </Link>
      </div>
    </AuthSplitLayout>
  );
}
