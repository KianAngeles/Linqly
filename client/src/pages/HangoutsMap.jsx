import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { hangoutsApi } from "../api/hangouts.api";
import { useAuth } from "../store/AuthContext";
import { socket } from "../socket";
import { API_BASE } from "../api/http";
import pinIcon from "../assets/icons/pin.png";
import "./HangoutsMap.css";
import HangoutsMapHeader from "../components/hangouts/HangoutsMapHeader";
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

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
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

function createHangoutPin(isDraft = false) {
  const el = document.createElement("div");
  el.className = isDraft ? "hangout-pin hangout-pin--draft" : "hangout-pin";
  const img = document.createElement("img");
  img.src = pinIcon;
  img.alt = "Hangout";
  el.appendChild(img);
  return el;
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

  const [center, setCenter] = useState(FALLBACK_CENTER);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [radiusMeters, setRadiusMeters] = useState(DEFAULT_RADIUS_METERS);
  const [zoom, setZoom] = useState(12);
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
  const [driveDistanceKm, setDriveDistanceKm] = useState(null);
  const [driveDistanceLoading, setDriveDistanceLoading] = useState(false);
  const [driveDistanceError, setDriveDistanceError] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [routeVisible, setRouteVisible] = useState(false);
  const [shareNote, setShareNote] = useState("");
  const [shareNoteError, setShareNoteError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchRef = useRef(null);
  const [formError, setFormError] = useState("");
  const [formState, setFormState] = useState(() => ({
    title: "",
    description: "",
    startsAt: toLocalInputValue(new Date()),
    durationMinutes: 120,
    visibility: "friends",
    maxAttendees: "",
  }));

  const mapboxToken = useMemo(() => import.meta.env.VITE_MAPBOX_TOKEN || "", []);

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
            "fill-color": "#0d6efd",
            "fill-opacity": 0.08,
          },
        });
        map.addLayer({
          id: "hangout-radius-outline",
          type: "line",
          source: "hangout-radius",
          paint: {
            "line-color": "#0d6efd",
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
    map.on("click", (e) => {
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
  }, [center.lat, center.lng, mapboxToken, mapReady, radiusMeters, zoom]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setCenter([center.lng, center.lat]);
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setZoom(zoom);
  }, [zoom]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setCenter(next);
        setUserLocation(next);
      },
      () => {}
    );
  }, []);

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
    const onNew = () => loadFeed(center.lng, center.lat);
    socket.on("hangout:new", onNew);
    socket.on("hangout:update", onNew);
    return () => {
      socket.off("hangout:new", onNew);
      socket.off("hangout:update", onNew);
    };
  }, [accessToken, center.lat, center.lng]);

  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const h of feed) {
      const coords = h.location?.coordinates;
      if (!coords || coords.length < 2) continue;
      const marker = new mapboxgl.Marker({
        element: createHangoutPin(false),
        anchor: "bottom",
      })
        .setLngLat(coords)
        .addTo(mapRef.current);
      marker.getElement().addEventListener("click", (e) => {
        e.stopPropagation();
        setSelectedId(h._id);
        setSelected(h);
      });
      markersRef.current.push(marker);
    }
  }, [feed, mapLoaded]);

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
        element: createHangoutPin(true),
        anchor: "bottom",
      });
    marker.setLngLat([draftPin.lng, draftPin.lat]).addTo(mapRef.current);
    draftMarkerRef.current = marker;
  }, [draftPin, mapLoaded]);

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
    if (!mapRef.current || !mapLoaded || !userLocation) return;
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
  }, [userLocation, mapLoaded]);

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
    if (!shareEnabled || !selected?._id || !isJoined || !accessToken) return;
    if (!navigator.geolocation) return;
    let lastSentAt = 0;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const next = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setUserLocation(next);
        const now = Date.now();
        if (now - lastSentAt < 15000) return;
        lastSentAt = now;
        try {
          const data = await hangoutsApi.shareLocation(accessToken, selected._id, {
            ...next,
            note: shareNote,
          });
          if (data?.hangout) setSelected(data.hangout);
        } catch (err) {
          setShareError(err.message || "Failed to share location");
        }
      },
      () => {
        setShareError("Location permission is required to share.");
      },
      { enableHighAccuracy: true, maximumAge: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [shareEnabled, selected?._id, isJoined, accessToken]);

  async function handleJoinLeave() {
    if (!selected || !accessToken) return;
    try {
      if (isJoined) {
        await hangoutsApi.leave(accessToken, selected._id);
        setShareEnabled(false);
      } else {
        await hangoutsApi.join(accessToken, selected._id);
      }
      await loadFeed(center.lng, center.lat);
      await loadDetails(selected._id);
    } catch {
      // ignore for now
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!accessToken || !draftPin) return;
    if (!formState.title.trim()) {
      setFormError("Title is required.");
      return;
    }

    const startsAt = formState.startsAt
      ? new Date(formState.startsAt).toISOString()
      : null;

    const payload = {
      title: formState.title.trim(),
      description: formState.description.trim(),
      startsAt,
      durationMinutes: Number(formState.durationMinutes || 120),
      location: { lng: draftPin.lng, lat: draftPin.lat },
      visibility: formState.visibility,
      maxAttendees:
        formState.maxAttendees === "" ? null : Number(formState.maxAttendees),
    };

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
        startsAt: toLocalInputValue(new Date()),
        durationMinutes: 120,
        visibility: "friends",
        maxAttendees: "",
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
    setShareError("");
    if (!shareEnabled) {
      if (!navigator.geolocation) {
        setShareError("Location is not supported on this device.");
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
          }
        },
        () => setShareError("Location permission is required to share.")
      );
    } else {
      try {
        const data = await hangoutsApi.stopSharing(accessToken, selected._id);
        if (data?.hangout) setSelected(data.hangout);
        setShareEnabled(false);
      } catch (err) {
        setShareError(err.message || "Failed to stop sharing");
      }
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
        limit: "5",
        proximity: `${center.lng},${center.lat}`,
        country: "ph",
        types: "poi,place,address",
      });
      const url =
        "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
        encodeURIComponent(q) +
        `.json?${params.toString()}`;
      const r = await fetch(url);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.message || "Search failed");
      setSearchResults(data.features || []);
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
          limit: "5",
          proximity: `${center.lng},${center.lat}`,
          country: "ph",
          types: "poi,place,address",
        });
        const url =
          "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
          encodeURIComponent(q) +
          `.json?${params.toString()}`;
        const r = await fetch(url);
        const data = await r.json();
        if (!r.ok) throw new Error(data?.message || "Search failed");
        setSearchResults(data.features || []);
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
      startsAt: toLocalInputValue(new Date()),
      durationMinutes: 120,
      visibility: "friends",
      maxAttendees: "",
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
      startsAt: toLocalInputValue(new Date(selected.startsAt)),
      durationMinutes: Math.max(
        15,
        Math.round(
          (new Date(selected.endsAt).getTime() - new Date(selected.startsAt).getTime()) /
            60000
        )
      ),
      visibility: selected.visibility || "friends",
      maxAttendees: selected.maxAttendees ?? "",
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

  return (
    <div className="container py-4 hangouts-map-page" style={{ maxWidth: 1200 }}>
      <HangoutsMapHeader
        user={user}
        onBack={() => nav("/app")}
        onLogout={handleLogout}
      />

      {!mapboxToken && (
        <div className="alert alert-warning">
          Missing Mapbox token. Set VITE_MAPBOX_TOKEN to load the map.
        </div>
      )}

      <div className="hangouts-map">
        {!mapReady && <MapGate onLoadMap={handleShowMap} />}

        <div ref={mapContainerRef} className="hangouts-map-canvas" />

        {mapReady && (
          <div className="map-hint">
            Click on the map to drop a new hangout pin.
          </div>
        )}

        {mapReady && (
          <MapSearch
            searchRef={searchRef}
            searchQuery={searchQuery}
            onChangeSearchQuery={(e) => setSearchQuery(e.target.value)}
            onSubmitSearch={handleSearch}
            searchError={searchError}
            searchResults={searchResults}
            onSelectResult={handleSelectResult}
          />
        )}

        {mapReady && (
          <MapActions onRecenter={handleRecenter} disabled={!userLocation} />
        )}

        {mapReady && (
          <RadiusControls
            radiusMeters={radiusMeters}
            onChangeRadius={(e) => setRadiusMeters(Number(e.target.value))}
          />
        )}

        <HangoutsLoadingEmpty
          isLoading={isLoading}
          mapReady={mapReady}
          feedLength={feed.length}
        />

        <HangoutDetailCard
          selected={selected}
          userLocation={userLocation}
          isCreator={isCreator}
          isJoined={isJoined}
          isFull={isFull}
          isDetailLoading={isDetailLoading}
          shareEnabled={shareEnabled}
          shareError={shareError}
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
          onClose={() => setSelectedId(null)}
          onJoinLeave={handleJoinLeave}
          onDelete={handleDelete}
          onEdit={openEdit}
          onToggleShareLocation={handleToggleShareLocation}
          onToggleRoute={handleToggleRoute}
          onShareNoteChange={(e) => setShareNote(e.target.value)}
        />
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
    </div>
  );
}
