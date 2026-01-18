import { apiFetch } from "./http";

export const friendsApi = {
  list: (accessToken) =>
    apiFetch("/friends/list", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  presence: (accessToken) =>
    apiFetch("/friends/presence", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),

  request: (accessToken, userId) =>
    apiFetch("/friends/request", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ userId }),
    }),

  accept: (accessToken, userId) =>
    apiFetch("/friends/accept", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ userId }),
    }),

  reject: (accessToken, userId) =>
    apiFetch("/friends/reject", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ userId }),
    }),

  block: (accessToken, userId) =>
    apiFetch("/friends/block", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ userId }),
    }),
  cancel: (accessToken, userId) =>
    apiFetch("/friends/cancel", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ userId }),
    }),

  remove: (accessToken, userId) =>
    apiFetch("/friends/remove", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ userId }),
    }),
};
