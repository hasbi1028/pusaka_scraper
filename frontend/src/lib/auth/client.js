const API_BASE = '';

const ACCESS_KEY = 'auth_access_token';
const REFRESH_KEY = 'auth_refresh_token';
const LEGACY_ACCESS_KEY = 'access_token';

export const SESSION_EXPIRED = 'SESSION_EXPIRED';

let refreshInFlight = null;

class SessionExpiredError extends Error {
  constructor() {
    super(SESSION_EXPIRED);
    this.code = SESSION_EXPIRED;
  }
}

function parseErrorText(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.error || fallback;
  } catch {
    return raw || fallback;
  }
}

function buildHeaders(initHeaders, body, accessToken) {
  const headers = new Headers(initHeaders || {});
  if (body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return headers;
}

export function getTokens() {
  const legacyAccess = localStorage.getItem(LEGACY_ACCESS_KEY) || '';
  let accessToken = localStorage.getItem(ACCESS_KEY) || '';
  const refreshToken = localStorage.getItem(REFRESH_KEY) || '';

  // One-time migration from old key used by previous frontend implementation.
  if (!accessToken && legacyAccess) {
    accessToken = legacyAccess;
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.removeItem(LEGACY_ACCESS_KEY);
  }

  return { accessToken, refreshToken };
}

export function setTokens({ accessToken, refreshToken }) {
  if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(LEGACY_ACCESS_KEY);
}

export async function login(username, password) {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) {
    const raw = await res.text();
    throw new Error(parseErrorText(raw, 'Login gagal'));
  }
  const data = await res.json();
  setTokens({ accessToken: data.access_token || '', refreshToken: data.refresh_token || '' });
  return data;
}

export async function logout() {
  const { refreshToken } = getTokens();
  try {
    if (refreshToken) {
      await fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
    }
  } catch {
    // Best-effort logout; token cleanup still happens locally.
  } finally {
    clearTokens();
  }
}

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const { refreshToken } = getTokens();
    if (!refreshToken) throw new SessionExpiredError();

    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!res.ok) throw new SessionExpiredError();

    const data = await res.json();
    const accessToken = data?.access_token || '';
    if (!accessToken) throw new SessionExpiredError();

    setTokens({ accessToken });
    return accessToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function rawFetch(path, init, accessToken) {
  const body = init?.body;
  const headers = buildHeaders(init?.headers, body, accessToken);
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });
}

async function parseResponse(res, fallbackError) {
  if (res.status === 204) return null;
  if (!res.ok) {
    const raw = await res.text();
    throw new Error(parseErrorText(raw, fallbackError));
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

export async function apiFetch(path, init = {}) {
  const { accessToken } = getTokens();
  let res = await rawFetch(path, init, accessToken);
  if (res.status !== 401) {
    return parseResponse(res, 'Request gagal');
  }

  try {
    const newAccess = await refreshAccessToken();
    res = await rawFetch(path, init, newAccess);
    if (res.status === 401) {
      throw new SessionExpiredError();
    }
    return parseResponse(res, 'Request gagal');
  } catch (err) {
    clearTokens();
    if (err instanceof SessionExpiredError) throw err;
    throw new SessionExpiredError();
  }
}
