import { useEffect } from "react";
import { chatsApi } from "../../api/chats.api";
import { socket } from "../../socket";

export default function useChatSocketEvents({
  accessToken,
  selectedChatId,
  selectedChatType,
  userId,
  chatSettingsClearedAt,
  setChats,
  setGroupSettings,
  setMessages,
  loadChats,
  pendingImageQueueRef,
  pendingImageUrlsRef,
  pendingTextQueueRef,
}) {
  useEffect(() => {
    const onNicknamesUpdate = (payload) => {
      if (!payload?.chatId || !payload?.nicknames) return;
      setChats((prev) =>
        prev.map((c) =>
          String(c._id) === String(payload.chatId)
            ? { ...c, nicknames: payload.nicknames }
            : c
        )
      );
      if (String(selectedChatId) === String(payload.chatId)) {
        setGroupSettings((prev) =>
          prev ? { ...prev, nicknames: payload.nicknames } : prev
        );
      }
    };
    socket.on("chat:nicknames", onNicknamesUpdate);
    return () => socket.off("chat:nicknames", onNicknamesUpdate);
  }, [selectedChatId, setChats, setGroupSettings]);

  useEffect(() => {
    const onAvatarUpdate = (payload) => {
      if (!payload?.chatId) return;
      setChats((prev) =>
        prev.map((c) =>
          String(c._id) === String(payload.chatId)
            ? { ...c, avatarUrl: payload.avatarUrl || null }
            : c
        )
      );
      if (String(selectedChatId) === String(payload.chatId)) {
        setGroupSettings((prev) =>
          prev ? { ...prev, avatarUrl: payload.avatarUrl || null } : prev
        );
      }
    };

    socket.on("chat:avatar", onAvatarUpdate);
    return () => socket.off("chat:avatar", onAvatarUpdate);
  }, [selectedChatId, setChats, setGroupSettings]);

  useEffect(() => {
    const onJoinRequest = (payload) => {
      if (!payload?.chatId || !payload?.request) return;
      if (String(payload.chatId) !== String(selectedChatId)) return;
      setGroupSettings((prev) => {
        if (!prev) return prev;
        const pending = prev.pendingJoinRequests || [];
        const exists = pending.some(
          (r) => String(r.user?.id) === String(payload.request.user?.id)
        );
        if (exists) return prev;
        return {
          ...prev,
          pendingJoinRequests: [...pending, payload.request],
        };
      });
    };

    const onJoinRequestResolved = (payload) => {
      if (!payload?.chatId || !payload?.userId) return;
      if (String(payload.chatId) !== String(selectedChatId)) return;
      setGroupSettings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pendingJoinRequests: (prev.pendingJoinRequests || []).filter(
            (r) => String(r.user?.id) !== String(payload.userId)
          ),
        };
      });
    };

    socket.on("chat:join-request", onJoinRequest);
    socket.on("chat:join-request:resolved", onJoinRequestResolved);
    return () => {
      socket.off("chat:join-request", onJoinRequest);
      socket.off("chat:join-request:resolved", onJoinRequestResolved);
    };
  }, [selectedChatId, setGroupSettings]);

  useEffect(() => {
    const onNew = (msg) => {
      loadChats().catch(() => {});

      if (String(msg.chatId) === String(selectedChatId)) {
        if (chatSettingsClearedAt) {
          const ts = new Date(
            msg.createdAt || msg.sentAt || msg.updatedAt
          ).getTime();
          if (!Number.isNaN(ts) && ts <= chatSettingsClearedAt) return;
        }
        const isOwn = String(msg.sender?.id) === String(userId);
        const isTextMessage =
          !msg?.type || String(msg.type) === "text";
        if (isOwn && isTextMessage && pendingTextQueueRef?.current?.length > 0) {
          const tempId = pendingTextQueueRef.current.shift();
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

        const isOwnAttachment =
          ["image", "video", "file", "audio"].includes(msg?.type) &&
          isOwn;
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
        const isGroupChat = selectedChatType === "group";
        const isMemberChange =
          String(msg.type) === "system" &&
          /(added|removed|left the chat|joined the chat|made .* admin|removed .* admin)/i.test(
            String(msg.text || "")
          );
        if (isGroupChat && isMemberChange && accessToken) {
          chatsApi
            .getGroupSettings(accessToken, selectedChatId)
            .then((data) => setGroupSettings(data.chat))
            .catch(() => {});
        }
      }
    };

    socket.on("message:new", onNew);
    return () => socket.off("message:new", onNew);
  }, [
    accessToken,
    selectedChatId,
    selectedChatType,
    userId,
    chatSettingsClearedAt,
    loadChats,
    pendingImageQueueRef,
    pendingImageUrlsRef,
    setMessages,
  ]);

  useEffect(() => {
    const onReaction = (payload) => {
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
  }, [selectedChatId, setMessages]);

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
  }, [selectedChatId, setMessages]);
}
