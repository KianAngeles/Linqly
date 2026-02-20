import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import dayjs from "dayjs";
import { hangoutsApi } from "../api/hangouts.api";
import { friendsApi } from "../api/friends.api";
import { useAuth } from "../store/AuthContext";
import { socket } from "../socket";
import { API_BASE } from "../api/http";
import pinIcon from "../assets/icons/pin.png";
import showIcon from "../assets/icons/map-icons/show.png";
import hiddenIcon from "../assets/icons/map-icons/hidden.png";
import removeAttendeeIcon from "../assets/icons/map-icons/remove.png";
import "./HangoutsMap.css";
import MapActions from "../components/hangouts/MapActions";
import HangoutsLoadingEmpty from "../components/hangouts/HangoutsLoadingEmpty";
import HangoutDetailCard from "../components/hangouts/HangoutDetailCard";
import HangoutModal from "../components/hangouts/HangoutModal";
import MapCanvas from "../components/hangouts/MapCanvas";
import HangoutsPanel from "../components/hangouts/HangoutsPanel";
import ControlsPanel from "../components/hangouts/ControlsPanel";
import MapOverlayDrawer from "../components/hangouts/MapOverlayDrawer";

const FALLBACK_CENTER = { lng: 120.9842, lat: 14.5995 };
const DEFAULT_RADIUS_METERS = 8000;
const MAP_STATE_KEY = "linqly.hangouts.mapState";
const HANGOUT_PIN_OFFSET = [0, -5];
const MAP_STYLE_LIGHT = "mapbox://styles/mapbox/streets-v12";
const MAP_STYLE_DARK = "mapbox://styles/mapbox/dark-v11";
const MAP_DESKTOP_BREAKPOINT = 1200;
const MAP_MOBILE_BREAKPOINT = 768;
const MOBILE_SHEET_COLLAPSED_HEIGHT = 72;
const MOBILE_SHEET_MID_RATIO = 0.45;
const MOBILE_SHEET_FULL_RATIO = 0.85;
const MOBILE_SHEET_DRAG_THRESHOLD_PX = 8;
const CLOSED_HANGOUT_STATUSES = new Set([
  "closed",
  "ended",
  "completed",
  "cancelled",
  "canceled",
  "done",
  "inactive",
]);

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function formatDistance(meters) {
  if (typeof meters !== "number") return "";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
}

function getInitial(value) {
  if (!value) return "H";
  return value.trim().charAt(0).toUpperCase();
}

function isHangoutClosed(hangout) {
  if (!hangout || typeof hangout !== "object") return true;
  const status = String(hangout.status || "").toLowerCase().trim();
  if (CLOSED_HANGOUT_STATUSES.has(status)) return true;
  const endsAtMs = hangout?.endsAt ? new Date(hangout.endsAt).getTime() : NaN;
  if (Number.isFinite(endsAtMs) && endsAtMs < new Date().getTime()) return true;
  return false;
}

function resolveAvatar(avatarUrl) {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
    return avatarUrl;
  }
  return `${API_BASE}${avatarUrl}`;
}

function colorFromId(id) {
  const palette = [
    "#20c997",
    "#0d6efd",
    "#fd7e14",
    "#e83e8c",
    "#6f42c1",
    "#198754",
    "#0dcaf0",
    "#ffc107",
    "#dc3545",
  ];
  const str = String(id || "");
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

function createHangoutPin({
  isDraft = false,
  isActive = false,
  isSwinging = false,
  swingDelay = "0s",
  motionPaused = false,
  isPulsing = false,
  pulseDelay = "0s",
} = {}) {
  const el = document.createElement("div");
  const draftClass = isDraft ? " is-draft" : "";
  const activeClass = isActive ? " is-active" : "";
  const swingingClass = isSwinging ? " is-swinging" : "";
  const pulsingClass = isPulsing ? " is-pulsing" : "";
  const pausedClass = motionPaused ? " is-motion-paused" : "";
  el.className = `hangout-pin-simple${draftClass}${activeClass}${swingingClass}${pulsingClass}${pausedClass}`;
  el.style.setProperty("--swing-delay", swingDelay);
  el.style.setProperty("--pulse-delay", pulseDelay);
  if (isPulsing) {
    const pulse = document.createElement("div");
    pulse.className = "hangout-pin-pulse";
    el.appendChild(pulse);
  }
  const img = document.createElement("img");
  img.src = pinIcon;
  img.alt = "Hangout";
  el.appendChild(img);
  return el;
}

function createFriendMarker(user) {
  const el = document.createElement("div");
  el.className = "friend-location-marker";
  const avatar = resolveAvatar(user?.avatarUrl);
  if (avatar) {
    el.style.backgroundImage = `url(${avatar})`;
  } else {
    el.style.backgroundColor = colorFromId(user?.id);
    el.textContent = getInitial(user?.username);
  }
  return el;
}

function applyNoteBubble(el, note) {
  const existing = el.querySelector(".location-note-bubble");
  const trimmed = note ? note.trim().slice(0, 16) : "";
  if (!trimmed) {
    if (existing) existing.remove();
    return;
  }
  const bubble = existing || document.createElement("div");
  bubble.className = "location-note-bubble";
  bubble.textContent = trimmed;
  if (!existing) el.appendChild(bubble);
}

function createSelfShareMarker(user, note) {
  const el = createFriendMarker(user);
  applyNoteBubble(el, note);
  return el;
}

function sortSearchResults(features = []) {
  return [...features].sort((a, b) => {
    const aPoi = a.place_type?.includes("poi") ? 1 : 0;
    const bPoi = b.place_type?.includes("poi") ? 1 : 0;
    return bPoi - aPoi;
  });
}

export default function HangoutsMap() {
  const nav = useNavigate();
  const { user, accessToken } = useAuth();
  const mapRef = useRef(null);
  const currentMapStyleRef = useRef("");
  const mapContainerRef = useRef(null);
  const markersRef = useRef([]);
  const draftMarkerRef = useRef(null);
  const sharedMarkersRef = useRef([]);
  const selfMarkerRef = useRef(null);
  const selfAvatarMarkerRef = useRef(null);
  const friendMarkersRef = useRef([]);

  const [center, setCenter] = useState(FALLBACK_CENTER);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS_METERS);
  const [zoom, setZoom] = useState(12);
  const [isMapZooming, setIsMapZooming] = useState(false);
  const [feed, setFeed] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [draftPin, setDraftPin] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareAllEnabled, setShareAllEnabled] = useState(false);
  const [shareAllError, setShareAllError] = useState("");
  const [shareAllLoading, setShareAllLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareAllNote, setShareAllNote] = useState("");
  const [friendLocations, setFriendLocations] = useState({});
  const [driveDistanceKm, setDriveDistanceKm] = useState(null);
  const [driveDistanceLoading, setDriveDistanceLoading] = useState(false);
  const [driveDistanceError, setDriveDistanceError] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [routeVisible, setRouteVisible] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [showWithinList, setShowWithinList] = useState(true);
  const [showJoinedList, setShowJoinedList] = useState(true);
  const [showMyHangouts, setShowMyHangouts] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const [shareNoteError, setShareNoteError] = useState("");
  const [joinActionError, setJoinActionError] = useState("");
  const [attendeeStatusUpdatingId, setAttendeeStatusUpdatingId] = useState("");
  const [attendeeStatusError, setAttendeeStatusError] = useState("");
  const [joinRequestActionKey, setJoinRequestActionKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchCountry, setSearchCountry] = useState("ph");
  const searchRef = useRef(null);
  const [formError, setFormError] = useState("");
  const [locating, setLocating] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(null);
  const [formState, setFormState] = useState(() => ({
    title: "",
    description: "",
    startsAt: null,
    durationMinutes: 120,
    visibility: "friends",
    maxAttendees: "",
    anyoneCanJoin: true,
    createGroupChat: true,
  }));
  const [searchParams] = useSearchParams();
  const hangoutIdParam = searchParams.get("hangoutId");
  const hangoutClosedParam = searchParams.get("hangoutClosed");
  const hangoutTitleParam = searchParams.get("hangoutTitle");
  const handledHangoutIdRef = useRef(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [removeAttendeeTarget, setRemoveAttendeeTarget] = useState(null);
  const [showHangoutClosedModal, setShowHangoutClosedModal] = useState(false);
  const joinedHangoutRoomRef = useRef(null);
  const [mapTheme, setMapTheme] = useState(() =>
    document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"
  );
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? MAP_DESKTOP_BREAKPOINT : window.innerWidth
  );
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [mobileSheetState, setMobileSheetState] = useState("collapsed");
  const [mobileSheetDragHeight, setMobileSheetDragHeight] = useState(null);
  const [isMobileSheetDragging, setIsMobileSheetDragging] = useState(false);
  const leftDrawerRef = useRef(null);
  const rightDrawerRef = useRef(null);
  const mobileSheetRef = useRef(null);
  const mobileControlsSheetRef = useRef(null);
  const mobileSheetDragStateRef = useRef(null);
  const mobileSheetDragMovedRef = useRef(false);
  const suppressSheetHandleClickRef = useRef(false);

  const mapboxToken = useMemo(() => import.meta.env.VITE_MAPBOX_TOKEN || "", []);
  const mapStyleUrl = mapTheme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
  const isDesktopLayout = viewportWidth >= MAP_DESKTOP_BREAKPOINT;
  const isMobileLayout = viewportWidth < MAP_MOBILE_BREAKPOINT;
  const isTabletLayout = !isDesktopLayout && !isMobileLayout;
  const pageLayoutClass = isDesktopLayout
    ? "is-desktop"
    : isTabletLayout
      ? "is-tablet"
      : "is-mobile";

  useEffect(() => {
    if (typeof MutationObserver === "undefined") return undefined;
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const nextTheme = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
      setMapTheme((prev) => (prev === nextTheme ? prev : nextTheme));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const lang = navigator.language || "";
    const region = lang.split("-")[1];
    if (region) {
      setSearchCountry(region.toLowerCase());
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (isDesktopLayout) {
      setLeftDrawerOpen(false);
      setRightDrawerOpen(false);
      setMobileControlsOpen(false);
      setMobileSheetState("collapsed");
      setMobileSheetDragHeight(null);
      setIsMobileSheetDragging(false);
      mobileSheetDragStateRef.current = null;
      mobileSheetDragMovedRef.current = false;
      suppressSheetHandleClickRef.current = false;
      return;
    }
    if (isTabletLayout) {
      setMobileControlsOpen(false);
      setMobileSheetState("collapsed");
      setMobileSheetDragHeight(null);
      setIsMobileSheetDragging(false);
      mobileSheetDragStateRef.current = null;
      mobileSheetDragMovedRef.current = false;
      suppressSheetHandleClickRef.current = false;
      return;
    }
    setLeftDrawerOpen(false);
    setRightDrawerOpen(false);
  }, [isDesktopLayout, isTabletLayout]);

  useEffect(() => {
    if (hangoutClosedParam === "1") {
      setShowHangoutClosedModal(true);
    }
  }, [hangoutClosedParam]);

  useEffect(() => {
    if (!mapboxToken || !userLocation) return;
    const params = new URLSearchParams({
      access_token: mapboxToken,
      types: "country",
      limit: "1",
    });
    const url =
      "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
      `${userLocation.lng},${userLocation.lat}.json?${params.toString()}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const code = data?.features?.[0]?.properties?.short_code;
        if (code) {
          setSearchCountry(code.toLowerCase());
        }
      })
      .catch(() => {});
  }, [mapboxToken, userLocation]);

  useEffect(() => {
    if (!mapboxToken) return;
    mapboxgl.accessToken = mapboxToken;
  }, [mapboxToken]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MAP_STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved?.center?.lng && saved?.center?.lat) {
        setCenter({ lng: saved.center.lng, lat: saved.center.lat });
      }
      if (typeof saved?.zoom === "number") setZoom(saved.zoom);
      if (typeof saved?.radiusMeters === "number") setRadiusMeters(saved.radiusMeters);
      if (saved?.mapReady) setMapReady(true);
    } catch {
      // ignore
    }
  }, []);

  function buildRadiusCircle({ lng, lat }, radius) {
    const points = 64;
    const coords = [];
    const earthRadius = 6371000;
    const d = radius / earthRadius;
    const lat1 = (lat * Math.PI) / 180;
    const lng1 = (lng * Math.PI) / 180;

    for (let i = 0; i <= points; i += 1) {
      const bearing = (i / points) * Math.PI * 2;
      const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
      );
      const lng2 =
        lng1 +
        Math.atan2(
          Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
          Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
        );
      coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
    }

    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [coords],
      },
      properties: {},
    };
  }

  useEffect(() => {
    if (!mapReady) return;
    if (locationEnabled !== true) return;
    if (mapRef.current || !mapContainerRef.current) return;
    if (!mapboxToken) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: mapStyleUrl,
      center: [center.lng, center.lat],
      zoom,
    });
    currentMapStyleRef.current = mapStyleUrl;

    map.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    map.on("style.load", () => {
      if (!map.getSource("hangout-radius")) {
        map.addSource("hangout-radius", {
          type: "geojson",
          data: buildRadiusCircle(center, radiusMeters),
        });
        map.addLayer({
          id: "hangout-radius-fill",
          type: "fill",
          source: "hangout-radius",
          paint: {
            "fill-color": "#6b7280",
            "fill-opacity": 0.18,
          },
        });
        map.addLayer({
          id: "hangout-radius-outline",
          type: "line",
          source: "hangout-radius",
          paint: {
            "line-color": "#111827",
            "line-width": 2,
            "line-opacity": 0.5,
          },
        });
      }
      if (!map.getSource("hangout-route")) {
        map.addSource("hangout-route", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: "hangout-route-line",
          type: "line",
          source: "hangout-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#0d6efd",
            "line-width": 4,
            "line-opacity": 0.7,
          },
        });
      }
      setMapLoaded(true);
    });
    map.on("zoomstart", () => setIsMapZooming(true));
    map.on("zoomend", () => setIsMapZooming(false));
    map.on("click", (e) => {
      const target = e.originalEvent?.target;
      if (target && target.closest(".map-overlay")) return;
      setDraftPin({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      setShowCreate(true);
      setFormError("");
    });
    // No auto-refresh on pan/zoom to avoid extra feed refreshes.

    mapRef.current = map;
    return () => {
      setMapLoaded(false);
      mapRef.current = null;
      map.remove();
    };
  }, [center.lat, center.lng, mapboxToken, mapReady, radiusMeters, zoom, locationEnabled, mapStyleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (currentMapStyleRef.current === mapStyleUrl) return;
    setMapLoaded(false);
    currentMapStyleRef.current = mapStyleUrl;
    map.setStyle(mapStyleUrl);
  }, [mapStyleUrl]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setCenter([center.lng, center.lat]);
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setZoom(zoom);
  }, [zoom]);

  const onMapLayoutChange = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const runResize = () => {
      if (typeof map.resize === "function") {
        map.resize();
        return;
      }
      if (typeof map.invalidateSize === "function") {
        map.invalidateSize();
      }
    };
    requestAnimationFrame(() => {
      runResize();
      setTimeout(runResize, 0);
    });
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const timer = setTimeout(onMapLayoutChange, 0);
    return () => clearTimeout(timer);
  }, [
    mapReady,
    onMapLayoutChange,
    isDesktopLayout,
    isTabletLayout,
    isMobileLayout,
    leftDrawerOpen,
    rightDrawerOpen,
    mobileControlsOpen,
    mobileSheetState,
  ]);

  useEffect(() => {
    const nodes = [
      leftDrawerRef.current,
      rightDrawerRef.current,
      mobileSheetRef.current,
      mobileControlsSheetRef.current,
    ].filter(Boolean);
    if (nodes.length === 0) return undefined;
    const onTransitionEnd = () => onMapLayoutChange();
    nodes.forEach((node) => node.addEventListener("transitionend", onTransitionEnd));
    return () => {
      nodes.forEach((node) => node.removeEventListener("transitionend", onTransitionEnd));
    };
  }, [onMapLayoutChange, isTabletLayout, isMobileLayout, leftDrawerOpen, rightDrawerOpen, mobileControlsOpen]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocating(false);
      setLocationEnabled(false);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setCenter(next);
        setUserLocation(next);
        setLocating(false);
        setLocationEnabled(true);
      },
      () => {
        setLocating(false);
        setLocationEnabled(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    if (!navigator.permissions?.query) return undefined;
    let active = true;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (!active) return;
        status.onchange = () => {
          if (status.state === "granted") {
            requestLocation();
          }
        };
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [requestLocation]);

  async function loadFeed(lng, lat) {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const data = await hangoutsApi.feed(accessToken, {
        lng,
        lat,
        radius: radiusMeters,
      });
      setFeed(data.hangouts || []);
    } catch {
      setFeed([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    loadFeed(center.lng, center.lat);
  }, [accessToken, center.lat, center.lng, radiusMeters]);

  useEffect(() => {
    if (!accessToken) return;
    const onNew = () => {
      loadFeed(center.lng, center.lat);
      if (selectedIdRef.current) {
        loadDetails(selectedIdRef.current);
      }
    };
    socket.on("hangout:new", onNew);
    socket.on("hangout:update", onNew);
    return () => {
      socket.off("hangout:new", onNew);
      socket.off("hangout:update", onNew);
    };
  }, [accessToken, center.lat, center.lng]);

  useEffect(() => {
    if (!accessToken) {
      setFriendLocations({});
      return;
    }
    let active = true;
    friendsApi
      .locations(accessToken)
      .then((data) => {
        if (!active) return;
        const next = {};
        for (const entry of data.locations || []) {
          if (entry?.user?.id) next[entry.user.id] = entry;
        }
        setFriendLocations(next);
      })
      .catch(() => {
        if (active) setFriendLocations({});
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(() => {
    function handleFriendLocation(payload) {
      if (!payload?.user?.id) return;
      setFriendLocations((prev) => ({
        ...prev,
        [payload.user.id]: payload,
      }));
    }

    function handleFriendLocationStop(payload) {
      const userId = payload?.userId;
      if (!userId) return;
      setFriendLocations((prev) => {
        if (!prev[userId]) return prev;
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }

    socket.on("friends:location", handleFriendLocation);
    socket.on("friends:location:stop", handleFriendLocationStop);
    return () => {
      socket.off("friends:location", handleFriendLocation);
      socket.off("friends:location:stop", handleFriendLocationStop);
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (showCreate && draftPin) return;

    for (const h of feed) {
      const coords = h.location?.coordinates;
      if (!coords || coords.length < 2) continue;
      const coordsForRadius = h.location?.coordinates;
      const distance =
        coordsForRadius && coordsForRadius.length === 2
          ? distanceKm(center, { lng: coordsForRadius[0], lat: coordsForRadius[1] })
          : null;
      const isInRadius =
        typeof distance === "number" && distance <= radiusMeters / 1000;
      const isActive = selectedId === h._id;
      const swingDelay = `${(markersRef.current.length % 5) * 0.4}s`;
      const pulseDelay = `${(markersRef.current.length % 6) * 0.35}s`;
      const markerEl = createHangoutPin({
        isActive,
        isSwinging: isInRadius && !isActive,
        swingDelay,
        isPulsing: isInRadius && !isActive,
        pulseDelay,
        motionPaused: isMapZooming,
      });
    const marker = new mapboxgl.Marker({
      element: markerEl,
      anchor: "bottom",
      offset: HANGOUT_PIN_OFFSET,
    })
      .setLngLat(coords)
      .addTo(mapRef.current);
    marker.getElement().addEventListener("click", (e) => {
      e.stopPropagation();
      if (selectedId === h._id && isDetailOpen) {
        closeHangoutDetails();
        return;
      }
      openHangoutDetails(h);
    });
    markersRef.current.push(marker);
    }
  }, [
    feed,
    mapLoaded,
    selectedId,
    center,
    radiusMeters,
    isMapZooming,
    showCreate,
    draftPin,
  ]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    if (!draftPin) {
      if (draftMarkerRef.current) {
        draftMarkerRef.current.remove();
        draftMarkerRef.current = null;
      }
      return;
    }

    const marker =
      draftMarkerRef.current ||
      new mapboxgl.Marker({
        element: createHangoutPin({ isDraft: true }),
        anchor: "bottom",
        offset: HANGOUT_PIN_OFFSET,
      });
    marker.setLngLat([draftPin.lng, draftPin.lat]).addTo(mapRef.current);
    draftMarkerRef.current = marker;
  }, [draftPin, mapLoaded, isMapZooming]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    sharedMarkersRef.current.forEach((m) => m.remove());
    sharedMarkersRef.current = [];

    const shared = selected?.sharedLocations || [];
    for (const entry of shared) {
      const coords = entry.location?.coordinates;
      if (!coords || coords.length < 2) continue;
      const avatar = resolveAvatar(entry.user?.avatarUrl);
      const color = colorFromId(entry.user?.id);
      const el = document.createElement("div");
      el.className = "shared-location-marker";
      el.style.color = color;
      if (entry.note) {
        const bubble = document.createElement("div");
        bubble.className = "shared-location-note";
        bubble.textContent = entry.note.slice(0, 20);
        el.appendChild(bubble);
      }
      const core = document.createElement("div");
      if (avatar) {
        core.className = "shared-location-avatar";
        core.style.backgroundImage = `url(${avatar})`;
      } else {
        core.className = "shared-location-dot";
        core.style.backgroundColor = color;
      }
      el.appendChild(core);
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(coords)
        .addTo(mapRef.current);
      sharedMarkersRef.current.push(marker);
    }
  }, [selected?.sharedLocations, mapLoaded]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    friendMarkersRef.current.forEach((m) => m.remove());
    friendMarkersRef.current = [];

    for (const entry of Object.values(friendLocations)) {
      if (entry?.user?.id && user?.id && String(entry.user.id) === String(user.id)) {
        continue;
      }
      const coords = entry?.location;
      if (!coords || typeof coords.lng !== "number" || typeof coords.lat !== "number")
        continue;
      const el = createFriendMarker(entry.user);
      applyNoteBubble(el, entry.note);
      const marker = new mapboxgl.Marker({
        element: el,
        anchor: "bottom",
      })
        .setLngLat([coords.lng, coords.lat])
        .addTo(mapRef.current);
      friendMarkersRef.current.push(marker);
    }
  }, [friendLocations, mapLoaded]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !userLocation) return;

    if (shareAllEnabled) {
      if (selfMarkerRef.current) {
        selfMarkerRef.current.remove();
        selfMarkerRef.current = null;
      }
      if (selfAvatarMarkerRef.current) {
        selfAvatarMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
        applyNoteBubble(selfAvatarMarkerRef.current.getElement(), shareAllNote);
        return;
      }
      const marker = new mapboxgl.Marker({
        element: createSelfShareMarker(user, shareAllNote),
        anchor: "bottom",
      })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(mapRef.current);
      selfAvatarMarkerRef.current = marker;
      return;
    }

    if (selfAvatarMarkerRef.current) {
      selfAvatarMarkerRef.current.remove();
      selfAvatarMarkerRef.current = null;
    }
    if (selfMarkerRef.current) {
      selfMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
      return;
    }
    const el = document.createElement("div");
    el.className = "self-location-dot";
    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(mapRef.current);
    selfMarkerRef.current = marker;
  }, [userLocation, mapLoaded, shareAllEnabled, user, shareAllNote]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource("hangout-radius");
    if (!source) return;
    source.setData(buildRadiusCircle(center, radiusMeters));
  }, [center.lat, center.lng, radiusMeters, mapLoaded]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource("hangout-route");
    if (!source) return;
    source.setData({ type: "FeatureCollection", features: [] });
    setRouteVisible(false);
  }, [selected?._id, mapLoaded]);

  async function loadDetails(hangoutId) {
    if (!accessToken || !hangoutId) return;
    setIsDetailLoading(true);
    try {
      const data = await hangoutsApi.get(accessToken, hangoutId);
      const hangout = data?.hangout || null;
      if (isHangoutClosed(hangout)) {
        setSelected(null);
        if (hangoutIdParam && String(hangoutIdParam) === String(hangoutId)) {
          setShowHangoutClosedModal(true);
        }
      } else {
        setSelected(hangout);
      }
    } catch {
      setSelected(null);
      if (hangoutIdParam && String(hangoutIdParam) === String(hangoutId)) {
        setShowHangoutClosedModal(true);
      }
    } finally {
      setIsDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedId || !accessToken) {
      setSelected(null);
      return;
    }
    loadDetails(selectedId);
  }, [selectedId, accessToken]);

  useEffect(() => {
    setJoinActionError("");
    setJoinRequestActionKey("");
    setAttendeeStatusError("");
    setAttendeeStatusUpdatingId("");
  }, [selected?._id]);

  useEffect(() => {
    if (!hangoutIdParam) return;
    if (handledHangoutIdRef.current === hangoutIdParam) return;
    handledHangoutIdRef.current = hangoutIdParam;
    const found = feed.find((h) => h._id === hangoutIdParam);
    if (found) {
      if (isHangoutClosed(found)) {
        closeHangoutDetails();
        setShowHangoutClosedModal(true);
        return;
      }
      openHangoutDetails(found);
      const coords = found.location?.coordinates;
      if (mapRef.current && mapLoaded && coords?.length === 2) {
        mapRef.current.flyTo({
          center: coords,
          zoom: 14,
          essential: true,
        });
      }
      return;
    }
    if (accessToken) {
      openHangoutDetails(hangoutIdParam);
    }
  }, [hangoutIdParam, feed, mapLoaded, accessToken]);

  useEffect(() => {
    if (!hangoutIdParam || !selected || selected._id !== hangoutIdParam) return;
    const coords = selected.location?.coordinates;
    if (!mapRef.current || !mapLoaded || !coords || coords.length < 2) return;
    mapRef.current.flyTo({ center: coords, zoom: 14, essential: true });
  }, [hangoutIdParam, selected, mapLoaded]);

  function distanceKm(a, b) {
    if (!a || !b) return null;
    const toRad = (n) => (n * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  const isCreator = selected && String(selected.creator?.id) === String(user?.id);
  const isJoined =
    selected?.attendees?.some((a) => String(a.id) === String(user?.id)) || false;
  const isFull =
    selected?.maxAttendees &&
    selected.attendeeCount >= selected.maxAttendees &&
    !isJoined;
  const isJoinApprovalRequired = (selected?.joinPolicy || "open") === "approval";
  const isJoinRequestPending = String(selected?.joinRequestStatus || "none") === "pending";
  const joinedHangouts = useMemo(
    () =>
      feed.filter((h) => {
        const isAttendee = (h.attendees || []).some(
          (a) => String(a.id) === String(user?.id)
        );
        const isCreator = String(h.creator?.id || "") === String(user?.id || "");
        return isAttendee && !isCreator;
      }),
    [feed, user?.id]
  );
  const myHangouts = useMemo(
    () => feed.filter((h) => String(h.creator?.id) === String(user?.id)),
    [feed, user?.id]
  );
  const shareTargets = useMemo(() => {
    const ids = new Set();
    if (shareEnabled && selected?._id && isJoined) {
      ids.add(selected._id);
    }
    return Array.from(ids);
  }, [shareEnabled, selected?._id, isJoined]);
  const shareTargetsRef = useRef([]);
  const shareNoteRef = useRef(shareNote);
  const shareAllEnabledRef = useRef(shareAllEnabled);
  const shareAllNoteRef = useRef(shareAllNote);
  const selectedIdRef = useRef(null);
  const shareWatchRef = useRef(null);
  const lastShareSentRef = useRef(0);
  const shareInFlightRef = useRef(false);

  useEffect(() => {
    shareTargetsRef.current = shareTargets;
  }, [shareTargets]);

  useEffect(() => {
    shareAllNoteRef.current = shareAllNote;
  }, [shareAllNote]);

  useEffect(() => {
    if (!shareAllEnabled || !accessToken || !userLocation) return;
    const trimmed = shareAllNote.trim().slice(0, 16);
    const timer = setTimeout(async () => {
      try {
        await friendsApi.updateLocation(accessToken, {
          ...userLocation,
          note: trimmed,
        });
      } catch (err) {
        setShareAllError(err.message || "Failed to update note");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [shareAllNote, shareAllEnabled, accessToken, userLocation]);

  useEffect(() => {
    shareNoteRef.current = shareNote;
  }, [shareNote]);

  useEffect(() => {
    shareAllEnabledRef.current = shareAllEnabled;
  }, [shareAllEnabled]);

  useEffect(() => {
    selectedIdRef.current = selected?._id || null;
  }, [selected?._id]);

  useEffect(() => {
    const hangoutId = isDetailOpen ? selected?._id : null;
    const prev = joinedHangoutRoomRef.current;
    if (prev && prev !== hangoutId) {
      socket.emit("hangout:leave", { hangoutId: prev });
      joinedHangoutRoomRef.current = null;
    }
    if (hangoutId && prev !== hangoutId) {
      socket.emit("hangout:join", { hangoutId });
      joinedHangoutRoomRef.current = hangoutId;
    }
    if (!hangoutId && prev) {
      socket.emit("hangout:leave", { hangoutId: prev });
      joinedHangoutRoomRef.current = null;
    }
  }, [isDetailOpen, selected?._id]);

  useEffect(() => {
    return () => {
      const prev = joinedHangoutRoomRef.current;
      if (prev) {
        socket.emit("hangout:leave", { hangoutId: prev });
        joinedHangoutRoomRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function handleStatusUpdate(payload) {
      if (!payload?.hangoutId || !payload?.userId) return;
      if (String(payload.hangoutId) !== String(selectedIdRef.current || "")) return;
      setSelected((prev) => {
        if (!prev) return prev;
        const attendees = (prev.attendees || []).map((a) => {
          if (String(a.id) !== String(payload.userId)) return a;
          return { ...a, status: payload.status, attendanceStatus: payload.status };
        });
        return { ...prev, attendees };
      });
    }
    socket.on("hangout:attendeeStatusUpdated", handleStatusUpdate);
    return () => {
      socket.off("hangout:attendeeStatusUpdated", handleStatusUpdate);
    };
  }, []);

  function updateSelectedAttendeeStatus(userId, status) {
    setSelected((prev) => {
      if (!prev) return prev;
      const attendees = (prev.attendees || []).map((a) => {
        if (String(a.id) !== String(userId)) return a;
        return { ...a, status, attendanceStatus: status };
      });
      return { ...prev, attendees };
    });
  }

  async function handleUpdateAttendeeStatus(userId, nextStatus) {
    if (!selected?._id || !accessToken || !userId) return;
    const current = (selected.attendees || []).find(
      (a) => String(a.id) === String(userId)
    );
    const prevStatus = current?.status || current?.attendanceStatus || "Confirmed";
    updateSelectedAttendeeStatus(userId, nextStatus);
    setAttendeeStatusUpdatingId(String(userId));
    setAttendeeStatusError("");
    try {
      const data = await hangoutsApi.updateAttendeeStatus(
        accessToken,
        selected._id,
        nextStatus
      );
      if (data?.hangout && String(data.hangout._id) === String(selected._id)) {
        setSelected(data.hangout);
      } else if (data?.attendee?.status) {
        updateSelectedAttendeeStatus(userId, data.attendee.status);
      }
    } catch (err) {
      updateSelectedAttendeeStatus(userId, prevStatus);
      setAttendeeStatusError(err.message || "Failed to update status");
    } finally {
      setAttendeeStatusUpdatingId("");
    }
  }

  useEffect(() => {
    if (!mapboxToken || !userLocation || !selected?.location?.coordinates) {
      setDriveDistanceKm(null);
      return;
    }
    const [lng, lat] = selected.location.coordinates;
    if (typeof lng !== "number" || typeof lat !== "number") return;

    let cancelled = false;
    setDriveDistanceLoading(true);
    setDriveDistanceError("");

    const url =
      "https://api.mapbox.com/directions/v5/mapbox/driving/" +
      `${userLocation.lng},${userLocation.lat};${lng},${lat}` +
      `?access_token=${mapboxToken}&overview=false&geometries=geojson`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const meters = data?.routes?.[0]?.distance;
        if (typeof meters === "number") {
          setDriveDistanceKm(meters / 1000);
        } else {
          setDriveDistanceKm(null);
        }
      })
      .catch(() => {
        if (!cancelled) setDriveDistanceError("Failed to load driving distance");
      })
      .finally(() => {
        if (!cancelled) setDriveDistanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mapboxToken, userLocation, selected?.location?.coordinates]);

  async function handleToggleRoute() {
    if (!mapRef.current || !mapLoaded) return;
    const source = mapRef.current.getSource("hangout-route");
    if (!source) return;

    if (routeVisible) {
      source.setData({ type: "FeatureCollection", features: [] });
      setRouteVisible(false);
      return;
    }

    if (!mapboxToken || !userLocation || !selected?.location?.coordinates) return;
    const [lng, lat] = selected.location.coordinates;
    if (typeof lng !== "number" || typeof lat !== "number") return;

    setRouteLoading(true);
    setRouteError("");
    try {
      const url =
        "https://api.mapbox.com/directions/v5/mapbox/driving/" +
        `${userLocation.lng},${userLocation.lat};${lng},${lat}` +
        `?access_token=${mapboxToken}&overview=full&geometries=geojson`;
      const r = await fetch(url);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || "Route failed");
      const coords = data?.routes?.[0]?.geometry?.coordinates || [];
      source.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "LineString", coordinates: coords },
            properties: {},
          },
        ],
      });
      setRouteVisible(true);
    } catch (err) {
      setRouteError(err.message || "Route failed");
    } finally {
      setRouteLoading(false);
    }
  }

  useEffect(() => {
    if (!shareEnabled || !selected?._id || !accessToken) return;
    if (shareNote.length > 20) return;
    setShareNoteError("");

    const timer = setTimeout(async () => {
      try {
        const data = await hangoutsApi.updateShareNote(accessToken, selected._id, shareNote);
        if (data?.hangout) setSelected(data.hangout);
      } catch (err) {
        setShareNoteError(err.message || "Failed to update note");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [shareNote, shareEnabled, selected?._id, accessToken]);

  useEffect(() => {
    const isSharing =
      selected?.sharedLocations?.some((x) => String(x.user?.id) === String(user?.id)) ||
      false;
    setShareEnabled(isSharing);
  }, [selected?._id, selected?.sharedLocations, user?.id]);

  useEffect(() => {
    if (!selected?.sharedLocations || !user?.id) return;
    const entry = selected.sharedLocations.find(
      (x) => String(x.user?.id) === String(user.id)
    );
    setShareNote(entry?.note || "");
  }, [selected?.sharedLocations, user?.id]);

  useEffect(() => {
    const shouldShare = shareAllEnabled || shareTargets.length > 0;
    if (!accessToken || !shouldShare) {
      if (shareWatchRef.current !== null) {
        navigator.geolocation.clearWatch(shareWatchRef.current);
        shareWatchRef.current = null;
      }
      return;
    }
    if (!navigator.geolocation || shareWatchRef.current !== null) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        if (shareInFlightRef.current) return;
        const next = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setUserLocation(next);
        const now = Date.now();
        if (now - lastShareSentRef.current < 30000) return;
        lastShareSentRef.current = now;
        shareInFlightRef.current = true;

        const ids = shareTargetsRef.current;
        for (const id of ids) {
          try {
            const data = await hangoutsApi.shareLocation(accessToken, id, {
              ...next,
              note: id === selectedIdRef.current ? shareNoteRef.current : "",
            });
            if (data?.hangout && id === selectedIdRef.current) {
              setSelected(data.hangout);
            }
          } catch (err) {
            const message = err.message || "Failed to share location";
            if (shareAllEnabledRef.current) {
              setShareAllError((prev) => (prev === message ? prev : message));
            } else {
              setShareError((prev) => (prev === message ? prev : message));
            }
          }
        }
        if (shareAllEnabledRef.current) {
          try {
            await friendsApi.updateLocation(accessToken, {
              ...next,
              note: shareAllNoteRef.current,
            });
          } catch (err) {
            const message = err.message || "Failed to share location";
            setShareAllError((prev) => (prev === message ? prev : message));
          }
        }
        shareInFlightRef.current = false;
      },
      () => {
        const message = "Location permission is required to share.";
        if (shareAllEnabledRef.current) {
          setShareAllError((prev) => (prev === message ? prev : message));
        } else {
          setShareError((prev) => (prev === message ? prev : message));
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );

    shareWatchRef.current = watchId;
    return () => {
      if (shareWatchRef.current === watchId) {
        navigator.geolocation.clearWatch(watchId);
        shareWatchRef.current = null;
      }
    };
  }, [accessToken, shareTargets.length, shareAllEnabled]);

  async function handleJoinLeave() {
    if (!selected || !accessToken) return;
    setJoinActionError("");
    try {
      if (isJoined) {
        await hangoutsApi.leave(accessToken, selected._id);
        setShareEnabled(false);
      } else {
        await hangoutsApi.join(accessToken, selected._id);
      }
      await loadFeed(center.lng, center.lat);
      await loadDetails(selected._id);
    } catch (err) {
      setJoinActionError(err.message || "Unable to update join state");
    }
  }

  async function handleApproveJoinRequest(requestUserId) {
    if (!selected?._id || !requestUserId || !accessToken) return;
    const key = `accept:${requestUserId}`;
    setJoinRequestActionKey(key);
    setJoinActionError("");
    try {
      await hangoutsApi.acceptJoinRequest(accessToken, selected._id, requestUserId);
      await loadFeed(center.lng, center.lat);
      await loadDetails(selected._id);
    } catch (err) {
      setJoinActionError(err.message || "Unable to accept join request");
    } finally {
      setJoinRequestActionKey("");
    }
  }

  async function handleDeclineJoinRequest(requestUserId) {
    if (!selected?._id || !requestUserId || !accessToken) return;
    const key = `decline:${requestUserId}`;
    setJoinRequestActionKey(key);
    setJoinActionError("");
    try {
      await hangoutsApi.declineJoinRequest(accessToken, selected._id, requestUserId);
      await loadFeed(center.lng, center.lat);
      await loadDetails(selected._id);
    } catch (err) {
      setJoinActionError(err.message || "Unable to decline join request");
    } finally {
      setJoinRequestActionKey("");
    }
  }

  async function handleDelete() {
    if (!selected || !accessToken) return;
    try {
      await hangoutsApi.remove(accessToken, selected._id);
      setSelected(null);
      setSelectedId(null);
      await loadFeed(center.lng, center.lat);
    } catch {
      // ignore
    }
  }

  function openRemoveAttendeeConfirm(attendee) {
    if (!attendee?.id || !selected?._id) return;
    setRemoveAttendeeTarget({
      id: String(attendee.id),
      username: attendee.username || "user",
      displayName: attendee.displayName || attendee.username || "user",
    });
  }

  function closeRemoveAttendeeConfirm() {
    setRemoveAttendeeTarget(null);
  }

  async function confirmRemoveAttendee() {
    if (!selected?._id || !removeAttendeeTarget?.id || !accessToken) return;
    try {
      await hangoutsApi.removeAttendee(accessToken, selected._id, removeAttendeeTarget.id);
      setRemoveAttendeeTarget(null);
      await loadFeed(center.lng, center.lat);
      await loadDetails(selected._id);
    } catch (err) {
      setJoinActionError(err.message || "Unable to remove attendee");
    }
  }

  function openDeleteConfirm() {
    if (!selected) return;
    setShowDeleteConfirm(true);
  }

  function closeDeleteConfirm() {
    setShowDeleteConfirm(false);
  }

  async function confirmDelete() {
    await handleDelete();
    setShowDeleteConfirm(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!accessToken || !draftPin) return;
    if (!formState.title.trim()) {
      setFormError("Title is required.");
      return;
    }

    if (!formState.startsAt) {
      setFormError("Start time is required.");
      return;
    }
    const startsAt = formState.startsAt.toISOString();

    const payload = {
      title: formState.title.trim(),
      description: formState.description.trim(),
      startsAt,
      durationMinutes: Number(formState.durationMinutes || 120),
      location: { lng: draftPin.lng, lat: draftPin.lat },
      visibility: formState.visibility,
      anyoneCanJoin: formState.anyoneCanJoin !== false,
      maxAttendees:
        formState.maxAttendees === "" ? null : Number(formState.maxAttendees),
    };
    if (!isEditing) {
      payload.createGroupChat = formState.createGroupChat !== false;
    }

    try {
      if (isEditing && editingId) {
        await hangoutsApi.update(accessToken, editingId, payload);
      } else {
        await hangoutsApi.create(accessToken, payload);
      }
      setShowCreate(false);
      setIsEditing(false);
      setEditingId(null);
      setDraftPin(null);
      setFormState({
        title: "",
        description: "",
        startsAt: null,
        durationMinutes: 120,
        visibility: "friends",
        maxAttendees: "",
        anyoneCanJoin: true,
        createGroupChat: true,
      });
      await loadFeed(center.lng, center.lat);
      if (selectedId) await loadDetails(selectedId);
    } catch (err) {
      setFormError(err.message || "Failed to create hangout.");
    }
  }

  function handleShowMap() {
    setMapReady(true);
  }

  async function handleToggleShareLocation() {
    if (!selected || !accessToken) return;
    if (shareLoading) return;
    setShareError("");
    setShareLoading(true);
    if (!shareEnabled) {
      if (!navigator.geolocation) {
        setShareError("Location is not supported on this device.");
        setShareLoading(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const next = { lng: pos.coords.longitude, lat: pos.coords.latitude };
          setUserLocation(next);
          try {
            const data = await hangoutsApi.shareLocation(accessToken, selected._id, {
              ...next,
              note: shareNote,
            });
            if (data?.hangout) setSelected(data.hangout);
            setShareEnabled(true);
          } catch (err) {
            setShareError(err.message || "Failed to share location");
          } finally {
            setShareLoading(false);
          }
        },
        () => {
          setShareError("Location permission is required to share.");
          setShareLoading(false);
        }
      );
    } else {
      try {
        const data = await hangoutsApi.stopSharing(accessToken, selected._id);
        if (data?.hangout) setSelected(data.hangout);
        setShareEnabled(false);
      } catch (err) {
        setShareError(err.message || "Failed to stop sharing");
      } finally {
        setShareLoading(false);
      }
    }
  }

  async function handleToggleShareAll() {
    if (!accessToken) return;
    if (shareAllLoading) return;
    setShareAllError("");
    setShareAllLoading(true);

    if (!shareAllEnabled) {
      if (!navigator.geolocation) {
        setShareAllError("Location is not supported on this device.");
        setShareAllLoading(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const next = { lng: pos.coords.longitude, lat: pos.coords.latitude };
          setUserLocation(next);
          setShareAllEnabled(true);
          try {
            await friendsApi.updateLocation(accessToken, { ...next, note: shareAllNote });
          } catch (err) {
            setShareAllError(err.message || "Failed to share location");
          } finally {
            setShareAllLoading(false);
          }
        },
        () => {
          setShareAllError("Location permission is required to share.");
          setShareAllLoading(false);
        }
      );
      return;
    }

    setShareAllEnabled(false);
    try {
      await friendsApi.stopLocation(accessToken);
    } catch (err) {
      setShareAllError(err.message || "Failed to stop sharing");
    } finally {
      setShareAllLoading(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!mapboxToken) return;
    const q = searchQuery.trim();
    if (!q) return;

    setSearchLoading(true);
    setSearchError("");
    try {
      const params = new URLSearchParams({
        access_token: mapboxToken,
        limit: "10",
        proximity: `${center.lng},${center.lat}`,
        types: "poi,place,address",
        autocomplete: "true",
        fuzzyMatch: "true",
      });
      if (searchCountry) params.set("country", searchCountry);
      const url =
        "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
        encodeURIComponent(q) +
        `.json?${params.toString()}`;
      const r = await fetch(url);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || "Search failed");
      setSearchResults(sortSearchResults(data.features || []));
    } catch (err) {
      setSearchResults([]);
      setSearchError(err.message || "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }

  useEffect(() => {
    if (!mapReady || !mapboxToken) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchError("");
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const params = new URLSearchParams({
          access_token: mapboxToken,
          limit: "10",
          proximity: `${center.lng},${center.lat}`,
          types: "poi,place,address",
          autocomplete: "true",
          fuzzyMatch: "true",
        });
        if (searchCountry) params.set("country", searchCountry);
        const url =
          "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
          encodeURIComponent(q) +
          `.json?${params.toString()}`;
        const r = await fetch(url);
        const data = await r.json();
        if (!r.ok) throw new Error(data?.message || "Search failed");
        setSearchResults(sortSearchResults(data.features || []));
      } catch (err) {
        setSearchResults([]);
        setSearchError(err.message || "Search failed");
      } finally {
        setSearchLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, mapReady, mapboxToken, center.lat, center.lng]);

  function handleSelectResult(feature) {
    if (!feature?.center || feature.center.length < 2) return;
    const [lng, lat] = feature.center;
    setCenter({ lng, lat });
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 14, essential: true });
    }
    setSearchResults([]);
  }

  useEffect(() => {
    if (searchResults.length === 0) return;
    function handleClickOutside(e) {
      if (!searchRef.current) return;
      if (!searchRef.current.contains(e.target)) {
        setSearchResults([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchResults.length]);

  function closeModal() {
    setShowCreate(false);
    setIsEditing(false);
    setEditingId(null);
    setDraftPin(null);
    setFormState({
      title: "",
      description: "",
      startsAt: null,
      durationMinutes: 120,
      visibility: "friends",
      maxAttendees: "",
      anyoneCanJoin: true,
      createGroupChat: true,
    });
  }

  function openEdit() {
    if (!selected) return;
    const coords = selected.location?.coordinates;
    if (coords?.length === 2) {
      setDraftPin({ lng: coords[0], lat: coords[1] });
    }
    setIsEditing(true);
    setEditingId(selected._id);
    setFormState({
      title: selected.title || "",
      description: selected.description || "",
      startsAt: selected.startsAt ? dayjs(selected.startsAt) : null,
      durationMinutes: Math.max(
        15,
        selected.endsAt && selected.startsAt
          ? Math.round(
              (new Date(selected.endsAt).getTime() -
                new Date(selected.startsAt).getTime()) /
                60000
            )
          : 120
      ),
      visibility: selected.visibility || "friends",
      maxAttendees: selected.maxAttendees ?? "",
      anyoneCanJoin: (selected.joinPolicy || "open") !== "approval",
      createGroupChat: true,
    });
    setFormError("");
    setShowCreate(true);
  }

  useEffect(() => {
    try {
      localStorage.setItem(
        MAP_STATE_KEY,
        JSON.stringify({
          center,
          zoom,
          radiusMeters,
          mapReady,
        })
      );
    } catch {
      // ignore
    }
  }, [center, zoom, radiusMeters, mapReady]);

  useEffect(() => {
    const hasOverlay =
      (isTabletLayout && (leftDrawerOpen || rightDrawerOpen)) ||
      (isMobileLayout && mobileControlsOpen);
    if (!hasOverlay) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (isTabletLayout) {
        setLeftDrawerOpen(false);
        setRightDrawerOpen(false);
      }
      if (isMobileLayout) {
        setMobileControlsOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isTabletLayout, isMobileLayout, leftDrawerOpen, rightDrawerOpen, mobileControlsOpen]);

  const openListDrawer = useCallback(() => {
    setLeftDrawerOpen(true);
    setRightDrawerOpen(false);
  }, []);

  const openControlsDrawer = useCallback(() => {
    setRightDrawerOpen(true);
    setLeftDrawerOpen(false);
  }, []);

  const closeTabletDrawers = useCallback(() => {
    setLeftDrawerOpen(false);
    setRightDrawerOpen(false);
  }, []);

  const cycleMobileSheetState = useCallback(() => {
    setMobileSheetState((prev) => {
      if (prev === "collapsed") return "mid";
      if (prev === "mid") return "full";
      return "mid";
    });
  }, []);

  const getMobileSheetSnapHeights = useCallback(() => {
    const viewportHeight =
      typeof window === "undefined"
        ? 0
        : window.visualViewport?.height || window.innerHeight || 0;

    const collapsed = MOBILE_SHEET_COLLAPSED_HEIGHT;
    if (viewportHeight <= 0) {
      return {
        collapsed,
        mid: collapsed + 180,
        full: collapsed + 360,
      };
    }

    const full = Math.max(collapsed + 120, Math.round(viewportHeight * MOBILE_SHEET_FULL_RATIO));
    const rawMid = Math.max(collapsed + 80, Math.round(viewportHeight * MOBILE_SHEET_MID_RATIO));
    const mid = Math.min(rawMid, full - 40);

    return { collapsed, mid, full };
  }, []);

  const getNearestMobileSheetState = useCallback(
    (height) => {
      const { collapsed, mid, full } = getMobileSheetSnapHeights();
      const candidates = [
        { state: "collapsed", height: collapsed },
        { state: "mid", height: mid },
        { state: "full", height: full },
      ];

      return candidates.reduce((closest, next) =>
        Math.abs(next.height - height) < Math.abs(closest.height - height) ? next : closest
      ).state;
    },
    [getMobileSheetSnapHeights]
  );

  const finishMobileSheetDrag = useCallback(
    (pointerId) => {
      const dragState = mobileSheetDragStateRef.current;
      if (!dragState || dragState.pointerId !== pointerId) return;

      const didDrag = mobileSheetDragMovedRef.current;
      const currentHeight = mobileSheetRef.current?.getBoundingClientRect().height;
      const finalHeight =
        typeof currentHeight === "number" && Number.isFinite(currentHeight)
          ? currentHeight
          : dragState.startHeight;

      mobileSheetDragStateRef.current = null;
      mobileSheetDragMovedRef.current = false;
      setIsMobileSheetDragging(false);
      setMobileSheetDragHeight(null);

      if (!didDrag) return;

      suppressSheetHandleClickRef.current = true;
      setMobileSheetState(getNearestMobileSheetState(finalHeight));
    },
    [getNearestMobileSheetState]
  );

  const handleMobileSheetPointerDown = useCallback(
    (event) => {
      if (!isMobileLayout) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const sheetNode = mobileSheetRef.current;
      if (!sheetNode) return;

      const startHeight = sheetNode.getBoundingClientRect().height;
      mobileSheetDragStateRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startHeight,
      };
      mobileSheetDragMovedRef.current = false;
      setIsMobileSheetDragging(true);
      setMobileSheetDragHeight(startHeight);

      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // no-op
      }
    },
    [isMobileLayout]
  );

  const handleMobileSheetPointerMove = useCallback(
    (event) => {
      const dragState = mobileSheetDragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      const deltaY = event.clientY - dragState.startY;
      if (!mobileSheetDragMovedRef.current && Math.abs(deltaY) >= MOBILE_SHEET_DRAG_THRESHOLD_PX) {
        mobileSheetDragMovedRef.current = true;
      }

      const { collapsed, full } = getMobileSheetSnapHeights();
      const nextHeight = Math.min(full, Math.max(collapsed, dragState.startHeight - deltaY));
      setMobileSheetDragHeight(nextHeight);
    },
    [getMobileSheetSnapHeights]
  );

  const handleMobileSheetPointerUp = useCallback(
    (event) => {
      finishMobileSheetDrag(event.pointerId);
      try {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // no-op
      }
    },
    [finishMobileSheetDrag]
  );

  const handleMobileSheetPointerCancel = useCallback(
    (event) => {
      finishMobileSheetDrag(event.pointerId);
      try {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // no-op
      }
    },
    [finishMobileSheetDrag]
  );

  const handleMobileSheetHandleClick = useCallback(() => {
    if (suppressSheetHandleClickRef.current) {
      suppressSheetHandleClickRef.current = false;
      return;
    }
    cycleMobileSheetState();
  }, [cycleMobileSheetState]);

  function handleRecenter() {
    if (!userLocation) return;
    setCenter(userLocation);
    setZoom(14);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 14 });
    }
  }

  function closeHangoutDetails() {
    setIsDetailOpen(false);
    setSelectedId(null);
    setSelected(null);
  }

  function openHangoutDetails(hangoutOrId) {
    const hangoutId =
      typeof hangoutOrId === "string" ? hangoutOrId : hangoutOrId?._id;
    if (!hangoutId) return;
    setSelectedId(hangoutId);
    if (hangoutOrId && typeof hangoutOrId === "object") {
      setSelected(hangoutOrId);
    }
    setIsDetailOpen(true);
  }

  function handleCloseDetail() {
    closeHangoutDetails();
  }

  useEffect(() => {
    if (!isDetailOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeHangoutDetails();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDetailOpen]);

  useEffect(() => {
    document.body.style.overflow = isDetailOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isDetailOpen]);

  function closeHangoutClosedModal() {
    setShowHangoutClosedModal(false);
    const next = new URLSearchParams(searchParams);
    next.delete("hangoutClosed");
    next.delete("hangoutTitle");
    next.delete("hangoutId");
    const query = next.toString();
    nav(query ? `/app/map?${query}` : "/app/map", { replace: true });
  }

  function renderHangoutList(items, emptyCopy, options = {}) {
    const { splitTimeRow = false } = options;
    if (isLoading) {
      return <div className="hangouts-panel-muted">Loading hangouts...</div>;
    }
    if (items.length === 0) {
      return <div className="hangouts-panel-muted">{emptyCopy}</div>;
    }
    return (
      <div className="hangouts-list">
        {items.map((h) => (
          <button
            key={h._id}
            type="button"
            className={`hangout-list-item${selectedId === h._id ? " is-active" : ""}`}
            onClick={() => {
              openHangoutDetails(h);
              const coords = h.location?.coordinates;
              if (
                mapRef.current &&
                mapLoaded &&
                coords &&
                coords.length === 2
              ) {
                mapRef.current.flyTo({
                  center: coords,
                  zoom: 14,
                  essential: true,
                });
              }
            }}
          >
            {(() => {
              const coords = h.location?.coordinates;
              const km =
                userLocation && coords && coords.length === 2
                  ? distanceKm(userLocation, { lng: coords[0], lat: coords[1] })
                  : null;
              const distanceText =
                typeof km === "number"
                  ? `${km.toFixed(2)} km`
                  : formatDistance(h.distanceMeters) || "Nearby";
              return (
                <>
            {resolveAvatar(h.creator?.avatarUrl) ? (
              <img
                src={resolveAvatar(h.creator?.avatarUrl)}
                alt={h.creator?.username || "Creator"}
                className="hangout-list-avatar hangout-list-avatar-img"
              />
            ) : (
              <div className="hangout-list-avatar">
                {getInitial(h.creator?.username || h.title)}
              </div>
            )}
            <div className="hangout-list-body">
              <div className="hangout-list-title">{h.title || "Untitled"}</div>
              <div className="hangout-list-subtitle">
                {h.creator?.username || "Unknown"}
              </div>
              {splitTimeRow ? (
                <>
                  <div className="hangout-list-meta">
                    <span>{distanceText}</span>
                  </div>
                  <div className="hangout-list-meta">
                    <span>{h.timeLabel || formatDateTime(h.startsAt) || "Time TBD"}</span>
                  </div>
                </>
              ) : (
                <div className="hangout-list-meta">
                  <span>{distanceText}</span>
                  <span>{h.timeLabel || formatDateTime(h.startsAt) || "Time TBD"}</span>
                </div>
              )}
              <div className="hangout-list-meta">
                <span>{h.attendeeCount || h.attendees?.length || 0} attending</span>
              </div>
            </div>
                </>
              );
            })()}
          </button>
        ))}
      </div>
    );
  }

  const canRenderPanels = mapReady && locationEnabled !== false;
  const withinListContent = renderHangoutList(
    feed,
    "No hangouts within this radius yet.",
    { splitTimeRow: true }
  );
  const joinedListContent = renderHangoutList(
    showMyHangouts ? myHangouts : joinedHangouts,
    showMyHangouts
      ? "You have not created any hangouts yet."
      : "You have not joined any hangouts yet."
  );
  const mobileNearbySummary = isLoading
    ? "Loading hangouts..."
    : `${feed.length} hangouts nearby`;

  return (
    <div
      className={`hangouts-map-page ${pageLayoutClass} ${
        isMobileLayout ? `mobile-sheet-${mobileSheetState}` : ""
      }`.trim()}
    >
      {!mapboxToken && (
        <div className="alert alert-warning">
          Missing Mapbox token. Set VITE_MAPBOX_TOKEN to load the map.
        </div>
      )}

      <div className="hangouts-map-layout">
        <div className="hangouts-map-center">
          <MapCanvas
            mapReady={mapReady}
            locating={locating}
            locationEnabled={locationEnabled}
            mapContainerRef={mapContainerRef}
            onLoadMap={handleShowMap}
          >
            {canRenderPanels && isDesktopLayout && (
              <>
                <div className="map-left-stack map-overlay">
                  <HangoutsPanel
                    searchRef={searchRef}
                    searchQuery={searchQuery}
                    onChangeSearchQuery={(e) => setSearchQuery(e.target.value)}
                    onSubmitSearch={handleSearch}
                    searchError={searchError}
                    searchResults={searchResults}
                    onSelectResult={handleSelectResult}
                    radiusMeters={radiusMeters}
                    showWithinList={showWithinList}
                    onToggleWithinList={() => setShowWithinList((prev) => !prev)}
                    showIcon={showIcon}
                    hiddenIcon={hiddenIcon}
                    listContent={withinListContent}
                    className="map-left-primary map-panel-desktop"
                  />
                </div>

                <div className="hangouts-map-toolbar map-overlay">
                  <ControlsPanel
                    className="map-controls-desktop"
                    radiusMeters={radiusMeters}
                    onChangeRadius={(e) => setRadiusMeters(Number(e.target.value))}
                    shareAllEnabled={shareAllEnabled}
                    onToggleShareAll={handleToggleShareAll}
                    shareAllLoading={shareAllLoading}
                    shareAllNote={shareAllNote}
                    onShareAllNoteChange={(e) => setShareAllNote(e.target.value)}
                    shareAllError={shareAllError}
                    showMyHangouts={showMyHangouts}
                    onToggleMyHangouts={() => setShowMyHangouts((prev) => !prev)}
                    showJoinedList={showJoinedList}
                    onToggleJoinedList={() => setShowJoinedList((prev) => !prev)}
                    joinedHangoutsCount={joinedHangouts.length}
                    myHangoutsCount={myHangouts.length}
                    showIcon={showIcon}
                    hiddenIcon={hiddenIcon}
                    joinedListContent={joinedListContent}
                    footer={
                      <div className="map-actions-right">
                        <MapActions onRecenter={handleRecenter} disabled={!userLocation} />
                      </div>
                    }
                  />
                </div>
              </>
            )}

            {canRenderPanels && isTabletLayout && (
              <div className="map-floating-actions map-overlay" role="group" aria-label="Map actions">
                <button
                  type="button"
                  className="map-fab-btn"
                  onClick={openListDrawer}
                  aria-expanded={leftDrawerOpen}
                  aria-controls="map-left-drawer"
                >
                  List
                </button>
                <button
                  type="button"
                  className="map-fab-btn"
                  onClick={openControlsDrawer}
                  aria-expanded={rightDrawerOpen}
                  aria-controls="map-right-drawer"
                >
                  Controls
                </button>
                <MapActions onRecenter={handleRecenter} disabled={!userLocation} />
              </div>
            )}

            {canRenderPanels && isMobileLayout && (
              <div className="map-floating-actions map-overlay" role="group" aria-label="Map actions">
                <button
                  type="button"
                  className="map-fab-btn"
                  onClick={() => setMobileControlsOpen(true)}
                  aria-expanded={mobileControlsOpen}
                  aria-controls="map-mobile-controls-sheet"
                >
                  Controls
                </button>
                <MapActions onRecenter={handleRecenter} disabled={!userLocation} />
              </div>
            )}

            {canRenderPanels && isMobileLayout && (
              <section
                ref={mobileSheetRef}
                className={`map-mobile-sheet is-${mobileSheetState}${
                  isMobileSheetDragging ? " is-dragging" : ""
                } map-overlay`}
                style={mobileSheetDragHeight != null ? { height: `${mobileSheetDragHeight}px` } : undefined}
                aria-label="Hangouts list"
              >
                <button
                  type="button"
                  className="map-mobile-sheet-handle"
                  onClick={handleMobileSheetHandleClick}
                  onPointerDown={handleMobileSheetPointerDown}
                  onPointerMove={handleMobileSheetPointerMove}
                  onPointerUp={handleMobileSheetPointerUp}
                  onPointerCancel={handleMobileSheetPointerCancel}
                  aria-label="Expand hangouts list"
                >
                  <span className="map-mobile-sheet-grip" aria-hidden="true" />
                  <span className="map-mobile-sheet-title">{mobileNearbySummary}</span>
                </button>
                {mobileSheetState !== "collapsed" && (
                  <div className="map-mobile-sheet-body">
                    <HangoutsPanel
                      searchRef={searchRef}
                      searchQuery={searchQuery}
                      onChangeSearchQuery={(e) => setSearchQuery(e.target.value)}
                      onSubmitSearch={handleSearch}
                      searchError={searchError}
                      searchResults={searchResults}
                      onSelectResult={handleSelectResult}
                      radiusMeters={radiusMeters}
                      showWithinList={showWithinList}
                      onToggleWithinList={() => setShowWithinList((prev) => !prev)}
                      showIcon={showIcon}
                      hiddenIcon={hiddenIcon}
                      listContent={withinListContent}
                      showHint={false}
                      className="map-panel-mobile"
                    />
                  </div>
                )}
              </section>
            )}

            <HangoutsLoadingEmpty isLoading={isLoading} mapReady={mapReady} feedLength={feed.length} />

            <aside
              className={`hangouts-detail-panel ${isDetailOpen ? "is-open" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-hidden={!isDetailOpen}
            >
              {selected ? (
                <HangoutDetailCard
                  selected={selected}
                  currentUserId={user?.id}
                  userLocation={userLocation}
                  isCreator={isCreator}
                  isJoined={isJoined}
                  isFull={isFull}
                  isDetailLoading={isDetailLoading}
                  shareEnabled={shareEnabled}
                  shareError={shareError}
                  shareLoading={shareLoading}
                  shareNote={shareNote}
                  shareNoteError={shareNoteError}
                  driveDistanceLoading={driveDistanceLoading}
                  driveDistanceKm={driveDistanceKm}
                  driveDistanceError={driveDistanceError}
                  routeLoading={routeLoading}
                  routeVisible={routeVisible}
                  routeError={routeError}
                  formatDateTime={formatDateTime}
                  resolveAvatar={resolveAvatar}
                  distanceKm={distanceKm}
                  onClose={handleCloseDetail}
                  onJoinLeave={handleJoinLeave}
                  joinActionError={joinActionError}
                  isJoinApprovalRequired={isJoinApprovalRequired}
                  isJoinRequestPending={isJoinRequestPending}
                  pendingJoinRequests={selected?.pendingJoinRequests || []}
                  joinRequestActionKey={joinRequestActionKey}
                  onApproveJoinRequest={handleApproveJoinRequest}
                  onDeclineJoinRequest={handleDeclineJoinRequest}
                  onOpenProfile={(username, opts = {}) => {
                    const clean = String(username || "").replace(/^@+/, "").trim();
                    if (!clean) return;
                    const url = `/app/profile/${encodeURIComponent(clean)}`;
                    if (opts?.newTab) {
                      window.open(url, "_blank", "noopener,noreferrer");
                    } else {
                      nav(url);
                    }
                  }}
                  removeAttendeeIcon={removeAttendeeIcon}
                  onRequestRemoveAttendee={openRemoveAttendeeConfirm}
                  onDelete={openDeleteConfirm}
                  onEdit={openEdit}
                  onToggleShareLocation={handleToggleShareLocation}
                  onToggleRoute={handleToggleRoute}
                  onShareNoteChange={(e) => setShareNote(e.target.value)}
                  onUpdateAttendeeStatus={handleUpdateAttendeeStatus}
                  attendeeStatusUpdatingId={attendeeStatusUpdatingId}
                  attendeeStatusError={attendeeStatusError}
                />
              ) : (
                <div className="hangouts-detail-empty">
                  {isDetailLoading ? "Loading details..." : "Select a hangout"}
                </div>
              )}
            </aside>
          </MapCanvas>
        </div>
      </div>

      {isTabletLayout && canRenderPanels && (
        <>
          <MapOverlayDrawer
            id="map-left-drawer"
            side="left"
            open={leftDrawerOpen}
            title="Hangouts"
            onClose={closeTabletDrawers}
            drawerRef={leftDrawerRef}
          >
            <div>
              <HangoutsPanel
                searchRef={searchRef}
                searchQuery={searchQuery}
                onChangeSearchQuery={(e) => setSearchQuery(e.target.value)}
                onSubmitSearch={handleSearch}
                searchError={searchError}
                searchResults={searchResults}
                onSelectResult={handleSelectResult}
                radiusMeters={radiusMeters}
                showWithinList={showWithinList}
                onToggleWithinList={() => setShowWithinList((prev) => !prev)}
                showIcon={showIcon}
                hiddenIcon={hiddenIcon}
                listContent={withinListContent}
                showHint={false}
                className="map-panel-drawer"
              />
            </div>
          </MapOverlayDrawer>

          <MapOverlayDrawer
            id="map-right-drawer"
            side="right"
            open={rightDrawerOpen}
            title="Controls"
            onClose={closeTabletDrawers}
            drawerRef={rightDrawerRef}
          >
            <div>
              <ControlsPanel
                radiusMeters={radiusMeters}
                onChangeRadius={(e) => setRadiusMeters(Number(e.target.value))}
                shareAllEnabled={shareAllEnabled}
                onToggleShareAll={handleToggleShareAll}
                shareAllLoading={shareAllLoading}
                shareAllNote={shareAllNote}
                onShareAllNoteChange={(e) => setShareAllNote(e.target.value)}
                shareAllError={shareAllError}
                showMyHangouts={showMyHangouts}
                onToggleMyHangouts={() => setShowMyHangouts((prev) => !prev)}
                showJoinedList={showJoinedList}
                onToggleJoinedList={() => setShowJoinedList((prev) => !prev)}
                joinedHangoutsCount={joinedHangouts.length}
                myHangoutsCount={myHangouts.length}
                showIcon={showIcon}
                hiddenIcon={hiddenIcon}
                joinedListContent={joinedListContent}
              />
            </div>
          </MapOverlayDrawer>
        </>
      )}

      {isMobileLayout && canRenderPanels && (
        <>
          <div
            className={`map-controls-sheet-backdrop ${mobileControlsOpen ? "is-open" : ""}`}
            onClick={() => setMobileControlsOpen(false)}
            aria-hidden={!mobileControlsOpen}
          />
          <section
            id="map-mobile-controls-sheet"
            ref={mobileControlsSheetRef}
            className={`map-controls-sheet ${mobileControlsOpen ? "is-open" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-hidden={!mobileControlsOpen}
            aria-label="Map controls"
          >
            <div className="map-controls-sheet-header">
              <div className="fw-semibold">Controls</div>
              <button
                type="button"
                className="map-drawer-close"
                onClick={() => setMobileControlsOpen(false)}
                aria-label="Close controls"
              >
                x
              </button>
            </div>
            <div className="map-controls-sheet-body">
              <ControlsPanel
                radiusMeters={radiusMeters}
                onChangeRadius={(e) => setRadiusMeters(Number(e.target.value))}
                shareAllEnabled={shareAllEnabled}
                onToggleShareAll={handleToggleShareAll}
                shareAllLoading={shareAllLoading}
                shareAllNote={shareAllNote}
                onShareAllNoteChange={(e) => setShareAllNote(e.target.value)}
                shareAllError={shareAllError}
                showMyHangouts={showMyHangouts}
                onToggleMyHangouts={() => setShowMyHangouts((prev) => !prev)}
                showJoinedList={showJoinedList}
                onToggleJoinedList={() => setShowJoinedList((prev) => !prev)}
                joinedHangoutsCount={joinedHangouts.length}
                myHangoutsCount={myHangouts.length}
                showIcon={showIcon}
                hiddenIcon={hiddenIcon}
                joinedListContent={joinedListContent}
              />
            </div>
          </section>
        </>
      )}
      <HangoutModal
        show={showCreate}
        isEditing={isEditing}
        formError={formError}
        formState={formState}
        onClose={closeModal}
        onSubmit={handleSubmit}
        onChangeField={(key, value) =>
          setFormState((s) => ({
            ...s,
            [key]: value,
          }))
        }
      />
      {showDeleteConfirm && selected && (
        <>
          <div className="modal-backdrop show" />
          <div className="modal d-block" tabIndex="-1" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Delete hangout</h5>
                  <button type="button" className="btn-close" onClick={closeDeleteConfirm} />
                </div>
                <div className="modal-body">
                  <div className="fw-semibold mb-2">
                    Are you sure you want to delete this hangout?
                  </div>
                  <div className="text-muted small">
                    This will remove “{selected.title || "Untitled"}” for everyone.
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={closeDeleteConfirm}
                  >
                    Cancel
                  </button>
                  <button type="button" className="btn btn-danger" onClick={confirmDelete}>
                    Delete hangout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {removeAttendeeTarget && selected && (
        <>
          <div className="modal-backdrop show" />
          <div className="modal d-block" tabIndex="-1" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Remove attendee</h5>
                  <button type="button" className="btn-close" onClick={closeRemoveAttendeeConfirm} />
                </div>
                <div className="modal-body">
                  <div className="fw-semibold mb-2">
                    Are you sure you want to remove {removeAttendeeTarget.displayName} from the
                    hangout?
                  </div>
                  <div className="text-muted small">
                    They will also be removed from the hangout group chat.
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={closeRemoveAttendeeConfirm}
                  >
                    Cancel
                  </button>
                  <button type="button" className="btn btn-danger" onClick={confirmRemoveAttendee}>
                    Remove attendee
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {showHangoutClosedModal && (
        <>
          <div className="modal-backdrop show" />
          <div className="modal d-block" tabIndex="-1" role="dialog">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Hangout closed</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={closeHangoutClosedModal}
                  />
                </div>
                <div className="modal-body">
                  <div className="fw-semibold mb-2">
                    This hangout is no longer available.
                  </div>
                  <div className="text-muted small">
                    {hangoutTitleParam
                      ? `"${hangoutTitleParam}" has already closed or was removed.`
                      : "The hangout has already closed or was removed."}
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-dark"
                    onClick={closeHangoutClosedModal}
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

