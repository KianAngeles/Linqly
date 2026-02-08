import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import HeaderBar from "./HeaderBar";
import IncomingCallModal from "../calls/IncomingCallModal";
import UniversalChat from "../universal-chat/UniversalChat";
import "./AppShell.css";

export default function AppShell() {
  const { pathname } = useLocation();
  const hideUniversalChat = pathname === "/app/chats" || pathname.startsWith("/app/chats/");

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <HeaderBar />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
      <IncomingCallModal />
      {!hideUniversalChat ? <UniversalChat /> : null}
    </div>
  );
}
