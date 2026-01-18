import { useState } from "react";
import { authApi } from "../api/auth.api";
import { Link } from "react-router-dom";

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
    <div className="container py-5" style={{ maxWidth: 420 }}>
      <h3 className="mb-3">Forgot Password</h3>
      {err && <div className="alert alert-danger">{err}</div>}
      {done ? (
        <div className="alert alert-success">
          If that email exists, a reset link was sent.
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn btn-primary w-100">Send Reset Link</button>
        </form>
      )}
      <div className="mt-3">
        <Link to="/login">Back to login</Link>
      </div>
    </div>
  );
}
