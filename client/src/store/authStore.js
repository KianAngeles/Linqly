import { authApi } from "../api/auth.api";

let accessToken = null;
let user = null;

export function getAccessToken() {
  return accessToken;
}
export function getUser() {
  return user;
}

export async function bootstrapAuth() {
  // Try to refresh to get a new access token on page load
  try {
    const r = await authApi.refresh();
    accessToken = r.accessToken;
    const me = await authApi.me(accessToken);
    user = me.user;
    return { user, accessToken };
  } catch {
    accessToken = null;
    user = null;
    return { user: null, accessToken: null };
  }
}

export async function login(email, password) {
  const r = await authApi.login({ email, password });
  accessToken = r.accessToken;
  user = r.user;
  return r;
}

export async function register(username, email, password) {
  const r = await authApi.register({ username, email, password });
  accessToken = r.accessToken;
  user = r.user;
  return r;
}

export async function logout() {
  await authApi.logout();
  accessToken = null;
  user = null;
}
