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
import MapGate from "../components/hangouts/MapGate";
import MapSearch from "../components/hangouts/MapSearch";
import MapActions from "../components/hangouts/MapActions";
import RadiusControls from "../components/hangouts/RadiusControls";
import HangoutsLoadingEmpty from "../components/hangouts/HangoutsLoadingEmpty";
import HangoutDetailCard from "../components/hangouts/HangoutDetailCard";
import HangoutModal from "../components/hangouts/HangoutModal";

const FALLBACK_CENTER = { lng: 120.9842, lat: 14.5995 };
const DEFAULT_RADIUS_METERS = 8000;
const MAP_STATE_KEY = "linqly.hangouts.mapState";
const HANGOUT_PIN_OFFSET = [0, -5];

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
  const { user, accessToken, logout } = useAuth();
  const mapRef = useRef(null);
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
  const [detailPlacement, setDetailPlacement] = useState(null);
  const [showWithinList, setShowWithinList] = useState(true);
  const [showJoinedList, setShowJoinedList] = useState(true);
  const [showMyHangouts, setShowMyHangouts] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const [shareNoteError, setShareNoteError] = useState("");
  const [joinActionError, setJoinActionError] = useState("");
  const [joinRequestActionKey, setJoinRequestActionKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
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
  const handledHangoutIdRef = useRef(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [removeAttendeeTarget, setRemoveAttendeeTarget] = useState(null);

  const mapboxToken = useMemo(() => import.meta.env.VITE_MAPBOX_TOKEN || "", []);

  useEffect(() => {
    const lang = navigator.language || "";
    const region = lang.split("-")[1];
    if (region) {
      setSearchCountry(region.toLowerCase());
    }
  }, []);

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
      style: "mapbox://styles/mapbox/streets-v12",
      center: [center.lng, center.lat],
      zoom,
    });

    map.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    map.on("load", () => {
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
  }, [center.lat, center.lng, mapboxToken, mapReady, radiusMeters, zoom, locationEnabled]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setCenter([center.lng, center.lat]);
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setZoom(zoom);
  }, [zoom]);

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
      if (selectedId === h._id) {
        setSelectedId(null);
        setSelected(null);
        setDetailPlacement(null);
        return;
      }
      setSelectedId(h._id);
      setSelected(h);
      setDetailPlacement("joined");
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
      setSelected(data.hangout);
    } catch {
      setSelected(null);
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
  }, [selected?._id]);

  useEffect(() => {
    if (!hangoutIdParam) return;
    if (handledHangoutIdRef.current === hangoutIdParam) return;
    handledHangoutIdRef.current = hangoutIdParam;
    const found = feed.find((h) => h._id === hangoutIdParam);
    if (found) {
      setSelectedId(found._id);
      setSelected(found);
      setDetailPlacement("joined");
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
      setSelectedId(hangoutIdParam);
      setDetailPlacement("joined");
      loadDetails(hangoutIdParam);
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
  const joinedHangoutIds = useMemo(
    () => joinedHangouts.map((h) => h._id).filter(Boolean),
    [joinedHangouts]
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

  async function handleLogout() {
    await logout();
    nav("/", { replace: true });
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

  function handleRecenter() {
    if (!userLocation) return;
    setCenter(userLocation);
    setZoom(14);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 14 });
    }
  }

  function handleCloseDetail() {
    setSelectedId(null);
    setSelected(null);
    setDetailPlacement(null);
  }

  function renderHangoutList(items, emptyCopy, placement) {
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
              setSelectedId(h._id);
              setSelected(h);
              if (placement) setDetailPlacement(placement);
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
              <div className="hangout-list-meta">
                <span>{formatDistance(h.distanceMeters) || "Nearby"}</span>
                <span>{h.timeLabel || formatDateTime(h.startsAt) || "Time TBD"}</span>
              </div>
              <div className="hangout-list-meta">
                <span>{h.attendeeCount || h.attendees?.length || 0} attending</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="hangouts-map-page">
      {!mapboxToken && (
        <div className="alert alert-warning">
          Missing Mapbox token. Set VITE_MAPBOX_TOKEN to load the map.
        </div>
      )}

      <div className="hangouts-map-layout">
        <div className="hangouts-map-center">
          <div className={`hangouts-map ${locationEnabled === false ? "is-disabled" : ""}`}>
            {!mapReady && <MapGate onLoadMap={handleShowMap} />}

            <div ref={mapContainerRef} className="hangouts-map-canvas" />

            {mapReady && locating && (
              <div className="map-locating map-overlay">
                <span
                  className="spinner-border spinner-border-sm"
                  role="status"
                  aria-hidden="true"
                />
                Locating...
              </div>
            )}

            {mapReady && locationEnabled === false && (
              <div className="map-location-disabled map-overlay">
                <div className="map-location-disabled-title">
                  We can’t access your location. Please enable location services to view the map.
                </div>
                <div className="map-location-disabled-subtitle">
                  Enable location in your browser settings to continue.
                </div>
              </div>
            )}

            {mapReady && locationEnabled !== false && (
              <div className="hangouts-map-toolbar map-overlay">
                <RadiusControls
                  radiusMeters={radiusMeters}
                  onChangeRadius={(e) => setRadiusMeters(Number(e.target.value))}
                />
                <div className="hangouts-location-toggle">
                  <div className="fw-semibold small">Friends only</div>
                  <div className="form-check form-switch m-0">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="shareLocationAllToggle"
                    checked={shareAllEnabled}
                    onChange={handleToggleShareAll}
                    disabled={shareAllLoading}
                  />
                    <label
                      className="form-check-label small"
                      htmlFor="shareLocationAllToggle"
                    >
                      Share with friends
                    </label>
                  </div>
                  <div className="text-muted small">Friends can see you on the map</div>
                  <div className="friends-only-note">
                    <label className="form-label small mb-1" htmlFor="shareAllNote">
                      Note
                    </label>
                    <input
                      id="shareAllNote"
                      className="form-control form-control-sm"
                      maxLength={16}
                      placeholder="On the way"
                      value={shareAllNote}
                      onChange={(e) => setShareAllNote(e.target.value)}
                    />
                  </div>
                  {shareAllLoading && (
                    <div className="text-muted small d-flex align-items-center gap-2">
                      <span
                        className="spinner-border spinner-border-sm"
                        role="status"
                        aria-hidden="true"
                      />
                      Updating location...
                    </div>
                  )}
                  {shareAllError && (
                    <div className="text-danger small">{shareAllError}</div>
                  )}
                </div>
                <div className="map-joined-panel">
                  <div className="map-joined-header">
                    <div>
                      <div className="fw-semibold small">
                        {showMyHangouts ? "Created hangouts" : "Joined hangouts"}
                      </div>
                      <div className="text-muted small">
                        {showMyHangouts ? myHangouts.length : joinedHangouts.length} in
                        this area
                      </div>
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={() => setShowMyHangouts((prev) => !prev)}
                      >
                        {showMyHangouts ? "Joined" : "Created"}
                      </button>
                      <button
                        type="button"
                        className="map-toggle-icon-btn"
                        onClick={() => setShowJoinedList((prev) => !prev)}
                        aria-label={showJoinedList ? "Hide list" : "Show list"}
                        title={showJoinedList ? "Hide" : "Show"}
                      >
                        <img
                          src={showJoinedList ? hiddenIcon : showIcon}
                          alt=""
                        />
                      </button>
                    </div>
                  </div>
                  {detailPlacement === "joined" && selected ? (
                    <div className="map-joined-detail">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        onClick={handleCloseDetail}
                      >
                        Back
                      </button>
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
                        onOpenProfile={(username) => {
                          const clean = String(username || "").replace(/^@+/, "").trim();
                          if (!clean) return;
                          nav(`/app/profile/${encodeURIComponent(clean)}`);
                        }}
                        removeAttendeeIcon={removeAttendeeIcon}
                        onRequestRemoveAttendee={openRemoveAttendeeConfirm}
                        onDelete={openDeleteConfirm}
                        onEdit={openEdit}
                        onToggleShareLocation={handleToggleShareLocation}
                        onToggleRoute={handleToggleRoute}
                        onShareNoteChange={(e) => setShareNote(e.target.value)}
                      />
                    </div>
                  ) : (
                    showJoinedList && (
                      <div className="map-joined-body">
                        {renderHangoutList(
                          showMyHangouts ? myHangouts : joinedHangouts,
                          showMyHangouts
                            ? "You have not created any hangouts yet."
                            : "You have not joined any hangouts yet.",
                          "joined"
                        )}
                      </div>
                    )
                  )}
                </div>
                <div className="map-actions-right">
                  <MapActions onRecenter={handleRecenter} disabled={!userLocation} />
                </div>
              </div>
            )}

            {mapReady && locationEnabled !== false && (
              <div className="map-left-stack map-overlay">
                <div className="map-left-primary">
                  <div className="map-hint">Click on the map to drop a new hangout pin.</div>
                  <MapSearch
                    searchRef={searchRef}
                    searchQuery={searchQuery}
                    onChangeSearchQuery={(e) => setSearchQuery(e.target.value)}
                    onSubmitSearch={handleSearch}
                    searchError={searchError}
                    searchResults={searchResults}
                    onSelectResult={handleSelectResult}
                  />
                  <div className="map-within-panel">
                    <div className="map-within-header">
                      <div className="map-within-meta">
                        <div className="fw-semibold small">Within radius</div>
                        <div className="text-muted small">
                          {Math.round(radiusMeters / 1000)} km around you
                        </div>
                      </div>
                      <button
                        type="button"
                        className="map-toggle-icon-btn"
                        onClick={() => setShowWithinList((prev) => !prev)}
                        aria-label={showWithinList ? "Hide list" : "Show list"}
                        title={showWithinList ? "Hide" : "Show"}
                      >
                        <img src={showWithinList ? hiddenIcon : showIcon} alt="" />
                      </button>
                    </div>
                    {showWithinList && (
                      <div className="map-within-body">
                        {renderHangoutList(
                          feed,
                          "No hangouts within this radius yet.",
                          "joined"
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <HangoutsLoadingEmpty
              isLoading={isLoading}
              mapReady={mapReady}
              feedLength={feed.length}
            />

          </div>
        </div>
      </div>

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
    </div>
  );
}
