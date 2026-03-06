import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./features/auth/pages/Landing.jsx";
import Login from "./features/auth/pages/Login.jsx";
import Register from "./features/auth/pages/Register.jsx";
import ForgotPassword from "./features/auth/pages/ForgotPassword.jsx";
import ResetPassword from "./features/auth/pages/ResetPassword.jsx";
import AppShell from "./app/layout/AppShell.jsx";
import { useAuth } from "./store/AuthContext";
import ChatsPanel from "./features/chats/pages/ChatsPanel.jsx";
import Settings from "./features/settings/pages/Settings.jsx";
import HangoutsMap from "./features/hangouts/pages/HangoutsMap.jsx";
import Friends from "./features/friends/pages/Friends.jsx";
import Home from "./features/home/pages/Home.jsx";
import Call from "./features/calls/pages/Call.jsx";
import Profile from "./features/profile/pages/Profile.jsx";
import SearchResults from "./features/search/pages/SearchResults.jsx";
import Notifications from "./features/notifications/pages/Notifications.jsx";


function Protected({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/" replace />;
}

function ProfileRedirect() {
  const { user } = useAuth();
  const usernameRaw = user?.username ? String(user.username) : "";
  const username = usernameRaw.replace(/^@+/, "");
  if (!username) return <Navigate to="/app" replace />;
  return <Navigate to={`/app/profile/${username}`} replace />;
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
          <Route path="profile" element={<ProfileRedirect />} />
          <Route path="profile/:username" element={<Profile />} />
          <Route path="friends" element={<Friends />} />
          <Route path="search" element={<SearchResults />} />
          <Route path="notifications" element={<Notifications />} />
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
