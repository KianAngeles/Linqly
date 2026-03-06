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

export async function register(displayName, username, email, password, gender) {
  const r = await authApi.register({
    displayName,
    username,
    email,
    password,
    gender,
  });
  accessToken = r.accessToken;
  user = r.user;
  return r;
}

export async function logout() {
  await authApi.logout();
  accessToken = null;
  user = null;
}
