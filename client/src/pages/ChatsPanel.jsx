import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { useCall } from "../store/CallContext";
import { socket } from "../socket";
import useChatSocketEvents from "../hooks/chats/useChatSocketEvents";
import { chatsApi } from "../api/chats.api";
import { messagesApi } from "../api/messages.api";
import { usersApi } from "../api/users.api";
import { friendsApi } from "../api/friends.api";
import useChatsData from "../hooks/chats/useChatsData";
import useMessagesData from "../hooks/chats/useMessagesData";
import useGroupManagement from "../hooks/chats/useGroupManagement";
import useChatSettingsPanel from "../hooks/chats/useChatSettingsPanel";
import useSharedAttachments from "../hooks/chats/useSharedAttachments";
import useMentionsAndEmoji from "../hooks/chats/useMentionsAndEmoji";
import useFindInChat from "../hooks/chats/useFindInChat";
import { formatFileSize, formatTimeLabel, formatRelativeTime } from "../utils/chats/formatting";
import { REACTION_EMOJIS, getMessageTimestamp, renderMessageText } from "../utils/chats/messages";
import { getDirectPeer, getDisplayName, getUserId, getUserName } from "../utils/chats/users";
import { resolveAttachmentUrl } from "../utils/chats/urls";
import useReadReceipts, { resolveSeenByMessage } from "../hooks/chats/useReadReceipts";

import ChatsSidebar from "../components/chats/ChatsSidebar";
import ChatRoom from "../components/chats/ChatRoom";
import MessageComposer from "../components/chats/MessageComposer";
import ReplyPreviewBar from "../components/chats/ReplyPreviewBar";
import ChatHeader from "../components/chats/room/ChatHeader";
import GroupAddMembersPanel from "../components/chats/room/GroupAddMembersPanel";
import GroupSettingsPanel from "../components/chats/room/GroupSettingsPanel";
import MessageItem from "../components/chats/room/MessageItem";
import MessageList from "../components/chats/room/MessageList";
import MessageReactions from "../components/chats/room/MessageReactions";
import AccordionSection from "../components/AccordionSection";
import FindMessageOverlay from "../components/chats/room/FindMessageOverlay";
import SharedOverlay from "../components/chats/room/SharedOverlay";
import GroupNameModal from "../components/chats/room/GroupNameModal";
import NicknamesModal from "../components/chats/room/NicknamesModal";
import EmojiPicker from "emoji-picker-react";

import "./ChatsPanel.css";
import reactIcon from "../assets/icons/react.png";
import replyIcon from "../assets/icons/reply.png";
import muteIcon from "../assets/icons/mute.png";
import moreIcon from "../assets/icons/more.png";
import editIcon from "../assets/icons/edit.png";
import darkSearchIcon from "../assets/icons/chat-settings-icons/dark-search.png";
import darkNotificationIcon from "../assets/icons/chat-settings-icons/dark-notificaiton.png";
import darkEditIcon from "../assets/icons/chat-settings-icons/dark-edit.png";
import darkEditNicknameIcon from "../assets/icons/chat-settings-icons/dark-edit-nickname.png";
import darkMakeAdminIcon from "../assets/icons/chat-settings-icons/dark-make-admin.png";
import darkRemoveIcon from "../assets/icons/chat-settings-icons/dark-remove.png";
import darkAddMemberIcon from "../assets/icons/chat-settings-icons/dark-add-member.png";
import darkImageIcon from "../assets/icons/chat-settings-icons/dark-image.png";
import imageIcon from "../assets/icons/image.png";
import micIcon from "../assets/icons/mic.png";
import sendIcon from "../assets/icons/send.png";
import notificationIcon from "../assets/icons/notification.png";
import pinnedIcon from "../assets/icons/pinned.png";
import searchIcon from "../assets/icons/search.png";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
const INDEFINITE_MUTE_MS = 1000 * 60 * 60 * 24 * 365 * 10;

export default function ChatsPanel() {
  const { accessToken, user, refreshChatSettings } = useAuth();
  const { startCall, isInCall } = useCall();
  const navigate = useNavigate();
  const { chatId: routeChatId } = useParams();

  // State
  const [selectedChatId, setSelectedChatId] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [err, setErr] = useState("");
  const [friends, setFriends] = useState([]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState(new Set());
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showGroupNameModal, setShowGroupNameModal] = useState(false);
  const [showNicknamesModal, setShowNicknamesModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [removeMemberTarget, setRemoveMemberTarget] = useState(null);
  const [memberMenuOpenFor, setMemberMenuOpenFor] = useState(null);
  const memberMenuRef = useRef(null);
  const [reactionModal, setReactionModal] = useState(null);
  const [unsendModal, setUnsendModal] = useState(null);
  const [leaveGroupModalOpen, setLeaveGroupModalOpen] = useState(false);
  const [mediaViewer, setMediaViewer] = useState(null);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [showFindMessage, setShowFindMessage] = useState(false);
  const [callDebug, setCallDebug] = useState("");
  const [showEmojiModal, setShowEmojiModal] = useState(false);
  const [defaultSendEmoji, setDefaultSendEmoji] = useState("👍");
  const groupPhotoInputRef = useRef(null);
  const [cropPhoto, setCropPhoto] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropUploading, setCropUploading] = useState(false);
  const cropCanvasRef = useRef(null);
  const cropImageRef = useRef(null);
  const cropDragRef = useRef({ x: 0, y: 0, dragging: false });

  useEffect(() => {
    const onDebug = (evt) => {
      if (!evt?.detail) return;
      setCallDebug(evt.detail);
      setTimeout(() => setCallDebug(""), 3000);
    };
    window.addEventListener("call:debug", onDebug);
    return () => window.removeEventListener("call:debug", onDebug);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!memberMenuOpenFor) return;
      const el = memberMenuRef.current;
      if (el && !el.contains(event.target)) {
        setMemberMenuOpenFor(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [memberMenuOpenFor]);

  useEffect(() => {
    if (!cropPhoto?.url) return;
    const img = new Image();
    img.onload = () => {
      cropImageRef.current = img;
      setCropOffset({ x: 0, y: 0 });
      setCropZoom(1);
      drawCropPreview();
    };
    img.src = cropPhoto.url;
    return () => {
      if (cropImageRef.current === img) cropImageRef.current = null;
    };
  }, [cropPhoto]);

  useEffect(() => {
    drawCropPreview();
  }, [cropZoom, cropOffset]);

  const [reactOpenFor, setReactOpenFor] = useState(null);
  const [moreOpenFor, setMoreOpenFor] = useState(null);
  const [hiddenMessageIds, setHiddenMessageIds] = useState(new Set());
  const pendingImageQueueRef = useRef([]);
  const pendingImageUrlsRef = useRef(new Map());
  const pendingTextQueueRef = useRef([]);
  const [typingByChat, setTypingByChat] = useState({});
  const [isAtBottom, setIsAtBottom] = useState(true);
  const typingActiveRef = useRef(false);
  const typingTimeoutRef = useRef(null);
  const typingTimersRef = useRef(new Map());
  const prevChatIdRef = useRef("");

  const chatRoomRef = useRef(null);

  const { chats, setChats, loadChats, togglePin, deleteChat } =
    useChatsData({
      accessToken,
      routeChatId,
      selectedChatId,
      setSelectedChatId,
      navigate,
    });

  // Derived
  const selectedChat = useMemo(
    () => chats.find((c) => String(c._id) === String(selectedChatId)),
    [chats, selectedChatId]
  );
  const {
    chatSettings,
    setChatSettings,
    openSection,
    setOpenSection,
    showMuteMenu,
    setShowMuteMenu,
    updateChatSettings,
    setChatMute,
  } = useChatSettingsPanel({
    accessToken,
    selectedChatId,
    refreshChatSettings,
    loadChats,
    setErr,
  });
  const {
    groupSettings,
    setGroupSettings,
    groupNameDraft,
    setGroupNameDraft,
    groupAvatarUploading,
    addMemberToGroup,
    saveGroupName,
    uploadGroupAvatar,
    removeMember,
    makeAdmin,
    removeAdmin,
    approveJoin,
    rejectJoin,
    handleLeaveGroup: leaveGroup,
  } = useGroupManagement({
    accessToken,
    selectedChatId,
    selectedChatType: selectedChat?.type,
    friends,
    isHangoutChat: selectedChat?.type === "hangout",
    setErr,
    loadChats,
    setShowAddMembers,
    setSelectedChatId,
  });
  const {
    attachmentsData,
    setAttachmentsData,
    showSharedPanel,
    setShowSharedPanel,
    mediaPanels,
    setMediaPanels,
    openSharedPanel,
    sharedMediaGroups,
    sharedFileGroups,
    sharedLinkGroups,
  } = useSharedAttachments({
    accessToken,
    selectedChatId,
    setShowFindMessage,
  });
  const isHangoutChat = selectedChat?.type === "hangout";
  const isGroupChat = selectedChat?.type === "group" || isHangoutChat;
  const directPeer = useMemo(
    () => getDirectPeer(selectedChat, user?.id),
    [selectedChat, user?.id]
  );
  const directPeerId = getUserId(directPeer);
  const isDirectChat = !!selectedChat && !isGroupChat && !!directPeerId;
  const isGroupAdmin = useMemo(() => {
    if (!groupSettings || !user?.id) return false;
    if (String(groupSettings.creator?.id) === String(user.id)) return true;
    return (groupSettings.admins || []).some(
      (a) => String(a.id) === String(user.id)
    );
  }, [groupSettings, user?.id]);
  const blockStatus = selectedChat?.blockStatus || null;
  const blockedByMe = Boolean(isDirectChat && blockStatus?.blockedByMe);
  const blockedByOther = Boolean(isDirectChat && blockStatus?.blockedByOther);
  const isBlocked = Boolean(blockedByMe || blockedByOther);
  const {
    text,
    setText,
    showMentions,
    setShowMentions,
    mentionQuery,
    setMentionQuery,
    showEmojiPicker,
    setShowEmojiPicker,
    mentionCandidates,
    onChangeText,
    insertMention,
    insertEmoji,
    handleToggleEmojiPicker,
  } = useMentionsAndEmoji({
    selectedChatMembers: selectedChat?.members,
  });
  const {
    messages,
    setMessages,
    loadMessages,
    loadOlder,
    hasMore,
    isLoadingOlder,
    send,
    sendQuick,
    sendImage,
    sendVoice,
  } = useMessagesData({
    accessToken,
    selectedChatId,
    user,
    isBlocked,
    replyingTo,
    setReplyingTo,
    setErr,
    pendingImageQueueRef,
    pendingImageUrlsRef,
    pendingTextQueueRef,
    text,
    setText,
    setShowMentions,
    setMentionQuery,
    setShowEmojiPicker,
  });
  const isMuted =
    Boolean(chatSettings?.muteUntil) && chatSettings.muteUntil > Date.now();
  const nicknamesMap = useMemo(() => {
    if (groupSettings?.nicknames) return groupSettings.nicknames;
    if (selectedChat?.nicknames) return selectedChat.nicknames;
    return {};
  }, [groupSettings?.nicknames, selectedChat?.nicknames]);
  const memberDirectory = useMemo(() => {
    const map = new Map();
    (selectedChat?.members || []).forEach((m) => {
      map.set(String(m.id || m._id), m);
    });
    return map;
  }, [selectedChat?.members]);


  useChatSocketEvents({
    accessToken,
    selectedChatId,
    selectedChatType: selectedChat?.type,
    userId: user?.id,
    chatSettingsClearedAt: chatSettings?.clearedAt,
    setChats,
    setGroupSettings,
    setMessages,
    loadChats,
    pendingImageQueueRef,
    pendingImageUrlsRef,
    pendingTextQueueRef,
  });

  useEffect(() => {
    const onReadUpdate = (payload) => {
      if (!payload?.chatId || !payload?.userId || !payload?.lastReadMessageId) return;
      if (String(payload.userId) === String(user?.id)) {
        const chatKey = String(payload.chatId);
        setChats((prev) =>
          prev.map((chat) =>
            String(chat._id) === chatKey
              ? {
                  ...chat,
                  lastReadMessageId: String(payload.lastReadMessageId),
                  lastReadAt: payload.readAt || null,
                }
              : chat
          )
        );
      }
    };

    const onTypingStart = (payload) => {
      if (!payload?.chatId || !payload?.user?.id) return;
      if (String(payload.chatId) !== String(selectedChatId)) return;
      if (String(payload.user.id) === String(user?.id)) return;
      setTypingByChat((prev) => {
        const chatKey = String(payload.chatId);
        const prevChat = prev[chatKey] || {};
        return {
          ...prev,
          [chatKey]: {
            ...prevChat,
            [String(payload.user.id)]: {
              user: payload.user,
              lastAt: Date.now(),
            },
          },
        };
      });
      const key = `${payload.chatId}:${payload.user.id}`;
      const existing = typingTimersRef.current.get(key);
      if (existing) clearTimeout(existing);
      typingTimersRef.current.set(
        key,
        setTimeout(() => {
          setTypingByChat((prev) => {
            const chatKey = String(payload.chatId);
            const prevChat = prev[chatKey] || {};
            const nextChat = { ...prevChat };
            delete nextChat[String(payload.user.id)];
            return { ...prev, [chatKey]: nextChat };
          });
          typingTimersRef.current.delete(key);
        }, 2200)
      );
    };

    const onTypingStop = (payload) => {
      if (!payload?.chatId || !payload?.user?.id) return;
      const chatKey = String(payload.chatId);
      const userKey = String(payload.user.id);
      setTypingByChat((prev) => {
        const prevChat = prev[chatKey] || {};
        if (!prevChat[userKey]) return prev;
        const nextChat = { ...prevChat };
        delete nextChat[userKey];
        return { ...prev, [chatKey]: nextChat };
      });
      const timerKey = `${chatKey}:${userKey}`;
      const existing = typingTimersRef.current.get(timerKey);
      if (existing) {
        clearTimeout(existing);
        typingTimersRef.current.delete(timerKey);
      }
    };

    socket.on("chat:readUpdate", onReadUpdate);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    return () => {
      socket.off("chat:readUpdate", onReadUpdate);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
    };
  }, [selectedChatId, user?.id]);

  useEffect(() => {
    const handlePresence = ({ userId, isOnline }) => {
      if (!userId) return;
      setChats((prev) =>
        prev.map((c) => {
          if (c.type !== "direct" || !c.otherUser) return c;
          if (String(c.otherUser.id) !== String(userId)) return c;
          return {
            ...c,
            otherUser: { ...c.otherUser, isOnline: !!isOnline },
          };
        })
      );
    };
    socket.on("presence:update", handlePresence);
    return () => {
      socket.off("presence:update", handlePresence);
    };
  }, [setChats]);


  const settingsActions = selectedChatId ? (
    <div className="chat-settings-find">
      <div className="chat-settings-action-row">
        <div className="chat-settings-action-item">
          <button
            type="button"
            className="chat-settings-find-btn"
            onClick={() => setShowFindMessage((v) => !v)}
            title="Find message"
          >
            <img src={darkSearchIcon} alt="Find message" />
          </button>
          <div className="chat-settings-action-label">Search</div>
        </div>
        <div className="chat-settings-action-item">
          <button
            type="button"
            className={`chat-settings-find-btn ${isMuted ? "is-muted" : ""}`}
            data-mute-toggle="true"
            onClick={() => setShowMuteMenu((v) => !v)}
            title="Notifications"
          >
            <img src={darkNotificationIcon} alt="Notifications" />
            {isMuted && <span className="chat-settings-mute-label">Mute</span>}
          </button>
          <div className="chat-settings-action-label">
            {isMuted ? "Unmute" : "Mute"}
          </div>
        </div>
      </div>
      {showMuteMenu && (
        <div className="chat-mute-menu">
          {muteDurationOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className="chat-mute-option"
              onClick={() => {
                setChatMute(selectedChatId, opt.ms);
                setShowMuteMenu(false);
              }}
            >
              {opt.label}
            </button>
          ))}
          {isMuted && (
            <button
              type="button"
              className="chat-mute-option chat-mute-option-clear"
              onClick={() => {
                setChatMute(selectedChatId, null);
                setShowMuteMenu(false);
              }}
            >
              Unmute
            </button>
          )}
        </div>
      )}
    </div>
  ) : null;

  const groupMembersSection = groupSettings ? (
    <AccordionSection
      title="Chat members"
      isOpen={openSection === "members"}
      onToggle={() =>
        setOpenSection(openSection === "members" ? "" : "members")
      }
    >
      {selectedChat?.type === "group" &&
        isGroupAdmin &&
        (groupSettings.pendingJoinRequests || []).length > 0 && (
          <div className="mb-3">
            <div className="fw-semibold mb-2">Join requests</div>
            <div className="list-group">
              {groupSettings.pendingJoinRequests.map((r) => (
                <div
                  key={r.user.id}
                  className="list-group-item d-flex justify-content-between align-items-center"
                >
                  <div className="d-flex align-items-center gap-2">
                    {r.user.avatarUrl ? (
                      <img
                        src={
                          r.user.avatarUrl.startsWith("http://") ||
                          r.user.avatarUrl.startsWith("https://")
                            ? r.user.avatarUrl
                            : `${API_BASE}${r.user.avatarUrl}`
                        }
                        alt={r.user.username}
                        width={28}
                        height={28}
                        style={{ borderRadius: "50%", objectFit: "cover" }}
                      />
                    ) : (
                      <div className="chat-settings-member-fallback">
                        {String(r.user.username || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                    )}
                    <div className="fw-semibold">{r.user.username}</div>
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-success"
                      onClick={() => approveJoin(r.user.id)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => rejectJoin(r.user.id)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      <div className="list-group">
        {(groupSettings.members || []).map((m) => {
          const isCreator = String(m.id) === String(groupSettings.creator?.id);
          const isAdminMember = (groupSettings.admins || []).some(
            (a) => String(a.id) === String(m.id)
          );
          const isCreatorUser =
            String(groupSettings.creator?.id) === String(user?.id);
          const canRemove =
            isGroupAdmin &&
            !isCreator &&
            String(m.id) !== String(user?.id) &&
            (!isAdminMember || isCreatorUser);

          return (
            <div
              key={m.id}
              className="list-group-item d-flex justify-content-between align-items-center"
            >
              <div className="d-flex align-items-center gap-2">
                {m.avatarUrl ? (
                  <img
                    src={
                      m.avatarUrl.startsWith("http://") ||
                      m.avatarUrl.startsWith("https://")
                        ? m.avatarUrl
                        : `${API_BASE}${m.avatarUrl}`
                    }
                    alt={m.username}
                    width={28}
                    height={28}
                    style={{ borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <div className="chat-settings-member-fallback">
                    {String(m.username || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="fw-semibold">{m.username}</div>
                  {isCreator && <div className="small text-muted">Creator</div>}
                  {!isCreator && isAdminMember && (
                    <div className="small text-muted">Admin</div>
                  )}
                </div>
              </div>
              {canRemove && (
                <div className="chat-settings-member-actions">
                  <button
                    type="button"
                    className="chat-settings-member-more"
                    onClick={() =>
                      setMemberMenuOpenFor((prev) =>
                        String(prev) === String(m.id) ? null : m.id
                      )
                    }
                    title="More"
                  >
                    <img src={moreIcon} alt="More" />
                  </button>
                  {String(memberMenuOpenFor) === String(m.id) && (
                    <div className="chat-settings-member-menu" ref={memberMenuRef}>
                      {!isAdminMember && (
                        <button
                          type="button"
                          className="chat-settings-menu-item chat-settings-menu-item-admin"
                          onClick={() => {
                            makeAdmin(m.id);
                            setMemberMenuOpenFor(null);
                          }}
                        >
                          <img src={darkMakeAdminIcon} alt="" aria-hidden="true" />
                          <span>Make admin</span>
                        </button>
                      )}
                      {isAdminMember && isCreatorUser && (
                        <button
                          type="button"
                          className="chat-settings-menu-item"
                          onClick={() => {
                            removeAdmin(m.id);
                            setMemberMenuOpenFor(null);
                          }}
                        >
                          <img src={darkRemoveIcon} alt="" aria-hidden="true" />
                          <span>Remove admin</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="chat-settings-menu-item"
                        onClick={() => {
                          setRemoveMemberTarget({
                            id: m.id,
                            username: m.username,
                          });
                          setMemberMenuOpenFor(null);
                        }}
                      >
                        <img src={darkRemoveIcon} alt="" aria-hidden="true" />
                        <span>Remove member</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {selectedChat?.type === "group" && (
          <button
            type="button"
            className="list-group-item list-group-item-action chat-settings-member-add"
            onClick={handleToggleAddMembers}
          >
            <div className="d-flex align-items-center gap-2">
              <img src={darkAddMemberIcon} alt="" aria-hidden="true" />
              <span>Add members</span>
            </div>
          </button>
        )}
      </div>

      {selectedChat?.type === "group" && (
        <>
          {showAddMembers && selectedChat?.type === "group" && (
            <div className="chat-modal-overlay">
              <div className="chat-modal">
                <div className="chat-modal-header">
                  <div className="fw-semibold">Add members</div>
                  <button
                    type="button"
                    className="chat-modal-close"
                    onClick={() => setShowAddMembers(false)}
                  >
                    x
                  </button>
                </div>
                  <GroupAddMembersPanel
                    friends={friends}
                    onAddMember={addMemberToGroup}
                    existingMembers={groupSettings.members || []}
                    API_BASE={API_BASE}
                  />
              </div>
            </div>
          )}
        </>
      )}
    </AccordionSection>
  ) : null;

  const settingsSections = selectedChatId ? (
    <>
      <AccordionSection
        title="Personalization"
        isOpen={openSection === "personalization"}
        onToggle={() =>
          setOpenSection(
            openSection === "personalization" ? "" : "personalization"
          )
        }
      >
        {isGroupChat && groupSettings && (
          <div className="mb-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary w-100 chat-settings-btn-row"
              onClick={() => setShowGroupNameModal(true)}
              disabled={isHangoutChat && !isGroupAdmin}
            >
              <img src={darkEditIcon} alt="" aria-hidden="true" />
              <span>Change Group Name</span>
            </button>
          </div>
        )}
        {isGroupChat && groupSettings && (
          <div className="mb-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary w-100 chat-settings-btn-row"
              onClick={() => groupPhotoInputRef.current?.click()}
              disabled={!isGroupAdmin}
            >
              <img src={darkImageIcon} alt="" aria-hidden="true" />
              <span>Change Group Photo</span>
            </button>
            <input
              ref={groupPhotoInputRef}
              type="file"
              accept="image/*"
              className="d-none"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setCropPhoto({
                    file,
                    url: URL.createObjectURL(file),
                  });
                }
                e.target.value = "";
              }}
              disabled={!isGroupAdmin}
            />
          </div>
        )}
        {selectedChat && (
          <div className="mb-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary w-100 chat-settings-btn-row"
              onClick={() => setShowNicknamesModal(true)}
            >
              <img src={darkEditNicknameIcon} alt="" aria-hidden="true" />
              <span>Edit nicknames</span>
            </button>
          </div>
        )}
        {selectedChat && (
          <div className="mb-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-primary w-100 chat-settings-btn-row"
              onClick={() => setShowEmojiModal(true)}
            >
              <span className="chat-settings-emoji-icon" aria-hidden="true">
                {defaultSendEmoji}
              </span>
              <span>Edit emoji</span>
            </button>
          </div>
        )}
      </AccordionSection>

      {isGroupChat && groupMembersSection}

      <AccordionSection
        title="Privacy"
        isOpen={openSection === "privacy"}
        onToggle={() =>
          setOpenSection(openSection === "privacy" ? "" : "privacy")
        }
      >
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="read-receipts"
            checked={chatSettings.readReceipts !== false}
            onChange={(e) => {
              updateChatSettings({ readReceipts: e.target.checked });
            }}
          />
          <label className="form-check-label" htmlFor="read-receipts">
            Read receipts
          </label>
        </div>
        <div className="form-check form-switch">
          <input
            className="form-check-input"
            type="checkbox"
            id="typing-indicators"
            checked={chatSettings.typingIndicators !== false}
            onChange={(e) => {
              updateChatSettings({
                typingIndicators: e.target.checked,
              });
            }}
          />
          <label className="form-check-label" htmlFor="typing-indicators">
            Typing indicators
          </label>
        </div>
        {selectedChat?.type === "group" && groupSettings && (
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              id="group-join-approval"
              checked={groupSettings.requireAdminApproval === true}
              disabled={!isGroupAdmin}
              onChange={(e) => {
                const nextValue = e.target.checked;
                setErr("");
                chatsApi
                  .updateGroup(accessToken, selectedChatId, {
                    requireAdminApproval: nextValue,
                  })
                  .then(() => {
                    setGroupSettings((prev) =>
                      prev ? { ...prev, requireAdminApproval: nextValue } : prev
                    );
                  })
                  .catch((err) => setErr(err.message));
              }}
            />
            <label className="form-check-label" htmlFor="group-join-approval">
              Request admin approval
            </label>
            <div className="form-text">
              Require an admin to approve all requests to join the group chat.
            </div>
          </div>
        )}
      </AccordionSection>

      {!isGroupChat && (
        <AccordionSection
          title="Safety (Danger zone)"
          isOpen={openSection === "safety"}
          onToggle={() =>
            setOpenSection(openSection === "safety" ? "" : "safety")
          }
        >
          <button
            type="button"
            className={`btn btn-sm w-100 ${
              blockedByMe ? "btn-outline-danger" : "btn-danger"
            }`}
            onClick={handleToggleBlock}
          >
            {blockedByMe ? "Unblock user" : "Block user"}
          </button>
        </AccordionSection>
      )}

      <AccordionSection
        title="Shared"
        isOpen={openSection === "shared"}
        onToggle={() => setOpenSection(openSection === "shared" ? "" : "shared")}
      >
        {(() => {
          const tabs = ["media", "files", "links"];
          const labels = {
            media: "Shared media",
            files: "Shared files",
            links: "Shared links",
          };
          const active = tabs.includes(showSharedPanel)
            ? showSharedPanel
            : "";
          const activeIndex = tabs.indexOf(active);
          return (
            <div className="chat-shared-switch" data-active={active}>
              {activeIndex >= 0 && (
                <div
                  className="chat-shared-switch-indicator"
                  style={{
                    transform: `translateX(calc(${activeIndex} * (100% + var(--switch-gap))))`,
                  }}
                />
              )}
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`chat-shared-switch-btn ${
                    active === tab ? "is-active" : ""
                  }`}
                  onClick={() => openSharedPanel(tab)}
                >
                  {labels[tab]}
                </button>
              ))}
            </div>
          );
        })()}
      </AccordionSection>
    </>
  ) : null;

  const groupNameModal = (
    <GroupNameModal
      isOpen={showGroupNameModal}
      isGroupChat={isGroupChat}
      isHangoutChat={isHangoutChat}
      isGroupAdmin={isGroupAdmin}
      groupNameDraft={groupNameDraft}
      onGroupNameDraftChange={(e) => setGroupNameDraft(e.target.value)}
      onSave={() => {
        saveGroupName();
        setShowGroupNameModal(false);
      }}
      onClose={() => setShowGroupNameModal(false)}
    />
  );

  const removeMemberModal = removeMemberTarget ? (
    <div className="chat-modal-overlay">
      <div className="chat-modal">
        <div className="chat-modal-header">
          <div className="fw-semibold">Remove From Chat?</div>
          <button
            type="button"
            className="chat-modal-close"
            onClick={() => setRemoveMemberTarget(null)}
          >
            x
          </button>
        </div>
        <div className="text-muted small mb-3 text-center">
          Are you sure you want to remove{" "}
          <strong>{removeMemberTarget.username}</strong> from the group chat?
          Sending and receiving new messages will no longer be available for
          him.
        </div>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-secondary w-100"
            onClick={() => setRemoveMemberTarget(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary w-100"
            onClick={() => {
              removeMember(removeMemberTarget.id);
              setRemoveMemberTarget(null);
            }}
          >
            Remove from chat
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const editEmojiModal = showEmojiModal ? (
    <div className="chat-modal-overlay">
      <div className="chat-modal">
        <div className="chat-modal-header">
          <div className="fw-semibold">Edit emoji</div>
          <button
            type="button"
            className="chat-modal-close"
            onClick={() => setShowEmojiModal(false)}
          >
            x
          </button>
        </div>
        <div className="chat-emoji-current-row">
          <span>Current emoji:</span>
          <span className="chat-emoji-current">{defaultSendEmoji}</span>
        </div>
        <EmojiPicker
          onEmojiClick={async (emojiData) => {
            const nextEmoji = emojiData.emoji;
            setDefaultSendEmoji(nextEmoji);
            setShowEmojiModal(false);
            if (!accessToken || !selectedChatId) return;
            const actor = user?.username || "Someone";
            const notice = `${actor} changed the emoji to ${nextEmoji}`;
            try {
              await messagesApi.sendSystem(accessToken, selectedChatId, notice);
            } catch (e) {
              setErr(e.message);
            }
          }}
          previewConfig={{ showPreview: false }}
          height={360}
          width={390}
        />
      </div>
    </div>
  ) : null;

  const cropPhotoModal = cropPhoto ? (
    <div className="chat-modal-overlay">
      <div className="chat-modal chat-crop-modal">
        <div className="chat-modal-header">
          <div className="fw-semibold">Crop group photo</div>
          <button
            type="button"
            className="chat-modal-close"
            onClick={() => {
              if (cropPhoto?.url) URL.revokeObjectURL(cropPhoto.url);
              setCropPhoto(null);
            }}
          >
            x
          </button>
        </div>
        <div className="chat-crop-body">
          <div
            className="chat-crop-canvas-wrap"
            onMouseDown={(e) => {
              cropDragRef.current = {
                x: e.clientX,
                y: e.clientY,
                dragging: true,
              };
            }}
            onMouseMove={(e) => {
              if (!cropDragRef.current.dragging) return;
              const dx = e.clientX - cropDragRef.current.x;
              const dy = e.clientY - cropDragRef.current.y;
              cropDragRef.current.x = e.clientX;
              cropDragRef.current.y = e.clientY;
              setCropOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
            }}
            onMouseUp={() => {
              cropDragRef.current.dragging = false;
            }}
            onMouseLeave={() => {
              cropDragRef.current.dragging = false;
            }}
          >
            <canvas
              ref={cropCanvasRef}
              className="chat-crop-canvas"
              width={240}
              height={240}
            />
          </div>
          <div className="chat-crop-controls">
            <label className="small text-muted">Zoom</label>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={cropZoom}
              onChange={(e) => setCropZoom(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="d-flex gap-2 mt-3">
          <button
            type="button"
            className="btn btn-secondary w-100"
            onClick={() => {
              if (cropPhoto?.url) URL.revokeObjectURL(cropPhoto.url);
              setCropPhoto(null);
            }}
            disabled={cropUploading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary w-100"
            onClick={() => {
              const canvas = cropCanvasRef.current;
              if (!canvas) return;
              setCropUploading(true);
              canvas.toBlob((blob) => {
                if (!blob) return;
                const file = new File([blob], "group-photo.png", {
                  type: "image/png",
                });
                uploadGroupAvatar(file)
                  .finally(() => {
                    if (cropPhoto?.url) URL.revokeObjectURL(cropPhoto.url);
                    setCropPhoto(null);
                    setCropUploading(false);
                  });
              }, "image/png");
            }}
            disabled={cropUploading}
          >
            {cropUploading ? "Uploading..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const nicknameMembers = useMemo(() => {
    const source =
      groupSettings?.members ||
      selectedChat?.members ||
      selectedChat?.participants ||
      selectedChat?.users ||
      [];
    return source
      .map((m) => ({
        id: getUserId(m),
        username: getUserName(m),
        avatarUrl: m?.avatarUrl || "",
      }))
      .filter((m) => m.id);
  }, [groupSettings?.members, selectedChat]);

  function handleSaveNickname(memberId, value) {
    const nextValue = String(value || "").trim();
    setErr("");
    chatsApi
      .updateGroup(accessToken, selectedChatId, {
        nicknameUserId: memberId,
        nickname: nextValue,
      })
      .then(() => {
        setChats((prev) =>
          prev.map((c) => {
            if (String(c._id) !== String(selectedChatId)) {
              return c;
            }
            const nextNicknames = {
              ...(c.nicknames || {}),
            };
            if (nextValue) {
              nextNicknames[memberId] = nextValue;
            } else {
              delete nextNicknames[memberId];
            }
            return { ...c, nicknames: nextNicknames };
          })
        );
        setGroupSettings((prev) => {
          if (!prev) return prev;
          const nextNicknames = {
            ...(prev.nicknames || {}),
          };
          if (nextValue) {
            nextNicknames[memberId] = nextValue;
          } else {
            delete nextNicknames[memberId];
          }
          return { ...prev, nicknames: nextNicknames };
        });
        setEditingUserId(null);
        setNicknameDraft("");
      })
      .catch((e) => setErr(e.message));
  }

  const nicknamesModal = (
    <NicknamesModal
      isOpen={showNicknamesModal}
      selectedChatId={selectedChatId}
      nicknameMembers={nicknameMembers}
      nicknamesMap={nicknamesMap}
      editingUserId={editingUserId}
      nicknameDraft={nicknameDraft}
      setEditingUserId={setEditingUserId}
      setNicknameDraft={setNicknameDraft}
      onSaveNickname={handleSaveNickname}
      onClose={() => setShowNicknamesModal(false)}
      resolveAvatarUrl={resolveAvatarUrl}
      editIcon={editIcon}
    />
  );

  // Effects
  // initial load
  useEffect(() => {
    if (!accessToken) return;
    loadChats().catch((e) => setErr(e.message));
  }, [accessToken, routeChatId]);

  useEffect(() => {
    if (!routeChatId) return;
    const nextId = String(routeChatId);
    if (String(selectedChatId) !== nextId) {
      setSelectedChatId(nextId);
    }
  }, [routeChatId]);

  useEffect(() => {
    setReplyingTo(null);
    setReactOpenFor(null);
    setMoreOpenFor(null);
    setShowMentions(false);
    setMentionQuery("");
    setShowEmojiPicker(false);
    setShowFindMessage(false);
    setShowSharedPanel("");
    setShowMuteMenu(false);
    setShowAddMembers(false);
    setShowGroupNameModal(false);
    setShowNicknamesModal(false);
    setUnsendModal(null);
    setLeaveGroupModalOpen(false);
    setMediaViewer(null);
    setEditingUserId(null);
    setNicknameDraft("");
  }, [
    selectedChatId,
    setMentionQuery,
    setShowEmojiPicker,
    setShowMentions,
    setShowMuteMenu,
    setShowSharedPanel,
  ]);


  useEffect(() => {
    if (!accessToken) return;
    friendsApi
      .list(accessToken)
      .then((data) => setFriends(data.friends || []))
      .catch(() => {});
  }, [accessToken]);

  // when selected chat changes: join room + load messages
  useEffect(() => {
    if (!accessToken || !selectedChatId) return;

    socket.emit("chat:join", { chatId: selectedChatId });
    loadMessages(selectedChatId).catch((e) => setErr(e.message));
  }, [accessToken, selectedChatId]);

  useEffect(() => {
    function onDocMouseDown(e) {
      // only run when picker is open
      if (!reactOpenFor && !moreOpenFor) return;

      const pickerEl = e.target.closest(".msg-react-picker");
      const toggleBtn = e.target.closest('[data-react-toggle="true"]');
      const moreMenu = e.target.closest(".msg-more-menu");
      const moreToggle = e.target.closest('[data-more-toggle="true"]');

      // If click is inside picker or on the emoji button, do nothing
      if (pickerEl || toggleBtn || moreMenu || moreToggle) return;

      // Otherwise close
      setReactOpenFor(null);
      setMoreOpenFor(null);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [reactOpenFor, moreOpenFor]);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!showMuteMenu) return;
      const menuEl = e.target.closest(".chat-mute-menu");
      const toggleBtn = e.target.closest('[data-mute-toggle="true"]');
      if (menuEl || toggleBtn) return;
      setShowMuteMenu(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [showMuteMenu]);

  async function onSearch(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await usersApi.search(accessToken, query);
      setResults(data.users);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function startChatWith(userId) {
    setErr("");
    try {
      const data = await chatsApi.createDirect(accessToken, userId);
      await loadChats();
      const nextId = String(data.chatId);
      setSelectedChatId(nextId);
      navigate(`/app/chats/${nextId}`);
      setResults([]);
      setQuery("");
    } catch (e) {
      setErr(e.message);
    }
  }

  function toggleGroupMember(userId) {
    setGroupMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function createGroup(e) {
    e.preventDefault();
    setErr("");

    const memberIds = Array.from(groupMembers);
    if (memberIds.length === 0) {
      setErr("Select at least one friend");
      return;
    }

    try {
      const data = await chatsApi.createGroup(
        accessToken,
        groupName.trim(),
        memberIds
      );
      await loadChats();
      const nextId = String(data.chatId);
      setSelectedChatId(nextId);
      navigate(`/app/chats/${nextId}`);
      setGroupName("");
      setGroupMembers(new Set());
      setShowGroupForm(false);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function react(messageId, emoji) {
    setErr("");
    try {
      await messagesApi.react(accessToken, messageId, emoji);
      // don't manually edit state here
      // socket "message:reaction" will update everyone consistently
    } catch (e) {
      setErr(e.message);
    }
  }

  async function unreact(messageId) {
    setErr("");
    try {
      await messagesApi.unreact(accessToken, messageId);
    } catch (e) {
      setErr(e.message);
    }
  }

  function getUnsendPreview(message) {
    if (!message) return "this message";
    const rawText = String(message.text || "").trim();
    if (rawText) {
      return rawText.length > 120 ? `${rawText.slice(0, 117)}...` : rawText;
    }
    if (message.type === "image" || message.imageUrl) return "image";
    if (message.type === "video") return "video message";
    if (message.type === "audio") return "audio message";
    if (message.type === "file") {
      return message.fileName ? `file "${message.fileName}"` : "file";
    }
    return "this message";
  }

  function openUnsendModal(message) {
    const messageId = message?.id || message?._id;
    if (!messageId) return;
    setUnsendModal({
      messageId,
      preview: getUnsendPreview(message),
    });
    setMoreOpenFor(null);
  }

  async function confirmUnsendMessage() {
    if (!unsendModal?.messageId) return;
    setErr("");
    try {
      await messagesApi.delete(accessToken, unsendModal.messageId);
      setMoreOpenFor(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setUnsendModal(null);
    }
  }

  async function downloadFileMessage(messageId, fileName) {
    if (!messageId) return;
    setErr("");
    try {
      const blob = await messagesApi.downloadFile(accessToken, messageId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName || "file";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e.message);
    }
  }

  function deleteForMe(messageId) {
    setHiddenMessageIds((prev) => {
      const next = new Set(prev);
      next.add(String(messageId));
      return next;
    });
    setMoreOpenFor(null);
  }

  // Helpers
  const muteDurationOptions = [
    { key: "5m", label: "5 mins", ms: 5 * 60 * 1000 },
    { key: "15m", label: "15 mins", ms: 15 * 60 * 1000 },
    { key: "30m", label: "30 mins", ms: 30 * 60 * 1000 },
    { key: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
    { key: "4h", label: "4 hours", ms: 4 * 60 * 60 * 1000 },
    { key: "forever", label: "Until turned off", ms: INDEFINITE_MUTE_MS },
  ];

  function myReactionEmoji(m) {
    const mine = (m.reactions || []).find(
      (r) => String(r.userId) === String(user?.id)
    );
    return mine?.emoji || null;
  }

  function handleQueryChange(e) {
    setQuery(e.target.value);
  }

  function handleGroupNameChange(e) {
    setGroupName(e.target.value);
  }

  function handleToggleGroupForm() {
    setShowGroupForm((v) => !v);
  }

  function handleSelectChat(id) {
    const nextId = String(id);
    setSelectedChatId(nextId);
    navigate(`/app/chats/${nextId}`);
  }

  function handleToggleAddMembers() {
    setShowAddMembers((v) => !v);
  }

  async function handleToggleBlock() {
    if (!directPeerId) return;
    const nextAction = blockedByMe ? "unblock" : "block";
    const label = blockedByMe
      ? "Unblock this user?"
      : "Block this user? They won't be able to message you.";
    if (!confirm(label)) return;
    setErr("");
    try {
      if (nextAction === "block") {
        await friendsApi.block(accessToken, directPeerId);
      } else {
        await friendsApi.unblock(accessToken, directPeerId);
      }
      await loadChats();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function handleLeaveGroup() {
    setLeaveGroupModalOpen(true);
  }

  async function confirmLeaveGroup() {
    const didLeave = await leaveGroup();
    setLeaveGroupModalOpen(false);
    if (didLeave) setMessages([]);
  }

  async function handleDeleteChat(chat) {
    const cleared = await deleteChat(chat);
    if (cleared) setMessages([]);
  }

  function handleComposerBlur() {
    setTimeout(() => setShowMentions(false), 100);
  }

  const typingEnabled = chatSettings?.typingIndicators !== false;

  function emitTypingStopFor(chatId) {
    if (!chatId || !typingEnabled) return;
    socket.emit("typing:stop", {
      chatId,
      user: { id: user?.id },
    });
  }

  function emitTypingStart() {
    if (!selectedChatId || !typingEnabled) return;
    if (typingActiveRef.current) return;
    typingActiveRef.current = true;
    socket.emit("typing:start", {
      chatId: selectedChatId,
      user: {
        id: user?.id,
        username: user?.username,
        avatarUrl: user?.avatarUrl || "",
      },
    });
  }

  function emitTypingStop() {
    if (!selectedChatId || !typingEnabled) return;
    if (!typingActiveRef.current) return;
    typingActiveRef.current = false;
    emitTypingStopFor(selectedChatId);
  }

  function handleTypingInput(value) {
    if (!typingEnabled || !selectedChatId) return;
    const hasText = String(value || "").trim().length > 0;
    if (hasText) {
      emitTypingStart();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        emitTypingStop();
      }, 2000);
    } else {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      emitTypingStop();
    }
  }

  function handleComposerBlurWithTyping() {
    handleComposerBlur();
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    emitTypingStop();
  }

  useEffect(() => {
    const prev = prevChatIdRef.current;
    if (prev && prev !== selectedChatId && typingActiveRef.current) {
      emitTypingStopFor(prev);
      typingActiveRef.current = false;
    }
    prevChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  function handleCloseReplyPreview() {
    setReplyingTo(null);
    setReactOpenFor(null);
    setMoreOpenFor(null);
  }

  function handleTextChange(value) {
    onChangeText(value);
    handleTypingInput(value);
  }

  async function handleSend(e) {
    await send(e);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    emitTypingStop();
  }

  async function handleSendQuick(value) {
    await sendQuick(value);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    emitTypingStop();
  }

  function resolveAvatarUrl(rawUrl) {
    return resolveAttachmentUrl(rawUrl || "", API_BASE);
  }

  function resolveSharedAttachmentUrl(rawUrl) {
    return resolveAttachmentUrl(rawUrl || "", API_BASE);
  }

  function drawCropPreview() {
    const canvas = cropCanvasRef.current;
    const img = cropImageRef.current;
    if (!canvas || !img) return;
    const size = canvas.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const baseScale = size / Math.min(img.width, img.height);
    const scale = baseScale * cropZoom;
    const renderW = img.width * scale;
    const renderH = img.height * scale;
    const maxX = Math.max(0, (renderW - size) / 2);
    const maxY = Math.max(0, (renderH - size) / 2);
    const clampedX = Math.min(maxX, Math.max(-maxX, cropOffset.x));
    const clampedY = Math.min(maxY, Math.max(-maxY, cropOffset.y));
    if (clampedX !== cropOffset.x || clampedY !== cropOffset.y) {
      setCropOffset({ x: clampedX, y: clampedY });
      return;
    }
    const x = (size - renderW) / 2 + clampedX;
    const y = (size - renderH) / 2 + clampedY;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, x, y, renderW, renderH);
  }

  // View models
  const visibleMessages = messages.filter(
    (m) => !hiddenMessageIds.has(String(m.id || m._id))
  );
  const readReceiptsEnabled = chatSettings?.readReceipts !== false;
  const { readMapForChat } = useReadReceipts({
    accessToken,
    chatId: selectedChatId,
    userId: user?.id,
    messages: visibleMessages,
    isAtBottom,
    isActive: Boolean(selectedChatId),
    enabled: readReceiptsEnabled,
  });
  const {
    findQuery,
    setFindQuery,
    findResults,
    highlightMatches,
    jumpToMessage,
  } = useFindInChat({ visibleMessages });

  const seenReadersByMessage = useMemo(
    () =>
      resolveSeenByMessage({
        messages: visibleMessages,
        readMapForChat,
        currentUserId: user?.id,
      }),
    [readMapForChat, user?.id, visibleMessages]
  );
  const reactionModalView = reactionModal ? (() => {
    const message = visibleMessages.find(
      (m) => String(m.id || m._id) === String(reactionModal.messageId)
    );
    if (!message) return null;
    const allReactions = message.reactions || [];
    const emojiCounts = allReactions.reduce((acc, r) => {
      const key = r.emoji || "";
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const emojiKeys = Object.keys(emojiCounts);
    const selectedEmoji = reactionModal.emoji;
    const filteredReactions =
      selectedEmoji === "all"
        ? allReactions
        : allReactions.filter((r) => r.emoji === selectedEmoji);

    return (
      <div className="chat-modal-overlay">
        <div className="chat-modal">
          <div className="chat-modal-header">
            <div className="fw-semibold">Message reactions</div>
            <button
              type="button"
              className="chat-modal-close"
              onClick={() => setReactionModal(null)}
            >
              x
            </button>
          </div>
          <div className="chat-reactions-tabs">
            <button
              type="button"
              className={`chat-reactions-tab ${
                selectedEmoji === "all" ? "is-active" : ""
              }`}
              onClick={() =>
                setReactionModal((prev) =>
                  prev ? { ...prev, emoji: "all" } : prev
                )
              }
            >
              All
            </button>
            {emojiKeys.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`chat-reactions-tab ${
                  selectedEmoji === emoji ? "is-active" : ""
                }`}
                onClick={() =>
                  setReactionModal((prev) =>
                    prev ? { ...prev, emoji } : prev
                  )
                }
              >
                {emoji} {emojiCounts[emoji]}
              </button>
            ))}
          </div>
          <div className="chat-reactions-list">
            {filteredReactions.length === 0 ? (
              <div className="text-muted small">No reactions yet.</div>
            ) : (
              filteredReactions.map((r, idx) => {
                const member = memberDirectory.get(String(r.userId)) || null;
                const name = member?.username || "Unknown";
                const avatarUrl = resolveAvatarUrl(member?.avatarUrl || "");
                return (
                  <div
                    key={`${r.userId}-${r.emoji}-${idx}`}
                    className="chat-reactions-row"
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={name}
                        className="chat-reactions-avatar"
                      />
                    ) : (
                      <div className="chat-reactions-avatar chat-reactions-avatar-fallback">
                        {String(name).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="chat-reactions-name">{name}</div>
                    <div className="chat-reactions-emoji">{r.emoji}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  })() : null;
  const unsendModalView = unsendModal ? (
    <div
      className="chat-modal-overlay"
      onClick={() => setUnsendModal(null)}
    >
      <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chat-modal-header">
          <div className="fw-semibold">Unsend message</div>
          <button
            type="button"
            className="chat-modal-close"
            onClick={() => setUnsendModal(null)}
          >
            x
          </button>
        </div>
        <div className="mb-3">
          Are you sure you want to unsend the message:{" "}
          <span className="fw-semibold">{unsendModal.preview}</span>?
        </div>
        <div className="d-flex justify-content-end gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => setUnsendModal(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={confirmUnsendMessage}
          >
            Unsend
          </button>
        </div>
      </div>
    </div>
  ) : null;
  const leaveGroupModalView = leaveGroupModalOpen ? (
    <div
      className="chat-modal-overlay"
      onClick={() => setLeaveGroupModalOpen(false)}
    >
      <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chat-modal-header">
          <div className="fw-semibold">Leave chat</div>
          <button
            type="button"
            className="chat-modal-close"
            onClick={() => setLeaveGroupModalOpen(false)}
          >
            x
          </button>
        </div>
        <div className="mb-3">Are you sure you want to leave?</div>
        <div className="d-flex justify-content-end gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => setLeaveGroupModalOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={confirmLeaveGroup}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  ) : null;

  function renderSeenAvatar(member, size, title) {
    const avatarUrl = resolveAvatarUrl(member?.avatarUrl || "");
    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt={title}
          width={size}
          height={size}
          className="msg-seen-avatar"
          title={title}
        />
      );
    }
    const initial = String(member?.username || "?").charAt(0).toUpperCase();
    return (
      <div className="msg-seen-avatar msg-seen-fallback" title={title}>
        {initial}
      </div>
    );
  }
  const headerTitle = selectedChat
    ? isGroupChat
      ? selectedChat?.name || "Group chat"
      : getDisplayName(directPeer, nicknamesMap)
    : "Chat";
  const directPeerName = getDisplayName(directPeer, nicknamesMap);
  const directPeerAvatar =
    directPeer?.avatarUrl &&
    (directPeer.avatarUrl.startsWith("http://") ||
    directPeer.avatarUrl.startsWith("https://")
      ? directPeer.avatarUrl
      : `${API_BASE}${directPeer.avatarUrl}`);
  const directPeerOnline = Boolean(selectedChat?.otherUser?.isOnline);
  const groupAvatar = selectedChat?.avatarUrl
    ? selectedChat.avatarUrl.startsWith("http://") ||
      selectedChat.avatarUrl.startsWith("https://")
      ? selectedChat.avatarUrl
      : `${API_BASE}${selectedChat.avatarUrl}`
    : "";

  const typingUsers = useMemo(() => {
    const chatTyping = typingByChat[String(selectedChatId)] || {};
    return Object.values(chatTyping)
      .map((entry) => entry.user)
      .filter(Boolean)
      .filter((u) => String(u.id) !== String(user?.id));
  }, [typingByChat, selectedChatId, user?.id]);

  const handleStartCall = () => {
    if (!isDirectChat || !directPeerId || !selectedChatId) {
      setCallDebug("Call unavailable: select a direct chat first.");
      setTimeout(() => setCallDebug(""), 2000);
      return;
    }
    if (isInCall) {
      setCallDebug("You're already in a call.");
      setTimeout(() => setCallDebug(""), 2000);
      return;
    }
    console.log("call button pressed", { userId: user?.id, user });
    if (!socket.connected) {
      setCallDebug("Socket not connected. Try refreshing.");
      setTimeout(() => setCallDebug(""), 3000);
      return;
    }
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const url = `${window.location.origin}/call?callId=${encodeURIComponent(
      callId
    )}&chatId=${encodeURIComponent(selectedChatId)}&peerId=${encodeURIComponent(
      directPeerId
    )}&role=caller`;
    const callWindow = window.open(url, "_blank", "popup=yes");
    if (!callWindow) {
      setCallDebug("Pop-up blocked. Allow popups for this site to start a call.");
      setTimeout(() => setCallDebug(""), 3000);
      return;
    }
    startCall({
      callId,
      chatId: selectedChatId,
      peerId: directPeerId,
      peerName: directPeerName,
      peerAvatar: directPeerAvatar || "",
      skipOpen: true,
      caller: user
        ? {
            id: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl || "",
          }
        : null,
    });
  };


  const messageItems = visibleMessages.map((m, idx) => {
    const isDeletedMessage =
      String(m.type) === "system" ||
      /deleted a message/i.test(String(m.text || ""));

    const isMine = String(m.sender?.id) === String(user?.id);
    const displayName = getDisplayName(m.sender, nicknamesMap);
    const imageUrl = m.imageUrl
      ? m.imageUrl.startsWith("http://") || m.imageUrl.startsWith("https://")
        ? m.imageUrl
        : `${API_BASE}${m.imageUrl}`
      : "";
    const fileUrl = m.fileUrl
      ? m.fileUrl.startsWith("http://") || m.fileUrl.startsWith("https://")
        ? m.fileUrl
        : `${API_BASE}${m.fileUrl}`
      : "";
    const prevMsg = visibleMessages[idx - 1];
    const prevTime = prevMsg ? getMessageTimestamp(prevMsg) : null;
    const currTime = getMessageTimestamp(m);
    const timeDiffMinutes =
      prevTime && currTime
        ? Math.abs(
            (new Date(currTime).getTime() - new Date(prevTime).getTime()) / 60000
          )
        : null;
    const showTimestamp =
      !prevMsg || (timeDiffMinutes !== null && timeDiffMinutes >= 30);
    const sameSenderPrev =
      prevMsg &&
      prevMsg.type !== "system" &&
      String(prevMsg.sender?.id) === String(m.sender?.id);
    const showName = showTimestamp || !sameSenderPrev;
    const nextMsg = visibleMessages[idx + 1];
    const nextTime = nextMsg ? getMessageTimestamp(nextMsg) : null;
    const nextTimeDiffMinutes =
      currTime && nextTime
        ? Math.abs(
            (new Date(nextTime).getTime() - new Date(currTime).getTime()) / 60000
          )
        : null;
    const nextShowTimestamp =
      !nextMsg || (nextTimeDiffMinutes !== null && nextTimeDiffMinutes >= 30);
    const nextIsSystem = nextMsg && String(nextMsg.type) === "system";
    const sameSenderNext =
      nextMsg && String(nextMsg.sender?.id) === String(m.sender?.id);
    const isBlockEnd =
      !nextMsg || nextIsSystem || !sameSenderNext || nextShowTimestamp;
    const showAvatar = !isMine && isBlockEnd;
    const senderAvatar = m.sender?.avatarUrl
      ? m.sender.avatarUrl.startsWith("http://") ||
        m.sender.avatarUrl.startsWith("https://")
        ? m.sender.avatarUrl
        : `${API_BASE}${m.sender.avatarUrl}`
      : "";
    const hasReactions = (m.reactions || []).length > 0;
    const reactionsSummary = Object.entries(
      (m.reactions || []).reduce((acc, r) => {
        if (!r?.emoji) return acc;
        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
        return acc;
      }, {})
    );
    const messageId = m.id || m._id;
    const showPicker = String(reactOpenFor) === String(messageId);
    const showMoreMenu = String(moreOpenFor) === String(messageId);
    const isMemberNotice =
      String(m.type) === "system" &&
      /(added|removed|left the chat|joined the chat|requested to add|requested to join)/i.test(
        String(m.text || "")
      );
    const isSystemNotice =
      String(m.type) === "system" &&
      /(changed the group name|updated the group photo|changed .* nickname|made .* admin|removed .* admin|changed the emoji|change the emoji)/i.test(
        String(m.text || "")
      );
    const reactedEmojis = new Set(
      (m.reactions || [])
        .filter((r) => String(r.userId) === String(user?.id))
        .map((r) => r.emoji)
        .filter(Boolean)
    );
    const onReplyToggle = () => {
      const mid = m.id || m._id;

      // toggle reply: click again closes
      setReplyingTo((prev) => {
        if (prev && String(prev.id) === String(mid)) return null;
        return {
          id: mid,
          senderName: displayName || "Unknown",
          text: m.text,
        };
      });

      setReactOpenFor(null); // close emoji picker if open
      setMoreOpenFor(null);
    };

    const onReactToggle = () => {
      const mid = m.id || m._id;
      setReactOpenFor((prev) => (String(prev) === String(mid) ? null : mid));
      setMoreOpenFor(null);
    };

    const onMoreToggle = () => {
      const mid = m.id || m._id;
      setMoreOpenFor((prev) => (String(prev) === String(mid) ? null : mid));
      setReactOpenFor(null);
    };

    const onEmojiPick = (emoji) => {
      const current = myReactionEmoji(m);
      if (current === emoji) unreact(messageId);
      else react(messageId, emoji);
      setReactOpenFor(null);
    };

    const reactions = hasReactions && reactionsSummary.length > 0 && (
      <MessageReactions
        isMine={isMine}
        reactionsSummary={reactionsSummary}
        onOpenReactions={() =>
          setReactionModal({
            messageId,
            emoji: "all",
          })
        }
      />
    );
    let seenIndicator = null;
    if (readReceiptsEnabled && !isDeletedMessage) {
      const readersForMessage = seenReadersByMessage.get(String(messageId)) || [];
      const eligibleReaders = isGroupChat
        ? readersForMessage.filter((r) => memberDirectory.has(String(r.userId)))
        : readersForMessage;
      if (eligibleReaders.length > 0) {
        const members = eligibleReaders.map((r) => {
          const member = memberDirectory.get(String(r.userId));
          return (
            member || {
              id: r.userId,
              username: "User",
              avatarUrl: "",
            }
          );
        });
        const visibleMembers = members.slice(0, 6);
        const remaining = Math.max(0, members.length - visibleMembers.length);
        const names = members.map((m) => m?.username || "Someone").join(", ");
        if (visibleMembers.length === 1) {
          const only = visibleMembers[0];
          const seenTime = readersForMessage[0]?.readAt
            ? new Date(readersForMessage[0].readAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })
            : "";
          const title = seenTime ? `Seen at ${seenTime}` : "Seen";
          seenIndicator = (
            <div className="msg-seen-single">
              {renderSeenAvatar(only, 16, title)}
            </div>
          );
        } else {
          seenIndicator = (
            <div className="msg-seen-stack" title={names ? `Seen by ${names}` : "Seen"}>
              {visibleMembers.map((m) => (
                <span key={m.id || m._id || m.username}>
                  {renderSeenAvatar(
                    m,
                    14,
                    m.username ? `Seen by ${m.username}` : "Seen"
                  )}
                </span>
              ))}
              {remaining > 0 && (
                <div className="msg-seen-more">+{remaining}</div>
              )}
            </div>
          );
        }
      }
    }

    if (isMemberNotice || isSystemNotice) {
      const label = String(m.text || "")
        .trim();
      return (
        <div key={messageId || idx} className="msg-system" id={messageId ? `msg-${messageId}` : undefined}>
          <div className="msg-system-text">{label}</div>
        </div>
      );
    }

    return (
      <div key={messageId || idx} id={messageId ? `msg-${messageId}` : undefined}>
        {showTimestamp && (
          <div className="message-time-divider">{formatTimeLabel(currTime)}</div>
        )}
      <MessageItem
        message={{
          ...m,
          imageUrl,
          fileUrl,
          isDeletedMessage,
          displayName,
        }}
          isMine={isMine}
          showName={showName}
          showAvatar={showAvatar}
          senderAvatar={senderAvatar}
          sameSenderPrev={sameSenderPrev}
          onDownloadFile={() =>
            downloadFileMessage(messageId, m.fileName || "file")
          }
          onReplyToggle={onReplyToggle}
          onReactToggle={onReactToggle}
          onMoreToggle={onMoreToggle}
          onUnsend={() => openUnsendModal(m)}
          onDeleteForMe={() => deleteForMe(messageId)}
          showPicker={showPicker}
          showMoreMenu={showMoreMenu}
          canUnsend={isMine}
          canDeleteForMe
          emojiOptions={REACTION_EMOJIS}
          reactedEmojis={reactedEmojis}
          onEmojiPick={onEmojiPick}
          renderMessageText={renderMessageText}
          replyIcon={replyIcon}
          reactIcon={reactIcon}
          moreIcon={moreIcon}
        reactions={reactions}
        seenIndicator={seenIndicator}
        onImageClick={(msg) => {
          if (!msg?.imageUrl) return;
          setMediaViewer({
            type: "image",
            url: msg.imageUrl,
          });
        }}
      />
    </div>
  );
});

  // Render
  return (
    <div className="container-fluid chats-panel-layout">
      <div className="row g-3 chats-panel-row">
      {err && (
        <div className="col-12">
          <div className="alert alert-danger">{err}</div>
        </div>
      )}

      {/* Left: chat list + search */}
      <div className="col-12 col-lg-3 chats-panel-col">
        <ChatsSidebar
          userId={user?.id}
          query={query}
          onQueryChange={handleQueryChange}
          onSearch={onSearch}
          results={results}
          onStartChatWith={startChatWith}
          showGroupForm={showGroupForm}
          onToggleGroupForm={handleToggleGroupForm}
          createGroup={createGroup}
          groupName={groupName}
          onGroupNameChange={handleGroupNameChange}
          friends={friends}
          groupMembers={groupMembers}
          onToggleGroupMember={toggleGroupMember}
          chats={chats}
          selectedChatId={selectedChatId}
          onSelectChat={handleSelectChat}
          API_BASE={API_BASE}
          muteIcon={muteIcon}
          pinnedIcon={pinnedIcon}
          moreIcon={moreIcon}
          onTogglePin={togglePin}
          muteOptions={muteDurationOptions}
          onSetMuteDuration={(chat, ms) => setChatMute(chat._id, ms)}
          onClearMute={(chat) => setChatMute(chat._id, null)}
          onDeleteChat={handleDeleteChat}
          formatTime={formatRelativeTime}
        />
      </div>

      {/* Right: chat room */}
      <div className="col-12 col-lg-6 chats-panel-col">
        <ChatRoom
          selectedChatId={selectedChatId}
          onStickToBottomChange={setIsAtBottom}
          header={
            <ChatHeader
              username={user?.username}
              title={headerTitle}
              avatarUrl={isDirectChat ? directPeerAvatar : groupAvatar}
              isMuted={isMuted}
              showCallButton={isDirectChat}
              disableCallButton={isInCall}
              onCall={handleStartCall}
            />
          }
          topContent={
            <>
              {callDebug && (
                <div className="alert alert-info py-2">{callDebug}</div>
              )}
              {blockedByMe ? (
                <div className="alert alert-warning py-2">
                  You blocked this user.
                </div>
              ) : null}
            </>
          }
          messageList={
            <>
              {isLoadingOlder && (
                <div className="chat-load-older-indicator">Loading older messages...</div>
              )}
              <MessageList items={messageItems} />
            </>
          }
          messageCount={visibleMessages.length}
          onReachTop={() => {
            if (hasMore && !isLoadingOlder) loadOlder();
          }}
          replyPreview={
            <ReplyPreviewBar
              replyingTo={replyingTo}
              onClose={handleCloseReplyPreview}
            />
          }
          typingIndicator={
            typingEnabled && typingUsers.length > 0 ? (
              <div className="chat-typing-indicator">
                {(() => {
                  const typer = typingUsers[0];
                  const avatarUrl = resolveAvatarUrl(typer?.avatarUrl || "");
                  const label = `${typer?.username || "Someone"} typing...`;
                  return avatarUrl ? (
                    <img src={avatarUrl} alt={label} className="chat-typing-avatar" />
                  ) : (
                    <div className="chat-typing-avatar chat-typing-fallback">
                      {String(typer?.username || "?").charAt(0).toUpperCase()}
                    </div>
                  );
                })()}
                <span className="chat-typing-text">Typing...</span>
              </div>
            ) : null
          }
          composerTopContent={
            blockedByOther ? (
              <div className="alert alert-danger py-2 chat-blocked-banner">
                <span className="chat-blocked-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                  >
                    <path d="M17 8h-1V6a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V6Zm7 12H7v-8h10v8Z" />
                  </svg>
                </span>
                You've been blocked by this user.
              </div>
            ) : null
          }
          composer={
            <MessageComposer
              text={text}
              onChangeText={handleTextChange}
              onInputBlur={handleComposerBlurWithTyping}
              showMentions={showMentions}
              mentionCandidates={mentionCandidates}
              onInsertMention={insertMention}
              showEmojiPicker={showEmojiPicker}
              onToggleEmojiPicker={handleToggleEmojiPicker}
              reactIcon={reactIcon}
              imageIcon={imageIcon}
              micIcon={micIcon}
              sendIcon={sendIcon}
              onInsertEmoji={insertEmoji}
              API_BASE={API_BASE}
              onSend={handleSend}
              onSendQuick={handleSendQuick}
              onSendImage={sendImage}
              onSendVoice={sendVoice}
              defaultSendEmoji={defaultSendEmoji}
              disabled={isBlocked}
            />
          }
        />
      </div>

      <div className="col-12 col-lg-3 chats-panel-col">
        <div className="border rounded p-3 h-100 chat-settings-panel">
          <div className="fw-bold mb-2">Chat settings</div>
          {!selectedChatId && (
            <div className="text-muted small">
              Select a chat to manage members and settings.
            </div>
          )}
          <FindMessageOverlay
            isOpen={showFindMessage}
            selectedChatId={selectedChatId}
            onClose={() => setShowFindMessage(false)}
            findQuery={findQuery}
            onFindQueryChange={(e) => setFindQuery(e.target.value)}
            onClearQuery={() => setFindQuery("")}
            findResults={findResults}
            jumpToMessage={jumpToMessage}
            highlightMatches={highlightMatches}
            resolveAvatarUrl={resolveAvatarUrl}
          />
          <SharedOverlay
            panel={showSharedPanel}
            selectedChatId={selectedChatId}
            onClose={() => setShowSharedPanel("")}
            openSharedPanel={openSharedPanel}
            attachmentsData={attachmentsData}
            sharedMediaGroups={sharedMediaGroups}
            sharedFileGroups={sharedFileGroups}
            sharedLinkGroups={sharedLinkGroups}
            resolveAttachmentUrl={resolveSharedAttachmentUrl}
            formatFileSize={formatFileSize}
            onMediaClick={(url) => {
              if (!url) return;
              setMediaViewer({ type: "image", url });
            }}
          />
          {selectedChatId && !isGroupChat && (
            <div className="d-flex flex-column gap-0">
              <div className="chat-settings-header">
                <div className="chat-settings-avatar-wrap">
                  {directPeerAvatar ? (
                    <img
                      src={directPeerAvatar}
                      alt={`${directPeerName} avatar`}
                      className="chat-settings-avatar"
                    />
                  ) : (
                    <div className="chat-settings-avatar chat-settings-avatar-fallback">
                      {directPeerName.trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                  {directPeerOnline && (
                    <span className="chat-settings-online-dot" />
                  )}
                </div>
                <div className="chat-settings-name">{directPeerName}</div>
                {settingsActions}
              </div>
              {settingsSections}
            </div>
          )}
          {selectedChatId && isGroupChat && groupSettings && (
            <div className="d-flex flex-column gap-3 chat-settings-group-stack">
              <GroupSettingsPanel
                groupSettings={groupSettings}
                isGroupAdmin={isGroupAdmin}
                groupAvatarUploading={groupAvatarUploading}
                onUploadAvatar={(file) => {
                  if (!file) return;
                  setCropPhoto({
                    file,
                    url: URL.createObjectURL(file),
                  });
                }}
                groupNameDraft={groupNameDraft}
                onGroupNameDraftChange={(e) => setGroupNameDraft(e.target.value)}
                onSaveGroupName={saveGroupName}
                onRemoveMember={removeMember}
                onApproveJoin={approveJoin}
                onRejectJoin={rejectJoin}
                API_BASE={API_BASE}
                currentUserId={user?.id}
                allowAddMembers={selectedChat?.type === "group"}
                showAddMembers={showAddMembers}
                onToggleAddMembers={handleToggleAddMembers}
                onLeaveGroup={handleLeaveGroup}
                leaveLabel={isHangoutChat ? "Leave hangout" : "Leave group"}
                editIcon={editIcon}
                headerActions={settingsActions}
                showMembersSection={false}
                accordionSections={
                  <>
                    {settingsSections}
                  </>
                }
              />
            </div>
          )}
          {nicknamesModal}
      {groupNameModal}
        {reactionModalView}
        {unsendModalView}
        {leaveGroupModalView}
        {removeMemberModal}
      {cropPhotoModal}
      {editEmojiModal}
      {mediaViewer?.url && (
        <div className="chat-media-viewer" onClick={() => setMediaViewer(null)}>
          <button
            type="button"
            className="chat-media-viewer-close"
            onClick={(e) => {
              e.stopPropagation();
              setMediaViewer(null);
            }}
          >
            ×
          </button>
          <img
            src={mediaViewer.url}
            alt="Shared media"
            className="chat-media-viewer-image"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  </div>
  </div>
    </div>
  );
}
