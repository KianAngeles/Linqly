const API = import.meta.env.VITE_API_URL;

export const messagesApi = {
  async list(accessToken, chatId, cursor) {
    const url = new URL(`${API}/messages`);
    url.searchParams.set("chatId", chatId);
    if (cursor) url.searchParams.set("cursor", cursor);

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to load messages");
    return data;
  },

  async send(accessToken, chatId, text, replyTo = null) {
    const start = performance.now();
    const r = await fetch(`${API}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ chatId, text, replyTo }),
    });

    const data = await r.json();
    if (import.meta.env.DEV) {
      const elapsed = Math.round(performance.now() - start);
      console.debug("[chat] send text", { chatId, elapsedMs: elapsed, ok: r.ok });
    }
    if (!r.ok) throw new Error(data.message || "Failed to send");
    return data;
  },

  async sendImage(accessToken, chatId, file, replyTo = null) {
    const form = new FormData();
    form.append("image", file);
    form.append("chatId", chatId);
    if (replyTo) form.append("replyTo", replyTo);

    const r = await fetch(`${API}/messages/image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
      body: form,
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to upload image");
    return data;
  },

  async sendFile(accessToken, chatId, file, replyTo = null) {
    const form = new FormData();
    form.append("file", file);
    form.append("chatId", chatId);
    if (replyTo) form.append("replyTo", replyTo);

    const r = await fetch(`${API}/messages/file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
      body: form,
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to upload file");
    return data;
  },

  async sendVoice(accessToken, chatId, file, replyTo = null) {
    const form = new FormData();
    form.append("voice", file);
    form.append("chatId", chatId);
    if (replyTo) form.append("replyTo", replyTo);

    const r = await fetch(`${API}/messages/voice`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
      body: form,
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to upload voice");
    return data;
  },

  // ✅ add this
  async react(accessToken, messageId, emoji) {
    const r = await fetch(`${API}/messages/${messageId}/react`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ emoji }),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to react");
    return data; // { ok: true, reactions: [...] }
  },

  // ✅ add this
  async unreact(accessToken, messageId) {
    const r = await fetch(`${API}/messages/${messageId}/unreact`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to unreact");
    return data;
  },

  async delete(accessToken, messageId) {
    const r = await fetch(`${API}/messages/${messageId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to delete message");
    return data;
  },

  async sendSystem(accessToken, chatId, text) {
    const r = await fetch(`${API}/messages/system`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ chatId, text }),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to send system message");
    return data;
  },

  async sendCallLog(accessToken, chatId, callStatus, durationSec = 0, callType = "audio") {
    const r = await fetch(`${API}/messages/call-log`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ chatId, callType, callStatus, durationSec }),
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to send call log");
    return data;
  },

  async downloadFile(accessToken, messageId) {
    const r = await fetch(`${API}/messages/${messageId}/download`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.message || "Failed to download file");
    }
    return r.blob();
  },

  async listAttachments(accessToken, chatId, kind, limit = 12) {
    const url = new URL(`${API}/messages/attachments`);
    url.searchParams.set("chatId", chatId);
    url.searchParams.set("kind", kind);
    url.searchParams.set("limit", String(limit));

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to load attachments");
    return data;
  },

};
