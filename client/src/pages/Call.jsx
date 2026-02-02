import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { socket } from "../socket";
import micIcon from "../assets/icons/mic.png";
import micMutedIcon from "../assets/icons/mic2.png";
import videoIcon from "../assets/icons/video.png";
import callEndIcon from "../assets/icons/call-end.png";
import "./Call.css";

const ICE_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function loadStoredMeta(callId) {
  if (!callId) return null;
  try {
    const raw = localStorage.getItem(`call:${callId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function Call() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const callId = searchParams.get("callId") || "";
  const chatId = searchParams.get("chatId") || "";
  const role = searchParams.get("role") || "caller";
  const storedMeta = useMemo(() => loadStoredMeta(callId), [callId]);
  const peerId = searchParams.get("peerId") || storedMeta?.peerId || "";
  const [status, setStatus] = useState(
    role === "caller" ? "ringing" : "connecting",
  );
  const [localAudioEnabled, setLocalAudioEnabled] = useState(true);
  const [localVideoEnabled, setLocalVideoEnabled] = useState(true);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(true);
  const [error, setError] = useState("");
  const [debug, setDebug] = useState("");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const audioTransceiverRef = useRef(null);
  const videoTransceiverRef = useRef(null);
  const pendingIceRef = useRef([]);
  const endedRef = useRef(false);
  const readySentRef = useRef(false);
  const offerSentRef = useRef(false);
  const offerHandledRef = useRef(false);
  const mediaInitRef = useRef(null);
  const videoToggleBusyRef = useRef(false);
  const localVideoEnabledRef = useRef(true);

  useEffect(() => {
    localVideoEnabledRef.current = localVideoEnabled;
  }, [localVideoEnabled]);
  const lastVideoToggleAtRef = useRef(0);
  const renegotiatingRef = useRef(false);

  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const peerName = storedMeta?.peerName || "Peer";
  const peerAvatar = storedMeta?.peerAvatar || "";
  const userAvatar =
    user?.avatarUrl &&
    (user.avatarUrl.startsWith("http://") ||
      user.avatarUrl.startsWith("https://"))
      ? user.avatarUrl
      : user?.avatarUrl
        ? `${apiBase}${user.avatarUrl}`
        : "";

  const cleanupConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
    }
    if (callId) {
      try {
        localStorage.removeItem(`call:${callId}`);
      } catch {
        // ignore
      }
    }
  }, [callId]);

  const endCall = useCallback(
    (reason, shouldEmit = true) => {
      if (endedRef.current) return;
      endedRef.current = true;
      setStatus("ended");
      if (shouldEmit && callId) {
        socket.emit("call:end", { callId, reason });
      }
      try {
        localStorage.removeItem("call:active");
      } catch {
        // ignore
      }
      cleanupConnection();
      setTimeout(() => window.close(), 400);
    },
    [callId, cleanupConnection],
  );

  useEffect(() => {
    if (!callId) return;
    try {
      localStorage.setItem("call:active", callId);
    } catch {
      // ignore
    }
    return () => {
      try {
        localStorage.removeItem("call:active");
      } catch {
        // ignore
      }
    };
  }, [callId]);

  const initMedia = useCallback(async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Media devices API not available.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      if (pcRef.current) {
        const audioTrack = stream.getAudioTracks()[0] || null;
        const videoTrack = stream.getVideoTracks()[0] || null;
        if (audioTransceiverRef.current) {
          await audioTransceiverRef.current.sender.replaceTrack(audioTrack);
        } else if (audioTrack) {
          pcRef.current.addTrack(audioTrack, stream);
        }
        if (videoTransceiverRef.current) {
          await videoTransceiverRef.current.sender.replaceTrack(videoTrack);
        } else if (videoTrack) {
          pcRef.current.addTrack(videoTrack, stream);
        }
      }
    } catch (err) {
      const name = err?.name || "UnknownError";
      const message = err?.message || "Unable to access camera or microphone.";
      console.log("getUserMedia error", name, message);
      setError(`${message} (${name})`);
    }
  }, []);

  const ensureMediaReady = useCallback(async () => {
    if (localStreamRef.current) return;
    if (mediaInitRef.current) {
      await mediaInitRef.current;
      return;
    }
    mediaInitRef.current = initMedia().finally(() => {
      mediaInitRef.current = null;
    });
    await mediaInitRef.current;
  }, [initMedia]);

  useEffect(() => {
    if (!callId || !peerId) return;

    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;
    remoteStreamRef.current = new MediaStream();

    if (!audioTransceiverRef.current) {
      audioTransceiverRef.current = pc.addTransceiver("audio", {
        direction: "sendrecv",
      });
    }
    if (!videoTransceiverRef.current) {
      videoTransceiverRef.current = pc.addTransceiver("video", {
        direction: "sendrecv",
      });
    }

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStreamRef.current?.addTrack(track);
      });
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("call:ice", { callId, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pcRef.current) return;
      if (pcRef.current.connectionState === "connected") {
        setStatus("in-call");
      }
      if (["failed", "disconnected"].includes(pcRef.current.connectionState)) {
        endCall("connection", false);
      }
    };

    initMedia();

    const handleAccept = async (payload) => {
      if (role !== "caller" || payload?.callId !== callId) return;
      console.log("call:accept", payload);
      setDebug("Received call:accept");
      setStatus("connecting");
    };

    const handleOffer = async (payload) => {
      if (payload?.callId !== callId) return;
      if (!payload?.renegotiate && role !== "callee") return;
      if (!payload?.renegotiate && offerHandledRef.current) return;
      console.log("call:offer", payload);
      setDebug(
        payload?.renegotiate
          ? "Received renegotiate offer"
          : "Received call:offer",
      );
      if (pc.signalingState !== "stable") return;
      await ensureMediaReady();
      if (!payload?.renegotiate) {
        offerHandledRef.current = true;
      }
      await pc.setRemoteDescription(payload.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call:answer", {
        callId,
        answer,
        renegotiate: payload?.renegotiate,
      });
      pendingIceRef.current.forEach((candidate) => {
        pc.addIceCandidate(candidate).catch(() => {});
      });
      pendingIceRef.current = [];
      if (payload?.renegotiate) {
        offerHandledRef.current = false;
      }
    };

    const handleAnswer = async (payload) => {
      if (payload?.callId !== callId || role !== "caller") return;
      console.log("call:answer", payload);
      setDebug(
        payload?.renegotiate
          ? "Received renegotiate answer"
          : "Received call:answer",
      );
      await pc.setRemoteDescription(payload.answer);
      pendingIceRef.current.forEach((candidate) => {
        pc.addIceCandidate(candidate).catch(() => {});
      });
      pendingIceRef.current = [];
    };

    const handleReady = async (payload) => {
      if (payload?.callId !== callId || role !== "caller") return;
      if (offerSentRef.current) return;
      console.log("call:ready", payload);
      setDebug("Peer ready");
      await ensureMediaReady();
      offerSentRef.current = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("call:offer", { callId, offer });
    };

    const handleIce = async (payload) => {
      if (payload?.callId !== callId || !payload?.candidate) return;
      console.log("call:ice", payload);
      const candidate = new RTCIceCandidate(payload.candidate);
      if (!pc.remoteDescription) {
        pendingIceRef.current.push(candidate);
        return;
      }
      pc.addIceCandidate(candidate).catch(() => {});
    };

    const handleEnd = (payload) => {
      if (payload?.callId !== callId) return;
      endCall(payload.reason || "ended", false);
    };

    const handleDecline = (payload) => {
      if (payload?.callId !== callId) return;
      endCall(payload.reason || "declined", false);
    };

    const handleAudioState = (payload) => {
      if (payload?.callId !== callId) return;
      setRemoteAudioEnabled(Boolean(payload.enabled));
    };

    const handleVideoState = (payload) => {
      if (payload?.callId !== callId) return;
      setRemoteVideoEnabled(Boolean(payload.enabled));
    };

    socket.on("call:accept", handleAccept);
    socket.on("call:ready", handleReady);
    socket.on("call:offer", handleOffer);
    socket.on("call:answer", handleAnswer);
    socket.on("call:ice", handleIce);
    socket.on("call:renegotiate", handleRenegotiate);
    socket.on("call:end", handleEnd);
    socket.on("call:decline", handleDecline);
    socket.on("call:audio-state", handleAudioState);
    socket.on("call:video-state", handleVideoState);

    return () => {
      socket.off("call:accept", handleAccept);
      socket.off("call:ready", handleReady);
      socket.off("call:offer", handleOffer);
      socket.off("call:answer", handleAnswer);
      socket.off("call:ice", handleIce);
      socket.off("call:renegotiate", handleRenegotiate);
      socket.off("call:end", handleEnd);
      socket.off("call:decline", handleDecline);
      socket.off("call:audio-state", handleAudioState);
      socket.off("call:video-state", handleVideoState);
      cleanupConnection();
    };
  }, [
    callId,
    peerId,
    role,
    cleanupConnection,
    endCall,
    initMedia,
    ensureMediaReady,
  ]);

  useEffect(() => {
    console.log("call socket state", socket.connected, socket.id);
    setDebug(`Socket connected=${socket.connected}`);
    if (callId && !readySentRef.current) {
      readySentRef.current = true;
      socket.emit("call:ready", { callId, role });
      console.log("call:ready emit", { callId, role });
      setDebug("Emitted call:ready");
    }
    const onConnect = () => {
      console.log("call socket connected", socket.id);
      setDebug("Socket connected");
      if (callId && !readySentRef.current) {
        readySentRef.current = true;
        socket.emit("call:ready", { callId, role });
        console.log("call:ready emit", { callId, role });
        setDebug("Emitted call:ready");
      }
    };
    const onConnectError = (err) => {
      console.log("call socket connect_error", err?.message || err);
      setDebug("Socket connect_error");
    };
    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    return () => {
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
    };
    if (socket.connected && callId && !readySentRef.current) {
      readySentRef.current = true;
      socket.emit("call:ready", { callId, role });
      console.log("call:ready emit", { callId, role });
      setDebug("Emitted call:ready");
    }
  }, [callId, role]);

  useEffect(() => {
    if (role !== "caller") return;
    if (status !== "ringing") return;
    const timer = setTimeout(() => {
      endCall("timeout");
    }, 30000);
    return () => clearTimeout(timer);
  }, [role, status, endCall]);

  useEffect(() => {
    if (role !== "caller" || status !== "ringing") return;
    const audio = new Audio("/sounds/ringing.mp3");
    audio.loop = true;
    audio.volume = 0.6;
    audio.play().catch(() => {});
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [role, status]);

  useEffect(() => {
    const handleUnload = () => {
      endCall("ended");
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [endCall]);

  const toggleAudio = () => {
    const next = !localAudioEnabled;
    setLocalAudioEnabled(next);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
    }
    socket.emit("call:audio-state", { callId, enabled: next });
  };

const toggleVideo = async () => {
  console.log("video toggle click");
  if (videoToggleBusyRef.current) return;
  videoToggleBusyRef.current = true;

  try {
    const next = !localVideoEnabledRef.current;
    const pc = pcRef.current;
    const stream = localStreamRef.current;

    if (!pc || !stream) return;

    const sender =
      videoTransceiverRef.current?.sender ||
      pc.getSenders().find((s) => s.track?.kind === "video");
    const currentTrack = stream.getVideoTracks()[0] || null;

    console.log("video toggle state", {
      next,
      signaling: pc.signalingState,
      hasTrack: Boolean(currentTrack),
      trackState: currentTrack?.readyState,
      senderTrack: sender?.track?.readyState || sender?.track?.kind || null,
    });

    if (!next) {
      if (currentTrack) {
        currentTrack.stop();
        try {
          stream.removeTrack(currentTrack);
        } catch {}
      }
      if (sender) {
        await sender.replaceTrack(null);
      }
      if (videoTransceiverRef.current) {
        videoTransceiverRef.current.direction = "recvonly";
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      setLocalVideoEnabled(false);
      socket.emit("call:video-state", { callId, enabled: false });
      return;
    }

    const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) throw new Error("No video track from getUserMedia");

    if (sender) await sender.replaceTrack(newTrack);

    stream.getVideoTracks().forEach((t) => {
      try {
        stream.removeTrack(t);
      } catch {}
      try {
        t.stop();
      } catch {}
    });
    stream.addTrack(newTrack);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    if (videoTransceiverRef.current) {
      videoTransceiverRef.current.direction = "sendrecv";
    }

    setLocalVideoEnabled(true);
    socket.emit("call:video-state", { callId, enabled: true });

    if (pc.signalingState === "stable") {
      if (role === "caller") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log("call:offer renegotiate emit");
        socket.emit("call:offer", { callId, offer, renegotiate: true });
      } else {
        socket.emit("call:renegotiate", { callId });
      }
    }
  } catch (err) {
    console.log("toggleVideo error", err);
    setError(err?.message || "Failed to toggle video");
    setLocalVideoEnabled(false);
  } finally {
    videoToggleBusyRef.current = false;
  }
};

  const localInitial = user?.username?.trim().charAt(0).toUpperCase() || "?";
  const remoteInitial = peerName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="call-page">
      <div className="call-header">
        <div className="call-title">Call</div>
        <div className="call-status">
          {status === "ringing" && "Ringing..."}
          {status === "connecting" && "Connecting..."}
          {status === "in-call" && "Connected"}
          {status === "ended" && "Call ended"}
        </div>
      </div>

      {error && (
        <div className="call-error">
          <div>{error}</div>
          <button type="button" className="call-retry-btn" onClick={initMedia}>
            Retry media
          </button>
        </div>
      )}

      <div className="call-cards">
        <div className="call-card">
          <div className="call-card-avatar">
            {userAvatar ? (
              <img src={userAvatar} alt={`${user.username} avatar`} />
            ) : (
              <div className="call-card-avatar-fallback">{localInitial}</div>
            )}
          </div>
          <div className="call-card-name">{user?.username || "You"}</div>
          <div className="call-card-media">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ display: "block", width: "100%", height: "100%" }}
            />
            {!localVideoEnabled && (
              <div className="call-card-media-off">Video off</div>
            )}
          </div>

          {!localAudioEnabled && (
            <div className="call-card-indicator">Muted</div>
          )}
        </div>

        <div className="call-card">
          <div className="call-card-avatar">
            {peerAvatar ? (
              <img src={peerAvatar} alt={`${peerName} avatar`} />
            ) : (
              <div className="call-card-avatar-fallback">{remoteInitial}</div>
            )}
          </div>
          <div className="call-card-name">{peerName}</div>
          <div className="call-card-media">
            {remoteVideoEnabled ? (
              <video ref={remoteVideoRef} autoPlay playsInline />
            ) : (
              <div className="call-card-media-off">Video off</div>
            )}
          </div>
          {!remoteAudioEnabled && (
            <div className="call-card-indicator">Muted</div>
          )}
        </div>
      </div>

      <div className="call-controls">
        <button
          type="button"
          className={`call-control ${localAudioEnabled ? "" : "is-off"}`}
          onClick={toggleAudio}
          disabled={!localStreamRef.current}
        >
          <img
            src={localAudioEnabled ? micIcon : micMutedIcon}
            alt={localAudioEnabled ? "Mute" : "Unmute"}
          />
        </button>
        <button
          type="button"
          className={`call-control ${localVideoEnabled ? "" : "is-off"}`}
          onClick={toggleVideo}
          disabled={!localStreamRef.current}
        >
          <img
            src={videoIcon}
            alt={localVideoEnabled ? "Disable video" : "Enable video"}
          />
        </button>
        <button
          type="button"
          className="call-control end"
          onClick={() => endCall("ended")}
        >
          <img src={callEndIcon} alt="End call" />
        </button>
      </div>

      <div className="call-meta">
        <div>Call ID: {callId || "unknown"}</div>
        <div>Chat ID: {chatId || "unknown"}</div>
        {debug && <div>Debug: {debug}</div>}
      </div>
    </div>
  );
}
const handleRenegotiate = async (payload) => {
  if (payload?.callId !== callId || role !== "caller") return;
  if (renegotiatingRef.current) return;
  if (pc.signalingState !== "stable") return;
  try {
    renegotiatingRef.current = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log("call:offer renegotiate emit");
    socket.emit("call:offer", { callId, offer, renegotiate: true });
  } finally {
    renegotiatingRef.current = false;
  }
};
