import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket";
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

export function CallProvider({ children }) {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCallId, setOutgoingCallId] = useState("");
  const [isInCall, setIsInCall] = useState(
    () => Boolean(localStorage.getItem("call:active"))
  );
  const timeoutRef = useRef(null);

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
        peerAvatar: resolveAvatarUrl(
          payload.callerAvatar || payload.caller?.avatarUrl || ""
        ),
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

    socket.on("call:incoming", onIncoming);
    socket.on("call:decline", onDecline);
    socket.on("call:end", onEnd);
    socket.on("call:accept", onAccept);

    return () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.off("call:incoming", onIncoming);
      socket.off("call:decline", onDecline);
      socket.off("call:end", onEnd);
      socket.off("call:accept", onAccept);
    };
  }, [incomingCall?.callId, outgoingCallId, isInCall]);

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
      const callWindow = window.open(url, "_blank", "noopener,noreferrer");
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

  const acceptCall = () => {
    if (!incomingCall) return;
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
    const callWindow = window.open(
      url,
      "_blank",
      "popup=yes,width=980,height=720"
    );
    if (!callWindow) {
      alert("Pop-up blocked. Allow popups to open the call window.");
    }
    socket.emit("call:accept", { callId: incomingCall.callId });
    setIncomingCall(null);
  };

  const declineCall = () => {
    if (!incomingCall) return;
    socket.emit("call:decline", { callId: incomingCall.callId });
    setIncomingCall(null);
  };

  const value = useMemo(
    () => ({
      incomingCall,
      outgoingCallId,
      isInCall,
      startCall,
      acceptCall,
      declineCall,
    }),
    [incomingCall, outgoingCallId, isInCall]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used inside CallProvider");
  return ctx;
}
