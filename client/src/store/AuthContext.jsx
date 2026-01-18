import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authApi } from "../api/auth.api";
import { socket } from "../socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [ready, setReady] = useState(false);
  const [mutedChatIds, setMutedChatIds] = useState(new Set());
  const audioUnlockedRef = useRef(false);
  const joinedChatIdsRef = useRef(new Set());

  async function refreshChatSettings(tokenOverride) {
    const token = tokenOverride || accessToken;
    if (!token) return;

    try {
      const data = await fetch(`${import.meta.env.VITE_API_URL}/chats`, {
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
    refreshChatSettings().catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    if (!user?.id) return;
    socket.emit("auth:online", user.id);
  }, [user]);

  const notifyAudio = useMemo(() => {
    const a = new Audio("/sounds/notify.mp3");
    a.volume = 0.5;
    return a;
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      audioUnlockedRef.current = true;
      notifyAudio
        .play()
        .then(() => {
          notifyAudio.pause();
          notifyAudio.currentTime = 0;
        })
        .catch(() => {});
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [notifyAudio]);

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

      notifyAudio.currentTime = 0;
      notifyAudio.play().catch(() => {});
    };

    socket.on("message:new", onNew);
    return () => socket.off("message:new", onNew);
  }, [user?.id, mutedChatIds, notifyAudio]);

  async function login(email, password) {
    const r = await authApi.login({ email, password });
    setAccessToken(r.accessToken);
    setUser(r.user);
    await refreshChatSettings();
  }

  async function register(username, email, password, gender) {
    const r = await authApi.register({ username, email, password, gender });
    setAccessToken(r.accessToken);
    setUser(r.user);
    await refreshChatSettings();
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setAccessToken(null);
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
