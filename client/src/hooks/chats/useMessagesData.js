import { useCallback, useState } from "react";
import { messagesApi } from "../../api/messages.api";
import { loadChatSettings } from "../../utils/chatSettings";

export default function useMessagesData({
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
}) {
  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const loadMessages = useCallback(
    async (chatId) => {
      const data = await messagesApi.list(accessToken, chatId);
      const clearedAt = loadChatSettings(chatId)?.clearedAt;
      const filtered = clearedAt
        ? data.messages.filter((m) => {
            const ts = new Date(m.createdAt || m.sentAt || m.updatedAt).getTime();
            return Number.isNaN(ts) ? true : ts > clearedAt;
          })
        : data.messages;
      setMessages([...filtered].reverse());
      setNextCursor(data.nextCursor || null);
    },
    [accessToken, loadChatSettings]
  );

  const loadOlder = useCallback(async () => {
    if (!selectedChatId || !nextCursor || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const data = await messagesApi.list(accessToken, selectedChatId, nextCursor);
      const clearedAt = loadChatSettings(selectedChatId)?.clearedAt;
      const filtered = clearedAt
        ? data.messages.filter((m) => {
            const ts = new Date(m.createdAt || m.sentAt || m.updatedAt).getTime();
            return Number.isNaN(ts) ? true : ts > clearedAt;
          })
        : data.messages;
      const batch = [...filtered].reverse();
      setMessages((prev) => [...batch, ...prev]);
      setNextCursor(data.nextCursor || null);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [accessToken, isLoadingOlder, loadChatSettings, nextCursor, selectedChatId]);

  const send = useCallback(
    async (e) => {
      e.preventDefault();
      if (!selectedChatId) return;
      if (isBlocked) return;
      if (!text.trim()) return;

      const outgoingText = text.trim();
      setErr("");
      setText("");
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingTextQueueRef?.current?.push(tempId);
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          chatId: selectedChatId,
          sender: { id: user?.id, username: user?.username },
          type: "text",
          text: outgoingText,
          createdAt: new Date().toISOString(),
          pending: true,
        },
      ]);
      try {
        await messagesApi.send(
          accessToken,
          selectedChatId,
          outgoingText,
          replyingTo?.id
        );
        setReplyingTo(null);
        setShowMentions(false);
        setMentionQuery("");
        setShowEmojiPicker(false);
      } catch (e) {
        if (pendingTextQueueRef?.current) {
          pendingTextQueueRef.current = pendingTextQueueRef.current.filter(
            (id) => id !== tempId
          );
        }
        setMessages((prev) =>
          prev.filter((m) => String(m.id || m._id) !== String(tempId))
        );
        setErr(e.message);
      }
    },
    [
      accessToken,
      isBlocked,
      pendingTextQueueRef,
      replyingTo?.id,
      selectedChatId,
      setErr,
      setMentionQuery,
      setReplyingTo,
      setShowEmojiPicker,
      setShowMentions,
      setText,
      text,
      user?.id,
      user?.username,
      setMessages,
    ]
  );

  const sendQuick = useCallback(
    async (value) => {
      if (!selectedChatId) return;
      if (isBlocked) return;
      const clean = String(value || "").trim();
      if (!clean) return;
      setErr("");
      setText("");
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingTextQueueRef?.current?.push(tempId);
      setMessages((prev) => [
        ...prev,
        {
          id: tempId,
          chatId: selectedChatId,
          sender: { id: user?.id, username: user?.username },
          type: "text",
          text: clean,
          createdAt: new Date().toISOString(),
          pending: true,
        },
      ]);
      try {
        await messagesApi.send(
          accessToken,
          selectedChatId,
          clean,
          replyingTo?.id
        );
        setReplyingTo(null);
        setShowMentions(false);
        setMentionQuery("");
        setShowEmojiPicker(false);
      } catch (e) {
        if (pendingTextQueueRef?.current) {
          pendingTextQueueRef.current = pendingTextQueueRef.current.filter(
            (id) => id !== tempId
          );
        }
        setMessages((prev) =>
          prev.filter((m) => String(m.id || m._id) !== String(tempId))
        );
        setErr(e.message);
      }
    },
    [
      accessToken,
      isBlocked,
      pendingTextQueueRef,
      replyingTo?.id,
      selectedChatId,
      setErr,
      setMentionQuery,
      setReplyingTo,
      setShowEmojiPicker,
      setShowMentions,
      setMessages,
      user?.id,
      user?.username,
    ]
  );

  const sendImage = useCallback(
    async (file) => {
      if (!selectedChatId || !file) return;
      if (isBlocked) return;
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
    },
    [
      accessToken,
      isBlocked,
      pendingImageQueueRef,
      pendingImageUrlsRef,
      replyingTo?.id,
      selectedChatId,
      setErr,
      setReplyingTo,
      user?.id,
      user?.username,
    ]
  );

  const sendVoice = useCallback(
    async (file) => {
      if (!selectedChatId || !file) return;
      if (isBlocked) return;
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
    },
    [
      accessToken,
      isBlocked,
      pendingImageQueueRef,
      pendingImageUrlsRef,
      replyingTo?.id,
      selectedChatId,
      setErr,
      setReplyingTo,
      user?.id,
      user?.username,
    ]
  );

  return {
    messages,
    setMessages,
    loadMessages,
    loadOlder,
    hasMore: Boolean(nextCursor),
    isLoadingOlder,
    send,
    sendQuick,
    sendImage,
    sendVoice,
  };
}
