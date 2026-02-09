import { useState } from "react";
import { authApi } from "../api/auth.api";
import { Link } from "react-router-dom";
import AuthCardLayout from "../components/auth/AuthCardLayout";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      await authApi.forgotPassword({ email });
      setDone(true);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <AuthCardLayout
      title="Forgot password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <Link className="auth-card-link" to="/login">
          Back to login
        </Link>
      }
    >
      {err && <div className="auth-card-notice is-error">{err}</div>}
      {done ? (
        <div className="auth-card-notice">
          If that email exists, a reset link was sent.
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn auth-card-btn">Send reset link</button>
        </form>
      )}
    </AuthCardLayout>
  );
}
