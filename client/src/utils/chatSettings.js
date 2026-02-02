const DEFAULT_SETTINGS = {
  muteUntil: null,
  readReceipts: true,
  typingIndicators: true,
  nickname: "",
  blocked: false,
  clearedAt: null,
};

const SETTINGS_PREFIX = "linqly.chatSettings.";

export function getDefaultChatSettings() {
  return { ...DEFAULT_SETTINGS };
}

export function loadChatSettings(chatId) {
  if (!chatId) return getDefaultChatSettings();
  try {
    const raw = localStorage.getItem(`${SETTINGS_PREFIX}${chatId}`);
    if (!raw) return getDefaultChatSettings();
    const parsed = JSON.parse(raw);
    return { ...getDefaultChatSettings(), ...parsed };
  } catch {
    return getDefaultChatSettings();
  }
}

export function saveChatSettings(chatId, settings) {
  if (!chatId) return;
  try {
    localStorage.setItem(
      `${SETTINGS_PREFIX}${chatId}`,
      JSON.stringify(settings)
    );
  } catch {}
}
