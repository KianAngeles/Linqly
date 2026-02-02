import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AppShell from "./components/layout/AppShell";
import { useAuth } from "./store/AuthContext";
import ChatsPanel from "./pages/ChatsPanel";
import Settings from "./pages/Settings";
import HangoutsMap from "./pages/HangoutsMap";
import Friends from "./pages/Friends";
import Home from "./pages/Home";
import Call from "./pages/Call";


function Protected({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { ready } = useAuth();

  if (!ready) return <div className="container py-5">Loading...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/app"
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route index element={<Home />} />
          <Route path="chats" element={<ChatsPanel />} />
          <Route path="chats/:chatId" element={<ChatsPanel />} />
          <Route path="map" element={<HangoutsMap />} />
          <Route path="friends" element={<Friends />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route
          path="/call"
          element={
            <Protected>
              <Call />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
