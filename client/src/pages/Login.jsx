import { useState } from "react";
import { useAuth } from "../store/AuthContext";
import { useNavigate, Link, useLocation } from "react-router-dom";
import AuthSplitLayout from "../components/auth/AuthSplitLayout";

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const transition =
    location?.state?.fromAuth && location?.state?.direction === "right"
      ? "right"
      : "";

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    try {
      await login(email, password);
      nav("/app");
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <AuthSplitLayout
      side="left"
      transition={transition}
      title="Login"
      subtitle="Access your account to continue."
      panelHeading="Welcome back"
      panelText="Sign in to continue messaging, planning hangouts, and checking updates."
    >
      {err && <div className="alert alert-danger">{err}</div>}
      <form onSubmit={onSubmit}>
        <div className="mb-3">
          <label className="form-label">Email</label>
          <input
            className="form-control"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="mb-3">
          <label className="form-label">Password</label>
          <input
            type="password"
            className="form-control"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn btn-auth-primary">Sign in</button>
        <div className="mt-2">
          <Link className="auth-inline-link" to="/forgot-password">
            Forgot password?
          </Link>
        </div>
      </form>
      <div className="mt-3">
        No account?{" "}
        <Link
          className="auth-inline-link"
          to="/register"
          state={{ fromAuth: true, direction: "left" }}
        >
          Register
        </Link>
      </div>
    </AuthSplitLayout>
  );
}
