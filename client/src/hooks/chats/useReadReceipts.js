import { useEffect, useRef, useState } from "react";
import { chatsApi } from "../../api/chats.api";
import { socket } from "../../socket";
import { getMessageTimestamp } from "../../utils/chats/messages";
import { addActiveChat, markChatRead, removeActiveChat } from "../../store/chatsStore";

const readStore = {
  readByChat: {},
  listeners: new Set(),
  notify() {
    this.listeners.forEach((listener) => listener(this.readByChat));
  },
  setChatReads(chatId, reads) {
    const key = String(chatId || "");
    if (!key) return;
    this.readByChat = {
      ...this.readByChat,
      [key]: reads,
    };
    this.notify();
  },
  setRead(chatId, userId, lastReadMessageId, readAt) {
    const chatKey = String(chatId || "");
    const userKey = String(userId || "");
    if (!chatKey || !userKey) return;
    const prevChat = this.readByChat[chatKey] || {};
    const prevEntry = prevChat[userKey];
    if (prevEntry?.readAt && readAt) {
      const prevTs = new Date(prevEntry.readAt).getTime();
      const nextTs = new Date(readAt).getTime();
      if (!Number.isNaN(prevTs) && !Number.isNaN(nextTs) && nextTs <= prevTs) {
        return;
      }
    }
    const nextChat = {
      ...prevChat,
      [userKey]: {
        lastReadMessageId: String(lastReadMessageId || ""),
        readAt: readAt || null,
      },
    };
    this.readByChat = { ...this.readByChat, [chatKey]: nextChat };
    this.notify();
  },
};

let socketListenerCount = 0;
let socketHandler = null;

function ensureSocketListener() {
  if (!socketHandler) {
    socketHandler = (payload) => {
      if (!payload?.chatId || !payload?.userId || !payload?.lastReadMessageId) return;
      readStore.setRead(
        payload.chatId,
        payload.userId,
        payload.lastReadMessageId,
        payload.readAt
      );
    };
  }
  if (socketListenerCount === 0) {
    socket.on("chat:readUpdate", socketHandler);
  }
  socketListenerCount += 1;
  return () => {
    socketListenerCount -= 1;
    if (socketListenerCount <= 0) {
      socketListenerCount = 0;
      socket.off("chat:readUpdate", socketHandler);
    }
  };
}

function getLastReadableMessageId(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m) continue;
    if (String(m.type) === "system") continue;
    const mid = String(m.id || m._id || "");
    if (mid) return mid;
  }
  return "";
}

export function resolveSeenByMessage({ messages, readMapForChat, currentUserId }) {
  const map = new Map();
  const indexMap = new Map();
  messages.forEach((m, idx) => {
    const mid = String(m?.id || m?._id || "");
    if (mid) indexMap.set(mid, idx);
  });

  Object.entries(readMapForChat || {}).forEach(([uid, read]) => {
    if (String(uid) === String(currentUserId)) return;
    const readId = String(read?.lastReadMessageId || "");
    if (!readId) return;
    let targetIdx = indexMap.get(readId);
    if (targetIdx === undefined) {
      const readAt = read?.readAt ? new Date(read.readAt).getTime() : NaN;
      if (!Number.isNaN(readAt)) {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const ts = getMessageTimestamp(messages[i]);
          if (!ts) continue;
          const t = new Date(ts).getTime();
          if (Number.isNaN(t)) continue;
          if (t <= readAt) {
            targetIdx = i;
            break;
          }
        }
      }
    }
    if (targetIdx === undefined) return;
    const targetId = String(messages[targetIdx]?.id || messages[targetIdx]?._id || "");
    if (!targetId) return;
    const readers = map.get(targetId) || [];
    readers.push({ userId: uid, readAt: read?.readAt || null });
    map.set(targetId, readers);
  });

  return map;
}

export default function useReadReceipts({
  accessToken,
  chatId,
  userId,
  messages,
  isAtBottom,
  isActive,
  enabled = true,
}) {
  const [readByChat, setReadByChat] = useState(readStore.readByChat);
  const lastReadEmitRef = useRef({});

  useEffect(() => {
    const listener = (next) => setReadByChat(next);
    readStore.listeners.add(listener);
    return () => readStore.listeners.delete(listener);
  }, []);

  useEffect(() => ensureSocketListener(), []);

  useEffect(() => {
    if (!accessToken || !chatId) return;
    chatsApi
      .getReads(accessToken, chatId)
      .then((data) => {
        const next = {};
        (data.reads || []).forEach((r) => {
          if (!r?.userId || !r?.lastReadMessageId) return;
          next[String(r.userId)] = {
            lastReadMessageId: String(r.lastReadMessageId),
            readAt: r.readAt || null,
          };
        });
        readStore.setChatReads(chatId, next);
      })
      .catch(() => {});
  }, [accessToken, chatId]);

  useEffect(() => {
    if (!chatId || !enabled) return;
    if (!isActive) return;
    addActiveChat(chatId);
    return () => removeActiveChat(chatId);
  }, [chatId, enabled, isActive]);

  useEffect(() => {
    if (!chatId || !enabled || !isActive) return;
    if (!isAtBottom) return;
    if (document.visibilityState === "hidden") return;
    if (!messages || messages.length === 0) return;
    const lastId = getLastReadableMessageId(messages);
    if (!lastId) return;
    const chatKey = String(chatId);
    if (lastReadEmitRef.current[chatKey] === lastId) return;
    const readAt = new Date().toISOString();
    socket.emit("chat:read", { chatId, lastReadMessageId: lastId });
    markChatRead(chatId, readAt, lastId);
    lastReadEmitRef.current[chatKey] = lastId;
  }, [chatId, enabled, isActive, isAtBottom, messages]);

  return {
    readMapForChat: readByChat[String(chatId)] || {},
  };
}
