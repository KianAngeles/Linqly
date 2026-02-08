import { useEffect, useMemo, useState } from "react";
import { socket } from "../socket";

const chatsStore = {
  chats: [],
  listeners: new Set(),
  currentUserId: "",
  activeCounts: new Map(),
  notify() {
    this.listeners.forEach((listener) => listener(this.chats));
  },
  setCurrentUserId(userId) {
    this.currentUserId = userId ? String(userId) : "";
  },
  setChats(next) {
    const resolved = typeof next === "function" ? next(this.chats) : next;
    this.chats = Array.isArray(resolved) ? resolved : [];
    this.notify();
  },
  updateChat(chatId, updater) {
    const key = String(chatId || "");
    if (!key) return;
    const nextChats = this.chats.map((chat) => {
      if (String(chat?._id) !== key) return chat;
      const patch = typeof updater === "function" ? updater(chat) : updater;
      if (!patch || patch === chat) return patch || chat;
      return { ...chat, ...patch };
    });
    this.chats = nextChats;
    this.notify();
  },
  markChatRead(chatId, readAt, lastReadMessageId) {
    const key = String(chatId || "");
    if (!key) return;
    const nextAt = readAt ? new Date(readAt).getTime() : NaN;
    this.updateChat(key, (chat) => {
      const prevAt = chat?.lastReadAt ? new Date(chat.lastReadAt).getTime() : 0;
      if (!Number.isNaN(nextAt) && nextAt <= prevAt) return chat;
      return {
        lastReadAt: readAt || new Date().toISOString(),
        ...(lastReadMessageId
          ? { lastReadMessageId: String(lastReadMessageId) }
          : null),
      };
    });
  },
  addActiveChat(chatId) {
    const key = String(chatId || "");
    if (!key) return;
    const next = (this.activeCounts.get(key) || 0) + 1;
    this.activeCounts.set(key, next);
  },
  removeActiveChat(chatId) {
    const key = String(chatId || "");
    if (!key) return;
    const next = (this.activeCounts.get(key) || 0) - 1;
    if (next <= 0) {
      this.activeCounts.delete(key);
    } else {
      this.activeCounts.set(key, next);
    }
  },
  isChatActive(chatId) {
    const key = String(chatId || "");
    if (!key) return false;
    return (this.activeCounts.get(key) || 0) > 0;
  },
  handleMessageNew(msg) {
    if (!msg?.chatId) return;
    const chatId = String(msg.chatId);
    const senderId = msg.senderId || msg.sender?.id || msg.sender?._id || "";
    const senderKey = senderId ? String(senderId) : "";
    const createdAt = msg.createdAt || msg.sentAt || msg.updatedAt || new Date().toISOString();
    const lastMessageText =
      typeof msg.text === "string" && msg.text.trim().length > 0
        ? msg.text
        : "";
    this.updateChat(chatId, (chat) => {
      if (!chat) return chat;
      const shouldMarkRead =
        this.isChatActive(chatId) ||
        (this.currentUserId && senderKey === String(this.currentUserId));
      return {
        lastMessageAt: createdAt,
        lastMessageText: lastMessageText || chat.lastMessageText || "",
        lastMessageSenderId: senderKey || chat.lastMessageSenderId || "",
        ...(shouldMarkRead ? { lastReadAt: createdAt } : null),
      };
    });
  },
  handleReadUpdate(payload) {
    if (!payload?.chatId || !payload?.userId) return;
    if (String(payload.userId) !== String(this.currentUserId || "")) return;
    this.markChatRead(payload.chatId, payload.readAt || new Date().toISOString(), payload.lastReadMessageId);
  },
};

let socketListenerCount = 0;
let socketHandlers = null;

function ensureSocketListeners() {
  if (!socketHandlers) {
    socketHandlers = {
      onMessageNew: (msg) => chatsStore.handleMessageNew(msg),
      onReadUpdate: (payload) => chatsStore.handleReadUpdate(payload),
    };
  }
  if (socketListenerCount === 0) {
    socket.on("message:new", socketHandlers.onMessageNew);
    socket.on("chat:readUpdate", socketHandlers.onReadUpdate);
  }
  socketListenerCount += 1;
  return () => {
    socketListenerCount -= 1;
    if (socketListenerCount <= 0) {
      socketListenerCount = 0;
      socket.off("message:new", socketHandlers.onMessageNew);
      socket.off("chat:readUpdate", socketHandlers.onReadUpdate);
    }
  };
}

export function isChatUnread(chat, userId) {
  if (!chat) return false;
  const lastMessageAt = chat.lastMessageAt ? new Date(chat.lastMessageAt).getTime() : 0;
  const lastReadAt = chat.lastReadAt ? new Date(chat.lastReadAt).getTime() : 0;
  const lastSenderId = chat.lastMessageSenderId ? String(chat.lastMessageSenderId) : "";
  if (!lastMessageAt) return false;
  if (userId && lastSenderId && String(userId) === lastSenderId) return false;
  return lastMessageAt > lastReadAt;
}

export function getUnreadChatsCount(chats, userId) {
  return (chats || []).filter((c) => isChatUnread(c, userId)).length;
}

export function markChatRead(chatId, readAt, lastReadMessageId) {
  chatsStore.markChatRead(chatId, readAt, lastReadMessageId);
}

export function addActiveChat(chatId) {
  chatsStore.addActiveChat(chatId);
}

export function removeActiveChat(chatId) {
  chatsStore.removeActiveChat(chatId);
}

export function useChatsStore(userId) {
  const [chats, setChatsState] = useState(chatsStore.chats);

  useEffect(() => {
    const listener = (next) => setChatsState(next);
    chatsStore.listeners.add(listener);
    return () => chatsStore.listeners.delete(listener);
  }, []);

  useEffect(() => {
    if (userId) chatsStore.setCurrentUserId(userId);
  }, [userId]);

  useEffect(() => ensureSocketListeners(), []);

  const unreadChatsCount = useMemo(
    () => getUnreadChatsCount(chats, userId),
    [chats, userId]
  );

  return {
    chats,
    setChats: chatsStore.setChats.bind(chatsStore),
    updateChat: chatsStore.updateChat.bind(chatsStore),
    unreadChatsCount,
  };
}

