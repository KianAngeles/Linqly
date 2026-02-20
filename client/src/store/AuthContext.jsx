import { createContext, useContext, useEffect, useRef, useState } from "react";
import { authApi } from "../api/auth.api";
import { API_BASE, authFetch, syncAccessToken } from "../api/http";
import { socket } from "../socket";
import { isChatActive } from "./chatsStore";
import {
  NotificationSoundManager,
  initMessageNotificationSound,
} from "../utils/notificationSoundManager";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [ready, setReady] = useState(false);
  const [mutedChatIds, setMutedChatIds] = useState(new Set());
  const joinedChatIdsRef = useRef(new Set());

  async function refreshChatSettings(tokenOverride) {
    const token = tokenOverride || accessToken;
    if (!token) return;

    try {
      const data = await authFetch(`${API_BASE}/chats`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      }).then((r) => r.json());

      // build a Set of muted chatIds
      const muted = new Set(
        (data.chats || [])
          .filter((c) => c.settings?.isMuted)
          .map((c) => String(c._id))
      );

      setMutedChatIds(muted);

      (data.chats || []).forEach((chat) => {
        const chatId = String(chat._id);
        if (!joinedChatIdsRef.current.has(chatId)) {
          socket.emit("chat:join", { chatId });
          joinedChatIdsRef.current.add(chatId);
        }
      });
    } catch {
      // ignore
    }
  }

  async function refreshAndLoadMe() {
    const r = await authApi.refresh(); // uses HttpOnly cookie
    setAccessToken(r.accessToken);
    const me = await authApi.me(r.accessToken);
    setUser(me.user);
    await refreshChatSettings(r.accessToken);
    return r.accessToken;
  }

  useEffect(() => {
    (async () => {
      try {
        await refreshAndLoadMe();
      } catch {
        setUser(null);
        setAccessToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    syncAccessToken(accessToken);
  }, [accessToken]);

  useEffect(() => {
    const onTokenRefreshed = (event) => {
      const nextToken = String(event?.detail?.accessToken || "").trim();
      if (!nextToken) return;
      setAccessToken((prev) => (prev === nextToken ? prev : nextToken));
    };
    window.addEventListener("auth:access-token-refreshed", onTokenRefreshed);
    return () => {
      window.removeEventListener("auth:access-token-refreshed", onTokenRefreshed);
    };
  }, []);

  useEffect(() => {
    refreshChatSettings().catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (!user?.id) return;
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit("auth:online", user.id);
  }, [user]);

  useEffect(() => {
    initMessageNotificationSound();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const onNew = (msg) => {
      // ignore own messages (handle both senderId and sender.id payloads)
      const senderId = msg.senderId || msg.sender?.id;
      if (String(senderId) === String(user.id)) return;

      const mentioned = (msg.mentions || []).some(
        (m) => String(m.userId || m.id) === String(user.id)
      );

      // if chat is muted and not mentioned, do nothing
      if (!mentioned && mutedChatIds.has(String(msg.chatId))) return;
      if (isChatActive(msg.chatId)) return;
      NotificationSoundManager.onIncomingMessage({ chatId: msg.chatId });
    };

    socket.on("message:new", onNew);
    return () => socket.off("message:new", onNew);
  }, [user?.id, mutedChatIds]);

  async function login(email, password) {
    const r = await authApi.login({ email, password });
    setAccessToken(r.accessToken);
    setUser(r.user);
    await refreshChatSettings(r.accessToken);
  }

  async function register(displayName, username, email, password, gender) {
    const r = await authApi.register({
      displayName,
      username,
      email,
      password,
      gender,
    });
    setAccessToken(r.accessToken);
    setUser(r.user);
    await refreshChatSettings(r.accessToken);
  }

  async function logout() {
    try {
      if (user?.id) {
        socket.emit("auth:offline", user.id);
      }
      socket.disconnect();
      await authApi.logout();
    } finally {
      setUser(null);
      setAccessToken(null);
      syncAccessToken(null);
      joinedChatIdsRef.current = new Set();
    }
  }

  const value = {
    user,
    accessToken,
    ready,
    login,
    register,
    logout,
    refreshAndLoadMe,
    setUser,
    setAccessToken,
    refreshChatSettings,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
