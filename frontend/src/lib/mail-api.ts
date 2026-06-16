// Mail API client — a parallel of lib/api.ts for the internal mail
// module. It is COMPLETELY independent of the LMS session:
//   - its own token storage keys (mail_access_token / mail_refresh_token),
//   - its own refresh path (POST /api/mail/auth/refresh),
//   - its own 401 redirect (/mail/login).
// It never reads or writes the LMS access_token / refresh_token, sets no
// shared cookie, and never calls the LMS refresh endpoint.
//
// Base URL resolution (mirrors lib/api.ts; fallback host copied verbatim
// from its API_BASE_URL).
//
// NOTE: NEXT_PUBLIC_API_URL is inlined into the bundle at BUILD time, not
// read at runtime — so changing it on Vercel only takes effect after a
// fresh deploy/rebuild. Env var FIRST (with any trailing slash stripped so
// "/api/mail/..." endpoints build a single-slash URL, never "<base>//api"),
// else the Spire backend; localhost for `next dev`.
export const MAIL_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "")
  || (process.env.NODE_ENV === "production"
      ? "https://spireinfotech-production.up.railway.app"
      : "http://localhost:8080");

const BASE_URL = MAIL_API_BASE_URL;

// Mail-only storage keys — MUST never collide with the LMS keys.
const ACCESS_KEY = "mail_access_token";
const REFRESH_KEY = "mail_refresh_token";

// ─── Types ──────────────────────────────────────────────────────────

// Spring Boot wraps every response in ApiResponse<T>.
interface MailApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

/** Non-sensitive mail account view (mirrors backend MailAccountSummary). */
export interface MailAccountSummary {
  id: number;
  email: string;
  displayName: string | null;
  role: string;   // USER | ADMIN | SUPER_ADMIN
  status: string; // ACTIVE | SUSPENDED
  mustChangePassword: boolean;
  domain: string;
  entityName: string;
}

/** A full mail session (refresh / change-password return this). */
export interface MailSession {
  accessToken: string;
  refreshToken: string;
  account: MailAccountSummary;
}

/**
 * /login always returns a full session (accessToken + refreshToken + account).
 * A must-change account also gets a (gated) session; the signal is read from
 * account.mustChangePassword, which routes the client to the change screen.
 */
export interface MailLoginResult {
  accessToken?: string;
  refreshToken?: string;
  account: MailAccountSummary;
}

// ─── Token storage (mail-only) ──────────────────────────────────────

export function getMailAccessToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(ACCESS_KEY) : null;
}

export function getMailRefreshToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(REFRESH_KEY) : null;
}

export function storeMailTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearMailTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ─── Authenticated fetch (one refresh + retry, then redirect) ───────

/**
 * For mail endpoints that REQUIRE a session. On 401 it tries exactly
 * one refresh via the mail refresh path, stores the rotated tokens, and
 * retries the original request once. If refresh (or the retry) fails it
 * clears the mail tokens and redirects to /mail/login. Never touches the
 * LMS session.
 */
export async function mailApiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getMailAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    const refreshed = await tryMailRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${getMailAccessToken()}`;
      const retry = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
      if (retry.ok) return retry.status === 204 ? (undefined as T) : retry.json();
    }
    // Refresh impossible or retry still unauthorized → end the session.
    clearMailTokens();
    if (typeof window !== "undefined") window.location.href = "/mail/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Must-change gate (Phase 19): the session can only reach the change flow.
    // Route there so the user is never stuck on a gated page (also a safety net
    // if a page guard is missed or the frontend lags the backend deploy).
    if (res.status === 403 && body?.message === "Password change required."
        && typeof window !== "undefined"
        && !window.location.pathname.startsWith("/mail/set-password")) {
      window.location.href = "/mail/set-password";
    }
    throw new Error(body?.message || `Request failed (${res.status})`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

/**
 * Authenticated fetch that returns the raw bytes (not JSON) — used by the
 * walled attachment download proxy. Mirrors {@link mailApiFetch}'s token +
 * one-refresh-retry, but returns a Blob. The raw storage/S3 URL is never
 * exposed; the byte stream comes straight from the authenticated proxy.
 */
export async function mailApiFetchBlob(
  endpoint: string,
  options: RequestInit = {},
): Promise<Blob> {
  const token = getMailAccessToken();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
  if (res.status === 401) {
    if (await tryMailRefresh()) {
      headers["Authorization"] = `Bearer ${getMailAccessToken()}`;
      res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
    }
    if (res.status === 401) {
      clearMailTokens();
      if (typeof window !== "undefined") window.location.href = "/mail/login";
      throw new Error("Unauthorized");
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 403 && body?.message === "Password change required."
        && typeof window !== "undefined"
        && !window.location.pathname.startsWith("/mail/set-password")) {
      window.location.href = "/mail/set-password";   // must-change gate (Phase 19) — mirror mailApiFetch
    }
    throw new Error(body?.message || `Download failed (${res.status})`);
  }
  return res.blob();
}

/**
 * One mail-token refresh, exposed for the XHR uploader (XMLHttpRequest can't
 * route through mailApiFetch but must share the same token/refresh source).
 * Returns true if the access token was rotated.
 */
export function mailRefresh(): Promise<boolean> {
  return tryMailRefresh();
}

/**
 * Single refresh against the MAIL refresh path. Stores BOTH rotated
 * tokens on success. Returns false (never throws) on any failure.
 */
async function tryMailRefresh(): Promise<boolean> {
  const refreshToken = getMailRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}/api/mail/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const wrapper: MailApiResponse<MailSession> = await res.json();
    storeMailTokens(wrapper.data.accessToken, wrapper.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// ─── Auth calls (direct fetch) ──────────────────────────────────────
// These do NOT go through mailApiFetch: a 401 here is a credential /
// token error to be surfaced to the user, not an expired session to be
// refreshed-and-redirected. Backend messages are already generic and
// human-readable, so they're surfaced verbatim.

export async function mailLogin(email: string, password: string): Promise<MailLoginResult> {
  const res = await fetch(`${BASE_URL}/api/mail/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json().catch(() => ({}))) as MailApiResponse<MailLoginResult>;
  if (!res.ok) throw new Error(body?.message || `Login failed (${res.status})`);
  return body.data;
}

// ─── Session probe (used at app mount; never redirects) ─────────────

/**
 * Non-redirecting session hydration for the provider's mount. Tries
 * GET /api/mail/me, then one refresh + retry. Returns the account on
 * success, or null (clearing stale tokens) on failure — page-level
 * guards decide whether to redirect, so this never derails a logged-out
 * visitor on, e.g., a /mail/set-password link.
 */
export async function probeMailSession(): Promise<MailAccountSummary | null> {
  const token = getMailAccessToken();
  if (!token) return null;
  try {
    const me = await fetch(`${BASE_URL}/api/mail/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (me.ok) return ((await me.json()) as MailApiResponse<MailAccountSummary>).data;
    if (me.status === 401) {
      // Genuine auth failure: try exactly one refresh, then give up.
      if (await tryMailRefresh()) {
        const me2 = await fetch(`${BASE_URL}/api/mail/me`, {
          headers: { Authorization: `Bearer ${getMailAccessToken()}` },
        });
        if (me2.ok) return ((await me2.json()) as MailApiResponse<MailAccountSummary>).data;
      }
      // 401 with no working refresh → the tokens are dead; clear them.
      clearMailTokens();
      return null;
    }
    // Non-401 (5xx / unexpected): hydrate as anonymous WITHOUT wiping —
    // a transient server error shouldn't force a re-login.
    return null;
  } catch {
    // Network error / offline: keep tokens so a later probe can recover.
    return null;
  }
}

/** Authenticated /me read — goes through mailApiFetch (refresh + redirect). */
export async function getMailMe(): Promise<MailAccountSummary> {
  const wrapper = await mailApiFetch<MailApiResponse<MailAccountSummary>>("/api/mail/me");
  return wrapper.data;
}

/**
 * Authenticated self-change of the logged-in user's own password (forced
 * first-login change, or voluntary). The mail session identifies the account.
 * Returns a FRESH session (Phase 19): the new access token is ungated
 * (must-change cleared), so the caller swaps to it and leaves the change gate.
 */
export async function mailChangePassword(newPassword: string): Promise<MailSession> {
  const wrapper = await mailApiFetch<MailApiResponse<MailSession>>("/api/mail/me/change-password", {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
  return wrapper.data;
}
