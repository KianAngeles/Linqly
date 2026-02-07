import { useEffect, useState } from "react";
import { useAuth } from "../store/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { usersApi } from "../api/users.api";

export default function Register() {
  const nav = useNavigate();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameNormalized, setUsernameNormalized] = useState("");
  const [usernameStatus, setUsernameStatus] = useState({ state: "idle", message: "" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState("male");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (usernameStatus.state !== "checking" || !usernameNormalized) return;
    const handle = setTimeout(() => {
      usersApi
        .checkUsername(usernameNormalized)
        .then((data) => {
          setUsernameStatus({
            state: data.available ? "available" : "taken",
            message: data.available ? "Username is available" : "Username is already taken",
          });
        })
        .catch(() => {
          setUsernameStatus({ state: "invalid", message: "Unable to check username" });
        });
    }, 400);
    return () => clearTimeout(handle);
  }, [usernameNormalized, usernameStatus.state]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (!displayName.trim()) {
      setErr("Display name is required.");
      return;
    }
    if (!usernameNormalized || usernameStatus.state !== "available") {
      setErr("Please choose a valid username.");
      return;
    }
    try {
      await register(displayName.trim(), usernameNormalized, email, password, gender);
      nav("/app");
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="container py-5" style={{ maxWidth: 420 }}>
      <h3 className="mb-3">Register</h3>
      {err && <div className="alert alert-danger">{err}</div>}
      <form onSubmit={onSubmit}>
        <div className="mb-3">
          <label className="form-label">Display Name</label>
          <input
            className="form-control"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Username</label>
          <input
            className="form-control"
            value={username}
            onChange={(e) => {
              const raw = e.target.value;
              const trimmed = raw.trim();
              if (!trimmed) {
                setUsername("");
                setUsernameNormalized("");
                setUsernameStatus({ state: "idle", message: "" });
                return;
              }
              const hasInvalid = /[^a-zA-Z0-9_@]/.test(trimmed);
              let next = trimmed.replace(/^@+/, "");
              next = next.toLowerCase().replace(/[^a-z0-9_]/g, "");
              const normalized = next;
              const display = normalized ? `@${normalized}` : "";
              setUsername(display);
              setUsernameNormalized(normalized);
              if (hasInvalid || !/^[a-z0-9_]{3,30}$/.test(normalized)) {
                setUsernameStatus({
                  state: "invalid",
                  message: "Username must be 3-30 characters and contain only letters, numbers, or underscore.",
                });
              } else {
                setUsernameStatus({ state: "checking", message: "Checking username..." });
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
        <div className="mb-3">
          <label className="form-label">Email</label>
          <input className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="mb-3">
          <label className="form-label">Password</label>
          <input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="mb-3">
          <label className="form-label">Gender</label>
          <select className="form-select" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <button className="btn btn-success w-100">Create account</button>
      </form>
      <div className="mt-3">
        Already have an account? <Link to="/login">Login</Link>
      </div>
    </div>
  );
}
