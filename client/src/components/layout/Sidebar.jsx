import { NavLink, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAuth } from "../../store/AuthContext";
import { useChatsStore } from "../../store/chatsStore";
import logoIcon from "../../assets/icons/linqly_logo.png";
import homeIcon from "../../assets/icons/sidebar-icons/home.png";
import messengerIcon from "../../assets/icons/sidebar-icons/messenger.png";
import mapIcon from "../../assets/icons/sidebar-icons/map.png";
import friendsIcon from "../../assets/icons/sidebar-icons/friends.png";
import profileIcon from "../../assets/icons/sidebar-icons/profile.png";
import settingsIcon from "../../assets/icons/sidebar-icons/setting.png";
import logoutIcon from "../../assets/icons/sidebar-icons/logout.png";
import minimizeIcon from "../../assets/icons/sidebar-icons/minimize.png";
import closeIcon from "../../assets/icons/sidebar-icons/close.png";

const SIDEBAR_COLLAPSE_STORAGE_KEY = "linqly.sidebarCollapsed";

function Badge({ count }) {
  if (count > 0) {
    return <span className="app-sidebar-badge">{count}</span>;
  }
  return null;
}

function AppNavItem({ item, collapsed }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/app"}
      className={({ isActive }) =>
        `app-nav-link app-sidebar-nav-item ${isActive ? "active" : ""}`
      }
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
    >
      <span className="app-sidebar-item-left">
        <img src={item.icon} alt="" aria-hidden="true" className="app-sidebar-item-icon" />
        <span className="app-sidebar-item-label">{item.label}</span>
      </span>
      <Badge count={item.badgeCount || 0} />
      {collapsed ? <span className="app-sidebar-tooltip">{item.label}</span> : null}
    </NavLink>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { unreadChatsCount } = useChatsStore(user?.id);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === "1";
  });
  const { mainItems, accountItems } = useMemo(() => {
    const usernameRaw = user?.username ? String(user.username) : "";
    const username = usernameRaw.replace(/^@+/, "");
    return {
      mainItems: [
        { key: "home", label: "Home", to: "/app", icon: homeIcon },
        {
          key: "messenger",
          label: "Messenger",
          to: "/app/chats",
          icon: messengerIcon,
          badgeCount: unreadChatsCount,
        },
        { key: "map", label: "Map", to: "/app/map", icon: mapIcon },
        { key: "friends", label: "Friends", to: "/app/friends", icon: friendsIcon },
      ],
      accountItems: [
        {
          key: "profile",
          label: "Profile",
          to: username ? `/app/profile/${username}` : "/app/profile",
          icon: profileIcon,
        },
        { key: "settings", label: "Settings", to: "/app/settings", icon: settingsIcon },
      ],
    };
  }, [unreadChatsCount, user?.username]);

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  return (
    <aside className={`app-sidebar ${collapsed ? "is-collapsed" : ""}`}>
      <div className="app-sidebar-header">
        <span className="app-sidebar-header-title">Linqly</span>
        <button
          type="button"
          className="app-sidebar-minimize"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleSidebar}
        >
          <img
            src={collapsed ? closeIcon : minimizeIcon}
            alt=""
            aria-hidden="true"
            className="app-sidebar-minimize-icon"
          />
        </button>
      </div>

      <div className="app-sidebar-brand">
        <img src={logoIcon} alt="Linqly logo" className="app-sidebar-brand-logo" />
        <div className="app-sidebar-brand-name">Linqly</div>
      </div>

      <nav className="app-sidebar-nav">
        <div className="app-sidebar-section app-sidebar-section-main">
          <div className="app-sidebar-section-title">MAIN</div>
          {mainItems.map((item) => (
            <AppNavItem key={item.key} item={item} collapsed={collapsed} />
          ))}
        </div>

        <div className="app-sidebar-section app-sidebar-section-account">
          <div className="app-sidebar-section-title">ACCOUNT</div>
          {accountItems.map((item) => (
            <AppNavItem key={item.key} item={item} collapsed={collapsed} />
          ))}
          <button
            type="button"
            className="app-nav-link app-sidebar-nav-item app-sidebar-logout"
            onClick={handleLogout}
            title={collapsed ? "Logout" : undefined}
            aria-label="Logout"
          >
            <span className="app-sidebar-item-left">
              <img src={logoutIcon} alt="" aria-hidden="true" className="app-sidebar-item-icon" />
              <span className="app-sidebar-item-label">Logout</span>
            </span>
            {collapsed ? <span className="app-sidebar-tooltip">Logout</span> : null}
          </button>
        </div>
      </nav>
    </aside>
  );
}
