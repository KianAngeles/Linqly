import { escapeRegExp } from "./strings";

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "💀"];

export function getMessageTimestamp(message) {
  return message?.createdAt || message?.sentAt || message?.updatedAt || null;
}

export function renderMessageText(m) {
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
