import { apiFetch, API_BASE } from "./http";

export const usersApi = {
  search: (accessToken, query) =>
    apiFetch(`/users/search?query=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  updateMe: (accessToken, patch) =>
    apiFetch("/users/me", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(patch),
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
