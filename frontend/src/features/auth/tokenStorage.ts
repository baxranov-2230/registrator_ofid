/**
 * Token storage.
 *
 * The refresh token is held by the backend in an httpOnly cookie, so no script
 * — including an injected one — can read it. Nothing here ever sees it.
 *
 * The access token stays in memory only: it is short-lived, and keeping it off
 * disk means a stolen localStorage dump yields nothing usable. The cost is that
 * a page reload starts with no access token, which is exactly why the app
 * performs a silent refresh on boot (see restoreSession in authSlice).
 *
 * `royd_session` is the one thing that persists, and it is not a credential —
 * just a flag saying "this browser had a session", so a fresh load knows
 * whether attempting a refresh is worthwhile instead of bouncing to /login.
 */

const SESSION_HINT_KEY = "royd_session";
const LEGACY_REFRESH_KEY = "royd_refresh";
const LEGACY_ACCESS_KEY = "royd_access";
const LEGACY_PERSIST_KEY = "royd_persist";

/** Access token — memory only, deliberately never written to storage. */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/**
 * Whether this browser believes it has a live session.
 *
 * Survives reload and browser restart. It only gates whether the app tries a
 * refresh — the cookie is the actual authority, so a stale hint costs one
 * rejected request and nothing more.
 */
export function hasSessionHint(): boolean {
  return localStorage.getItem(SESSION_HINT_KEY) === "1";
}

export function setSessionHint(active: boolean): void {
  if (active) localStorage.setItem(SESSION_HINT_KEY, "1");
  else localStorage.removeItem(SESSION_HINT_KEY);
}

export function clearTokens(): void {
  accessToken = null;
  setSessionHint(false);
  clearLegacyTokens();
}

/**
 * Drop tokens written by the previous localStorage/sessionStorage scheme.
 *
 * A session that predates the cookie still has a usable refresh token in
 * storage; it is returned once so the boot path can trade it for a cookie
 * session, then erased.
 */
export function takeLegacyRefreshToken(): string | null {
  const legacy =
    sessionStorage.getItem(LEGACY_REFRESH_KEY) ?? localStorage.getItem(LEGACY_REFRESH_KEY);
  clearLegacyTokens();
  return legacy;
}

function clearLegacyTokens(): void {
  sessionStorage.removeItem(LEGACY_REFRESH_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  localStorage.removeItem(LEGACY_PERSIST_KEY);
}
