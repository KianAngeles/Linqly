import { apiFetch } from "./http";

export const notificationsApi = {
  list: (accessToken) =>
    apiFetch("/notifications", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
};
