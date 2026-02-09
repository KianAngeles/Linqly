import { useMemo, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { authApi } from "../api/auth.api";
import AuthCardLayout from "../components/auth/AuthCardLayout";

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
    <AuthCardLayout
      title="Reset password"
      subtitle="Create a new password to secure your account."
      footer={
        <Link className="auth-card-link" to="/login">
          Back to login
        </Link>
      }
    >
      {missing && (
        <div className="auth-card-notice is-error">
          Missing reset token or email. Please request a new reset link.
        </div>
      )}

      {err && <div className="auth-card-notice is-error">{err}</div>}

      {done ? (
        <div className="auth-card-notice">Password updated! Redirecting to login...</div>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input className="form-control" value={email} disabled readOnly />
          </div>
          <div className="mb-3">
            <label className="form-label">New password</label>
            <input
              type="password"
              className="form-control"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={missing}
            />
          </div>
          <button className="btn auth-card-btn" disabled={missing}>
            Update password
          </button>
        </form>
      )}
    </AuthCardLayout>
  );
}
