import { useMemo, useState } from "react";

export default function useFindInChat({ visibleMessages }) {
  const [findQuery, setFindQuery] = useState("");

  const findResults = useMemo(() => {
    const q = String(findQuery || "").trim().toLowerCase();
    if (!q) return [];
    return visibleMessages.filter((m) => {
      if (m.type !== "text") return false;
      const text = String(m.text || "").toLowerCase();
      return text.includes(q);
    });
  }, [findQuery, visibleMessages]);

  function highlightMatches(text, query) {
    const source = String(text || "");
    const q = String(query || "").toLowerCase();
    if (!q) return [{ text: source, isMatch: false }];
    const lower = source.toLowerCase();
    const parts = [];
    let idx = 0;
    while (idx < source.length) {
      const hit = lower.indexOf(q, idx);
      if (hit === -1) {
        parts.push({ text: source.slice(idx), isMatch: false });
        break;
      }
      if (hit > idx) {
        parts.push({ text: source.slice(idx, hit), isMatch: false });
      }
      parts.push({ text: source.slice(hit, hit + q.length), isMatch: true });
      idx = hit + q.length;
    }
    return parts;
  }

  function jumpToMessage(messageId) {
    if (!messageId) return;
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("msg-jump-highlight");
    setTimeout(() => {
      el.classList.remove("msg-jump-highlight");
    }, 1600);
  }

  return {
    findQuery,
    setFindQuery,
    findResults,
    highlightMatches,
    jumpToMessage,
  };
}
