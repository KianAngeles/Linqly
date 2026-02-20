const configuredApiBase = import.meta.env.VITE_API_URL;
export const API_BASE =
  (configuredApiBase ? configuredApiBase.trim().replace(/\/+$/, "") : "") ||
  (typeof window !== "undefined" ? window.location.origin : "");

let sessionAccessToken = null;
let refreshPromise = null;

function resolveUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input && typeof input.url === "string") return input.url;
  return "";
}

function extractBearerToken(headers) {
  const raw = headers.get("Authorization") || headers.get("authorization");
  if (!raw || !raw.startsWith("Bearer ")) return "";
  return raw.slice(7).trim();
}

function isRefreshEndpoint(url) {
  return /\/auth\/refresh(?:\?|$)/.test(url);
}

function isFormLikeBody(body) {
  return (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer
  );
}

function emitTokenRefreshed(accessToken) {
  if (typeof window === "undefined" || !accessToken) return;
  window.dispatchEvent(
    new CustomEvent("auth:access-token-refreshed", {
      detail: { accessToken },
    })
  );
}

export function syncAccessToken(accessToken) {
  sessionAccessToken = accessToken || null;
}

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.accessToken) {
      sessionAccessToken = null;
      const message = data?.message || "Unable to refresh access token";
      throw new Error(message);
    }

    sessionAccessToken = data.accessToken;
    emitTokenRefreshed(data.accessToken);
    return data.accessToken;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function authFetch(input, init = {}) {
  const requestUrl = resolveUrl(input);
  const headers = new Headers(init.headers || {});
  const requestToken = extractBearerToken(headers);
  const hasBearerToken = Boolean(requestToken);
  const tokenToUse = hasBearerToken ? (sessionAccessToken || requestToken) : "";

  if (tokenToUse) {
    headers.set("Authorization", `Bearer ${tokenToUse}`);
  }

  const options = {
    ...init,
    credentials: init.credentials || "include",
    headers,
  };

  let response = await fetch(input, options);

  const shouldAttemptRefresh =
    response.status === 401 &&
    hasBearerToken &&
    !isRefreshEndpoint(requestUrl);

  if (!shouldAttemptRefresh) return response;

  try {
    const refreshedToken = await refreshAccessToken();
    const retryHeaders = new Headers(headers);
    retryHeaders.set("Authorization", `Bearer ${refreshedToken}`);
    response = await fetch(input, {
      ...options,
      headers: retryHeaders,
    });
  } catch {
    // Keep original 401 response behavior if refresh fails.
  }

  return response;
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body && !isFormLikeBody(options.body)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await authFetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || "Request failed";
    throw new Error(msg);
  }
  return data;
}
