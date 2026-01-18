import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { socket } from "../socket";
import { chatsApi } from "../api/chats.api";
import { messagesApi } from "../api/messages.api";
import { usersApi } from "../api/users.api";
import { friendsApi } from "../api/friends.api";

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

import "./ChatsPanel.css";
import reactIcon from "../assets/icons/react.png";
import replyIcon from "../assets/icons/reply.png";
import muteIcon from "../assets/icons/mute.png";
import moreIcon from "../assets/icons/more.png";
import editIcon from "../assets/icons/edit.png";
import imageIcon from "../assets/icons/image.png";
import micIcon from "../assets/icons/mic.png";
import sendIcon from "../assets/icons/send.png";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";
const REACTION_EMOJIS = ["👍", "😂", "🔥", "😍", "🎉", "😮"];

export default function ChatsPanel() {
  const { accessToken, user, refreshChatSettings } = useAuth();
  const navigate = useNavigate();
  const { chatId: routeChatId } = useParams();

  // State
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [err, setErr] = useState("");
  const [friends, setFriends] = useState([]);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState(new Set());
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [groupSettings, setGroupSettings] = useState(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupAvatarUploading, setGroupAvatarUploading] = useState(false);

  const [reactOpenFor, setReactOpenFor] = useState(null);
  const [moreOpenFor, setMoreOpenFor] = useState(null);
  const [hiddenMessageIds, setHiddenMessageIds] = useState(new Set());
  const pendingImageQueueRef = useRef([]);
  const pendingImageUrlsRef = useRef(new Map());

  const chatRoomRef = useRef(null);

  // Derived
  const selectedChat = useMemo(
    () => chats.find((c) => String(c._id) === String(selectedChatId)),
    [chats, selectedChatId]
  );
  const isHangoutChat = selectedChat?.type === "hangout";
  const isGroupChat = selectedChat?.type === "group" || isHangoutChat;

  const isGroupAdmin = useMemo(() => {
    if (!groupSettings || !user?.id) return false;
    if (String(groupSettings.creator?.id) === String(user.id)) return true;
    return (groupSettings.admins || []).some(
      (a) => String(a.id) === String(user.id)
    );
  }, [groupSettings, user?.id]);

  const mentionCandidates = useMemo(() => {
    const members = selectedChat?.members || [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => {
      const name = String(m?.username || "").toLowerCase();
      return name && (!q || name.startsWith(q));
    });
  }, [selectedChat?.members, mentionQuery]);

  // Data loaders
  async function loadChats() {
    const data = await chatsApi.list(accessToken);
    setChats(data.chats);

    // auto-select first chat only when no route is active
    if (!selectedChatId && !routeChatId && data.chats.length) {
      const nextId = String(data.chats[0]._id);
      setSelectedChatId(nextId);
      navigate(`/app/chats/${nextId}`, { replace: true });
    }
  }

  async function loadMessages(chatId) {
    const data = await messagesApi.list(accessToken, chatId);
    setMessages([...data.messages].reverse());
  }

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
    if (!accessToken) return;
    if (!["group", "hangout"].includes(selectedChat?.type)) {
      setGroupSettings(null);
      return;
    }

    chatsApi
      .getGroupSettings(accessToken, selectedChatId)
      .then((data) => {
        setGroupSettings(data.chat);
        setGroupNameDraft(data.chat?.name || "");
      })
      .catch(() => {});
  }, [accessToken, selectedChatId, selectedChat?.type]);

  // close reply + emoji picker when switching chats
  useEffect(() => {
    setReactOpenFor(null);
    setMoreOpenFor(null);
    setReplyingTo(null);
    setShowAddMembers(false);
    setGroupSettings(null);
  }, [selectedChatId]);

  // realtime incoming messages
  useEffect(() => {
    const onNew = (msg) => {
      // always refresh chat preview ordering
      loadChats().catch(() => {});

      // If it's not this chat, don't append to open window
      if (String(msg.chatId) === String(selectedChatId)) {
        const isOwnAttachment =
          ["image", "video", "file", "audio"].includes(msg?.type) &&
          String(msg.sender?.id) === String(user?.id);
        if (isOwnAttachment && pendingImageQueueRef.current.length > 0) {
          const tempId = pendingImageQueueRef.current.shift();
          const tempUrl = pendingImageUrlsRef.current.get(tempId);
          if (tempUrl) {
            URL.revokeObjectURL(tempUrl);
            pendingImageUrlsRef.current.delete(tempId);
          }

          setMessages((prev) => {
            const hasTemp = prev.some(
              (m) => String(m.id || m._id) === String(tempId)
            );
            const replaced = prev.map((m) =>
              String(m.id || m._id) === String(tempId) ? msg : m
            );
            return hasTemp ? replaced : [...prev, msg];
          });
          return;
        }
        setMessages((prev) => [...prev, msg]);
      }
    };

    socket.on("message:new", onNew);
    return () => socket.off("message:new", onNew);
  }, [selectedChatId, user?.id]);

  useEffect(() => {
    const onReaction = (payload) => {
      // payload: { messageId, chatId, reactions }
      if (String(payload.chatId) !== String(selectedChatId)) return;

      setMessages((prev) =>
        prev.map((m) =>
          String(m.id || m._id) === String(payload.messageId)
            ? { ...m, reactions: payload.reactions }
            : m
        )
      );
    };

    socket.on("message:reaction", onReaction);
    return () => socket.off("message:reaction", onReaction);
  }, [selectedChatId]);

  useEffect(() => {
    const onDeleted = (payload) => {
      if (String(payload.chatId) !== String(selectedChatId)) return;
      setMessages((prev) =>
        prev.map((m) =>
          String(m.id || m._id) === String(payload.messageId)
            ? {
                ...m,
                type: "system",
                text: payload.systemText || "Message deleted",
                imageUrl: null,
                replyTo: null,
                replyPreview: null,
                reactions: [],
                mentions: [],
                createdAt: payload.createdAt || m.createdAt,
              }
            : m
        )
      );
    };

    socket.on("message:deleted", onDeleted);
    return () => socket.off("message:deleted", onDeleted);
  }, [selectedChatId]);

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

  // Actions
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

  async function addMemberToGroup(userId) {
    setErr("");
    try {
      await chatsApi.addMember(accessToken, selectedChatId, userId);
      await loadChats();
      setShowAddMembers(false);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function saveGroupName() {
    setErr("");
    try {
      await chatsApi.updateGroup(accessToken, selectedChatId, {
        name: groupNameDraft,
      });
      await loadChats();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function uploadGroupAvatar(file) {
    if (!file) return;
    setErr("");
    setGroupAvatarUploading(true);
    try {
      await chatsApi.uploadGroupAvatar(accessToken, selectedChatId, file);
      await loadChats();
    } catch (e) {
      setErr(e.message);
    } finally {
      setGroupAvatarUploading(false);
    }
  }

  async function removeMember(userId) {
    setErr("");
    try {
      await chatsApi.removeMember(accessToken, selectedChatId, userId);
      await loadChats();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function approveJoin(userId) {
    setErr("");
    try {
      await chatsApi.approveJoin(accessToken, selectedChatId, userId);
      await loadChats();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function rejectJoin(userId) {
    setErr("");
    try {
      await chatsApi.rejectJoin(accessToken, selectedChatId, userId);
    } catch (e) {
      setErr(e.message);
    }
  }

  async function send(e) {
    e.preventDefault();
    if (!selectedChatId) return;
    if (!text.trim()) return;

    setErr("");
    try {
      await messagesApi.send(
        accessToken,
        selectedChatId,
        text.trim(),
        replyingTo?.id
      );
      setText("");
      setReplyingTo(null);
      setShowMentions(false);
      setMentionQuery("");
      setShowEmojiPicker(false);
      // socket will append via message:new
    } catch (e) {
      setErr(e.message);
    }
  }

  async function sendImage(file) {
    if (!selectedChatId || !file) return;
    setErr("");
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);
    const isImage = file.type?.startsWith("image/");
    const isVideo = file.type?.startsWith("video/");
    const attachmentType = isImage ? "image" : isVideo ? "video" : "file";
    pendingImageQueueRef.current.push(tempId);
    pendingImageUrlsRef.current.set(tempId, previewUrl);

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        chatId: selectedChatId,
        sender: { id: user?.id, username: user?.username },
        type: attachmentType,
        imageUrl: isImage ? previewUrl : "",
        fileUrl: !isImage ? previewUrl : "",
        fileName: file.name || "file",
        fileType: file.type || "",
        fileSize: file.size || 0,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);

    try {
      if (isImage) {
        await messagesApi.sendImage(
          accessToken,
          selectedChatId,
          file,
          replyingTo?.id
        );
      } else {
        await messagesApi.sendFile(
          accessToken,
          selectedChatId,
          file,
          replyingTo?.id
        );
      }
      setReplyingTo(null);
    } catch (e) {
      pendingImageQueueRef.current = pendingImageQueueRef.current.filter(
        (id) => id !== tempId
      );
      const tempUrl = pendingImageUrlsRef.current.get(tempId);
      if (tempUrl) {
        URL.revokeObjectURL(tempUrl);
        pendingImageUrlsRef.current.delete(tempId);
      }
      setMessages((prev) =>
        prev.filter((m) => String(m.id || m._id) !== String(tempId))
      );
      setErr(e.message);
    }
  }

  async function sendVoice(file) {
    if (!selectedChatId || !file) return;
    setErr("");
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);
    pendingImageQueueRef.current.push(tempId);
    pendingImageUrlsRef.current.set(tempId, previewUrl);

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        chatId: selectedChatId,
        sender: { id: user?.id, username: user?.username },
        type: "audio",
        fileUrl: previewUrl,
        fileName: file.name || "voice",
        fileType: file.type || "",
        fileSize: file.size || 0,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);

    try {
      await messagesApi.sendVoice(
        accessToken,
        selectedChatId,
        file,
        replyingTo?.id
      );
      setReplyingTo(null);
    } catch (e) {
      pendingImageQueueRef.current = pendingImageQueueRef.current.filter(
        (id) => id !== tempId
      );
      const tempUrl = pendingImageUrlsRef.current.get(tempId);
      if (tempUrl) {
        URL.revokeObjectURL(tempUrl);
        pendingImageUrlsRef.current.delete(tempId);
      }
      setMessages((prev) =>
        prev.filter((m) => String(m.id || m._id) !== String(tempId))
      );
      setErr(e.message);
    }
  }

  async function togglePin(c) {
    await chatsApi.updateSettings(accessToken, c._id, {
      isPinned: !c.settings?.isPinned,
    });
    await loadChats();
  }

  async function toggleMute(c) {
    await chatsApi.updateSettings(accessToken, c._id, {
      isMuted: !c.settings?.isMuted,
    });
    await loadChats();
    await refreshChatSettings();
  }

  async function toggleIgnore(c) {
    await chatsApi.updateSettings(accessToken, c._id, {
      isIgnored: !c.settings?.isIgnored,
    });
    await loadChats();
  }

  async function deleteChat(c) {
    if (!confirm("Delete this chat for you?")) return;
    await chatsApi.deleteForMe(accessToken, c._id);
    await loadChats();
    if (String(selectedChatId) === String(c._id)) {
      setSelectedChatId("");
      setMessages([]);
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

  async function unsendMessage(messageId) {
    if (!confirm("Unsend this message?")) return;
    setErr("");
    try {
      await messagesApi.delete(accessToken, messageId);
      setMoreOpenFor(null);
    } catch (e) {
      setErr(e.message);
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
  function myReactionEmoji(m) {
    const mine = (m.reactions || []).find(
      (r) => String(r.userId) === String(user?.id)
    );
    return mine?.emoji || null;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function renderMessageText(m) {
    const text = m?.text || "";
    if (!text) return text;

    const names = Array.from(
      new Set((m.mentions || []).map((mm) => String(mm.username || "").trim()))
    ).filter(Boolean);
    if (names.length === 0) return text;

    const pattern = names.map((n) => escapeRegExp(n)).join("|");
    const re = new RegExp(`@(?:${pattern})\\b`, "gi");
    const matches = text.match(re);
    if (!matches) return text;

    const parts = text.split(re);
    return parts.reduce((acc, part, i) => {
      acc.push(<span key={`t-${i}`}>{part}</span>);
      if (i < matches.length) {
        acc.push(<strong key={`m-${i}`}>{matches[i]}</strong>);
      }
      return acc;
    }, []);
  }

  function getMessageTimestamp(message) {
    return (
      message?.createdAt ||
      message?.sentAt ||
      message?.timestamp ||
      message?.updatedAt ||
      null
    );
  }

  function formatTimeLabel(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return "";
    const time = new Date(timestamp).getTime();
    if (Number.isNaN(time)) return "";
    const diffMinutes = Math.max(1, Math.round((Date.now() - time) / 60000));
    if (diffMinutes < 60) return `${diffMinutes}m`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d`;
  }

  function onChangeText(value) {
    setText(value);

    const at = value.lastIndexOf("@");
    if (at === -1) {
      setShowMentions(false);
      setMentionQuery("");
      return;
    }

    const after = value.slice(at + 1);
    if (!/^[a-zA-Z0-9_]*$/.test(after)) {
      setShowMentions(false);
      setMentionQuery("");
      return;
    }

    setMentionQuery(after);
    setShowMentions(true);
  }

  function insertMention(username) {
    if (!text.includes("@")) return;
    const next = text.replace(/@[\w]*$/, `@${username} `);
    setText(next);
    setShowMentions(false);
    setMentionQuery("");
  }

  function insertEmoji(emoji) {
    if (!emoji?.native) return;
    setText((prev) => `${prev}${emoji.native}`);
    setShowEmojiPicker(false);
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

  async function handleLeaveGroup() {
    const label = isHangoutChat ? "Leave this hangout chat?" : "Leave this group chat?";
    if (!confirm(label)) return;
    setErr("");
    try {
      await chatsApi.leaveGroup(accessToken, selectedChatId);
      await loadChats();
      setSelectedChatId("");
      setMessages([]);
    } catch (e) {
      setErr(e.message);
    }
  }

  function handleComposerBlur() {
    setTimeout(() => setShowMentions(false), 100);
  }

  function handleToggleEmojiPicker() {
    setShowEmojiPicker((v) => !v);
  }

  function handleCloseReplyPreview() {
    setReplyingTo(null);
    setReactOpenFor(null);
    setMoreOpenFor(null);
  }

  // View models
  const visibleMessages = messages.filter(
    (m) => !hiddenMessageIds.has(String(m.id || m._id))
  );

  const messageItems = visibleMessages.map((m, idx) => {
    const isDeletedMessage =
      String(m.type) === "system" ||
      /deleted a message/i.test(String(m.text || ""));

    const isMine = String(m.sender?.id) === String(user?.id);
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
    const sameSenderPrev =
      prevMsg &&
      prevMsg.type !== "system" &&
      String(prevMsg.sender?.id) === String(m.sender?.id);
    const showName = !sameSenderPrev;
    const showTimestamp =
      !prevMsg || (timeDiffMinutes !== null && timeDiffMinutes >= 30);
    const nextMsg = visibleMessages[idx + 1];
    const sameSenderNext =
      nextMsg && String(nextMsg.sender?.id) === String(m.sender?.id);
    const showAvatar = !isMine && !sameSenderNext && m.sender?.avatarUrl;
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
          senderName: m.sender?.username || "Unknown",
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
      <MessageReactions isMine={isMine} reactionsSummary={reactionsSummary} />
    );

    return (
      <div key={m.id || idx}>
        {showTimestamp && (
          <div className="message-time-divider">{formatTimeLabel(currTime)}</div>
        )}
        <MessageItem
          message={{ ...m, imageUrl, fileUrl, isDeletedMessage }}
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
          onUnsend={() => unsendMessage(messageId)}
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
          moreIcon={moreIcon}
          onTogglePin={togglePin}
          onToggleMute={toggleMute}
          onToggleIgnore={toggleIgnore}
          onDeleteChat={deleteChat}
          formatTime={formatRelativeTime}
        />
      </div>

      {/* Right: chat room */}
      <div className="col-12 col-lg-6 chats-panel-col">
        <ChatRoom
          selectedChatId={selectedChatId}
          header={<ChatHeader username={user?.username} />}
          messageList={<MessageList items={messageItems} />}
          messageCount={visibleMessages.length}
          replyPreview={
            <ReplyPreviewBar
              replyingTo={replyingTo}
              onClose={handleCloseReplyPreview}
            />
          }
          composer={
            <MessageComposer
              text={text}
              onChangeText={onChangeText}
              onInputBlur={handleComposerBlur}
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
              onSend={send}
              onSendImage={sendImage}
              onSendVoice={sendVoice}
            />
          }
        />
      </div>

      <div className="col-12 col-lg-3 chats-panel-col">
        <div className="border rounded p-3 h-100">
          <div className="fw-bold mb-2">Chat settings</div>
          {!selectedChatId && (
            <div className="text-muted small">
              Select a chat to manage members and settings.
            </div>
          )}
          {selectedChatId && !isGroupChat && (
            <div className="text-muted small">
              Settings are available for group or hangout chats.
            </div>
          )}
          {selectedChatId && isGroupChat && groupSettings && (
            <>
              <GroupSettingsPanel
                groupSettings={groupSettings}
                isGroupAdmin={isGroupAdmin}
                groupAvatarUploading={groupAvatarUploading}
                onUploadAvatar={uploadGroupAvatar}
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
              />

              {showAddMembers && selectedChat?.type === "group" && (
                <GroupAddMembersPanel
                  friends={friends}
                  onAddMember={addMemberToGroup}
                />
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
