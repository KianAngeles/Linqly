import { useMemo, useState } from "react";

export default function useMentionsAndEmoji({ selectedChatMembers }) {
  const [text, setText] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const mentionCandidates = useMemo(() => {
    const members = selectedChatMembers || [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => {
      const name = String(m?.username || "").toLowerCase();
      return name && (!q || name.startsWith(q));
    });
  }, [selectedChatMembers, mentionQuery]);

  function onChangeText(value) {
    setText(value);

    const at = value.lastIndexOf("@");
    if (at === -1) {
      setShowMentions(false);
      setMentionQuery("");
      return;
    }

    const after = value.slice(at + 1);
    if (!/^[a-zA-Z0-9_]*$/.test(after)) {
      setShowMentions(false);
      setMentionQuery("");
      return;
    }

    setMentionQuery(after);
    setShowMentions(true);
  }

  function insertMention(username) {
    if (!text.includes("@")) return;
    const next = text.replace(/@[\w]*$/, `@${username} `);
    setText(next);
    setShowMentions(false);
    setMentionQuery("");
  }

  function insertEmoji(emoji) {
    if (!emoji?.native) return;
    setText((prev) => `${prev}${emoji.native}`);
  }

  function handleToggleEmojiPicker() {
    setShowEmojiPicker((v) => !v);
  }

  return {
    text,
    setText,
    showMentions,
    setShowMentions,
    mentionQuery,
    setMentionQuery,
    showEmojiPicker,
    setShowEmojiPicker,
    mentionCandidates,
    onChangeText,
    insertMention,
    insertEmoji,
    handleToggleEmojiPicker,
  };
}
