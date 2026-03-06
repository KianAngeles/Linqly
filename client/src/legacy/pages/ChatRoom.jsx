import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { messagesApi } from "../api/messages.api";
import { socket } from "../socket";

export default function ChatRoom() {
  const { chatId } = useParams();
  const { accessToken, user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    const data = await messagesApi.list(accessToken, chatId);
    // server returns newest-first; reverse for display
    setMessages([...data.messages].reverse());
  }

  // Join socket room
  useEffect(() => {
    if (!chatId) return;
    socket.emit("chat:join", { chatId });
  }, [chatId]);

  // Fetch messages when opened
  useEffect(() => {
    if (!accessToken || !chatId) return;
    load().catch((e) => setErr(e.message));
  }, [accessToken, chatId]);

  // Listen for realtime message
  useEffect(() => {
    const onNew = (msg) => {
      if (String(msg.chatId) !== String(chatId)) return;
      setMessages((prev) => [...prev, msg]);
    };

    socket.on("message:new", onNew);
    return () => socket.off("message:new", onNew);
  }, [chatId]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      await messagesApi.send(accessToken, chatId, text.trim());
      setText("");
      // NOTE: we don't need to manually append because socket event will come back
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="container py-4" style={{ maxWidth: 900 }}>
      <h3 className="fw-bold mb-3">Chat Room</h3>
      <div className="text-muted small mb-3">chatId: {chatId}</div>
      {err && <div className="alert alert-danger">{err}</div>}

      <div className="border rounded p-3 mb-3" style={{ height: 320, overflowY: "auto" }}>
        {messages.map((m, idx) => (
          <div key={m.id || idx} className="mb-2">
            <div className="small text-muted">
              {String(m.senderId) === String(user?.id) ? "You" : m.senderId}
            </div>
            <div>{m.text}</div>
          </div>
        ))}
      </div>

      <form className="d-flex gap-2" onSubmit={send}>
        <input
          className="form-control"
          placeholder="Type message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn btn-primary" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
