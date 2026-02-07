import { apiFetch, API_BASE } from "./http";

export const usersApi = {
  checkUsername: (username) =>
    apiFetch(`/users/check-username?username=${encodeURIComponent(username)}`),
  search: (accessToken, query, page = 1, limit = 8) =>
    apiFetch(
      `/users/search?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`,
      {
      headers: { Authorization: `Bearer ${accessToken}` },
      }
    ),
  getByUsername: (accessToken, username) =>
    apiFetch(`/users/by-username/${encodeURIComponent(username)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  updateMe: (accessToken, patch) =>
    apiFetch("/users/me", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(patch),
    }),
  getPrivacy: (accessToken) =>
    apiFetch("/users/me/privacy", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  updatePrivacy: (accessToken, privacy) =>
    apiFetch("/users/me/privacy", {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(privacy),
    }),

  uploadAvatar: async (accessToken, file) => {
    const form = new FormData();
    form.append("avatar", file);

    const r = await fetch(`${API_BASE}/users/me/avatar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
      body: form,
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.message || "Failed to upload avatar";
      throw new Error(msg);
    }
    return data;
  },
};
