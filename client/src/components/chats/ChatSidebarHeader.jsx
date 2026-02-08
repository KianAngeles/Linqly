import { useEffect, useMemo, useRef, useState } from "react";
import headerMoreIcon from "../../assets/icons/more.png";
import backIcon from "../../assets/icons/back.png";

const MODE_TITLES = {
  chats: "Chats",
  archive: "Archive",
  requests: "Message Requests",
};

export default function ChatSidebarHeader({ mode, onModeChange, hasRequests = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const title = useMemo(() => MODE_TITLES[mode] || MODE_TITLES.chats, [mode]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const onEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutsideClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutsideClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  const handleSelect = (nextMode) => {
    onModeChange(nextMode);
    setMenuOpen(false);
  };

  const isAltMode = mode === "archive" || mode === "requests";

  return (
    <div className="d-flex align-items-center justify-content-between mb-2 chat-sidebar-header-row">
      <div className="fw-bold chat-sidebar-title">{title}</div>
      <div className="dropdown chat-sidebar-header-menu" ref={menuRef}>
        <button
          type="button"
          className={`chat-more-btn ${hasRequests ? "has-requests" : ""}`}
          aria-label={isAltMode ? "Back to chats" : "Open chat sidebar menu"}
          aria-haspopup={isAltMode ? undefined : "true"}
          aria-expanded={isAltMode ? undefined : menuOpen}
          onClick={() => {
            if (isAltMode) {
              onModeChange("chats");
            } else {
              setMenuOpen((prev) => !prev);
            }
          }}
        >
          <img src={isAltMode ? backIcon : headerMoreIcon} alt="" width={18} height={18} />
        </button>
        {!isAltMode && (
          <div
            className={`dropdown-menu dropdown-menu-end sidebar-header-dropdown-menu ${
              menuOpen ? "show" : ""
            }`}
            role="menu"
          >
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={() => handleSelect("archive")}
            >
              Archive
            </button>
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={() => handleSelect("requests")}
            >
              Message Requests
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
