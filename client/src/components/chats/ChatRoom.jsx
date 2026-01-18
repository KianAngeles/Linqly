import { useEffect, useRef, useState } from "react";

export default function ChatRoom({
  selectedChatId,
  header,
  topContent,
  messageList,
  replyPreview,
  composer,
  messageCount = 0,
}) {
  const listRef = useRef(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickToBottom(distance < 24);
  };

  useEffect(() => {
    if (stickToBottom) {
      scrollToBottom();
    }
  }, [messageCount, stickToBottom]);

  useEffect(() => {
    setStickToBottom(true);
    requestAnimationFrame(scrollToBottom);
  }, [selectedChatId]);

  return (
    <div className="border rounded p-3 chat-room-panel">
      {!selectedChatId ? (
        <div className="text-muted">Select a chat to start.</div>
      ) : (
        <>
          {header}
          {topContent}
          <div
            ref={listRef}
            className="border rounded p-2 mb-2 message-list chat-room-messages"
            style={{ overflowY: "auto" }}
            onScroll={handleScroll}
          >
            {messageList}
          </div>
          {replyPreview}
          {composer}
        </>
      )}
    </div>
  );
}
