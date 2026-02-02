import { useCallback, useState } from "react";
import { chatsApi } from "../../api/chats.api";

export default function useChatsData({
  accessToken,
  routeChatId,
  selectedChatId,
  setSelectedChatId,
  navigate,
}) {
  const [chats, setChats] = useState([]);

  const loadChats = useCallback(async () => {
    const data = await chatsApi.list(accessToken);
    setChats(data.chats);

    const hasSelected = selectedChatId
      ? data.chats.some((c) => String(c._id) === String(selectedChatId))
      : false;
    if (selectedChatId && !hasSelected) {
      if (data.chats.length) {
        const nextId = String(data.chats[0]._id);
        setSelectedChatId(nextId);
        navigate(`/app/chats/${nextId}`, { replace: true });
      } else {
        setSelectedChatId("");
        navigate("/app/chats", { replace: true });
      }
      return;
    }

    if (!selectedChatId && !routeChatId && data.chats.length) {
      const nextId = String(data.chats[0]._id);
      setSelectedChatId(nextId);
      navigate(`/app/chats/${nextId}`, { replace: true });
    }
  }, [accessToken, navigate, routeChatId, selectedChatId, setSelectedChatId]);

  const togglePin = useCallback(
    async (c) => {
      await chatsApi.updateSettings(accessToken, c._id, {
        isPinned: !c.settings?.isPinned,
      });
      await loadChats();
    },
    [accessToken, loadChats]
  );

  const toggleIgnore = useCallback(
    async (c) => {
      await chatsApi.updateSettings(accessToken, c._id, {
        isIgnored: !c.settings?.isIgnored,
      });
      await loadChats();
    },
    [accessToken, loadChats]
  );

  const deleteChat = useCallback(
    async (c) => {
      if (!confirm("Delete this chat for you?")) return;
      await chatsApi.deleteForMe(accessToken, c._id);
      await loadChats();
      let clearedSelected = false;
      if (String(selectedChatId) === String(c._id)) {
        setSelectedChatId("");
        clearedSelected = true;
      }
      return clearedSelected;
    },
    [accessToken, loadChats, selectedChatId, setSelectedChatId]
  );

  return {
    chats,
    setChats,
    loadChats,
    togglePin,
    toggleIgnore,
    deleteChat,
  };
}
