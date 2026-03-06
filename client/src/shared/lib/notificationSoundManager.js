const SOUND_SRC = "/sounds/message_notification_sound.mp3";
const GLOBAL_COOLDOWN_MS = 3000;
const PER_CHAT_COOLDOWN_MS = 3000;
const BURST_WINDOW_MS = 15000;
const BURST_THRESHOLD = 10;
const BURST_SILENCE_MS = 30000;

const state = {
  audio: null,
  initialized: false,
  soundBlocked: false,
  lastPlayedAtGlobal: 0,
  lastPlayedAtByChatId: new Map(),
  incomingAt: [],
  silencedUntil: 0,
};

function ensureAudio() {
  if (state.audio) return state.audio;
  const audio = new Audio(SOUND_SRC);
  audio.preload = "auto";
  audio.volume = 0.65;
  state.audio = audio;
  return audio;
}

function pruneOldIncoming(now) {
  state.incomingAt = state.incomingAt.filter((ts) => now - ts <= BURST_WINDOW_MS);
}

function emitSilencedNotice(until) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("message-sound:silenced", {
      detail: {
        message: "Notifications silenced temporarily (too many messages).",
        until,
      },
    })
  );
}

async function tryPlay() {
  const audio = ensureAudio();
  try {
    audio.currentTime = 0;
    await audio.play();
    state.soundBlocked = false;
    return true;
  } catch {
    state.soundBlocked = true;
    return false;
  }
}

export function initMessageNotificationSound() {
  if (state.initialized || typeof window === "undefined") return;
  state.initialized = true;
  ensureAudio();
  window.addEventListener("pointerdown", primeMessageNotificationSound, { passive: true });
  window.addEventListener("keydown", primeMessageNotificationSound);
}

export async function primeMessageNotificationSound() {
  const audio = ensureAudio();
  const prevVolume = audio.volume;
  try {
    audio.volume = 0;
    audio.currentTime = 0;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    state.soundBlocked = false;
  } catch {
    state.soundBlocked = true;
  } finally {
    audio.volume = prevVolume;
  }
}

export const NotificationSoundManager = {
  get soundBlocked() {
    return state.soundBlocked;
  },
  onIncomingMessage({ chatId }) {
    const chatKey = String(chatId || "");
    if (!chatKey) return { played: false, reason: "missing_chat_id" };

    const now = Date.now();
    pruneOldIncoming(now);
    state.incomingAt.push(now);

    if (state.incomingAt.length >= BURST_THRESHOLD) {
      if (now >= state.silencedUntil) {
        state.silencedUntil = now + BURST_SILENCE_MS;
        emitSilencedNotice(state.silencedUntil);
      }
      return { played: false, reason: "burst_silenced" };
    }

    if (now < state.silencedUntil) {
      return { played: false, reason: "silenced" };
    }

    if (now - state.lastPlayedAtGlobal < GLOBAL_COOLDOWN_MS) {
      return { played: false, reason: "global_cooldown" };
    }

    const lastByChat = state.lastPlayedAtByChatId.get(chatKey) || 0;
    if (now - lastByChat < PER_CHAT_COOLDOWN_MS) {
      return { played: false, reason: "chat_cooldown" };
    }

    return tryPlay().then((played) => {
      if (played) {
        state.lastPlayedAtGlobal = now;
        state.lastPlayedAtByChatId.set(chatKey, now);
      }
      return { played, reason: played ? "played" : "blocked" };
    });
  },
};

export function playMessageNotificationSound(chatId = "default") {
  return NotificationSoundManager.onIncomingMessage({ chatId });
}
