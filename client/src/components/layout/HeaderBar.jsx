import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { useAuth } from "../../store/AuthContext";

const pageTitles = [
  { pattern: "/app", title: "Home" },
  { pattern: "/app/chats/*", title: "Messenger" },
  { pattern: "/app/map", title: "Map" },
  { pattern: "/app/friends", title: "Friends" },
  { pattern: "/app/settings", title: "Settings" },
];

export default function HeaderBar() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { user, logout } = useAuth();

  const title = useMemo(() => {
    for (const entry of pageTitles) {
      if (matchPath(entry.pattern, pathname)) return entry.title;
    }
    return "Home";
  }, [pathname]);

  async function handleLogout() {
    await logout();
    nav("/", { replace: true });
  }

  const avatarLetter = (user?.username || "?").slice(0, 1).toUpperCase();

  return (
    <header className="app-header border-bottom bg-white">
      <div className="d-flex align-items-center justify-content-between px-4 py-3 gap-3">
        <div>
          <div className="h5 mb-0 fw-semibold">{title}</div>
          <div className="text-muted small">Linqly workspace</div>
        </div>

        <div className="d-flex align-items-center gap-2">
          <button type="button" className="btn btn-outline-secondary btn-sm">
            <span className="me-2">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
                <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
              </svg>
            </span>
            Notifications
          </button>

          <Link to="/app/map" className="btn btn-primary btn-sm">
            Create Hangout
          </Link>

          <div className="dropdown">
            <button
              className="btn btn-outline-secondary btn-sm dropdown-toggle d-flex align-items-center gap-2"
              type="button"
              data-bs-toggle="dropdown"
              aria-expanded="false"
            >
              <span className="avatar-pill">{avatarLetter}</span>
              <span className="d-none d-md-inline">{user?.username || "Account"}</span>
            </button>
            <ul className="dropdown-menu dropdown-menu-end">
              <li>
                <Link className="dropdown-item" to="/app/settings">
                  Profile / Settings
                </Link>
              </li>
              <li>
                <button className="dropdown-item" type="button" onClick={handleLogout}>
                  Logout
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </header>
  );
}
