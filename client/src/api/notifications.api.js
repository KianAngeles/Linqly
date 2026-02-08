import { apiFetch } from "./http";

export const notificationsApi = {
  list: (accessToken) =>
    apiFetch("/notifications", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  markRead: (accessToken, notificationId) =>
    apiFetch("/notifications/read", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ notificationId }),
    }),
  markAllRead: (accessToken) =>
    apiFetch("/notifications/read-all", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  clearRead: (accessToken, notificationIds = []) =>
    apiFetch("/notifications/clear-read", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ notificationIds }),
    }),
};
