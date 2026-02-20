import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useAuth } from "../store/AuthContext";
import { friendsApi } from "../api/friends.api";
import { hangoutsApi } from "../api/hangouts.api";
import { usersApi } from "../api/users.api";
import { chatsApi } from "../api/chats.api";
import { API_BASE } from "../api/http";
import { socket } from "../socket";
import EditProfileModal from "./profile/EditProfileModal";
import UploadAvatarModal from "./profile/UploadAvatarModal";
import BasicInfoModal from "./profile/BasicInfoModal";
import EditInterestsModal from "./profile/EditInterestsModal";
import "./Profile.css";
import editIcon from "../assets/icons/edit2.png";
import genderIcon from "../assets/icons/profile-icons/gender.png";
import ageIcon from "../assets/icons/profile-icons/age.png";
import birthdayIcon from "../assets/icons/profile-icons/birthday.png";
import locationIcon from "../assets/icons/profile-icons/location.png";
import editAvatarIcon from "../assets/icons/edit.png";
import calendarIcon from "../assets/icons/profile-icons/calendar.png";
import clockIcon from "../assets/icons/profile-icons/clock.png";
import attendeeIcon from "../assets/icons/profile-icons/attendee.png";
import checkedIcon from "../assets/icons/profile-icons/checked.png";
import sparklerIcon from "../assets/icons/profile-icons/sparkler.png";
import trashIcon from "../assets/icons/profile-icons/trash.png";
import whiteDropdownIcon from "../assets/icons/white-dropdown.png";

const PROFILE_MAP_FALLBACK_CENTER = { lng: 120.9842, lat: 14.5995 };
const CLOSED_HANGOUT_STATUSES = new Set([
  "closed",
  "ended",
  "completed",
  "cancelled",
  "canceled",
  "done",
  "inactive",
]);

export default function Profile() {
  const { user: viewer, accessToken, setUser } = useAuth();
  const navigate = useNavigate();
  const { username: usernameParam } = useParams();
  const [searchParams] = useSearchParams();
  const ABOUT_LIMIT = 480;
  const previewMode =
    searchParams.get("preview") === "1" || searchParams.get("view") === "public";
  const [activeTab, setActiveTab] = useState("about");
  const [showEdit, setShowEdit] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showBasicInfoModal, setShowBasicInfoModal] = useState(false);
  const [showClosedNotice, setShowClosedNotice] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showUnfriendConfirm, setShowUnfriendConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingMenuOpen, setPendingMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [friendHover, setFriendHover] = useState(false);
  const [previewAudience, setPreviewAudience] = useState("friends");
  const [reportReason, setReportReason] = useState("spam");
  const [reportNotes, setReportNotes] = useState("");
  const menuRef = useRef(null);
  const pendingMenuRef = useRef(null);
  const [friendsCount, setFriendsCount] = useState(null);
  const [friendsList, setFriendsList] = useState([]);
  const [hangouts, setHangouts] = useState([]);
  const [showInterestsModal, setShowInterestsModal] = useState(false);
  const [editAbout, setEditAbout] = useState(false);
  const [hangoutsView, setHangoutsView] = useState("created");
  const [createdHangoutsPage, setCreatedHangoutsPage] = useState(1);
  const [joinedHangoutsPage, setJoinedHangoutsPage] = useState(1);
  const [createdHangoutsExpanded, setCreatedHangoutsExpanded] = useState(false);
  const [joinedHangoutsExpanded, setJoinedHangoutsExpanded] = useState(false);
  const [hangoutAction, setHangoutAction] = useState(null);
  const [hangoutActionPending, setHangoutActionPending] = useState(false);
  const [draftInterests, setDraftInterests] = useState([]);
  const [draftAbout, setDraftAbout] = useState("");
  const [profileUser, setProfileUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [profileNotFound, setProfileNotFound] = useState(false);
  const [mapPreviewLoaded, setMapPreviewLoaded] = useState(false);
  const mapPreviewContainerRef = useRef(null);
  const mapPreviewRef = useRef(null);
  const mapPreviewMarkersRef = useRef([]);
  const mapboxToken = useMemo(() => import.meta.env.VITE_MAPBOX_TOKEN || "", []);

  const normalizedUsername = useMemo(() => {
    return String(usernameParam || "")
      .trim()
      .replace(/^@+/, "")
      .toLowerCase();
  }, [usernameParam]);

  useEffect(() => {
    if (!accessToken || !normalizedUsername) return;
    let cancelled = false;
    setProfileLoading(true);
    setProfileError("");
    setProfileNotFound(false);
    usersApi
      .getByUsername(accessToken, normalizedUsername)
      .then((data) => {
        if (cancelled) return;
        const nextUser = {
          ...(data?.user || {}),
          relationship: data?.relationship || "none",
          isBlockedByViewer: !!data?.isBlockedByViewer,
        };
        setProfileUser(nextUser);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e.message === "User not found") {
          setProfileNotFound(true);
        } else {
          setProfileError(e.message || "Unable to load profile");
        }
        setProfileUser(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, normalizedUsername]);

  const isOwnProfile =
    !!viewer?.id &&
    !!profileUser?.id &&
    String(viewer.id) === String(profileUser.id);

  useEffect(() => {
    if (!accessToken || !isOwnProfile) return;
    friendsApi
      .list(accessToken)
      .then((data) => {
        const list = Array.isArray(data.friends) ? data.friends : [];
        setFriendsCount(list.length);
        setFriendsList(list);
      })
      .catch(() => {});
  }, [accessToken, isOwnProfile]);

  useEffect(() => {
    if (!accessToken || !isOwnProfile) return;
    if (!previewMode && viewer?.privacy && Object.keys(viewer.privacy).length) return;
    usersApi
      .getPrivacy(accessToken)
      .then((data) => {
        if (!data?.privacy) return;
        setUser((prev) => ({ ...(prev || {}), privacy: data.privacy }));
      })
      .catch(() => {});
  }, [accessToken, isOwnProfile, previewMode, viewer?.privacy, setUser]);

  useEffect(() => {
    if (!accessToken || !isOwnProfile) return;
    hangoutsApi
      .mine(accessToken)
      .then((data) => setHangouts(data.hangouts || []))
      .catch(() => {});
  }, [accessToken, isOwnProfile]);

  useEffect(() => {
    if (!isOwnProfile) {
      setFriendsCount(null);
      setFriendsList([]);
      setHangouts([]);
    }
  }, [isOwnProfile]);

  const normalizeLocation = (value) => {
    if (!value) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      return { country: "", province: trimmed };
    }
    const country = String(value.country || "").trim();
    const province = String(value.province || "").trim();
    if (!country && !province) return null;
    return { country, province };
  };

  const formatLocation = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    const province = String(value.province || "").trim();
    const country = String(value.country || "").trim();
    if (!province && !country) return "";
    if (province && country) return `${province}, ${country}`;
    return province || country;
  };

  const getLocationKey = (value) => {
    const normalized = normalizeLocation(value);
    if (!normalized) return "";
    return [normalized.country, normalized.province]
      .map((item) => String(item || "").trim().toLowerCase())
      .filter((item) => item)
      .join("|");
  };

  const resolveHangoutCoords = (hangout) => {
    const coords =
      hangout?.location?.coordinates ||
      hangout?.location?.coords ||
      hangout?.coordinates ||
      null;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
    }
    const lng = Number(
      hangout?.location?.lng ??
        hangout?.location?.longitude ??
        hangout?.lng ??
        hangout?.longitude
    );
    const lat = Number(
      hangout?.location?.lat ??
        hangout?.location?.latitude ??
        hangout?.lat ??
        hangout?.latitude
    );
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
    return null;
  };

  const isHangoutOngoing = (hangout) => {
    if (hangout?.ongoing === true) return true;
    if (String(hangout?.status || "").toLowerCase() === "ongoing") return true;
    const startsAt = hangout?.startsAt ? new Date(hangout.startsAt).getTime() : NaN;
    const endsAt = hangout?.endsAt ? new Date(hangout.endsAt).getTime() : NaN;
    const now = Date.now();
    if (!Number.isNaN(startsAt) && !Number.isNaN(endsAt)) {
      return now >= startsAt && now <= endsAt;
    }
    return false;
  };

  const isHangoutClosed = (hangout) => {
    if (!hangout || typeof hangout !== "object") return true;
    const status = String(hangout.status || "").toLowerCase().trim();
    if (CLOSED_HANGOUT_STATUSES.has(status)) return true;
    const endsAtMs = hangout?.endsAt ? new Date(hangout.endsAt).getTime() : NaN;
    if (Number.isFinite(endsAtMs) && endsAtMs < new Date().getTime()) return true;
    return false;
  };

  const profile = useMemo(() => {
    const displayName =
      profileUser?.displayName ||
      profileUser?.name ||
      (profileUser?.username ? profileUser.username.replace(/^@/, "") : "User");
    const usernameRaw = profileUser?.username ? String(profileUser.username) : "";
    const username = usernameRaw.replace(/^@+/, "");
    const usernameDisplay = username ? `@${username}` : "@user";
    return {
      id: profileUser?.id || profileUser?._id || "",
      displayName,
      username,
      usernameDisplay,
      bio: profileUser?.bio || "",
      location: normalizeLocation(profileUser?.location),
      gender: profileUser?.gender || "",
      age: profileUser?.birthday || "",
      friendsCount:
        friendsCount !== null
          ? friendsCount
          : profileUser?.friendsCount ?? (isOwnProfile ? 0 : null),
      hangoutsCount: Number.isFinite(profileUser?.hangoutsCount)
        ? profileUser.hangoutsCount
        : Array.isArray(profileUser?.hangouts)
        ? profileUser.hangouts.length
        : null,
      joined: profileUser?.createdAt || "",
      interests: Array.isArray(profileUser?.interests) ? profileUser.interests : [],
      about: profileUser?.about || "",
      avatarUrl: profileUser?.avatarUrl || "",
      hangouts: isOwnProfile ? hangouts : profileUser?.hangouts || [],
      friendsPreview: friendsList.length
        ? friendsList
        : Array.isArray(profileUser?.friends)
        ? profileUser.friends
        : Array.isArray(profileUser?.friendsPreview)
        ? profileUser.friendsPreview
        : [],
    };
  }, [profileUser, friendsCount, hangouts, friendsList, isOwnProfile]);

  useEffect(() => {
    if (!showInterestsModal) return;
    const interests = profile.interests || [];
    setDraftInterests(interests);
  }, [showInterestsModal, profile.interests]);

  useEffect(() => {
    if (!editAbout) return;
    setDraftAbout(profile.about || "");
  }, [editAbout, profile.about]);

  const isProfileFieldEmpty = (value) => {
    if (Array.isArray(value)) return value.length === 0;
    if (value && typeof value === "object") {
      return !formatLocation(normalizeLocation(value));
    }
    return value === null || value === undefined || String(value).trim() === "";
  };
  const canEdit = isOwnProfile && !previewMode;
  const isViewingOther = !isOwnProfile;
  const isPreviewingOwn = isOwnProfile && previewMode;
  const isOwnerView = isOwnProfile && !isPreviewingOwn;
  const isPrivacyNoticeMode = isViewingOther || isPreviewingOwn;
  const isHangoutsTabActive = activeTab === "hangouts";
  const isFriendViewer = profileUser?.relationship === "friends";
  const privacy = isOwnProfile
    ? viewer?.privacy || profileUser?.privacy || {}
    : profileUser?.privacy || {};
  const getVisibility = (key, fallback = "Only me") => privacy?.[key] || fallback;
  const profileLink = profile.username
    ? `${window.location.origin}/app/profile/${profile.username}`
    : `${window.location.origin}/app/profile/user`;
  const avatarSrc = profile.avatarUrl
    ? profile.avatarUrl.startsWith("http://") ||
      profile.avatarUrl.startsWith("https://")
      ? profile.avatarUrl
      : `${API_BASE}${profile.avatarUrl}`
    : "";
  const isOnline =
    typeof profileUser?.isOnline === "boolean" ? profileUser.isOnline : isOwnProfile;
  const normalizeVisibility = (value) => {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "friends") return "friends";
    if (raw === "only me" || raw === "onlyme" || raw === "only_me") return "only_me";
    return "public";
  };
  const canSee = (privacyValue, audience) => {
    const normalized = normalizeVisibility(privacyValue);
    if (audience === "friends") return normalized === "public" || normalized === "friends";
    if (audience === "public") return normalized === "public";
    return false;
  };
  const privacyLabels = {
    public: "Public",
    friends: "Friends",
    only_me: "Only me",
  };
  const getPrivacyValue = (key, fallback = "Public") =>
    normalizeVisibility(getVisibility(key, fallback));
  const canViewByPrivacy = (value) => {
    if (isOwnerView) return true;
    const normalized = normalizeVisibility(value);
    if (normalized === "public") return true;
    if (normalized === "friends") return isFriendViewer;
    return false;
  };
  const genderHidden =
    (isViewingOther && profileUser?.gender === null) ||
    (isPreviewingOwn && !canSee(getVisibility("gender", "public"), previewAudience));
  const birthdayHidden =
    (isViewingOther && profileUser?.birthday === null) ||
    (isPreviewingOwn && !canSee(getVisibility("birthday", "public"), previewAudience));
  const locationHidden =
    (isViewingOther && profileUser?.location === null) ||
    (isPreviewingOwn && !canSee(getVisibility("location", "public"), previewAudience));
  const interestsHidden =
    (isViewingOther && profileUser?.interests === null) ||
    (isPreviewingOwn && !canSee(getVisibility("interests", "public"), previewAudience));
  const aboutHidden =
    (isViewingOther && profileUser?.about === null) ||
    (isPreviewingOwn && !canSee(getVisibility("about", "public"), previewAudience));

  const showGender =
    isOwnerView || (!genderHidden && !isProfileFieldEmpty(profile.gender));
  const showAge =
    isOwnerView || (!birthdayHidden && !isProfileFieldEmpty(profile.age));
  const showLocation =
    isOwnerView || (!locationHidden && !isProfileFieldEmpty(profile.location));
  const showInterests =
    isOwnerView || (!interestsHidden && !isProfileFieldEmpty(profile.interests));
  const showAbout =
    isOwnerView || (!aboutHidden && !isProfileFieldEmpty(profile.about));

  const friendsPrivacy = getPrivacyValue("friends", "Friends");
  const createdHangoutsPrivacy = getPrivacyValue("hangoutsCreated", "Friends");
  const joinedHangoutsPrivacy = getPrivacyValue("hangoutsJoined", "Only me");

  const INTEREST_OPTIONS = [
    "☕ Coffee ☕",
    "🍽️ Food trips 🍽️",
    "🏋️ Gym 🏋️",
    "🏀 Basketball 🏀",
    "🎮 Gaming 🎮",
    "💻 Coding 💻",
    "🎬 Movies 🎬",
    "🍿 Anime 🍿",
    "🎧 Music 🎧",
    "📸 Photography 📸",
    "✈️ Travel ✈️",
    "🥾 Hiking 🥾",
    "📚 Reading 📚",
    "👨‍🍳 Cooking 👨‍🍳",
    "🐶 Dogs 🐶",
    "🐱 Cats 🐱",
    "🤝 Making friends 🤝",
    "🌙 Night drives 🌙",
    "🎨 Art 🎨",
    "🧘 Yoga 🧘",
    "⚽ Soccer ⚽",
    "🏐 Volleyball 🏐",
    "🎳 Bowling 🎳",
    "🎤 Karaoke 🎤",
    "🧋 Milk tea 🧋",
    "🛹 Skating 🛹",
    "🎯 Board games 🎯",
    "🧳 Weekend trips 🧳",
    "🐾 Pet walks 🐾",
    "🧩 Puzzles 🧩",
    "🌊 Beach days 🌊",
    "⛰️ Mountains ⛰️",
    "🚴 Cycling 🚴",
    "🏃 Running 🏃",
    "🥗 Healthy eats 🥗",
    "🍔 Burgers 🍔",
    "🍣 Sushi 🍣",
    "🍕 Pizza 🍕",
    "🎲 Tabletop 🎲",
  ];

  const basicInfoVisible = showGender || showAge || showLocation;
  const interestsVisible = showInterests;
  const aboutVisible = showAbout;
  const hasAnyVisibleSection = basicInfoVisible || interestsVisible || aboutVisible;
  const basicInfoHiddenSection = isPrivacyNoticeMode && !basicInfoVisible;
  const interestsHiddenSection = isPrivacyNoticeMode && !interestsVisible;
  const aboutHiddenSection = isPrivacyNoticeMode && !aboutVisible;
  const showBasicInfoCard = isOwnerView || basicInfoVisible || basicInfoHiddenSection;
  const showInterestsCard = isOwnerView || interestsVisible || interestsHiddenSection;
  const showAboutCard = isOwnerView || aboutVisible || aboutHiddenSection;
  const totalSectionCount = 3;
  const privateSectionCount =
    (basicInfoHiddenSection ? 1 : 0) +
    (interestsHiddenSection ? 1 : 0) +
    (aboutHiddenSection ? 1 : 0);
  const showPrivateProfileCard = isPrivacyNoticeMode && !hasAnyVisibleSection;
  const privacyNotice = isPrivacyNoticeMode && privateSectionCount > 0
    ? privateSectionCount === totalSectionCount
      ? {
          title: "Private Profile",
          body: "This user has chosen to keep their profile private.",
        }
      : {
          title: "Some info is private",
          body: "Some profile details are hidden due to privacy settings.",
        }
    : null;
  const privacyNoticeCard = privacyNotice ? (
    <div className="profile-card">
      <div className="profile-card-header">
        <h5 className="fw-semibold mb-0">{privacyNotice.title}</h5>
      </div>
      <p className="text-muted mb-0">{privacyNotice.body}</p>
    </div>
  ) : null;
  const friendsCountDisplay = profile.friendsCount ?? "--";
  const hangoutsCountDisplay = profile.hangoutsCount ?? "--";
  const createdHangouts = useMemo(() => {
    const list = Array.isArray(profile.hangouts) ? profile.hangouts : [];
    return list.filter((h) => {
      const creatorId = h?.creator?.id || h?.creatorId || "";
      if (!creatorId && !isOwnProfile) return true;
      return String(creatorId) === String(profile.id);
    });
  }, [profile.hangouts, profile.id, isOwnProfile]);
  const joinedHangouts = useMemo(() => {
    const list = Array.isArray(profile.hangouts) ? profile.hangouts : [];
    return list.filter((h) => {
      const creatorId = h?.creator?.id || h?.creatorId || "";
      if (!creatorId && !isOwnProfile) return false;
      return String(creatorId) !== String(profile.id);
    });
  }, [profile.hangouts, profile.id, isOwnProfile]);
  const hangoutsPerPage = 3;
  const buildPagination = (list, page) => {
    const totalPages = Math.max(1, Math.ceil(list.length / hangoutsPerPage));
    const clampedPage = Math.min(page, totalPages);
    const start = (clampedPage - 1) * hangoutsPerPage;
    const paged = list.slice(start, start + hangoutsPerPage);
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i);
      return { totalPages, clampedPage, paged, pages };
    }
    const windowSize = 5;
    let startPage = Math.max(2, clampedPage - 2);
    let endPage = Math.min(totalPages - 1, clampedPage + 2);
    if (clampedPage <= 3) {
      startPage = 2;
      endPage = 5;
    } else if (clampedPage >= totalPages - 2) {
      startPage = totalPages - 4;
      endPage = totalPages - 1;
    } else if (endPage - startPage + 1 < windowSize) {
      endPage = Math.min(totalPages - 1, startPage + windowSize - 1);
    }
    pages.push(1);
    if (startPage > 2) pages.push("ellipsis-left");
    for (let i = startPage; i <= endPage; i += 1) pages.push(i);
    if (endPage < totalPages - 1) pages.push("ellipsis-right");
    pages.push(totalPages);
    return { totalPages, clampedPage, paged, pages };
  };

  const createdPagination = useMemo(
    () => buildPagination(createdHangouts, createdHangoutsPage),
    [createdHangouts, createdHangoutsPage]
  );
  const joinedPagination = useMemo(
    () => buildPagination(joinedHangouts, joinedHangoutsPage),
    [joinedHangouts, joinedHangoutsPage]
  );

  const activeHangouts =
    hangoutsView === "created" ? createdHangouts : joinedHangouts;
  const activePagination =
    hangoutsView === "created" ? createdPagination : joinedPagination;
  const activeExpanded =
    hangoutsView === "created" ? createdHangoutsExpanded : joinedHangoutsExpanded;
  const setActiveExpanded =
    hangoutsView === "created" ? setCreatedHangoutsExpanded : setJoinedHangoutsExpanded;
  const setActivePage =
    hangoutsView === "created" ? setCreatedHangoutsPage : setJoinedHangoutsPage;
  const activePrivacy =
    hangoutsView === "created" ? createdHangoutsPrivacy : joinedHangoutsPrivacy;
  const activePrivateLabel =
    hangoutsView === "created"
      ? "Created hangouts are private."
      : "Joined hangouts are private.";
  const activeEmptyLabel =
    hangoutsView === "created" ? "No created hangouts yet." : "No joined hangouts yet.";
  const canViewActiveHangouts = isOwnerView
    || (isPreviewingOwn
      ? canSee(activePrivacy, previewAudience)
      : canViewByPrivacy(activePrivacy));

  const mapPreviewPins = useMemo(() => {
    return activeHangouts
      .map((hangout) => {
        const point = resolveHangoutCoords(hangout);
        if (!point) return null;
        return {
          id: String(hangout?._id || ""),
          point,
          isClosed: isHangoutClosed(hangout),
          isLive: isHangoutOngoing(hangout),
        };
      })
      .filter(Boolean);
  }, [activeHangouts]);

  const mapPreviewHasPins = mapPreviewPins.length > 0;

  useEffect(() => {
    if (!mapboxToken) return;
    mapboxgl.accessToken = mapboxToken;
  }, [mapboxToken]);

  useEffect(() => {
    if (!mapboxToken || !canViewActiveHangouts || !isHangoutsTabActive) return;
    if (!mapPreviewContainerRef.current || mapPreviewRef.current) return;

    const map = new mapboxgl.Map({
      container: mapPreviewContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [PROFILE_MAP_FALLBACK_CENTER.lng, PROFILE_MAP_FALLBACK_CENTER.lat],
      zoom: 1.6,
      interactive: false,
      attributionControl: true,
    });

    map.scrollZoom.disable();
    map.dragPan.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();
    map.keyboard.disable();

    map.on("load", () => {
      setMapPreviewLoaded(true);
    });

    mapPreviewRef.current = map;

    return () => {
      setMapPreviewLoaded(false);
      mapPreviewMarkersRef.current.forEach((marker) => marker.remove());
      mapPreviewMarkersRef.current = [];
      mapPreviewRef.current = null;
      map.remove();
    };
  }, [mapboxToken, canViewActiveHangouts, isHangoutsTabActive]);

  useEffect(() => {
    if (!mapPreviewRef.current || !mapPreviewLoaded) return;

    mapPreviewMarkersRef.current.forEach((marker) => marker.remove());
    mapPreviewMarkersRef.current = [];

    if (!mapPreviewHasPins) {
      mapPreviewRef.current.jumpTo({
        center: [PROFILE_MAP_FALLBACK_CENTER.lng, PROFILE_MAP_FALLBACK_CENTER.lat],
        zoom: 1.6,
      });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds(
      mapPreviewPins[0].point,
      mapPreviewPins[0].point
    );

    mapPreviewPins.forEach((pin) => {
      bounds.extend(pin.point);
      const markerEl = document.createElement("div");
      markerEl.className = [
        "profile-map-pin",
        hangoutsView === "created" ? "profile-map-pin-created" : "profile-map-pin-joined",
        pin.isClosed ? "is-closed" : "",
        pin.isLive ? "is-live" : "",
      ]
        .filter(Boolean)
        .join(" ");
      mapPreviewMarkersRef.current.push(
        new mapboxgl.Marker({ element: markerEl, anchor: "center" })
          .setLngLat(pin.point)
          .addTo(mapPreviewRef.current)
      );
    });

    mapPreviewRef.current.fitBounds(bounds, {
      padding: 42,
      maxZoom: 12,
      duration: 0,
    });
  }, [hangoutsView, mapPreviewHasPins, mapPreviewLoaded, mapPreviewPins]);

  const openMapPreview = () => {
    const userId = profile.id || profileUser?.id || "";
    const params = new URLSearchParams();
    params.set("scope", "profile");
    if (userId) params.set("userId", userId);
    params.set("show", hangoutsView === "created" ? "created" : "joined");
    navigate(`/app/map?${params.toString()}`);
  };

  useEffect(() => {
    setCreatedHangoutsPage(1);
    setJoinedHangoutsPage(1);
    setCreatedHangoutsExpanded(false);
    setJoinedHangoutsExpanded(false);
  }, [profile.id, isOwnProfile]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (!menuRef.current || menuRef.current.contains(e.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!pendingMenuOpen) return;
    const handleClick = (e) => {
      if (!pendingMenuRef.current || pendingMenuRef.current.contains(e.target)) return;
      setPendingMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pendingMenuOpen]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!accessToken) return;
    const handlePresence = ({ userId, isOnline }) => {
      if (!userId) return;
      setProfileUser((prev) => {
        if (!prev) return prev;
        const prevId = prev.id || prev._id;
        if (!prevId || String(prevId) !== String(userId)) return prev;
        return { ...prev, isOnline: !!isOnline };
      });
    };
    socket.on("presence:update", handlePresence);
    return () => {
      socket.off("presence:update", handlePresence);
    };
  }, [accessToken]);

  const handleProfileSaved = (nextUser) => {
    if (!nextUser) return;
    setUser(nextUser);
    setProfileUser((prev) => {
      if (!prev) return prev;
      const prevId = prev.id || prev._id;
      const nextId = nextUser.id || nextUser._id;
      if (!prevId || !nextId || String(prevId) !== String(nextId)) return prev;
      return { ...prev, ...nextUser, relationship: prev.relationship };
    });
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileLink);
      setToast("Profile link copied");
    } catch {
      setToast("Unable to copy link");
    }
  };

  const handleMessage = async () => {
    if (!accessToken || !profile.id) return;
    try {
      const data = await chatsApi.createDirect(accessToken, profile.id);
      const chatId = data?.chatId || data?.chat?._id || data?._id;
      if (chatId) navigate(`/app/chats/${chatId}`);
    } catch {
      setToast("Unable to start chat");
    }
  };

  const handleBlock = async () => {
    if (!accessToken || !profile.id) return;
    try {
      await friendsApi.block(accessToken, profile.id);
      setProfileUser((prev) =>
        prev ? { ...prev, relationship: "blocked", isBlockedByViewer: true } : prev
      );
      setToast("User blocked");
      setShowBlockConfirm(false);
    } catch {
      setToast("Unable to block user");
    }
  };

  const relationship = profileUser?.relationship || "none";
  const isBlockedByViewer = !!profileUser?.isBlockedByViewer;
  const friendStatus = useMemo(() => {
    if (relationship === "friends") return "friends";
    if (relationship === "pending_incoming") return "pending_in";
    if (relationship === "pending_outgoing") return "pending_out";
    if (relationship === "blocked") return "blocked";
    return "none";
  }, [relationship]);
  const friendAction = useMemo(() => {
    if (friendStatus === "friends") return { label: "Friends", disabled: false };
    if (friendStatus === "pending_out")
      return { label: "Request sent", disabled: true };
    if (friendStatus === "pending_in")
      return { label: "Accept request", disabled: false };
    if (friendStatus === "blocked") {
      return isBlockedByViewer
        ? { label: "Unblock", disabled: false }
        : { label: "Blocked", disabled: true };
    }
    return { label: "Add friend", disabled: false };
  }, [friendStatus, isBlockedByViewer]);

  const handleFriendAction = async () => {
    if (!accessToken || !profile.id || friendAction.disabled) return;
    try {
      if (friendStatus === "friends") {
        setShowUnfriendConfirm(true);
        return;
      }
      if (friendStatus === "blocked" && isBlockedByViewer) {
        await friendsApi.unblock(accessToken, profile.id);
        setProfileUser((prev) =>
          prev ? { ...prev, relationship: "none", isBlockedByViewer: false } : prev
        );
        setToast("User unblocked");
        return;
      }
      if (friendStatus === "pending_in") {
        await friendsApi.accept(accessToken, profile.id);
        setProfileUser((prev) => (prev ? { ...prev, relationship: "friends" } : prev));
        setToast("Friend request accepted");
        return;
      }
      await friendsApi.request(accessToken, profile.id);
      setProfileUser((prev) =>
        prev ? { ...prev, relationship: "pending_outgoing" } : prev
      );
      setToast("Friend request sent");
    } catch {
      setToast("Unable to update friend status");
    }
  };

  const handleAcceptPendingRequest = async () => {
    if (!accessToken || !profile.id) return;
    try {
      await friendsApi.accept(accessToken, profile.id);
      setProfileUser((prev) => (prev ? { ...prev, relationship: "friends" } : prev));
      setPendingMenuOpen(false);
      setToast("Friend request accepted");
    } catch {
      setToast("Unable to update friend status");
    }
  };

  const handleDeclinePendingRequest = async () => {
    if (!accessToken || !profile.id) return;
    try {
      await friendsApi.reject(accessToken, profile.id);
      setProfileUser((prev) => (prev ? { ...prev, relationship: "none" } : prev));
      setPendingMenuOpen(false);
      setToast("Friend request declined");
    } catch {
      setToast("Unable to update friend status");
    }
  };

  const handleUnfriend = async () => {
    if (!accessToken || !profile.id) return;
    try {
      await friendsApi.remove(accessToken, profile.id);
      setProfileUser((prev) => {
        if (!prev) return prev;
        const nextCount =
          typeof prev.friendsCount === "number"
            ? Math.max(prev.friendsCount - 1, 0)
            : prev.friendsCount;
        return {
          ...prev,
          relationship: "none",
          isBlockedByViewer: false,
          friendsCount: nextCount,
        };
      });
      setShowUnfriendConfirm(false);
      setToast("Friend removed");
    } catch {
      setToast("Unable to unfriend");
    }
  };

  const handleConfirmHangoutAction = async () => {
    if (!accessToken || !hangoutAction?.id) return;
    setHangoutActionPending(true);
    try {
      if (hangoutAction.mode === "delete") {
        await hangoutsApi.remove(accessToken, hangoutAction.id);
        setHangouts((prev) => prev.filter((h) => h._id !== hangoutAction.id));
        setProfileUser((prev) => {
          if (!prev) return prev;
          const nextCount =
            typeof prev.hangoutsCount === "number"
              ? Math.max(prev.hangoutsCount - 1, 0)
              : prev.hangoutsCount;
          return { ...prev, hangoutsCount: nextCount };
        });
        setToast("Hangout deleted");
      } else {
        await hangoutsApi.leave(accessToken, hangoutAction.id);
        setHangouts((prev) => prev.filter((h) => h._id !== hangoutAction.id));
        setToast("Left hangout");
      }
      setHangoutAction(null);
    } catch (e) {
      setToast(e.message || "Unable to update hangout");
    } finally {
      setHangoutActionPending(false);
    }
  };

  

  const renderHangoutCards = (list) =>
    list.map((h) => {
      const now = Date.now();
      const endsAt = h.endsAt ? new Date(h.endsAt).getTime() : null;
      const isClosed = endsAt !== null && !Number.isNaN(endsAt) && endsAt < now;
      const status = isClosed ? "Closed" : "Open";
      const start = h.startsAt || h.datetime || h.startTime || null;
      const startDate = start ? new Date(start) : null;
      const dateLabel = startDate
        ? startDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "Date TBD";
      const timeLabel = startDate
        ? startDate.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })
        : "Time TBD";
      const locationLabel =
        h.locationName ||
        h.location?.name ||
        h.location?.address ||
        (typeof h.location === "string" ? h.location : "");
      const attendingCount = Number.isFinite(h.attendingCount)
        ? h.attendingCount
        : Array.isArray(h.attendees)
        ? h.attendees.length
        : null;
      const creatorId = h?.creator?.id || h?.creatorId || "";
      const isCreator =
        isOwnProfile && creatorId && String(creatorId) === String(profile.id);
      const canManage = isOwnerView && isOwnProfile;
      return (
        <div
          key={h._id}
          className="profile-hangout-card"
          role="button"
          tabIndex={0}
          onClick={() => {
            if (isClosed) {
              setShowClosedNotice(true);
              return;
            }
            navigate(`/app/map?hangoutId=${h._id}`);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (isClosed) {
                setShowClosedNotice(true);
                return;
              }
              navigate("/app/map");
            }
          }}
        >
          <div className="profile-hangout-content">
            <div className="profile-hangout-title">{h.title || "Untitled"}</div>
            <div className="profile-hangout-meta">
              <span className="profile-hangout-meta-row">
                <span className="profile-hangout-icon">
                  <img src={calendarIcon} alt="" />
                </span>
                <span className="profile-hangout-text">{dateLabel}</span>
              </span>
              <span className="profile-hangout-meta-row">
                <span className="profile-hangout-icon">
                  <img src={clockIcon} alt="" />
                </span>
                <span className="profile-hangout-text">{timeLabel}</span>
              </span>
              {locationLabel && (
                <span className="profile-hangout-meta-row">
                  <span className="profile-hangout-icon">📍</span>
                  <span className="profile-hangout-text">{locationLabel}</span>
                </span>
              )}
              {attendingCount !== null && (
                <span className="profile-hangout-meta-row">
                  <span className="profile-hangout-icon">
                    <img src={attendeeIcon} alt="" />
                  </span>
                  <span className="profile-hangout-text">
                    {attendingCount} attending
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="profile-hangout-actions">
            {canManage && (
              <button
                type="button"
                className="profile-hangout-trash"
                title={isCreator ? "Delete" : "Leave"}
                aria-label={isCreator ? "Delete hangout" : "Leave hangout"}
                disabled={hangoutActionPending && hangoutAction?.id === h._id}
                onClick={(e) => {
                  e.stopPropagation();
                  setHangoutAction({
                    id: h._id,
                    mode: isCreator ? "delete" : "leave",
                    title: h.title || "Untitled",
                  });
                }}
              >
                <img src={trashIcon} alt="" />
              </button>
            )}
            <span
              className={`profile-hangout-pill ${
                isClosed ? "is-closed" : "is-open"
              }`}
            >
              {status}
            </span>
          </div>
        </div>
      );
    });

  const formatRelativeActivity = (date) => {
    if (!date || Number.isNaN(date.getTime())) return "";
    const diffMs = Date.now() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return "last week";
    if (diffDays < 45) return "earlier this month";
    if (diffDays < 90) return "last month";
    return "a while ago";
  };

  const recentActivityItems = useMemo(() => {
    const items = [];
    items.push(
      isOnline
        ? { label: "Active now", isActive: true }
        : { icon: clockIcon, label: "Offline" }
    );
    const hangoutsList = Array.isArray(profile.hangouts) ? profile.hangouts : [];
    let latestHangout = null;
    hangoutsList.forEach((h) => {
      const rawDate =
        h?.startsAt || h?.datetime || h?.startTime || h?.createdAt || h?.updatedAt || null;
      const time = rawDate ? new Date(rawDate).getTime() : NaN;
      if (Number.isNaN(time)) return;
      if (!latestHangout || time > latestHangout.time) {
        latestHangout = { time, hangout: h };
      }
    });
    if (latestHangout) {
      const creatorId =
        latestHangout.hangout?.creator?.id || latestHangout.hangout?.creator?._id || "";
      const isCreator = creatorId && String(creatorId) === String(profile.id);
      const relative = formatRelativeActivity(new Date(latestHangout.time));
      if (relative) {
        items.push({
          icon: locationIcon,
          label: `${isCreator ? "Created" : "Joined"} a hangout ${relative}`,
        });
      }
    }
    if (profile.joined) {
      const joinedDate = new Date(profile.joined);
      if (!Number.isNaN(joinedDate.getTime())) {
        const daysSinceJoin = Math.floor(
          (Date.now() - joinedDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceJoin >= 0 && daysSinceJoin <= 14) {
          items.push({ icon: checkedIcon, label: "New to Linqly" });
        }
      }
    }
    return items.slice(0, 3);
  }, [isOnline, profile.hangouts, profile.id, profile.joined]);

  const mutualContextItems = useMemo(() => {
    if (!isViewingOther) return [];
    const items = [];
    const mutualCount = Number.isFinite(profileUser?.mutualFriendsCount)
      ? profileUser.mutualFriendsCount
      : null;
    if (mutualCount && mutualCount > 0) {
      items.push({
        icon: attendeeIcon,
        label: `${mutualCount} mutual friend${mutualCount === 1 ? "" : "s"}`,
      });
    }
    const viewerLocationKey = getLocationKey(viewer?.location);
    const profileLocationKey = getLocationKey(profile.location);
    if (!locationHidden && viewerLocationKey && profileLocationKey) {
      if (viewerLocationKey === profileLocationKey) {
        const locationLabel = formatLocation(profile.location);
        items.push({
          icon: locationIcon,
          label: locationLabel ? `Both in ${locationLabel}` : "Same location",
        });
      }
    }
    if (!interestsHidden) {
      const viewerInterests = Array.isArray(viewer?.interests) ? viewer.interests : [];
      const profileInterests = Array.isArray(profile.interests) ? profile.interests : [];
      const shared = profileInterests.filter((item) =>
        viewerInterests.some(
          (v) => String(v).trim().toLowerCase() === String(item).trim().toLowerCase()
        )
      );
      if (shared.length) {
        const uniqueShared = Array.from(
          new Map(
            shared.map((item) => [String(item).trim().toLowerCase(), String(item).trim()])
          ).values()
        );
        const display = uniqueShared.slice(0, 2);
        const extra = uniqueShared.length - display.length;
        const summary =
          extra > 0 ? `${display.join(", ")} +${extra}` : display.join(", ");
        items.push({
          icon: sparklerIcon,
          label: `Shared interests: ${summary}`,
        });
      }
    }
    return items.slice(0, 3);
  }, [
    isViewingOther,
    profileUser?.mutualFriendsCount,
    locationHidden,
    viewer?.location,
    profile.location,
    interestsHidden,
    viewer?.interests,
    profile.interests,
  ]);

  return (
    <div className="container-fluid py-4 profile-page">
      <div className="row align-items-center mb-3">
        <div className="col-12 col-lg-4">
          <h3 className="fw-bold mb-0">Profile</h3>
        </div>
        <div className="col-12 col-lg-8">
          {isPreviewingOwn && (
            <div className="d-flex justify-content-center justify-content-lg-center mt-2 mt-lg-0">
              <div className="btn-group" role="group" aria-label="Preview POV">
                <button
                  type="button"
                  className={`btn btn-outline-dark ${
                    previewAudience === "friends" ? "active" : ""
                  }`}
                  onClick={() => setPreviewAudience("friends")}
                >
                  Friends POV
                </button>
                <button
                  type="button"
                  className={`btn btn-outline-dark ${
                    previewAudience === "public" ? "active" : ""
                  }`}
                  onClick={() => setPreviewAudience("public")}
                >
                  Public POV
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {profileError && <div className="alert alert-danger">{profileError}</div>}
      {profileLoading ? (
        <div className="row g-4">
          <div className="col-12 col-lg-4">
            <div className="profile-card profile-summary-card">
              <div className="profile-skeleton profile-skeleton-avatar" />
              <div className="profile-skeleton profile-skeleton-line" />
              <div className="profile-skeleton profile-skeleton-line sm" />
              <div className="profile-skeleton profile-skeleton-line md" />
              <div className="profile-skeleton profile-skeleton-stats" />
              <div className="profile-skeleton profile-skeleton-actions" />
            </div>
          </div>
          <div className="col-12 col-lg-8">
            <div className="profile-card">
              <div className="profile-skeleton profile-skeleton-line lg" />
              <div className="profile-skeleton profile-skeleton-line" />
              <div className="profile-skeleton profile-skeleton-line" />
              <div className="profile-skeleton profile-skeleton-line sm" />
            </div>
            <div className="profile-card">
              <div className="profile-skeleton profile-skeleton-line lg" />
              <div className="profile-skeleton profile-skeleton-line" />
              <div className="profile-skeleton profile-skeleton-line md" />
            </div>
          </div>
        </div>
      ) : profileNotFound ? (
        <div className="profile-card">
          <h5 className="fw-semibold mb-2">Profile not found</h5>
          <p className="text-muted mb-3">
            We couldn't find that user. Double-check the username and try again.
          </p>
          <button type="button" className="btn btn-dark" onClick={() => navigate("/app")}>
            Back to home
          </button>
        </div>
      ) : (
      <div className="row g-4">
        <div className="col-12 col-lg-4">
          <div className="profile-card profile-summary-card">
            <div className="profile-avatar-wrap">
              {avatarSrc ? (
                <img src={avatarSrc} alt={profile.displayName} className="profile-avatar" />
              ) : (
                <div className="profile-avatar profile-avatar-placeholder">
                  {String(profile.username || profile.displayName || "?")
                    .replace(/^@+/, "")
                    .charAt(0)
                    .toUpperCase()}
                </div>
              )}
              {canEdit && (
                <button
                  type="button"
                  className="profile-avatar-edit"
                  onClick={() => setShowAvatarModal(true)}
                  aria-label="Edit profile photo"
                >
                  <span className="profile-avatar-edit-bg" />
                  <img src={editAvatarIcon} alt="" className="profile-avatar-edit-icon" />
                </button>
              )}
              {isOnline && <span className="profile-online-dot" />}
            </div>
            <div className="profile-name">{profile.displayName}</div>
            <div className="profile-handle">{profile.usernameDisplay}</div>
            <div
              className={`profile-bio ${
                isOwnerView && isProfileFieldEmpty(profile.bio) ? "is-placeholder" : ""
              }`}
            >
              {isProfileFieldEmpty(profile.bio)
                ? isOwnerView
                  ? "Add a bio"
                  : ""
                : profile.bio}
            </div>

            <div className="profile-stats">
              <div>
                <div className="profile-stat-value">{friendsCountDisplay}</div>
                <div className="profile-stat-label">Friends</div>
              </div>
              <div>
                <div className="profile-stat-value">{hangoutsCountDisplay}</div>
                <div className="profile-stat-label">Hangouts</div>
              </div>
              <div>
                <div className={`profile-stat-value ${isProfileFieldEmpty(profile.joined) ? "is-placeholder" : ""}`}>
                  {isProfileFieldEmpty(profile.joined)
                    ? "—"
                    : new Date(profile.joined).toLocaleString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
                </div>
                <div className="profile-stat-label">Joined</div>
              </div>
            </div>

            <hr className="profile-divider" />

            <div className="profile-actions">
              {isOwnProfile ? (
                <button
                  type="button"
                  className="btn btn-dark w-100"
                  onClick={() => setShowEdit(true)}
                  disabled={!canEdit}
                >
                  {previewMode ? "Add friend" : "Edit Profile"}
                </button>
              ) : (
                <>
                  {friendStatus === "pending_in" ? (
                    <div className="profile-pending-wrap w-100" ref={pendingMenuRef}>
                      <button
                        type="button"
                        className="btn btn-dark w-100 profile-pending-btn"
                        onClick={() => setPendingMenuOpen((v) => !v)}
                        aria-haspopup="menu"
                        aria-expanded={pendingMenuOpen}
                      >
                        <span>Pending</span>
                        <img
                          src={whiteDropdownIcon}
                          alt=""
                          aria-hidden="true"
                          className="profile-pending-caret"
                        />
                      </button>
                      {pendingMenuOpen && (
                        <div className="profile-pending-dropdown" role="menu">
                          <button
                            type="button"
                            className="profile-pending-item"
                            role="menuitem"
                            onClick={handleAcceptPendingRequest}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="profile-pending-item"
                            role="menuitem"
                            onClick={handleDeclinePendingRequest}
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-dark w-100"
                      onClick={handleFriendAction}
                      disabled={friendAction.disabled}
                      onMouseEnter={() => {
                        if (friendStatus === "friends") setFriendHover(true);
                      }}
                      onMouseLeave={() => setFriendHover(false)}
                    >
                      {friendStatus === "friends" && friendHover
                        ? "Unfriend"
                        : friendAction.label}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline-secondary w-100"
                    onClick={handleMessage}
                  >
                    Message
                  </button>
                </>
              )}
              <div className="profile-menu" ref={menuRef}>
                <button
                  type="button"
                  className="btn btn-outline-secondary profile-more-btn"
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  ⋮
                </button>
                {menuOpen && (
                  <div className="profile-menu-dropdown" role="menu">
                    {isOwnProfile ? (
                      <>
                        <button
                          type="button"
                          className="profile-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            navigate("/app/settings");
                          }}
                        >
                          Account Settings
                        </button>
                        <button
                          type="button"
                          className="profile-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            navigate("/app/settings?tab=privacy");
                          }}
                        >
                          Privacy Settings
                        </button>
                        <button
                          type="button"
                          className="profile-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            window.open(`${profileLink}?preview=1`, "_blank", "noopener");
                          }}
                        >
                          Preview Public Profile
                        </button>
                        <button
                          type="button"
                          className="profile-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            handleCopyLink();
                          }}
                        >
                          Copy Profile Link
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="profile-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            handleMessage();
                          }}
                        >
                          Message
                        </button>
                        {friendStatus === "friends" && (
                          <button
                            type="button"
                            className="profile-menu-item"
                            role="menuitem"
                            onClick={() => {
                              setMenuOpen(false);
                              setShowUnfriendConfirm(true);
                            }}
                          >
                            Unfriend
                          </button>
                        )}
                        <button
                          type="button"
                          className="profile-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            handleCopyLink();
                          }}
                        >
                          Copy Profile Link
                        </button>
                        <button
                          type="button"
                          className="profile-menu-item"
                          role="menuitem"
                          onClick={() => {
                            setMenuOpen(false);
                            setShowReportModal(true);
                          }}
                        >
                          Report user
                        </button>
                        <button
                          type="button"
                          className="profile-menu-item"
                          role="menuitem"
                          disabled={friendStatus === "blocked" && !isBlockedByViewer}
                          onClick={() => {
                            setMenuOpen(false);
                            if (friendStatus === "blocked" && isBlockedByViewer) {
                              handleFriendAction();
                              return;
                            }
                            setShowBlockConfirm(true);
                          }}
                        >
                          {friendStatus === "blocked"
                            ? isBlockedByViewer
                              ? "Unblock"
                              : "Blocked"
                            : "Block user"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="profile-card">
            <div className="profile-card-header">
              <h5 className="fw-semibold mb-0">Recent Activity</h5>
            </div>
            {recentActivityItems.length ? (
              <div className="profile-mini-list">
                {recentActivityItems.map((item, idx) => (
                  <div key={`${item.label}-${idx}`} className="profile-mini-item">
                    <span
                      className={`profile-mini-icon ${
                        item.isActive ? "is-active-dot" : ""
                      }`}
                    >
                      {item.isActive ? (
                        <span className="profile-active-dot" />
                      ) : item.icon ? (
                        <img src={item.icon} alt="" />
                      ) : null}
                    </span>
                    <span className="profile-mini-text">{item.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="profile-mini-empty text-muted">No recent activity yet</div>
            )}
          </div>
          {isViewingOther && (
            <div className="profile-card">
              <div className="profile-card-header">
                <h5 className="fw-semibold mb-0">Mutual Context</h5>
              </div>
              {mutualContextItems.length ? (
                <div className="profile-mini-list">
                  {mutualContextItems.map((item, idx) => (
                    <div key={`${item.label}-${idx}`} className="profile-mini-item">
                      <span
                        className={`profile-mini-icon ${
                          item.iconText ? "is-text-icon" : ""
                        }`}
                      >
                        {item.icon ? <img src={item.icon} alt="" /> : item.iconText}
                      </span>
                      <span className="profile-mini-text">{item.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="profile-mini-empty text-muted">
                  No mutual connections yet
                </div>
              )}
            </div>
          )}
        </div>

        <div className="col-12 col-lg-8">
          <div className="profile-tabs">
            <span
              className="profile-tab-slider"
              style={{
                transform:
                  activeTab === "about"
                    ? "translateX(0%)"
                    : activeTab === "friends"
                    ? "translateX(100%)"
                    : "translateX(200%)",
              }}
            />
            <button
              type="button"
              className={`profile-tab ${activeTab === "about" ? "is-active" : ""}`}
              onClick={() => setActiveTab("about")}
            >
              About
            </button>
            <button
              type="button"
              className={`profile-tab ${activeTab === "friends" ? "is-active" : ""}`}
              onClick={() => setActiveTab("friends")}
            >
              Friends
            </button>
            <button
              type="button"
              className={`profile-tab ${activeTab === "hangouts" ? "is-active" : ""}`}
              onClick={() => setActiveTab("hangouts")}
            >
              Hangouts
            </button>
          </div>

          {activeTab === "about" && (
            <div className="profile-tab-content">
              {showPrivateProfileCard ? (
                privacyNoticeCard
              ) : (
                <>
                  {privacyNoticeCard}
              {showBasicInfoCard && (
              <div className="profile-card">
                <div className="profile-card-header">
                  <h5 className="fw-semibold mb-0">Basic Info</h5>
                  {canEdit && (
                    <button
                      type="button"
                      className="profile-edit-icon"
                      onClick={() => setShowBasicInfoModal(true)}
                      aria-label="Edit basic info"
                    >
                      <img src={editIcon} alt="" />
                    </button>
                  )}
                </div>
                {!isOwnerView && basicInfoHiddenSection && !basicInfoVisible ? (
                  <div className="text-muted">This information is private.</div>
                ) : (
                  <>
                {showGender && (
                  <div className="profile-info-row">
                    <div className="profile-info-icon">
                      <img src={genderIcon} alt="" />
                    </div>
                    <div className="profile-info-text">
                      <div className="profile-info-label">Gender</div>
                      <div className={`profile-info-value ${isProfileFieldEmpty(profile.gender) ? "is-placeholder" : ""}`}>
                        {isProfileFieldEmpty(profile.gender)
                          ? "Not set"
                          : profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1)}
                      </div>
                    </div>
                    {isOwnerView && (
                      <span className="profile-chip">{getVisibility("gender")}</span>
                    )}
                  </div>
                )}
                {showAge && (
                  <div className="profile-info-row">
                    <div className="profile-info-icon">
                      <img src={ageIcon} alt="" />
                    </div>
                    <div className="profile-info-text">
                      <div className="profile-info-label">Age</div>
                      <div className={`profile-info-value ${isProfileFieldEmpty(profile.age) ? "is-placeholder" : ""}`}>
                        {isProfileFieldEmpty(profile.age)
                          ? "Not set"
                          : Math.max(
                              0,
                              new Date().getFullYear() -
                                new Date(profile.age).getFullYear() -
                                (new Date() <
                                new Date(
                                  new Date().getFullYear(),
                                  new Date(profile.age).getMonth(),
                                  new Date(profile.age).getDate()
                                )
                                  ? 1
                                  : 0)
                            )}
                      </div>
                    </div>
                    {isOwnerView && (
                      <span className="profile-chip">{getVisibility("birthday")}</span>
                    )}
                  </div>
                )}
                {showAge && (
                  <div className="profile-info-row">
                    <div className="profile-info-icon">
                      <img src={birthdayIcon} alt="" />
                    </div>
                    <div className="profile-info-text">
                      <div className="profile-info-label">Birthday</div>
                      <div className={`profile-info-value ${isProfileFieldEmpty(profile.age) ? "is-placeholder" : ""}`}>
                        {isProfileFieldEmpty(profile.age)
                          ? "Not set"
                          : new Date(profile.age).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                      </div>
                    </div>
                    {isOwnerView && (
                      <span className="profile-chip">{getVisibility("birthday")}</span>
                    )}
                  </div>
                )}
                {showLocation && (
                  <div className="profile-info-row">
                    <div className="profile-info-icon">
                      <img src={locationIcon} alt="" />
                    </div>
                    <div className="profile-info-text">
                      <div className="profile-info-label">Location</div>
                      <div className={`profile-info-value ${isProfileFieldEmpty(profile.location) ? "is-placeholder" : ""}`}>
                        {isProfileFieldEmpty(profile.location)
                          ? "Not set"
                          : formatLocation(profile.location)}
                      </div>
                    </div>
                    {isOwnerView && (
                      <span className="profile-chip">{getVisibility("location")}</span>
                    )}
                  </div>
                )}
                  </>
                )}
              </div>
              )}

              {showInterestsCard && (
              <div className="profile-card">
                <div className="profile-card-header">
                  <h5 className="fw-semibold mb-0">Interests</h5>
                  {isOwnerView && (
                    <div className="profile-card-header-actions">
                      <span className="profile-chip">{getVisibility("interests")}</span>
                      {canEdit && (
                        <button
                          type="button"
                          className="profile-edit-icon"
                          onClick={() => setShowInterestsModal(true)}
                          aria-label="Edit interests"
                        >
                          <img src={editIcon} alt="" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {!isOwnerView && interestsHidden ? (
                  <div className="text-muted">This information is private.</div>
                ) : isProfileFieldEmpty(profile.interests) ? (
                  <div className="profile-empty">
                    {isOwnerView ? "Add your interests" : "No interests added yet."}
                  </div>
                ) : (
                  <div className="profile-tags">
                    {profile.interests.map((interest) => (
                      <span key={interest} className="profile-tag">
                        {interest}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              )}

              {showAboutCard && (
              <div className="profile-card">
                <div className="profile-card-header">
                  <h5 className="fw-semibold mb-0">About Me</h5>
                  {isOwnerView && (
                    <div className="profile-card-header-actions">
                      <span className="profile-chip">{getVisibility("about")}</span>
                      {canEdit && (
                        <button
                          type="button"
                          className="profile-edit-icon"
                          onClick={() => setEditAbout((v) => !v)}
                          aria-label="Edit about"
                        >
                          <img src={editIcon} alt="" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {!isOwnerView && aboutHidden ? (
                  <div className="text-muted">This information is private.</div>
                ) : editAbout ? (
                  <div className="profile-edit-block">
                    <div className="profile-modal-row">
                      <label className="form-label mb-0">About Me</label>
                      <textarea
                        className="form-control"
                        rows={4}
                        value={draftAbout}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next.length <= ABOUT_LIMIT) {
                            setDraftAbout(next);
                          }
                        }}
                      />
                      <div className="profile-bio-footer">
                        <div className="profile-edit-helper">
                          Share a short intro
                        </div>
                        <div className="profile-char-count">
                          {draftAbout.length}/{ABOUT_LIMIT}
                        </div>
                      </div>
                    </div>
                    <div className="profile-edit-actions">
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => {
                          setDraftAbout(profile.about || "");
                          setEditAbout(false);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-dark btn-sm"
                        onClick={async () => {
                          if (!accessToken) return;
                          const data = await usersApi.updateMe(accessToken, {
                            about: draftAbout.trim().slice(0, ABOUT_LIMIT),
                          });
                          if (data?.user) handleProfileSaved(data.user);
                          setEditAbout(false);
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="profile-about-card">
                    <p
                      className={`profile-about-text mb-0 ${
                        isProfileFieldEmpty(profile.about) ? "is-placeholder" : ""
                      }`}
                    >
                      {isProfileFieldEmpty(profile.about)
                        ? isOwnerView
                          ? "Tell people a little about yourself"
                          : "No about info yet."
                        : profile.about}
                    </p>
                  </div>
                )}
              </div>
              )}
                </>
              )}
            </div>
          )}

          {activeTab === "friends" && (
            <>
              {showPrivateProfileCard ? (
                privacyNoticeCard
              ) : (
                <>
                <div className="profile-card">
                  <div className="profile-card-header">
                    <h5 className="fw-semibold mb-0">Friends</h5>
                    {isOwnerView && (
                      <div className="profile-card-header-actions">
                        <span className="profile-chip">
                          {privacyLabels[friendsPrivacy]}
                        </span>
                      </div>
                    )}
                  </div>
                  {!isOwnerView &&
                  !(isPreviewingOwn
                    ? canSee(friendsPrivacy, previewAudience)
                    : canViewByPrivacy(friendsPrivacy)) ? (
                    <div className="text-muted">Friends list is private.</div>
                  ) : (
                    <div className="profile-friends-grid">
                      {profile.friendsPreview?.length ? (
                        profile.friendsPreview.map((f) => {
                          const friend = f?.user || f;
                          const name =
                            friend?.displayName ||
                            friend?.name ||
                            (friend?.username
                              ? friend.username.replace(/^@/, "")
                              : "User");
                          const uname = friend?.username
                            ? friend.username.replace(/^@/, "")
                            : "";
                          const handle = uname ? `@${uname}` : "@user";
                          const avatarFallback = String(
                            uname || name || "?"
                          )
                            .replace(/^@+/, "")
                            .trim()
                            .charAt(0)
                            .toUpperCase();
                          const avatar = friend?.avatarUrl || "";
                          const avatarUrl = avatar
                            ? avatar.startsWith("http://") ||
                              avatar.startsWith("https://")
                              ? avatar
                              : `${API_BASE}${avatar}`
                            : "";
                          return (
                            <div
                              key={friend?._id || friend?.id || handle}
                              className="profile-friend"
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (!uname) return;
                                setActiveTab("about");
                                navigate(`/app/profile/${uname}`);
                              }}
                              onKeyDown={(e) => {
                                if (!uname) return;
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setActiveTab("about");
                                  navigate(`/app/profile/${uname}`);
                                }
                              }}
                            >
                              <div className="profile-friend-avatar-wrap">
                                {avatarUrl ? (
                                  <img
                                    src={avatarUrl}
                                    alt={name}
                                    className="profile-friend-avatar"
                                  />
                                ) : (
                                  <div className="profile-friend-avatar profile-friend-avatar-placeholder">
                                    {avatarFallback}
                                  </div>
                                )}
                              </div>
                              <div className="profile-friend-name">{name}</div>
                              <div className="profile-friend-handle">{handle}</div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-muted small">No friends yet.</div>
                      )}
                    </div>
                  )}
                </div>
                </>
              )}
            </>
          )}

          {activeTab === "hangouts" && (
            <div className="profile-tab-content">
              {showPrivateProfileCard ? (
                privacyNoticeCard
              ) : (
                <>
                            <div className="profile-card">
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <div>
                    <h5 className="fw-semibold mb-1">Map Preview</h5>
                    <div className="profile-map-subtitle">Your Hangout Footprint</div>
                  </div>
                </div>
                {!canViewActiveHangouts ? (
                  <div className="text-muted small">{activePrivateLabel}</div>
                ) : (
                  <div
                    className="profile-map-preview"
                    role="button"
                    tabIndex={0}
                    onClick={openMapPreview}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openMapPreview();
                      }
                    }}
                    aria-label="Open full map view"
                  >
                    <div
                      ref={mapPreviewContainerRef}
                      className="profile-map-canvas"
                    />
                    {!mapPreviewHasPins && (
                      <div className="profile-map-empty" role="presentation">
                        <div className="profile-map-empty-icon" aria-hidden="true">
                          <svg
                            viewBox="0 0 24 24"
                            width="22"
                            height="22"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 21s7-7.2 7-11.4A7 7 0 0 0 5 9.6C5 13.8 12 21 12 21Z" />
                            <circle cx="12" cy="9.6" r="2.6" />
                          </svg>
                        </div>
                        <div className="profile-map-empty-title">No hangouts yet</div>
                        <div className="profile-map-empty-text">
                          Hangouts you create or join will appear here.
                        </div>
                        {isOwnerView && (
                          <button
                            type="button"
                            className="btn btn-outline-dark btn-sm profile-map-empty-cta"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate("/app/map");
                            }}
                          >
                            Create a hangout
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {!mapboxToken && canViewActiveHangouts && (
                  <div className="text-muted small mt-2">
                    Missing Mapbox token. Set <code>VITE_MAPBOX_TOKEN</code>.
                  </div>
                )}
              </div>
              <div className="profile-card">
                <div className="d-flex align-items-center justify-content-between mb-3 profile-hangouts-header">
                  <h5 className="fw-semibold mb-0">Recent Hangouts</h5>
                  <div className="d-flex align-items-center gap-2 profile-hangouts-header-actions">
                    {isOwnerView && (
                      <span className="profile-chip">
                        {privacyLabels[activePrivacy]}
                      </span>
                    )}
                    <div
                      className="btn-group profile-hangouts-view-toggle"
                      role="group"
                      aria-label="Hangouts view"
                    >
                    <button
                      type="button"
                      className={`btn btn-outline-dark btn-sm ${
                        hangoutsView === "created" ? "active" : ""
                      }`}
                      onClick={() => setHangoutsView("created")}
                    >
                      Created
                    </button>
                    <button
                      type="button"
                      className={`btn btn-outline-dark btn-sm ${
                        hangoutsView === "joined" ? "active" : ""
                      }`}
                      onClick={() => setHangoutsView("joined")}
                    >
                      Joined
                    </button>
                    </div>
                  </div>
                </div>
                {!isOwnerView &&
                !(isPreviewingOwn
                  ? canSee(activePrivacy, previewAudience)
                  : canViewByPrivacy(activePrivacy)) ? (
                  <div className="text-muted small">{activePrivateLabel}</div>
                ) : (
                  <>
                    <div
                      key={`${hangoutsView}-${activePagination.clampedPage}`}
                      className="profile-hangouts-page"
                    >
                      {(activeExpanded ? activeHangouts : activePagination.paged).length ? (
                        renderHangoutCards(
                          activeExpanded ? activeHangouts : activePagination.paged
                        )
                      ) : (
                        <div className="text-muted small">{activeEmptyLabel}</div>
                      )}
                    </div>
                    {(activePagination.totalPages > 1 ||
                      activeHangouts.length > hangoutsPerPage) && (
                      <div className="profile-hangouts-controls">
                        {!activeExpanded && activePagination.totalPages > 1 && (
                          <div className="profile-hangouts-pagination">
                            <button
                              type="button"
                              className="btn btn-outline-dark btn-sm"
                              onClick={() =>
                                setActivePage((prev) => Math.max(1, prev - 1))
                              }
                              disabled={activePagination.clampedPage === 1}
                            >
                              Prev
                            </button>
                            <div className="profile-hangouts-pages">
                              {activePagination.pages.map((item, idx) => {
                                if (typeof item !== "number") {
                                  return (
                                    <span
                                      key={`hangout-ellipsis-${idx}`}
                                      className="profile-hangouts-ellipsis"
                                    >
                                      ?
                                    </span>
                                  );
                                }
                                const isActive = item === activePagination.clampedPage;
                                return (
                                  <button
                                    key={`hangout-page-${item}`}
                                    type="button"
                                    className={`profile-hangouts-page-btn ${
                                      isActive ? "is-active" : ""
                                    }`}
                                    onClick={() => setActivePage(item)}
                                  >
                                    {item}
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              className="btn btn-outline-dark btn-sm"
                              onClick={() =>
                                setActivePage((prev) =>
                                  Math.min(activePagination.totalPages, prev + 1)
                                )
                              }
                              disabled={
                                activePagination.clampedPage === activePagination.totalPages
                              }
                            >
                              Next
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          className="btn btn-outline-dark btn-sm"
                          onClick={() => setActiveExpanded((prev) => !prev)}
                        >
                          {activeExpanded ? "Uncollapse" : "Collapse all"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

                </>
              )}
            </div>
          )}
        </div>
      </div>

      )}

      <EditProfileModal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        profile={profile}
        accessToken={accessToken}
        onSaved={handleProfileSaved}
      />
      <UploadAvatarModal
        isOpen={showAvatarModal}
        onClose={() => setShowAvatarModal(false)}
        accessToken={accessToken}
        onSaved={handleProfileSaved}
      />
      <BasicInfoModal
        isOpen={showBasicInfoModal}
        onClose={() => setShowBasicInfoModal(false)}
        profile={profile}
        accessToken={accessToken}
        onSaved={handleProfileSaved}
      />
      <EditInterestsModal
        isOpen={showInterestsModal}
        onClose={() => setShowInterestsModal(false)}
        options={INTEREST_OPTIONS}
        selected={draftInterests}
        onChange={setDraftInterests}
        onSave={async (nextInterests) => {
          if (!accessToken) return;
          const data = await usersApi.updateMe(accessToken, {
            interests: nextInterests,
          });
          if (data?.user) handleProfileSaved(data.user);
          setShowInterestsModal(false);
        }}
      />
      {hangoutAction && (
        <div className="profile-modal-overlay" onClick={() => setHangoutAction(null)}>
          <div
            className="profile-modal profile-closed-modal"
            role="dialog"
            aria-modal="true"
            aria-label={hangoutAction.mode === "delete" ? "Delete hangout" : "Leave hangout"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="profile-modal-header">
              <div className="fw-semibold">
                {hangoutAction.mode === "delete" ? "Delete hangout?" : "Leave hangout?"}
              </div>
              <button
                type="button"
                className="btn btn-sm btn-link"
                onClick={() => setHangoutAction(null)}
                disabled={hangoutActionPending}
              >
                Close
              </button>
            </div>
            <div className="profile-modal-body">
              <div className="text-muted">
                {hangoutAction.mode === "delete"
                  ? "This will permanently delete this hangout and remove it for all participants."
                  : "You’ll be removed from this hangout."}
              </div>
            </div>
            <div className="profile-modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setHangoutAction(null)}
                disabled={hangoutActionPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmHangoutAction}
                disabled={hangoutActionPending}
              >
                {hangoutAction.mode === "delete" ? "Delete" : "Leave"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showClosedNotice && (
        <div className="profile-modal-overlay" onClick={() => setShowClosedNotice(false)}>
          <div
            className="profile-modal profile-closed-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Hangout closed"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="profile-modal-header">
              <div className="fw-semibold">Hangout closed</div>
              <button
                type="button"
                className="btn btn-sm btn-link"
                onClick={() => setShowClosedNotice(false)}
              >
                Close
              </button>
            </div>
            <div className="profile-modal-body">
              <div className="text-muted">This hangout is already closed.</div>
            </div>
            <div className="profile-modal-footer">
              <button
                type="button"
                className="btn btn-dark"
                onClick={() => setShowClosedNotice(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {showBlockConfirm && (
        <div className="profile-modal-overlay" onClick={() => setShowBlockConfirm(false)}>
          <div
            className="profile-modal profile-closed-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Block user"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="profile-modal-header">
              <div className="fw-semibold">Block user</div>
              <button
                type="button"
                className="btn btn-sm btn-link"
                onClick={() => setShowBlockConfirm(false)}
              >
                Close
              </button>
            </div>
            <div className="profile-modal-body">
              <div className="text-muted">
                Are you sure you want to block this user?
              </div>
            </div>
            <div className="profile-modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowBlockConfirm(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-dark" onClick={handleBlock}>
                Block
              </button>
            </div>
          </div>
        </div>
      )}
      {showUnfriendConfirm && (
        <div className="profile-modal-overlay" onClick={() => setShowUnfriendConfirm(false)}>
          <div
            className="profile-modal profile-closed-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Unfriend"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="profile-modal-header">
              <div className="fw-semibold">Unfriend {profile.usernameDisplay}?</div>
              <button
                type="button"
                className="btn btn-sm btn-link"
                onClick={() => setShowUnfriendConfirm(false)}
              >
                Close
              </button>
            </div>
            <div className="profile-modal-body">
              <div className="text-muted">
                You'll be removed from each other's friends list.
              </div>
            </div>
            <div className="profile-modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowUnfriendConfirm(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleUnfriend}>
                Unfriend
              </button>
            </div>
          </div>
        </div>
      )}
      {showReportModal && (
        <div className="profile-modal-overlay" onClick={() => setShowReportModal(false)}>
          <div
            className="profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Report user"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="profile-modal-header">
              <div className="fw-semibold">Report user</div>
              <button
                type="button"
                className="btn btn-sm btn-link"
                onClick={() => setShowReportModal(false)}
              >
                Close
              </button>
            </div>
            <div className="profile-modal-body">
              <div className="profile-modal-row">
                <label className="form-label">Reason</label>
                <select
                  className="form-select"
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                >
                  <option value="spam">Spam</option>
                  <option value="harassment">Harassment</option>
                  <option value="impersonation">Impersonation</option>
                  <option value="inappropriate">Inappropriate content</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="profile-modal-row">
                <label className="form-label">Notes (optional)</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="profile-modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowReportModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-dark"
                onClick={() => {
                  setShowReportModal(false);
                  setReportNotes("");
                  setReportReason("spam");
                  setToast("Report submitted");
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="profile-toast">{toast}</div>}
    </div>
  );
}
