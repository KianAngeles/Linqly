import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";

export default function Landing() {
  const { user } = useAuth();

  // If already logged in, skip landing and go to app
  if (user) return <Navigate to="/app" replace />;

  return (
    <div>
      {/* Navbar */}
      <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom">
        <div className="container">
          <Link className="navbar-brand fw-bold" to="/">
            Linqly
          </Link>

          <div className="d-flex gap-2">
            <Link className="btn btn-outline-primary" to="/login">
              Login
            </Link>
            <Link className="btn btn-primary" to="/register">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="py-5 bg-light">
        <div className="container">
          <div className="row align-items-center g-4">
            <div className="col-lg-6">
              <h1 className="display-5 fw-bold">
                Chat, pin a hangout, and link up in real life.
              </h1>
              <p className="lead text-muted mt-3">
                Linqly is a real-time chat app with map-based hangouts. Create a
                pin, invite friends, and track everyone’s progress with Hangout
                GPS statuses like <b>Prepping</b>, <b>On the way</b>, and{" "}
                <b>Arrived</b> — using privacy-friendly approximate distance.
              </p>

              <div className="d-flex gap-2 mt-4">
                <Link className="btn btn-primary btn-lg" to="/register">
                  Create an account
                </Link>
                <Link className="btn btn-outline-secondary btn-lg" to="/login">
                  Sign in
                </Link>
              </div>

              <div className="mt-3 text-muted small">
                Free to use • Privacy-first location sharing • Real-time updates
              </div>
            </div>

            {/* Placeholder “product screenshot” */}
            <div className="col-lg-6">
              <div className="p-4 bg-white border rounded-3 shadow-sm">
                <div className="text-muted small mb-2">Preview</div>
                <div className="ratio ratio-16x9 bg-light rounded">
                  <div className="d-flex align-items-center justify-content-center text-muted">
                    Map + Chat UI mockup here
                  </div>
                </div>
                <div className="mt-3 d-flex gap-2">
                  <span className="badge bg-primary">Chat</span>
                  <span className="badge bg-success">Hangouts</span>
                  <span className="badge bg-dark">GPS Status</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="py-5">
        <div className="container">
          <h2 className="fw-bold mb-4">What you can do with Linqly</h2>
          <div className="row g-4">
            <div className="col-md-4">
              <div className="p-4 border rounded-3 h-100">
                <h5 className="fw-bold">Real-time chat</h5>
                <p className="text-muted mb-0">
                  1-on-1 and group messaging with fast updates and a clean UI.
                </p>
              </div>
            </div>

            <div className="col-md-4">
              <div className="p-4 border rounded-3 h-100">
                <h5 className="fw-bold">Hangout pins</h5>
                <p className="text-muted mb-0">
                  Pin a meetup location on the map, limit participants, and
                  invite friends instantly.
                </p>
              </div>
            </div>

            <div className="col-md-4">
              <div className="p-4 border rounded-3 h-100">
                <h5 className="fw-bold">Hangout GPS</h5>
                <p className="text-muted mb-0">
                  Status updates + approximate distance so everyone knows who’s
                  prepping, on the way, or already there.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section className="py-5 bg-light">
        <div className="container text-center">
          <h3 className="fw-bold">Ready to link up?</h3>
          <p className="text-muted">
            Create your account and start your first hangout pin.
          </p>
          <Link className="btn btn-primary btn-lg" to="/register">
            Get Started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-4 border-top">
        <div className="container d-flex justify-content-between align-items-center">
          <span className="text-muted small">© {new Date().getFullYear()} Linqly</span>
          <span className="text-muted small">
            Built with React + Express + MongoDB
          </span>
        </div>
      </footer>
    </div>
  );
}
