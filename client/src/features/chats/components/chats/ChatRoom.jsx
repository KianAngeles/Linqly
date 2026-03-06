import { useEffect, useRef, useState } from "react";

export default function ChatRoom({
  selectedChatId,
  header,
  topContent,
  messageList,
  typingIndicator,
  replyPreview,
  composerTopContent,
  composer,
  messageCount = 0,
  onStickToBottomChange,
  onReachTop,
}) {
  const listRef = useRef(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const topTriggeredRef = useRef(false);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop <= 4) {
      if (!topTriggeredRef.current) {
        topTriggeredRef.current = true;
        onReachTop?.();
      }
    } else if (topTriggeredRef.current) {
      topTriggeredRef.current = false;
    }
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < 24;
    setStickToBottom(atBottom);
    onStickToBottomChange?.(atBottom);
  };

  useEffect(() => {
    if (stickToBottom) {
      scrollToBottom();
    }
  }, [messageCount, stickToBottom]);

  useEffect(() => {
    setStickToBottom(true);
    onStickToBottomChange?.(true);
    topTriggeredRef.current = false;
    requestAnimationFrame(scrollToBottom);
  }, [selectedChatId]);

  return (
    <div className="border rounded p-2 chat-room-panel">
      {!selectedChatId ? (
        <div className="text-muted">Select a chat to start.</div>
      ) : (
        <>
          {header}
          {topContent}
          <div
            ref={listRef}
            className=" rounded p-2 mb-2 message-list chat-room-messages"
            style={{ overflowY: "auto" }}
            onScroll={handleScroll}
          >
            {messageList}
          </div>
          {typingIndicator}
          <div className="chat-composer-area">
            {replyPreview}
            {composerTopContent}
            {composer}
          </div>
        </>
      )}
    </div>
  );
}
