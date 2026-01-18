import { apiFetch } from "./http";

export const authApi = {
  register: (body) => apiFetch("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => apiFetch("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  refresh: () => apiFetch("/auth/refresh", { method: "POST" }),
  me: (accessToken) =>
    apiFetch("/auth/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  logout: () => apiFetch("/auth/logout", { method: "POST" }),

  forgotPassword: (body) => apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify(body) }),
  resetPassword: (body) => apiFetch("/auth/reset-password", { method: "POST", body: JSON.stringify(body) }),

};

