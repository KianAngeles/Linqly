const API = import.meta.env.VITE_API_URL;

export const hangoutsApi = {
  async feed(accessToken, { lng, lat, radius }) {
    const url = new URL(`${API}/hangouts/feed`);
    url.searchParams.set("lng", lng);
    url.searchParams.set("lat", lat);
    if (radius) url.searchParams.set("radius", radius);

    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to load hangouts");
    return data;
  },

  async create(accessToken, body) {
    const r = await fetch(`${API}/hangouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to create hangout");
    return data;
  },

  async get(accessToken, hangoutId) {
    const r = await fetch(`${API}/hangouts/${hangoutId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to load hangout");
    return data;
  },

  async join(accessToken, hangoutId) {
    const r = await fetch(`${API}/hangouts/${hangoutId}/join`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to join hangout");
    return data;
  },

  async leave(accessToken, hangoutId) {
    const r = await fetch(`${API}/hangouts/${hangoutId}/leave`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to leave hangout");
    return data;
  },

  async remove(accessToken, hangoutId) {
    const r = await fetch(`${API}/hangouts/${hangoutId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to delete hangout");
    return data;
  },

  async update(accessToken, hangoutId, body) {
    const r = await fetch(`${API}/hangouts/${hangoutId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to update hangout");
    return data;
  },

  async shareLocation(accessToken, hangoutId, { lng, lat }) {
    const r = await fetch(`${API}/hangouts/${hangoutId}/share-location`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ lng, lat }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to share location");
    return data;
  },

  async stopSharing(accessToken, hangoutId) {
    const r = await fetch(`${API}/hangouts/${hangoutId}/share-location/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: "include",
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to stop sharing");
    return data;
  },

  async updateShareNote(accessToken, hangoutId, note) {
    const r = await fetch(`${API}/hangouts/${hangoutId}/share-location/note`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ note }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Failed to update note");
    return data;
  },
};
