import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import HeaderBar from "./HeaderBar";
import "./AppShell.css";

export default function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <HeaderBar />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
