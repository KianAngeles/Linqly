import { useCallback, useEffect, useState } from "react";
import { chatsApi } from "../../api/chats.api";
import {
  getDefaultChatSettings,
  loadChatSettings,
  saveChatSettings,
} from "../../utils/chatSettings";

export default function useChatSettingsPanel({
  accessToken,
  selectedChatId,
  refreshChatSettings,
  loadChats,
  setErr,
}) {
  const [chatSettings, setChatSettings] = useState(getDefaultChatSettings());
  const [openSection, setOpenSection] = useState("personalization");
  const [showMuteMenu, setShowMuteMenu] = useState(false);

  const updateChatSettings = useCallback(
    (patch) => {
      if (!selectedChatId) return;
      const next = { ...chatSettings, ...patch };
      setChatSettings(next);
      saveChatSettings(selectedChatId, next);
    },
    [chatSettings, selectedChatId]
  );

  const setChatMute = useCallback(
    async (chatId, durationMs) => {
      if (!chatId) return;
      const nextUntil = durationMs ? Date.now() + durationMs : null;
      const current = loadChatSettings(chatId);
      const nextSettings = { ...current, muteUntil: nextUntil };
      saveChatSettings(chatId, nextSettings);
      if (String(selectedChatId) === String(chatId)) {
        setChatSettings(nextSettings);
      }
      try {
        await chatsApi.updateSettings(accessToken, chatId, {
          isMuted: Boolean(nextUntil),
        });
        await loadChats();
        await refreshChatSettings();
      } catch (e) {
        setErr(e.message);
      }
    },
    [accessToken, loadChats, refreshChatSettings, selectedChatId, setErr]
  );

  useEffect(() => {
    if (!selectedChatId) {
      setChatSettings(getDefaultChatSettings());
      return;
    }
    setChatSettings(loadChatSettings(selectedChatId));
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId) return;
    if (chatSettings.muteUntil && chatSettings.muteUntil <= Date.now()) {
      setChatMute(selectedChatId, null);
    }
  }, [chatSettings.muteUntil, selectedChatId, setChatMute]);

  return {
    chatSettings,
    setChatSettings,
    openSection,
    setOpenSection,
    showMuteMenu,
    setShowMuteMenu,
    updateChatSettings,
    setChatMute,
  };
}
