import { NavLink } from "react-router-dom";
import { useMemo } from "react";
import { useAuth } from "../../store/AuthContext";

function Badge({ variant }) {
  if (variant === "unread") {
    return (
      <span className="badge rounded-pill text-bg-light border border-light-subtle">
        --
      </span>
    );
  }
  return null;
}

export default function Sidebar() {
  const { user } = useAuth();
  const navItems = useMemo(() => {
    const usernameRaw = user?.username ? String(user.username) : "";
    const username = usernameRaw.replace(/^@+/, "");
    return [
      { label: "Home", to: "/app" },
      { label: "Messenger", to: "/app/chats", badge: "unread" },
      { label: "Map", to: "/app/map" },
      { label: "Friends", to: "/app/friends" },
      { label: "Profile", to: username ? `/app/profile/${username}` : "/app/profile" },
      { label: "Settings", to: "/app/settings" },
    ];
  }, [user?.username]);

  return (
    <aside className="app-sidebar">
      <div className="px-3 py-4">
        <div className="app-logo">Linqly</div>
        <div className="text-muted small mt-1">Connect and hang out</div>
      </div>

      <nav className="nav flex-column gap-1 px-2 pb-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/app"}
            className={({ isActive }) =>
              `nav-link app-nav-link d-flex align-items-center justify-content-between ${
                isActive ? "active" : ""
              }`
            }
          >
            <span>{item.label}</span>
            <Badge variant={item.badge} />
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
