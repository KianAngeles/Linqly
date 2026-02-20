import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { socket } from "../socket";
import CallLayout from "../components/calls/CallLayout";
import GroupCallAdminMenu from "../components/calls/GroupCallAdminMenu";
import { messagesApi } from "../api/messages.api";
import { API_BASE } from "../api/http";
import { GROUP_CALLS_ENABLED } from "../constants/featureFlags";

const TURN_URLS = (import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_URL || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME || "";
const TURN_CREDENTIAL =
  import.meta.env.VITE_TURN_CREDENTIAL || import.meta.env.VITE_TURN_PASSWORD || "";

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    ...(TURN_URLS.length
      ? [
          {
            urls: TURN_URLS.length === 1 ? TURN_URLS[0] : TURN_URLS,
            username: TURN_USERNAME,
            credential: TURN_CREDENTIAL,
          },
        ]
      : []),
  ],
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

function snapshotTrack(track) {
  if (!track) return null;
  return {
    id: track.id || "",
    kind: track.kind || "",
    enabled: track.enabled !== false,
    muted: Boolean(track.muted),
    readyState: track.readyState || "",
    label: track.label || "",
  };
}

function snapshotPc(pc) {
  if (!pc) return null;
  return {
    connectionState: pc.connectionState || "",
    iceConnectionState: pc.iceConnectionState || "",
    iceGatheringState: pc.iceGatheringState || "",
    signalingState: pc.signalingState || "",
    senders: (pc.getSenders?.() || []).map((sender) => snapshotTrack(sender.track)),
    receivers: (pc.getReceivers?.() || []).map((receiver) => snapshotTrack(receiver.track)),
    transceivers: (pc.getTransceivers?.() || []).map((transceiver) => ({
      mid: transceiver?.mid ?? null,
      direction: transceiver?.direction || "",
      currentDirection: transceiver?.currentDirection || "",
      sender: snapshotTrack(transceiver?.sender?.track),
      receiver: snapshotTrack(transceiver?.receiver?.track),
    })),
  };
}

export default function Call() {
  const { user, accessToken } = useAuth();
  const [searchParams] = useSearchParams();
  const callId = searchParams.get("callId") || "";
  const chatId = searchParams.get("chatId") || "";
  const role = searchParams.get("role") || "caller";
  const storedMeta = useMemo(() => loadStoredMeta(callId), [callId]);
  const scope = searchParams.get("scope") || storedMeta?.scope || "direct";
  const isGroupCallRequested = scope === "group";
  const isGroupCall = isGroupCallRequested && GROUP_CALLS_ENABLED;
  const peerId = searchParams.get("peerId") || storedMeta?.peerId || "";

  const [status, setStatus] = useState(role === "caller" ? "ringing" : "connecting");
  const [localAudioEnabled, setLocalAudioEnabled] = useState(true);
  const [localVideoEnabled, setLocalVideoEnabled] = useState(true);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(true);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [localStreamTick, setLocalStreamTick] = useState(0);
  const [remoteStreamTick, setRemoteStreamTick] = useState(0);
  const [mutedForMeByUserId, setMutedForMeByUserId] = useState({});
  const [hiddenVideoByUserId, setHiddenVideoByUserId] = useState({});
  const [error, setError] = useState("");
  const [debug, setDebug] = useState("");
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [groupCallState, setGroupCallState] = useState(null);
  const [groupActionBusy, setGroupActionBusy] = useState(false);
  const [groupRemoteTick, setGroupRemoteTick] = useState(0);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [debugSnapshotText, setDebugSnapshotText] = useState("");
  const [callDebugEvents, setCallDebugEvents] = useState([]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const audioSenderRef = useRef(null);
  const videoSenderRef = useRef(null);
  const pendingIceRef = useRef([]);
  const mediaInitRef = useRef(null);
  const groupPeersRef = useRef(new Map());
  const groupRemoteStreamsRef = useRef(new Map());
  const groupPendingIceRef = useRef(new Map());
  const groupMakingOfferRef = useRef(new Set());
  const groupOfferSentRef = useRef(new Set());
  const groupRemoteVideoElsRef = useRef(new Map());
  const groupRemoteAudioElsRef = useRef(new Map());
  const debugIntervalRef = useRef(null);

  const endedRef = useRef(false);
  const readySentRef = useRef(false);
  const offerSentRef = useRef(false);
  const localTracksReadyRef = useRef(false);
  const videoToggleBusyRef = useRef(false);
  const localVideoEnabledRef = useRef(true);
  const renegotiatingRef = useRef(false);
  const makingOfferRef = useRef(false);
  const negotiationReadyRef = useRef(false);
  const autoplayMutedRef = useRef(false);
  const connectedAtRef = useRef(null);
  const missedLoggedRef = useRef(false);
  const completedLoggedRef = useRef(false);

  const apiBase = API_BASE;
  const displayName = user?.displayName || user?.username || "You";
  const localUserId = user?.id || user?._id || user?.userId || "";
  const peerName = storedMeta?.peerName || "Peer";
  const peerAvatar = storedMeta?.peerAvatar || "";
  const userAvatar =
    user?.avatarUrl &&
    (user.avatarUrl.startsWith("http://") || user.avatarUrl.startsWith("https://"))
      ? user.avatarUrl
      : user?.avatarUrl
        ? `${apiBase}${user.avatarUrl}`
        : "";

  useEffect(() => {
    // Detach this popup from its opener so closing other app tabs doesn't kill the call window.
    try {
      if (window.opener) {
        window.opener = null;
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isGroupCallRequested || GROUP_CALLS_ENABLED) return;
    setError("Group calls are disabled.");
    setStatus("ended");
    setTimeout(() => window.close(), 400);
  }, [isGroupCallRequested]);

  useEffect(() => {
    localVideoEnabledRef.current = localVideoEnabled;
  }, [localVideoEnabled]);

  useEffect(() => {
    // Debug bridge for inspecting sender/receiver tracks from DevTools.
    window.__linqlyCallDebug = {
      getPc: () => pcRef.current,
      receivers: () =>
        (pcRef.current?.getReceivers() || []).map((receiver) => ({
          kind: receiver.track?.kind || null,
          state: receiver.track?.readyState || null,
          muted: Boolean(receiver.track?.muted),
          enabled: Boolean(receiver.track?.enabled),
        })),
      senders: () =>
        (pcRef.current?.getSenders() || []).map((sender) => ({
          kind: sender.track?.kind || null,
          state: sender.track?.readyState || null,
          muted: Boolean(sender.track?.muted),
          enabled: Boolean(sender.track?.enabled),
        })),
    };
    return () => {
      try {
        delete window.__linqlyCallDebug;
      } catch {
        window.__linqlyCallDebug = undefined;
      }
    };
  }, []);

  const resetPeerRefs = useCallback(() => {
    pendingIceRef.current = [];
    readySentRef.current = false;
    offerSentRef.current = false;
    localTracksReadyRef.current = false;
    renegotiatingRef.current = false;
    makingOfferRef.current = false;
    negotiationReadyRef.current = false;
    audioSenderRef.current = null;
    videoSenderRef.current = null;
  }, []);

  const pushCallDebugEvent = useCallback((type, details = null) => {
    const eventRow = {
      at: new Date().toISOString(),
      type: String(type || "event"),
      details: details || null,
    };
    setCallDebugEvents((prev) => {
      const next = [...prev, eventRow];
      if (next.length > 120) {
        return next.slice(next.length - 120);
      }
      return next;
    });
  }, []);

  const summarizeGroupPeer = useCallback((peer) => {
    if (!peer) return null;
    return {
      connectionState: peer.connectionState || "",
      iceConnectionState: peer.iceConnectionState || "",
      signalingState: peer.signalingState || "",
      senders: (peer.getSenders?.() || [])
        .map((sender) => sender?.track?.kind || null)
        .filter(Boolean),
      receivers: (peer.getReceivers?.() || [])
        .map((receiver) => receiver?.track?.kind || null)
        .filter(Boolean),
      transceivers: (peer.getTransceivers?.() || []).map((transceiver) => ({
        mid: transceiver?.mid ?? null,
        direction: transceiver?.direction || "",
        currentDirection: transceiver?.currentDirection || "",
        senderKind: transceiver?.sender?.track?.kind || null,
        receiverKind: transceiver?.receiver?.track?.kind || null,
      })),
    };
  }, []);

  const clearGroupRemoteMediaElements = useCallback((targetUserId) => {
    const key = String(targetUserId || "");
    const videoEl = groupRemoteVideoElsRef.current.get(key);
    const audioEl = groupRemoteAudioElsRef.current.get(key);
    if (videoEl) {
      videoEl.srcObject = null;
    }
    if (audioEl) {
      audioEl.srcObject = null;
    }
  }, []);

  const cleanupGroupPeer = useCallback(
    (targetUserId) => {
      const key = String(targetUserId || "");
      if (!key) return;

      const peer = groupPeersRef.current.get(key);
      if (peer) {
        peer.ontrack = null;
        peer.onicecandidate = null;
        peer.onconnectionstatechange = null;
        try {
          peer.close();
        } catch {
          // ignore
        }
      }

      const stream = groupRemoteStreamsRef.current.get(key);
      if (stream) {
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // ignore
          }
        });
      }

      groupPeersRef.current.delete(key);
      groupRemoteStreamsRef.current.delete(key);
      groupPendingIceRef.current.delete(key);
      groupMakingOfferRef.current.delete(key);
      groupOfferSentRef.current.delete(key);
      clearGroupRemoteMediaElements(key);
      setGroupRemoteTick((tick) => tick + 1);
    },
    [clearGroupRemoteMediaElements]
  );

  const cleanupAllGroupPeers = useCallback(() => {
    const keys = Array.from(groupPeersRef.current.keys());
    keys.forEach((key) => cleanupGroupPeer(key));
    groupPeersRef.current.clear();
    groupRemoteStreamsRef.current.clear();
    groupPendingIceRef.current.clear();
    groupMakingOfferRef.current.clear();
    groupOfferSentRef.current.clear();
    setGroupRemoteTick((tick) => tick + 1);
  }, [cleanupGroupPeer]);

  const syncGroupMediaElements = useCallback(
    (targetUserId) => {
      const key = String(targetUserId || "");
      if (!key) return;
      const stream = groupRemoteStreamsRef.current.get(key) || null;
      const videoEl = groupRemoteVideoElsRef.current.get(key);
      const audioEl = groupRemoteAudioElsRef.current.get(key);
      if (videoEl && videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
        // Keep remote group video muted; audio plays through the paired <audio> element.
        videoEl.muted = true;
        videoEl.volume = 0;
        videoEl.play?.().catch(() => {});
      }
      if (audioEl && audioEl.srcObject !== stream) {
        audioEl.srcObject = stream;
        audioEl.muted = Boolean(mutedForMeByUserId[key]);
        audioEl.volume = mutedForMeByUserId[key] ? 0 : 1;
        audioEl.play?.().catch(() => {
          setAutoplayBlocked(true);
          setDebug("Tap anywhere to enable remote audio.");
        });
      }
    },
    [mutedForMeByUserId]
  );

  const bindGroupRemoteVideo = useCallback(
    (targetUserId, node) => {
      const key = String(targetUserId || "");
      if (!key) return;
      if (!node) {
        groupRemoteVideoElsRef.current.delete(key);
        return;
      }
      groupRemoteVideoElsRef.current.set(key, node);
      syncGroupMediaElements(key);
    },
    [syncGroupMediaElements]
  );

  const bindGroupRemoteAudio = useCallback(
    (targetUserId, node) => {
      const key = String(targetUserId || "");
      if (!key) return;
      if (!node) {
        groupRemoteAudioElsRef.current.delete(key);
        return;
      }
      groupRemoteAudioElsRef.current.set(key, node);
      syncGroupMediaElements(key);
    },
    [syncGroupMediaElements]
  );

  const shouldInitiateGroupOffer = useCallback(
    (targetUserId) => {
      const me = String(localUserId || "");
      const them = String(targetUserId || "");
      if (!me || !them) return false;
      return me < them;
    },
    [localUserId]
  );

  const attachRemoteStream = useCallback((stream) => {
    if (!remoteVideoRef.current) return;
    remoteVideoRef.current.srcObject = stream;
    const playPromise = remoteVideoRef.current.play?.();
    if (playPromise?.catch) {
      playPromise.catch((err) => {
        const errorName = String(err?.name || "");
        if (errorName === "NotAllowedError") {
          autoplayMutedRef.current = true;
          remoteVideoRef.current.muted = true;
          remoteVideoRef.current.play?.().catch(() => {});
          setAutoplayBlocked(true);
          setDebug("Tap anywhere to unmute remote audio.");
          return;
        }
        // Non-policy errors (e.g. AbortError while metadata is settling)
        // should retry without forcing a user-gesture unmute path.
        setTimeout(() => {
          const node = remoteVideoRef.current;
          if (!node) return;
          if (node.paused) {
            node.play?.().catch(() => {});
          }
        }, 120);
      });
    }
  }, []);

  const cleanupConnection = useCallback(() => {
    cleanupAllGroupPeers();

    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.onnegotiationneeded = null;
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

    resetPeerRefs();
  }, [callId, cleanupAllGroupPeers, resetPeerRefs]);

  const createCallLog = useCallback(
    async (callStatus, durationSec = 0) => {
      if (!accessToken || !chatId) return;
      try {
        await messagesApi.sendCallLog(accessToken, chatId, callStatus, durationSec, "audio");
      } catch {
        // ignore call log failures to avoid blocking call teardown
      }
    },
    [accessToken, chatId],
  );

  const endCall = useCallback(
    (reason, shouldEmit = true) => {
      if (endedRef.current) return;
      endedRef.current = true;

      if (
        !isGroupCall &&
        role === "caller" &&
        connectedAtRef.current &&
        !completedLoggedRef.current &&
        reason !== "timeout"
      ) {
        completedLoggedRef.current = true;
        const durationSec = Math.max(
          0,
          Math.round((Date.now() - connectedAtRef.current) / 1000),
        );
        createCallLog("completed", durationSec);
      }

      setStatus("ended");
      if (shouldEmit && callId) {
        if (isGroupCall) {
          socket.emit("group_call:leave", { callId, chatId, reason });
        } else {
          socket.emit("call:end", { callId, reason });
        }
      }
      try {
        localStorage.removeItem("call:active");
      } catch {
        // ignore
      }
      cleanupConnection();
      setTimeout(() => window.close(), 400);
    },
    [callId, chatId, cleanupConnection, createCallLog, isGroupCall, role],
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

  const ensureMediaReady = useCallback(async () => {
    if (localStreamRef.current && localStreamRef.current.getTracks().length > 0) {
      return localStreamRef.current;
    }

    if (mediaInitRef.current) {
      return mediaInitRef.current;
    }

    mediaInitRef.current = (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Media devices API not available.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      localStreamRef.current = stream;
      setLocalStreamTick((tick) => tick + 1);
      setLocalAudioEnabled(true);
      setLocalVideoEnabled(true);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      return stream;
    })()
      .catch((err) => {
        const name = err?.name || "UnknownError";
        const message = err?.message || "Unable to access camera or microphone.";
        setError(`${message} (${name})`);
        throw err;
      })
      .finally(() => {
        mediaInitRef.current = null;
      });

    return mediaInitRef.current;
  }, []);

  const ensureGroupLocalTracks = useCallback(
    async (peer, targetUserId) => {
      if (!peer || peer.connectionState === "closed") return { added: false };
      let localStream = localStreamRef.current;
      if (!localStream || localStream.getTracks().length === 0) {
        try {
          localStream = await ensureMediaReady();
        } catch (err) {
          pushCallDebugEvent("group_local_media_unavailable", {
            targetUserId,
            error: err?.name || "MediaError",
            message: err?.message || "local media unavailable",
          });
          return { added: false };
        }
      }

      const senderKinds = new Set(
        (peer.getSenders?.() || []).map((sender) => sender?.track?.kind).filter(Boolean)
      );
      let added = false;
      localStream.getTracks().forEach((track) => {
        if (senderKinds.has(track.kind)) return;
        try {
          peer.addTrack(track, localStream);
          added = true;
        } catch {
          // ignore duplicate addTrack errors
        }
      });

      if (added) {
        pushCallDebugEvent("group_local_tracks_attached", {
          targetUserId,
          kinds: localStream.getTracks().map((track) => track.kind),
          summary: summarizeGroupPeer(peer),
        });
      }

      return { added };
    },
    [ensureMediaReady, pushCallDebugEvent, summarizeGroupPeer]
  );

  const ensureGroupPeerConnection = useCallback(
    async (targetUserId) => {
      const key = String(targetUserId || "");
      if (!key || key === String(localUserId || "")) return null;

      const existing = groupPeersRef.current.get(key);
      if (existing && existing.connectionState !== "closed") {
        await ensureGroupLocalTracks(existing, key);
        return existing;
      }

      const peer = new RTCPeerConnection(ICE_CONFIG);
      groupPeersRef.current.set(key, peer);

      pushCallDebugEvent("group_peer_created", {
        targetUserId: key,
        summary: summarizeGroupPeer(peer),
      });

      peer.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket.emit("group_call:ice", {
          callId,
          targetUserId: key,
          candidate: event.candidate,
        });
      };

      peer.ontrack = (event) => {
        let stream = groupRemoteStreamsRef.current.get(key);
        if (!stream) {
          stream = new MediaStream();
          groupRemoteStreamsRef.current.set(key, stream);
        }

        if (event.track) {
          const hasTrack = stream.getTracks().some((track) => track.id === event.track.id);
          if (!hasTrack) {
            stream.addTrack(event.track);
            setGroupRemoteTick((tick) => tick + 1);
            pushCallDebugEvent("group_track", {
              fromUserId: key,
              kind: event.track.kind || "",
              trackId: event.track.id || "",
              readyState: event.track.readyState || "",
            });
            pushCallDebugEvent("group_ontrack", {
              fromUserId: key,
              kind: event.track.kind || "",
              trackId: event.track.id || "",
              muted: Boolean(event.track.muted),
            });
          }
        }

        syncGroupMediaElements(key);
      };

      peer.onconnectionstatechange = () => {
        pushCallDebugEvent("group_peer_state", {
          userId: key,
          connectionState: peer.connectionState || "",
          iceConnectionState: peer.iceConnectionState || "",
          signalingState: peer.signalingState || "",
        });
        if (peer.connectionState === "connected") {
          pushCallDebugEvent("group_peer_connected", {
            userId: key,
            summary: summarizeGroupPeer(peer),
          });
        }
        if (peer.connectionState === "closed") {
          cleanupGroupPeer(key);
          return;
        }
        if (peer.connectionState === "failed") {
          groupOfferSentRef.current.delete(key);
          return;
        }
        if (peer.connectionState === "disconnected") {
          window.setTimeout(() => {
            const current = groupPeersRef.current.get(key);
            if (current !== peer) return;
            if (peer.connectionState === "disconnected") {
              groupOfferSentRef.current.delete(key);
            }
          }, 5000);
        }
      };

      await ensureGroupLocalTracks(peer, key);

      const transceivers = peer.getTransceivers();
      const hasAudioLine = transceivers.some(
        (transceiver) =>
          transceiver?.sender?.track?.kind === "audio" ||
          transceiver?.receiver?.track?.kind === "audio"
      );
      const hasVideoLine = transceivers.some(
        (transceiver) =>
          transceiver?.sender?.track?.kind === "video" ||
          transceiver?.receiver?.track?.kind === "video"
      );

      if (!hasAudioLine) {
        try {
          peer.addTransceiver("audio", { direction: "recvonly" });
        } catch {
          // ignore
        }
      }
      if (!hasVideoLine) {
        try {
          peer.addTransceiver("video", { direction: "recvonly" });
        } catch {
          // ignore
        }
      }
      pushCallDebugEvent("group_transceivers_ready", {
        targetUserId: key,
        summary: summarizeGroupPeer(peer),
      });

      return peer;
    },
    [
      callId,
      cleanupGroupPeer,
      ensureGroupLocalTracks,
      localUserId,
      pushCallDebugEvent,
      summarizeGroupPeer,
      syncGroupMediaElements,
    ]
  );

  const flushGroupPendingIce = useCallback(async (targetUserId) => {
    const key = String(targetUserId || "");
    if (!key) return;
    const peer = groupPeersRef.current.get(key);
    if (!peer?.remoteDescription) return;

    const pending = groupPendingIceRef.current.get(key) || [];
    if (!pending.length) return;
    groupPendingIceRef.current.delete(key);

    for (const candidate of pending) {
      await peer.addIceCandidate(candidate).catch(() => {});
    }
  }, []);

  const queueGroupIce = useCallback((targetUserId, candidate) => {
    const key = String(targetUserId || "");
    if (!key || !candidate) return;
    const existing = groupPendingIceRef.current.get(key) || [];
    existing.push(candidate);
    groupPendingIceRef.current.set(key, existing);
  }, []);

  const sendGroupOffer = useCallback(
    async (targetUserId, isRenegotiate = false) => {
      const key = String(targetUserId || "");
      if (!key || !socket.connected) return false;
      if (groupMakingOfferRef.current.has(key)) return false;

      const peer = await ensureGroupPeerConnection(key);
      if (!peer || peer.connectionState === "closed") return false;
      if (peer.signalingState !== "stable") return false;

      try {
        groupMakingOfferRef.current.add(key);
        pushCallDebugEvent("group_offer_create", {
          targetUserId: key,
          summary: summarizeGroupPeer(peer),
        });
        const offer = await peer.createOffer({
          iceRestart: isRenegotiate === true,
        });
        await peer.setLocalDescription(offer);
        pushCallDebugEvent("group_offer_sent", {
          targetUserId: key,
          signalingState: peer.signalingState || "",
          renegotiate: isRenegotiate === true,
        });
        pushCallDebugEvent("group_offer_set_local", {
          targetUserId: key,
          summary: summarizeGroupPeer(peer),
        });
        socket.emit("group_call:offer", {
          callId,
          targetUserId: key,
          offer,
          renegotiate: isRenegotiate,
        });
        groupOfferSentRef.current.add(key);
        return true;
      } catch {
        return false;
      } finally {
        groupMakingOfferRef.current.delete(key);
      }
    },
    [callId, ensureGroupPeerConnection, pushCallDebugEvent, summarizeGroupPeer]
  );

  const syncGroupPeerMesh = useCallback(
    async (participantsList) => {
      if (!isGroupCall) return;
      const remoteIds = (participantsList || [])
        .map((participant) => String(participant?.userId || ""))
        .filter(Boolean)
        .filter((id) => id !== String(localUserId || ""));
      const remoteSet = new Set(remoteIds);

      const existingIds = Array.from(groupPeersRef.current.keys());
      existingIds.forEach((id) => {
        if (!remoteSet.has(id)) {
          cleanupGroupPeer(id);
        }
      });

      for (const targetUserId of remoteIds) {
        const peer = await ensureGroupPeerConnection(targetUserId);
        if (!peer) continue;
        const shouldInitiate = shouldInitiateGroupOffer(targetUserId);
        const needsInitialOffer =
          shouldInitiate &&
          !groupOfferSentRef.current.has(targetUserId) &&
          !peer.remoteDescription &&
          peer.signalingState === "stable";
        if (needsInitialOffer) {
          await sendGroupOffer(targetUserId, false);
        }
      }
    },
    [
      cleanupGroupPeer,
      ensureGroupPeerConnection,
      isGroupCall,
      localUserId,
      sendGroupOffer,
      shouldInitiateGroupOffer,
    ]
  );

  const buildDebugSnapshot = useCallback(() => {
    const localStream = localStreamRef.current;
    const groupPeers = {};
    groupPeersRef.current.forEach((peer, userId) => {
      const stream = groupRemoteStreamsRef.current.get(String(userId));
      groupPeers[String(userId)] = {
        peer: snapshotPc(peer),
        remoteStreamTracks: (stream?.getTracks?.() || []).map((track) => snapshotTrack(track)),
        pendingIceCount: (groupPendingIceRef.current.get(String(userId)) || []).length,
        hasVideoElement: groupRemoteVideoElsRef.current.has(String(userId)),
        hasAudioElement: groupRemoteAudioElsRef.current.has(String(userId)),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      call: {
        callId,
        chatId,
        scope,
        role,
        status,
        socketConnected: socket.connected,
        userId: String(localUserId || ""),
        userName: displayName,
      },
      media: {
        localAudioEnabled,
        localVideoEnabled,
        remoteAudioEnabled,
        remoteVideoEnabled,
        autoplayBlocked,
      },
      localTracks: (localStream?.getTracks?.() || []).map((track) => snapshotTrack(track)),
      directPeerConnection: snapshotPc(pcRef.current),
      group: {
        participantCount: groupCallState?.participantCount || 0,
        participants: (groupCallState?.participants || []).map((participant) => ({
          userId: String(participant?.userId || ""),
          name: participant?.name || "Unknown",
          audioEnabled: participant?.audioEnabled !== false,
          videoEnabled: participant?.videoEnabled !== false,
        })),
        peerCount: groupPeersRef.current.size,
        peers: groupPeers,
        offerSentTo: Array.from(groupOfferSentRef.current),
        makingOfferFor: Array.from(groupMakingOfferRef.current),
      },
      events: callDebugEvents,
    };
  }, [
    autoplayBlocked,
    callDebugEvents,
    callId,
    chatId,
    displayName,
    groupCallState?.participantCount,
    groupCallState?.participants,
    localAudioEnabled,
    localUserId,
    localVideoEnabled,
    remoteAudioEnabled,
    remoteVideoEnabled,
    role,
    scope,
    status,
  ]);

  const refreshDebugSnapshot = useCallback(() => {
    try {
      const snapshot = buildDebugSnapshot();
      setDebugSnapshotText(JSON.stringify(snapshot, null, 2));
    } catch (err) {
      setDebugSnapshotText(
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            error: err?.message || "Failed to build debug snapshot",
          },
          null,
          2
        )
      );
    }
  }, [buildDebugSnapshot]);

  const copyDebugSnapshot = useCallback(async () => {
    const payload = debugSnapshotText || JSON.stringify(buildDebugSnapshot(), null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setDebug("Debug snapshot copied.");
    } catch {
      setDebug("Could not copy debug snapshot.");
    }
  }, [buildDebugSnapshot, debugSnapshotText]);

  const ensureLocalTracks = useCallback(
    async (pc) => {
      const targetPc = pc || pcRef.current;
      if (!targetPc || targetPc.connectionState === "closed") return;

      const stream = await ensureMediaReady();
      const audioTrack = stream.getAudioTracks()[0] || null;
      const videoTrack = stream.getVideoTracks()[0] || null;

      if (!audioSenderRef.current && audioTrack) {
        audioSenderRef.current = targetPc.addTrack(audioTrack, stream);
      }
      if (!videoSenderRef.current && videoTrack) {
        videoSenderRef.current = targetPc.addTrack(videoTrack, stream);
      }

      localTracksReadyRef.current = Boolean(audioSenderRef.current || videoSenderRef.current);
    },
    [ensureMediaReady],
  );

  const getVideoSender = useCallback((pc) => {
    const targetPc = pc || pcRef.current;
    if (!targetPc) return null;

    if (videoSenderRef.current) {
      const currentSenders = targetPc.getSenders();
      if (currentSenders.includes(videoSenderRef.current)) {
        return videoSenderRef.current;
      }
    }

    const byTrack = targetPc.getSenders().find((sender) => sender.track?.kind === "video");
    if (byTrack) {
      videoSenderRef.current = byTrack;
      return byTrack;
    }

    const byTransceiver = targetPc
      .getTransceivers()
      .find((transceiver) => transceiver?.receiver?.track?.kind === "video")?.sender;
    if (byTransceiver) {
      videoSenderRef.current = byTransceiver;
      return byTransceiver;
    }

    return null;
  }, []);

  const emitOffer = useCallback(
    async (pc, isRenegotiate = false) => {
      const targetPc = pc || pcRef.current;
      if (!targetPc || targetPc.connectionState === "closed") return false;
      if (targetPc.signalingState !== "stable") return false;
      if (!socket.connected) return false;
      if (makingOfferRef.current) return false;

      try {
        makingOfferRef.current = true;
        const offer = await targetPc.createOffer();
        await targetPc.setLocalDescription(offer);
        socket.emit("call:offer", { callId, offer, renegotiate: isRenegotiate });
        return true;
      } catch {
        return false;
      } finally {
        makingOfferRef.current = false;
      }
    },
    [callId],
  );

  const flushPendingIce = useCallback(async (pc) => {
    const targetPc = pc || pcRef.current;
    if (!targetPc?.remoteDescription) return;

    const pending = [...pendingIceRef.current];
    pendingIceRef.current = [];

    for (const candidate of pending) {
      await targetPc.addIceCandidate(candidate).catch(() => {});
    }
  }, []);

  const tryEmitReady = useCallback(() => {
    if (!callId || readySentRef.current) return false;
    if (!socket.connected) return false;
    if (!localTracksReadyRef.current) return false;

    socket.emit("call:ready", { callId, role });
    readySentRef.current = true;
    setDebug("Emitted call:ready");
    return true;
  }, [callId, role]);

  useEffect(() => {
    if (!callId || !peerId) return;

    resetPeerRefs();
    endedRef.current = false;
    connectedAtRef.current = null;
    missedLoggedRef.current = false;
    completedLoggedRef.current = false;

    const pc = new RTCPeerConnection(ICE_CONFIG);
    pcRef.current = pc;
    remoteStreamRef.current = new MediaStream();

    // Attach remote tracks strictly through ontrack.
    pc.ontrack = (event) => {
      const targetStream = remoteStreamRef.current || new MediaStream();
      remoteStreamRef.current = targetStream;

      if (event.track) {
        const exists = targetStream.getTracks().some((track) => track.id === event.track.id);
        if (!exists) {
          targetStream.addTrack(event.track);
          if (event.track.kind === "audio") {
            setRemoteStreamTick((tick) => tick + 1);
          }
        }
      }

      attachRemoteStream(targetStream);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("call:ice", { callId, candidate: event.candidate });
      }
    };

    pc.onnegotiationneeded = async () => {
      if (!negotiationReadyRef.current) return;
      await emitOffer(pc, true);
    };

    pc.onconnectionstatechange = () => {
      if (!pcRef.current) return;
      if (pcRef.current.connectionState === "connected") {
        if (!connectedAtRef.current) {
          connectedAtRef.current = Date.now();
        }
        setStatus("in-call");
      }
      if (["failed", "disconnected"].includes(pcRef.current.connectionState)) {
        endCall("connection", false);
      }
    };

    const handleAccept = (payload) => {
      if (role !== "caller" || payload?.callId !== callId) return;
      setDebug("Received call:accept");
      setStatus("connecting");
    };

    const handleReady = async (payload) => {
      if (payload?.callId !== callId || role !== "caller") return;
      if (offerSentRef.current) return;
      const currentPc = pcRef.current;
      if (!currentPc || currentPc.connectionState === "closed") return;

      await ensureLocalTracks(currentPc);
      if (currentPc.signalingState !== "stable") return;

      offerSentRef.current = true;
      const didSend = await emitOffer(currentPc, false);
      if (didSend) {
        setDebug("Sent call:offer");
      }
    };

    const handleOffer = async (payload) => {
      if (payload?.callId !== callId) return;
      const isRenegotiate = Boolean(payload?.renegotiate);
      if (!isRenegotiate && role !== "callee") return;

      const currentPc = pcRef.current;
      if (!currentPc || currentPc.connectionState === "closed") return;
      if (currentPc.signalingState !== "stable") return;

      await ensureLocalTracks(currentPc);
      await currentPc.setRemoteDescription(payload.offer);
      await flushPendingIce(currentPc);

      const answer = await currentPc.createAnswer();
      await currentPc.setLocalDescription(answer);
      negotiationReadyRef.current = true;
      socket.emit("call:answer", {
        callId,
        answer,
        renegotiate: isRenegotiate,
      });
      setDebug(isRenegotiate ? "Sent renegotiate answer" : "Sent call:answer");
    };

    const handleAnswer = async (payload) => {
      if (payload?.callId !== callId || role !== "caller") return;

      const currentPc = pcRef.current;
      if (!currentPc || currentPc.connectionState === "closed") return;
      if (currentPc.signalingState !== "have-local-offer") return;

      await currentPc.setRemoteDescription(payload.answer);
      await flushPendingIce(currentPc);
      negotiationReadyRef.current = true;
      setDebug(payload?.renegotiate ? "Received renegotiate answer" : "Received call:answer");
    };

    const handleIce = async (payload) => {
      if (payload?.callId !== callId || !payload?.candidate) return;

      const currentPc = pcRef.current;
      if (!currentPc || currentPc.connectionState === "closed") return;

      const candidate = new RTCIceCandidate(payload.candidate);
      if (!currentPc.remoteDescription) {
        pendingIceRef.current.push(candidate);
        return;
      }
      await currentPc.addIceCandidate(candidate).catch(() => {});
    };

    const handleRenegotiate = async (payload) => {
      if (payload?.callId !== callId || role !== "caller") return;
      if (renegotiatingRef.current) return;

      const currentPc = pcRef.current;
      if (!currentPc || currentPc.connectionState === "closed") return;
      if (currentPc.signalingState !== "stable") return;

      try {
        renegotiatingRef.current = true;
        await ensureLocalTracks(currentPc);
        await emitOffer(currentPc, true);
      } finally {
        renegotiatingRef.current = false;
      }
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

    const handleConnect = () => {
      setDebug("Socket connected");
      tryEmitReady();
    };

    const handleConnectError = (err) => {
      setDebug(`Socket connect_error: ${err?.message || "unknown"}`);
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
    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);

    let cancelled = false;
    (async () => {
      try {
        await ensureLocalTracks(pc);
        if (cancelled) return;
        tryEmitReady();
      } catch {
        // ensureMediaReady already sets a user-visible error.
      }
    })();

    if (socket.connected) {
      tryEmitReady();
    }

    return () => {
      cancelled = true;
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
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      cleanupConnection();
    };
  }, [
    attachRemoteStream,
    callId,
    cleanupConnection,
    endCall,
    emitOffer,
    ensureLocalTracks,
    flushPendingIce,
    peerId,
    resetPeerRefs,
    role,
    tryEmitReady,
  ]);

  useEffect(() => {
    if (!autoplayBlocked) return;

    const handleGesture = () => {
      const videoEl = remoteVideoRef.current;
      if (videoEl && autoplayMutedRef.current) {
        videoEl.muted = false;
        videoEl.play?.().catch(() => {});
        autoplayMutedRef.current = false;
      }
      setAutoplayBlocked(false);
      setDebug("");
    };

    window.addEventListener("pointerdown", handleGesture, { once: true });
    return () => window.removeEventListener("pointerdown", handleGesture);
  }, [autoplayBlocked]);

  useEffect(() => {
    if (!remoteVideoEnabled) return;
    if (!remoteVideoRef.current) return;
    if (!remoteStreamRef.current) return;
    attachRemoteStream(remoteStreamRef.current);
  }, [attachRemoteStream, remoteVideoEnabled]);

  useEffect(() => {
    const remoteKey = peerId || peerName;
    if (!remoteKey) return;
    if (hiddenVideoByUserId[remoteKey]) return;
    if (!remoteVideoRef.current) return;
    if (!remoteStreamRef.current) return;
    attachRemoteStream(remoteStreamRef.current);

    const mutedForMe = Boolean(mutedForMeByUserId[remoteKey]);
    const videoEl = remoteVideoRef.current;
    if (videoEl) {
      if (mutedForMe) {
        videoEl.muted = true;
        videoEl.volume = 0;
      } else if (!autoplayMutedRef.current) {
        videoEl.muted = false;
        videoEl.volume = 1;
      }
    }
  }, [attachRemoteStream, hiddenVideoByUserId, mutedForMeByUserId, peerId, peerName]);

  useEffect(() => {
    const remoteKey = peerId || peerName;
    if (!remoteKey) return;
    if (!hiddenVideoByUserId[remoteKey]) {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = null;
      }
      return;
    }

    if (!remoteAudioRef.current) return;
    if (!remoteStreamRef.current) return;
    remoteAudioRef.current.srcObject = remoteStreamRef.current;

    const mutedForMe = Boolean(mutedForMeByUserId[remoteKey]);
    if (mutedForMe) {
      remoteAudioRef.current.muted = true;
      remoteAudioRef.current.volume = 0;
    } else if (!autoplayMutedRef.current) {
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.volume = 1;
      remoteAudioRef.current.play?.().catch(() => {});
    }
  }, [hiddenVideoByUserId, mutedForMeByUserId, peerId, peerName]);

  useEffect(() => {
    const remoteKey = peerId || peerName;
    if (!remoteKey) return;
    const mutedForMe = Boolean(mutedForMeByUserId[remoteKey]);
    const videoEl = remoteVideoRef.current;
    if (!videoEl) return;

    if (mutedForMe) {
      videoEl.muted = true;
      videoEl.volume = 0;
      return;
    }

    if (!autoplayMutedRef.current) {
      videoEl.muted = false;
      videoEl.volume = 1;
    }
  }, [mutedForMeByUserId, peerId, peerName]);

  useEffect(() => {
    if (!isGroupCall) return;
    groupRemoteVideoElsRef.current.forEach((videoEl) => {
      if (!videoEl) return;
      // Group remote audio is rendered through dedicated audio tags.
      // Keep remote videos muted to avoid autoplay policy rejections.
      videoEl.muted = true;
      videoEl.volume = 0;
      videoEl.play?.().catch(() => {});
    });
    groupRemoteAudioElsRef.current.forEach((audioEl, userId) => {
      if (!audioEl) return;
      const mutedForMe = Boolean(mutedForMeByUserId[userId]);
      if (mutedForMe) {
        audioEl.muted = true;
        audioEl.volume = 0;
        return;
      }
      audioEl.muted = false;
      audioEl.volume = 1;
      audioEl.play?.().catch(() => {});
    });
  }, [isGroupCall, mutedForMeByUserId, groupRemoteTick]);

  useEffect(() => {
    if (role !== "caller") return;
    if (status !== "ringing") return;

    const timer = setTimeout(() => {
      if (!missedLoggedRef.current) {
        missedLoggedRef.current = true;
        createCallLog("missed", 0);
      }
      endCall("timeout");
    }, 15000);

    return () => clearTimeout(timer);
  }, [createCallLog, endCall, role, status]);

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

  useEffect(() => {
    if (!isGroupCall || !callId || !chatId) return;
    let cancelled = false;
    setStatus("connecting");

    const applyGroupPayload = (payload) => {
      if (!payload?.callId || String(payload.callId) !== String(callId)) return;
      const participants = Array.isArray(payload.participants) ? payload.participants : [];
      const joinedUserIds = participants.map((p) => String(p.userId || ""));
      pushCallDebugEvent("group_payload", {
        callId: payload.callId,
        participantCount: payload?.participantCount || participants.length,
      });
      setGroupCallState({
        callId: payload.callId,
        chatId: payload.chatId || chatId,
        callType: payload.callType || "audio",
        startedByUserId: payload.startedByUserId || "",
        startedByName: payload.startedByName || "Unknown",
        startedAt: payload.startedAt || "",
        participantCount: payload.participantCount || participants.length,
        participants,
        joinedUserIds,
      });
      setStatus("in-call");
      syncGroupPeerMesh(participants).catch(() => {});
    };

    const onStarted = (payload) => applyGroupPayload(payload);
    const onUpdated = (payload) => applyGroupPayload(payload);
    const onEnded = (payload) => {
      if (String(payload?.callId || "") !== String(callId)) return;
      setDebug("Group call ended.");
      endCall("ended", false);
    };
    const onRemoved = (payload) => {
      if (String(payload?.callId || "") !== String(callId)) return;
      setDebug("You were removed from the group call.");
      endCall("removed", false);
    };
    const onForceMute = (payload) => {
      if (String(payload?.callId || "") !== String(callId)) return;
      setLocalAudioEnabled(false);
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      setDebug(payload?.byName ? `${payload.byName} muted you.` : "You were muted by an admin.");
    };
    const onAskUnmute = (payload) => {
      if (String(payload?.callId || "") !== String(callId)) return;
      setDebug(payload?.text || "Admin requests you to unmute.");
    };
    const onOffer = async (payload) => {
      if (String(payload?.callId || "") !== String(callId)) return;
      const fromUserId = String(payload?.fromUserId || "");
      if (!fromUserId || !payload?.offer) return;
      if (String(fromUserId) === String(localUserId || "")) return;
      pushCallDebugEvent("group_offer_received", {
        fromUserId,
        renegotiate: payload?.renegotiate === true,
      });
      try {
        const peer = await ensureGroupPeerConnection(fromUserId);
        if (!peer || peer.connectionState === "closed") return;

        const isPolite = !shouldInitiateGroupOffer(fromUserId);
        const offerCollision =
          groupMakingOfferRef.current.has(fromUserId) || peer.signalingState !== "stable";
        if (offerCollision && !isPolite) {
          pushCallDebugEvent("group_offer_ignored", {
            fromUserId,
            signalingState: peer.signalingState || "",
          });
          return;
        }
        if (offerCollision) {
          await peer.setLocalDescription({ type: "rollback" });
        }

        await peer.setRemoteDescription(payload.offer);
        pushCallDebugEvent("group_offer_set_remote", {
          fromUserId,
          summary: summarizeGroupPeer(peer),
        });
        await flushGroupPendingIce(fromUserId);
        pushCallDebugEvent("group_answer_create", {
          fromUserId,
          summary: summarizeGroupPeer(peer),
        });
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        pushCallDebugEvent("group_answer_set_local", {
          fromUserId,
          summary: summarizeGroupPeer(peer),
        });
        socket.emit("group_call:answer", {
          callId,
          targetUserId: fromUserId,
          answer,
          renegotiate: payload?.renegotiate === true,
        });
        pushCallDebugEvent("group_answer_sent", {
          targetUserId: fromUserId,
          signalingState: peer.signalingState || "",
        });
        groupOfferSentRef.current.add(fromUserId);
      } catch (err) {
        pushCallDebugEvent("group_offer_error", {
          fromUserId,
          error: err?.name || "OfferError",
          message: err?.message || "failed to handle offer",
        });
      }
    };
    const onAnswer = async (payload) => {
      if (String(payload?.callId || "") !== String(callId)) return;
      const fromUserId = String(payload?.fromUserId || "");
      if (!fromUserId || !payload?.answer) return;
      pushCallDebugEvent("group_answer_received", { fromUserId });
      try {
        const peer = groupPeersRef.current.get(fromUserId);
        if (!peer || peer.connectionState === "closed") return;
        if (peer.signalingState !== "have-local-offer") return;

        await peer.setRemoteDescription(payload.answer).catch(() => {});
        pushCallDebugEvent("group_answer_set_remote", {
          fromUserId,
          summary: summarizeGroupPeer(peer),
        });
        await flushGroupPendingIce(fromUserId);
      } catch {
        // ignore answer failures to keep call UI responsive
      }
    };
    const onIce = async (payload) => {
      if (String(payload?.callId || "") !== String(callId)) return;
      const fromUserId = String(payload?.fromUserId || "");
      if (!fromUserId || !payload?.candidate) return;
      pushCallDebugEvent("group_ice_received", { fromUserId });
      try {
        const candidate = new RTCIceCandidate(payload.candidate);
        const peer = groupPeersRef.current.get(fromUserId);
        if (!peer || peer.connectionState === "closed") {
          queueGroupIce(fromUserId, candidate);
          pushCallDebugEvent("group_ice_queued", {
            fromUserId,
            reason: "no_peer_or_closed",
          });
          await ensureGroupPeerConnection(fromUserId).catch(() => {});
          return;
        }
        if (!peer.remoteDescription) {
          queueGroupIce(fromUserId, candidate);
          pushCallDebugEvent("group_ice_queued", {
            fromUserId,
            reason: "no_remote_description",
          });
          return;
        }
        await peer.addIceCandidate(candidate).catch(() => {});
        pushCallDebugEvent("group_ice_added", {
          fromUserId,
          summary: summarizeGroupPeer(peer),
        });
      } catch {
        // ignore ICE failures to keep call UI responsive
      }
    };

    socket.on("group_call:started", onStarted);
    socket.on("group_call:updated", onUpdated);
    socket.on("group_call:ended", onEnded);
    socket.on("group_call:removed", onRemoved);
    socket.on("group_call:force_mute", onForceMute);
    socket.on("group_call:ask_unmute", onAskUnmute);
    socket.on("group_call:offer", onOffer);
    socket.on("group_call:answer", onAnswer);
    socket.on("group_call:ice", onIce);

    emitWithAck("group_call:join", { callId, chatId }).then((response) => {
      if (cancelled) return;
      if (!response?.ok) {
        pushCallDebugEvent("group_join_failed", {
          message: response?.message || "join failed",
        });
        setError(response?.message || "Unable to join this group call.");
        setStatus("ended");
        return;
      }
      pushCallDebugEvent("group_join_ok", {
        participantCount: response?.payload?.participantCount || 0,
      });
      applyGroupPayload(response?.payload || {});
      ensureMediaReady().catch(() => {});
    });

    return () => {
      cancelled = true;
      socket.off("group_call:started", onStarted);
      socket.off("group_call:updated", onUpdated);
      socket.off("group_call:ended", onEnded);
      socket.off("group_call:removed", onRemoved);
      socket.off("group_call:force_mute", onForceMute);
      socket.off("group_call:ask_unmute", onAskUnmute);
      socket.off("group_call:offer", onOffer);
      socket.off("group_call:answer", onAnswer);
      socket.off("group_call:ice", onIce);
    };
  }, [
    callId,
    chatId,
    endCall,
    ensureGroupPeerConnection,
    ensureMediaReady,
    flushGroupPendingIce,
    isGroupCall,
    queueGroupIce,
    syncGroupPeerMesh,
    localUserId,
    pushCallDebugEvent,
    summarizeGroupPeer,
    shouldInitiateGroupOffer,
  ]);

  useEffect(() => {
    if (!showDebugPanel) {
      if (debugIntervalRef.current) {
        window.clearInterval(debugIntervalRef.current);
        debugIntervalRef.current = null;
      }
      return;
    }

    refreshDebugSnapshot();
    debugIntervalRef.current = window.setInterval(() => {
      refreshDebugSnapshot();
    }, 1000);

    return () => {
      if (debugIntervalRef.current) {
        window.clearInterval(debugIntervalRef.current);
        debugIntervalRef.current = null;
      }
    };
  }, [refreshDebugSnapshot, showDebugPanel]);

  useEffect(() => {
    window.__linqlyGroupCallDebug = {
      snapshot: () => buildDebugSnapshot(),
      events: () => [...callDebugEvents],
      peers: () => Array.from(groupPeersRef.current.keys()),
    };
    return () => {
      try {
        delete window.__linqlyGroupCallDebug;
      } catch {
        window.__linqlyGroupCallDebug = undefined;
      }
    };
  }, [buildDebugSnapshot, callDebugEvents]);

  const toggleAudio = () => {
    const next = !localAudioEnabled;
    setLocalAudioEnabled(next);
    pushCallDebugEvent("local_audio_toggle", { enabled: next });

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = next;
      });
    }

    if (isGroupCall) {
      socket.emit("group_call:audio_state", { callId, enabled: next });
    } else {
      socket.emit("call:audio-state", { callId, enabled: next });
    }
  };

  const toggleVideo = async () => {
    if (videoToggleBusyRef.current) return;
    videoToggleBusyRef.current = true;

    try {
      const next = !localVideoEnabledRef.current;

      if (isGroupCall) {
        setLocalVideoEnabled(next);
        localVideoEnabledRef.current = next;
        pushCallDebugEvent("local_video_toggle", { enabled: next, scope: "group" });
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach((track) => {
            track.enabled = next;
          });
        }
        socket.emit("group_call:video_state", { callId, enabled: next });
        return;
      }

      const pc = pcRef.current;
      const stream = localStreamRef.current;

      if (!pc || !stream || pc.connectionState === "closed") return;

      const sender = getVideoSender(pc);

      if (!next) {
        pushCallDebugEvent("local_video_toggle", { enabled: false, scope: "direct" });
        const currentTrack = sender?.track || stream.getVideoTracks()[0] || null;
        if (currentTrack && currentTrack.readyState === "live") {
          // Keep the same camera track and sender alive to avoid remote black-frame
          // regressions on some browsers after stop()/replaceTrack(null).
          currentTrack.enabled = false;
        } else if (sender) {
          // Fallback when no live local track is attached.
          await sender.replaceTrack(null).catch(() => {});
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.muted = true;
        }
        setLocalVideoEnabled(false);
        localVideoEnabledRef.current = false;
        socket.emit("call:video-state", { callId, enabled: false });
        return;
      }

      let activeTrack = sender?.track || stream.getVideoTracks()[0] || null;
      if (activeTrack && activeTrack.readyState === "live") {
        activeTrack.enabled = true;
      } else {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const newTrack = camStream.getVideoTracks()[0];
        if (!newTrack) throw new Error("No video track from getUserMedia");

        if (sender) {
          await sender.replaceTrack(newTrack).catch(() => {});
          videoSenderRef.current = sender;
        } else {
          videoSenderRef.current = pc.addTrack(newTrack, stream);
          negotiationReadyRef.current = true;
          await emitOffer(pc, true);
        }

        stream.getVideoTracks().forEach((track) => {
          if (track.id === newTrack.id) return;
          try {
            stream.removeTrack(track);
          } catch {
            // ignore
          }
          try {
            track.stop();
          } catch {
            // ignore
          }
        });
        stream.addTrack(newTrack);
        activeTrack = newTrack;
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        await localVideoRef.current.play?.().catch(() => {});
      }

      setLocalVideoEnabled(true);
      localVideoEnabledRef.current = true;
      pushCallDebugEvent("local_video_toggle", { enabled: true, scope: "direct" });
      socket.emit("call:video-state", { callId, enabled: true });

      const activeSender = getVideoSender(pc);
      console.log("toggleVideo:on state", {
        hasVideoSender: Boolean(activeSender),
        senderReadyState: activeSender?.track?.readyState || null,
        senderMuted: Boolean(activeSender?.track?.muted),
        connectionState: pc.connectionState,
      });
    } catch (err) {
      setError(err?.message || "Failed to toggle video");
      setLocalVideoEnabled(false);
      localVideoEnabledRef.current = false;
    } finally {
      videoToggleBusyRef.current = false;
    }
  };

  const participants = useMemo(() => {
    const groupRemoteVersion = groupRemoteTick;
    void groupRemoteVersion;
    if (isGroupCall) {
      const participantsFromState = (groupCallState?.participants || []).map((participant) => {
        const isLocalParticipant = String(participant.userId) === String(localUserId);
        const remoteStream = groupRemoteStreamsRef.current.get(String(participant.userId || ""));
        const hasVideoTrack = Boolean(
          remoteStream?.getVideoTracks().some((track) => track.readyState === "live")
        );
        return {
        userId: participant.userId,
        displayName: participant.name || "Unknown",
        role:
          isLocalParticipant
            ? "You"
            : String(participant.userId) === String(groupCallState?.startedByUserId || "")
              ? "Starter"
              : "Participant",
        avatarUrl:
          participant.avatarUrl &&
          (String(participant.avatarUrl).startsWith("http://") ||
            String(participant.avatarUrl).startsWith("https://"))
            ? participant.avatarUrl
            : participant.avatarUrl
              ? `${apiBase}${participant.avatarUrl}`
              : "",
        isMuted:
          isLocalParticipant
            ? !localAudioEnabled
            : participant.audioEnabled === false,
        isVideoOff: isLocalParticipant
          ? !localVideoEnabled
          : participant.videoEnabled === false || !hasVideoTrack,
        isSpeaking: false,
        isMutedForMe: Boolean(mutedForMeByUserId[participant.userId]),
        isVideoHiddenForMe: Boolean(hiddenVideoByUserId[participant.userId]),
        canBeRemoved:
          String(participant.userId) !== String(groupCallState?.startedByUserId || ""),
      };
      });

      if (
        localUserId &&
        !participantsFromState.some(
          (participant) => String(participant.userId) === String(localUserId)
        )
      ) {
        participantsFromState.unshift({
          userId: localUserId,
          displayName,
          role: "You",
          avatarUrl: userAvatar,
          isMuted: !localAudioEnabled,
          isVideoOff: !localVideoEnabled,
          isSpeaking: false,
          isMutedForMe: false,
          isVideoHiddenForMe: false,
          canBeRemoved: false,
        });
      }
      return participantsFromState;
    }

    const list = [];
    if (user?.id || user?.username) {
      list.push({
        userId: localUserId,
        displayName,
        role: "You",
        avatarUrl: userAvatar,
        isMuted: !localAudioEnabled,
        isVideoOff: !localVideoEnabled,
        isSpeaking: localAudioEnabled && localSpeaking,
        isMutedForMe: Boolean(mutedForMeByUserId[localUserId]),
        isVideoHiddenForMe: Boolean(hiddenVideoByUserId[localUserId]),
      });
    }
    if (peerId || peerName) {
      list.push({
        userId: peerId || peerName,
        displayName: peerName,
        role: "Caller",
        avatarUrl: peerAvatar,
        isMuted: !remoteAudioEnabled,
        isVideoOff: !remoteVideoEnabled,
        isSpeaking: remoteAudioEnabled && remoteSpeaking,
        isMutedForMe: Boolean(mutedForMeByUserId[peerId || peerName]),
        isVideoHiddenForMe: Boolean(hiddenVideoByUserId[peerId || peerName]),
      });
    }
    return list;
  }, [
    apiBase,
    localUserId,
    displayName,
    groupCallState?.participants,
    groupCallState?.startedByUserId,
    isGroupCall,
    userAvatar,
    localAudioEnabled,
    localVideoEnabled,
    localSpeaking,
    peerId,
    peerName,
    peerAvatar,
    remoteAudioEnabled,
    remoteVideoEnabled,
    remoteSpeaking,
    mutedForMeByUserId,
    hiddenVideoByUserId,
    groupRemoteTick,
    user?.id,
    user?.username,
  ]);

  const profileKeyByUserId = useMemo(() => {
    const map = {};
    if (isGroupCall) {
      (groupCallState?.participants || []).forEach((participant) => {
        if (!participant?.userId) return;
        map[participant.userId] = participant.name || participant.userId;
      });
    }
    if (localUserId) {
      map[localUserId] = user?.username || user?.id || localUserId;
    }
    if (peerId || peerName) {
      map[peerId || peerName] = peerName || peerId;
    }
    return map;
  }, [groupCallState?.participants, isGroupCall, localUserId, user?.username, user?.id, peerId, peerName]);

  useEffect(() => {
    if (!localStreamRef.current) return;
    const stream = localStreamRef.current;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    let rafId = 0;
    let stopped = false;
    let audioContext;
    let analyser;
    let source;
    let data;

    const start = async () => {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        data = new Uint8Array(analyser.fftSize);
        source.connect(analyser);
        if (audioContext.state === "suspended") {
          audioContext.resume().catch(() => {});
        }
      } catch {
        return;
      }

      const threshold = 0.02;
      const loop = () => {
        if (stopped) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLocalSpeaking(rms > threshold);
        rafId = requestAnimationFrame(loop);
      };
      loop();
    };

    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      setLocalSpeaking(false);
      try {
        source?.disconnect();
        analyser?.disconnect();
        audioContext?.close();
      } catch {
        // ignore
      }
    };
  }, [localStreamTick]);

  useEffect(() => {
    if (!remoteStreamRef.current) return;
    const stream = remoteStreamRef.current;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    let rafId = 0;
    let stopped = false;
    let audioContext;
    let analyser;
    let source;
    let data;

    const start = async () => {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        data = new Uint8Array(analyser.fftSize);
        source.connect(analyser);
        if (audioContext.state === "suspended") {
          audioContext.resume().catch(() => {});
        }
      } catch {
        return;
      }

      const threshold = 0.02;
      const loop = () => {
        if (stopped) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setRemoteSpeaking(rms > threshold);
        rafId = requestAnimationFrame(loop);
      };
      loop();
    };

    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      setRemoteSpeaking(false);
      try {
        source?.disconnect();
        analyser?.disconnect();
        audioContext?.close();
      } catch {
        // ignore
      }
    };
  }, [remoteStreamTick]);

  const isCurrentUserGroupAdmin = useMemo(() => {
    if (!isGroupCall) return false;
    return (groupCallState?.participants || []).some(
      (participant) =>
        String(participant.userId) === String(localUserId) && participant.isAdmin === true
    );
  }, [groupCallState?.participants, isGroupCall, localUserId]);

  const adminActionParticipants = useMemo(
    () =>
      (participants || []).filter(
        (participant) => String(participant.userId) !== String(localUserId)
      ),
    [localUserId, participants]
  );

  const handleForceMuteParticipant = useCallback(
    async (targetUserId) => {
      if (!isGroupCall || !targetUserId) return;
      setGroupActionBusy(true);
      const response = await emitWithAck("group_call:force_mute", {
        callId,
        targetUserId,
      });
      if (!response?.ok) {
        setDebug(response?.message || "Failed to mute participant.");
      }
      setGroupActionBusy(false);
    },
    [callId, isGroupCall]
  );

  const handleRemoveParticipant = useCallback(
    async (targetUserId) => {
      if (!isGroupCall || !targetUserId) return;
      setGroupActionBusy(true);
      const response = await emitWithAck("group_call:remove_participant", {
        callId,
        targetUserId,
      });
      if (!response?.ok) {
        setDebug(response?.message || "Failed to remove participant.");
      }
      setGroupActionBusy(false);
    },
    [callId, isGroupCall]
  );

  const handleMuteAll = useCallback(async () => {
    if (!isGroupCall) return;
    if (!window.confirm("Mute all participants currently unmuted?")) return;
    setGroupActionBusy(true);
    const response = await emitWithAck("group_call:mute_all", { callId });
    if (!response?.ok) {
      setDebug(response?.message || "Failed to mute all.");
    }
    setGroupActionBusy(false);
  }, [callId, isGroupCall]);

  const handleAskUnmute = useCallback(
    async (targetUserId) => {
      if (!isGroupCall || !targetUserId) return;
      setGroupActionBusy(true);
      const response = await emitWithAck("group_call:ask_unmute", {
        callId,
        targetUserId,
      });
      if (!response?.ok) {
        setDebug(response?.message || "Failed to send unmute request.");
      }
      setGroupActionBusy(false);
    },
    [callId, isGroupCall]
  );

  return (
    <div className="call-page">
      <div className="call-topbar">
        <div className="call-title">Call</div>
        <div className="d-flex align-items-center gap-2">
          <button
            type="button"
            className="call-debug-toggle-btn"
            onClick={() => {
              setShowDebugPanel((prev) => !prev);
              pushCallDebugEvent("debug_panel_toggle", {
                nextOpen: !showDebugPanel,
              });
            }}
          >
            {showDebugPanel ? "Hide Debug" : "Show Debug"}
          </button>
          <div className="call-status">
            {status === "ringing" && "Ringing..."}
            {status === "connecting" && "Connecting..."}
            {status === "in-call" && "Connected"}
            {status === "ended" && "Call ended"}
          </div>
          <GroupCallAdminMenu
            isVisible={isGroupCall && isCurrentUserGroupAdmin}
            canMuteAll={!groupActionBusy}
            onMuteAll={handleMuteAll}
            participants={adminActionParticipants}
            onAskUnmute={handleAskUnmute}
          />
        </div>
      </div>

      {error && (
        <div className="call-error">
          <div>{error}</div>
          <button type="button" className="call-retry-btn" onClick={ensureMediaReady}>
            Retry media
          </button>
        </div>
      )}

      {showDebugPanel && (
        <div className="call-debug-panel">
          <div className="call-debug-panel-head">
            <div className="call-debug-panel-title">Call Debug Snapshot</div>
            <div className="call-debug-panel-actions">
              <button type="button" className="call-debug-btn" onClick={refreshDebugSnapshot}>
                Refresh
              </button>
              <button type="button" className="call-debug-btn" onClick={copyDebugSnapshot}>
                Copy
              </button>
              <button
                type="button"
                className="call-debug-btn"
                onClick={() => {
                  setCallDebugEvents([]);
                  pushCallDebugEvent("debug_events_cleared");
                }}
              >
                Clear Events
              </button>
            </div>
          </div>
          <pre className="call-debug-pre">{debugSnapshotText || "{}"}</pre>
        </div>
      )}

      <CallLayout
        participants={participants}
        localUserId={localUserId}
        localMuted={!localAudioEnabled}
        localVideoOff={!localVideoEnabled}
        onToggleMute={toggleAudio}
        onToggleVideo={toggleVideo}
        onEndCall={() => endCall("ended")}
        onToggleMuteForMe={(targetUserId) => {
          if (!targetUserId || targetUserId === localUserId) return;
          setMutedForMeByUserId((prev) => ({
            ...prev,
            [targetUserId]: !prev[targetUserId],
          }));
        }}
        onToggleHideVideoForMe={(targetUserId) => {
          if (!targetUserId || targetUserId === localUserId) return;
          setHiddenVideoByUserId((prev) => ({
            ...prev,
            [targetUserId]: !prev[targetUserId],
          }));
        }}
        onViewProfile={(targetUserId) => {
          if (!targetUserId) return;
          const profileKey = profileKeyByUserId[targetUserId] || targetUserId;
          const url = `/app/profile/${encodeURIComponent(String(profileKey))}`;
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        }}
        localVideoRef={localVideoRef}
        remoteVideoRef={remoteVideoRef}
        remoteAudioRef={remoteAudioRef}
        controlsDisabled={status !== "in-call"}
        isGroupCall={isGroupCall}
        isGroupAdmin={isCurrentUserGroupAdmin}
        onForceMuteParticipant={handleForceMuteParticipant}
        onRemoveParticipant={handleRemoveParticipant}
        bindGroupRemoteVideo={bindGroupRemoteVideo}
        bindGroupRemoteAudio={bindGroupRemoteAudio}
      />

      <div className="call-meta">
        <div>Call ID: {callId || "unknown"}</div>
        <div>Chat ID: {chatId || "unknown"}</div>
        {debug && <div>Debug: {debug}</div>}
      </div>
    </div>
  );
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
