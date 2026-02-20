import { authFetch } from "./http";
const API = import.meta.env.VITE_API_URL;

export const messageRequestsApi = {
  async send(accessToken, toUserId, text) {
    const r = await authFetch(`${API}/message-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ toUserId, text }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to send message request");
    return data;
  },

  async list(accessToken, limit = 8) {
    const url = new URL(`${API}/message-requests`);
    url.searchParams.set("limit", String(limit));
    const r = await authFetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to load message requests");
    return data;
  },

  async getById(accessToken, requestId, cursor = "") {
    const url = new URL(`${API}/message-requests/${requestId}`);
    if (cursor) url.searchParams.set("cursor", cursor);
    const r = await authFetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to load message request");
    return data;
  },

  async accept(accessToken, requestId) {
    const r = await authFetch(`${API}/message-requests/${requestId}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to accept request");
    return data;
  },

  async decline(accessToken, requestId) {
    const r = await authFetch(`${API}/message-requests/${requestId}/decline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to decline request");
    return data;
  },

  async ignore(accessToken, requestId) {
    const r = await authFetch(`${API}/message-requests/${requestId}/ignore`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to ignore request");
    return data;
  },
};
