import { authFetch } from "./http";
const API = import.meta.env.VITE_API_URL;

export const chatsApi = {
  async createGroup(accessToken, name, memberIds) {
    const r = await authFetch(`${API}/chats/group`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ name, memberIds }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to create group chat");
    return data;
  },

  async createDirect(accessToken, userId) {
    const r = await authFetch(`${API}/chats/direct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ userId }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to create chat");
    return data;
  },

  async list(accessToken) {
    const r = await authFetch(`${API}/chats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to load chats");
    return data;
  },

  async updateSettings(accessToken, chatId, patch) {
    const r = await authFetch(`${API}/chats/${chatId}/settings`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify(patch),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to update settings");
    return data;
  },

  async deleteForMe(accessToken, chatId) {
    const r = await authFetch(`${API}/chats/${chatId}/delete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to delete chat");
    return data;
  },

  async leaveGroup(accessToken, chatId) {
    const r = await authFetch(`${API}/chats/${chatId}/leave`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to leave group");
    return data;
  },

  async addMember(accessToken, chatId, userId) {
    const r = await authFetch(`${API}/chats/${chatId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ userId }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to add member");
    return data;
  },

  async getGroupSettings(accessToken, chatId) {
    const r = await authFetch(`${API}/chats/${chatId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to load group settings");
    return data;
  },

  async updateGroup(accessToken, chatId, patch) {
    const r = await authFetch(`${API}/chats/${chatId}/group`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify(patch),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to update group");
    return data;
  },

  async uploadGroupAvatar(accessToken, chatId, file) {
    const form = new FormData();
    form.append("avatar", file);
    const r = await authFetch(`${API}/chats/${chatId}/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
      body: form,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || "Failed to upload group avatar");
    return data;
  },

  async removeMember(accessToken, chatId, userId) {
    const r = await authFetch(`${API}/chats/${chatId}/members/${userId}/remove`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to remove member");
    return data;
  },

  async makeAdmin(accessToken, chatId, userId) {
    const r = await authFetch(`${API}/chats/${chatId}/admins/${userId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to update admin");
    return data;
  },

  async removeAdmin(accessToken, chatId, userId) {
    const r = await authFetch(`${API}/chats/${chatId}/admins/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to update admin");
    return data;
  },

  async approveJoin(accessToken, chatId, userId) {
    const r = await authFetch(`${API}/chats/${chatId}/join-request/${userId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to approve request");
    return data;
  },

  async rejectJoin(accessToken, chatId, userId) {
    const r = await authFetch(`${API}/chats/${chatId}/join-request/${userId}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to reject request");
    return data;
  },

  async getReads(accessToken, chatId) {
    const r = await authFetch(`${API}/chats/${chatId}/reads`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to load reads");
    return data;
  },

  async getOngoingCallState(accessToken, chatId) {
    const r = await authFetch(`${API}/chats/${chatId}/ongoing-call`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to load ongoing call");
    return data;
  },
};
