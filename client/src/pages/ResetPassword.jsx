import { useMemo, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { authApi } from "../api/auth.api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();

  const token = params.get("token") || "";
  const email = params.get("email") || "";

  const [newPassword, setNewPassword] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      await authApi.resetPassword({ email, token, newPassword });
      setDone(true);
      setTimeout(() => nav("/login"), 800);
    } catch (e) {
      setErr(e.message);
    }
  }

  const missing = useMemo(() => !token || !email, [token, email]);

  return (
    <div className="container py-5" style={{ maxWidth: 420 }}>
      <h3 className="mb-3">Reset Password</h3>

      {missing && (
        <div className="alert alert-danger">
          Missing reset token or email. Please request a new reset link.
        </div>
      )}

      {err && <div className="alert alert-danger">{err}</div>}

      {done ? (
        <div className="alert alert-success">Password updated! Redirecting to login…</div>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="mb-2 small text-muted">Email: {email}</div>
          <div className="mb-3">
            <label className="form-label">New Password</label>
            <input
              type="password"
              className="form-control"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={missing}
            />
          </div>
          <button className="btn btn-success w-100" disabled={missing}>
            Update Password
          </button>
        </form>
      )}

      <div className="mt-3">
        <Link to="/login">Back to login</Link>
      </div>
    </div>
  );
}
