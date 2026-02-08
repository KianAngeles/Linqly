import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket";
import { GROUP_CALLS_ENABLED } from "../constants/featureFlags";
import { useAuth } from "./AuthContext";

const CallContext = createContext(null);
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

function createCallId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function resolveAvatarUrl(rawUrl) {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  return `${API_BASE}${rawUrl}`;
}

function storeCallMeta(callId, meta) {
  if (!callId || !meta) return;
  try {
    localStorage.setItem(`call:${callId}`, JSON.stringify(meta));
  } catch {
    // ignore storage errors
  }
}

function openDetachedCallWindow(url) {
  const win = window.open(url, "_blank", "popup=yes,width=980,height=720");
  if (!win) return null;
  try {
    win.opener = null;
  } catch {
    // ignore
  }
  return win;
}

function emitWithAck(eventName, payload) {
  return new Promise((resolve) => {
    try {
      socket.emit(eventName, payload, (response) => {
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

export function CallProvider({ children }) {
  const { user, accessToken } = useAuth();
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCallId, setOutgoingCallId] = useState("");
  const [isInCall, setIsInCall] = useState(
    () => Boolean(localStorage.getItem("call:active"))
  );
  const timeoutRef = useRef(null);

  const joinGroupCall = useCallback(
    async ({ chatId, callId, chatName = "", startedByName = "" }) => {
      if (!GROUP_CALLS_ENABLED) {
        return { ok: false, message: "Group calls are disabled." };
      }
      if (!chatId) return { ok: false, message: "Missing chatId" };
      let nextCallId = String(callId || "");

      if (!nextCallId && accessToken) {
        try {
          const res = await fetch(`${API_BASE}/chats/${chatId}/ongoing-call`, {
            headers: { Authorization: `Bearer ${accessToken}` },
            credentials: "include",
          });
          const data = await res.json();
          if (res.ok && data?.ongoingCall?.callId) {
            nextCallId = String(data.ongoingCall.callId);
          }
        } catch {
          // ignore
        }
      }

      if (!nextCallId) {
        return { ok: false, message: "No ongoing call found" };
      }

      storeCallMeta(nextCallId, {
        scope: "group",
        role: "group",
        chatId,
        chatName,
        startedByName,
      });

      const url = `${window.location.origin}/call?callId=${encodeURIComponent(
        nextCallId
      )}&chatId=${encodeURIComponent(chatId)}&scope=group&role=group`;
      const callWindow = openDetachedCallWindow(url);
      if (!callWindow) {
        return {
          ok: false,
          message: "Pop-up blocked. Allow popups for this site to join a call.",
        };
      }
      return { ok: true, callId: nextCallId };
    },
    [accessToken]
  );

  const startGroupCall = useCallback(
    async ({ chatId, callType = "audio" }) => {
      if (!GROUP_CALLS_ENABLED) {
        return { ok: false, message: "Group calls are disabled." };
      }
      if (!chatId) return { ok: false, message: "Missing chatId" };
      if (isInCall) return { ok: false, message: "You are already in a call" };
      if (!socket.connected) {
        return { ok: false, message: "Socket not connected" };
      }

      const callId = createCallId();
      const response = await emitWithAck("group_call:start", {
        callId,
        chatId,
        callType,
      });

      if (!response?.ok) {
        return {
          ok: false,
          message: response?.message || "Failed to start group call",
        };
      }

      const payload = response?.payload || {};
      const resolvedCallId = String(payload.callId || callId);
      const joinResult = await joinGroupCall({
        chatId,
        callId: resolvedCallId,
        chatName: payload.chatName || "",
        startedByName: payload.startedByName || user?.username || "",
      });

      if (!joinResult?.ok) return joinResult;
      return { ok: true, callId: resolvedCallId, payload };
    },
    [isInCall, joinGroupCall, user?.username]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const onConnect = () => {
      console.log("socket connected", socket.id);
    };
    const onConnectError = (err) => {
      console.log("socket connect_error", err?.message || err);
    };
    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);

    const onIncoming = (payload) => {
      if (!payload?.callId || !payload?.callerId) return;
      if (isInCall) {
        socket.emit("call:decline", { callId: payload.callId, reason: "busy" });
        return;
      }
      console.log("call:incoming", payload);
      try {
        const tag = `[Call] Incoming from ${payload.callerName || payload.caller?.username || payload.callerId}`;
        window.dispatchEvent(new CustomEvent("call:debug", { detail: tag }));
      } catch {
        // ignore
      }
      setIncomingCall({
        callId: payload.callId,
        chatId: payload.chatId,
        peerId: payload.callerId,
        peerName: payload.callerName || payload.caller?.username || "Unknown",
        scope: "direct",
        peerAvatar: resolveAvatarUrl(
          payload.callerAvatar || payload.caller?.avatarUrl || ""
        ),
      });
    };

    const onGroupIncoming = (payload) => {
      if (!GROUP_CALLS_ENABLED) return;
      if (!payload?.callId || !payload?.chatId) return;
      if (isInCall) return;
      if (incomingCall?.callId && String(incomingCall.callId) === String(payload.callId)) return;
      setIncomingCall({
        callId: payload.callId,
        chatId: payload.chatId,
        peerId: payload.starterId || "",
        peerName: payload.starterName || "Unknown",
        peerAvatar: resolveAvatarUrl(payload.starterAvatar || ""),
        scope: "group",
        chatName: payload.chatName || "",
        startedByName: payload.starterName || "Unknown",
      });
    };

    const onDecline = (payload) => {
      if (payload?.callId && payload.callId === outgoingCallId) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setOutgoingCallId("");
      }
      if (payload?.callId && payload.callId === incomingCall?.callId) {
        setIncomingCall(null);
      }
    };

    const onEnd = (payload) => {
      if (payload?.callId && payload.callId === incomingCall?.callId) {
        setIncomingCall(null);
      }
      if (payload?.callId && payload.callId === outgoingCallId) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setOutgoingCallId("");
      }
    };

    const onAccept = (payload) => {
      if (payload?.callId && payload.callId === outgoingCallId) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      }
    };

    const onGroupEnded = (payload) => {
      if (!GROUP_CALLS_ENABLED) return;
      if (!payload?.callId) return;
      if (
        incomingCall?.scope === "group" &&
        String(payload.callId) === String(incomingCall.callId)
      ) {
        setIncomingCall(null);
      }
    };

    socket.on("call:incoming", onIncoming);
    socket.on("group_call:notification", onGroupIncoming);
    socket.on("call:decline", onDecline);
    socket.on("call:end", onEnd);
    socket.on("call:accept", onAccept);
    socket.on("group_call:ended", onGroupEnded);

    return () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("call:incoming", onIncoming);
      socket.off("group_call:notification", onGroupIncoming);
      socket.off("call:decline", onDecline);
      socket.off("call:end", onEnd);
      socket.off("call:accept", onAccept);
      socket.off("group_call:ended", onGroupEnded);
    };
  }, [incomingCall?.callId, incomingCall?.scope, outgoingCallId, isInCall]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === "call:active") {
        setIsInCall(Boolean(event.newValue));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const startCall = (callData) => {
    if (!callData?.peerId || !callData?.chatId) {
      console.log("call:start blocked", {
        peerId: callData?.peerId,
        chatId: callData?.chatId,
      });
      try {
        window.dispatchEvent(
          new CustomEvent("call:debug", {
            detail: "Call start blocked (missing user/peer/chat).",
          })
        );
      } catch {
        // ignore
      }
      return;
    }
    const callId = callData.callId || createCallId();
    setOutgoingCallId(callId);
    storeCallMeta(callId, {
      role: "caller",
      chatId: callData.chatId,
      peerId: callData.peerId,
      peerName: callData.peerName,
      peerAvatar: callData.peerAvatar,
    });

    const path = `/call?callId=${encodeURIComponent(
      callId
    )}&chatId=${encodeURIComponent(callData.chatId)}&peerId=${encodeURIComponent(
      callData.peerId
    )}&role=caller`;
    const url = `${window.location.origin}${path}`;
    if (!callData.skipOpen) {
      const callWindow = openDetachedCallWindow(url);
      if (!callWindow) {
        alert("Pop-up blocked. Allow popups for this site to start a call.");
        setOutgoingCallId("");
        try {
          localStorage.removeItem(`call:${callId}`);
        } catch {
          // ignore
        }
        return;
      }
    }

    const caller = callData.caller || {
      id: user?.id,
      username: user?.username,
      avatarUrl: user?.avatarUrl || "",
    };

    console.log("call:start emit", {
      callId,
      chatId: callData.chatId,
      calleeId: callData.peerId,
      socketConnected: socket.connected,
      callerId: caller?.id,
    });
    try {
      window.dispatchEvent(
        new CustomEvent("call:debug", {
          detail: `Emitting call:start (connected=${socket.connected})`,
        })
      );
    } catch {
      // ignore
    }

    socket.emit("call:start", {
      callId,
      chatId: callData.chatId,
      calleeId: callData.peerId,
      caller,
    });

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      socket.emit("call:end", { callId, reason: "timeout" });
      setOutgoingCallId("");
    }, 30000);
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    if (incomingCall.scope === "group") {
      if (!GROUP_CALLS_ENABLED) {
        setIncomingCall(null);
        return;
      }
      const result = await joinGroupCall({
        chatId: incomingCall.chatId,
        callId: incomingCall.callId,
        chatName: incomingCall.chatName || "",
        startedByName: incomingCall.startedByName || incomingCall.peerName || "",
      });
      if (!result?.ok) {
        alert(result?.message || "Unable to join this group call.");
        return;
      }
      setIncomingCall(null);
      return;
    }
    storeCallMeta(incomingCall.callId, {
      role: "callee",
      chatId: incomingCall.chatId,
      peerId: incomingCall.peerId,
      peerName: incomingCall.peerName,
      peerAvatar: incomingCall.peerAvatar,
    });
    const url = `${window.location.origin}/call?callId=${encodeURIComponent(
      incomingCall.callId
    )}&chatId=${encodeURIComponent(
      incomingCall.chatId
    )}&peerId=${encodeURIComponent(incomingCall.peerId)}&role=callee`;
    const callWindow = openDetachedCallWindow(url);
    if (!callWindow) {
      alert("Pop-up blocked. Allow popups to open the call window.");
    }
    socket.emit("call:accept", { callId: incomingCall.callId });
    setIncomingCall(null);
  };

  const declineCall = () => {
    if (!incomingCall) return;
    if (incomingCall.scope === "group") {
      setIncomingCall(null);
      return;
    }
    socket.emit("call:decline", { callId: incomingCall.callId });
    setIncomingCall(null);
  };

  const value = useMemo(
    () => ({
      incomingCall,
      outgoingCallId,
      isInCall,
      startCall,
      startGroupCall,
      joinGroupCall,
      acceptCall,
      declineCall,
    }),
    [
      incomingCall,
      outgoingCallId,
      isInCall,
      startCall,
      startGroupCall,
      joinGroupCall,
      acceptCall,
      declineCall,
    ]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used inside CallProvider");
  return ctx;
}
