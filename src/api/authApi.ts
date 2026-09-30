import type { WorkspaceAccess } from "../auth/access";
import { uid } from "../lib/uid";

export type AuthUser = {
  id?: string;
  _id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  /** Staff only: role label, department and permissions (see auth/access.ts). */
  access?: WorkspaceAccess;
};

export type AuthSession = {
  token?: string;
  user?: AuthUser;
};

type LoginPayload = {
  email: string;
  password: string;
};

type AuthResponse = {
  token?: string;
  accessToken?: string;
  access_token?: string;
  jwt?: string;
  message?: string;
  errors?: Array<{ field?: string; message?: string }>;
  user?: AuthUser;
  data?: {
    token?: string;
    accessToken?: string;
    access_token?: string;
    jwt?: string;
    user?: AuthUser;
  };
};

type AuthResult = {
  message: string;
  session: AuthSession;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
const loginEndpoint = import.meta.env.VITE_LOGIN_ENDPOINT ?? "/api/auth/login";
// Only honour a build-time API token in local development. In a production
// build any VITE_* value is embedded in the shipped JS and readable by anyone,
// so a real token must never be baked in — production auth is the login JWT.
const envApiToken = import.meta.env.DEV ? import.meta.env.VITE_API_TOKEN : undefined;
const tokenStorageKey = "period-buddy-api-token";
const userStorageKey = "period-buddy-auth-user";
// Cookie sessions (backend utils/sessionCookie.js): the token lives in an
// httpOnly cookie the page can't read. localStorage only keeps this marker
// in place of the token, plus when the session ends.
const COOKIE_SESSION = "cookie-session";
const cookieExpiryKey = "period-buddy-session-expires";

/* ------------------------- JWT expiry handling -------------------------- */

/** Decode the payload of a JWT without verifying it (verification is the
 * server's job). Returns null for opaque/local tokens or malformed input. */
function decodeJwtPayload(token: string): { exp?: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as { exp?: number };
  } catch {
    return null;
  }
}

/** True when a JWT carries an `exp` claim that is already in the past.
 * Non-JWT / expiry-less tokens are treated as valid (server will 401 if not). */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  // 10s skew so we don't send a token that expires mid-flight.
  return Date.now() >= payload.exp * 1000 - 10_000;
}

/* --------------------- Unauthorized (401) subscribers ------------------- */

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Register a callback fired whenever the session becomes invalid (expiry or
 * a 401 from the API). Returns an unsubscribe function. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/** Clear the session and notify listeners so the app can redirect to login.
 * Call this from API layers on a 401 response. */
export function handleUnauthorized() {
  clearAuthSession();
  unauthorizedListeners.forEach((fn) => fn());
}

/** True while this browser is signed in with the httpOnly session cookie. */
export function isCookieSession() {
  return localStorage.getItem(tokenStorageKey) === COOKIE_SESSION;
}

function cookieSessionExpired() {
  const expires = Number(localStorage.getItem(cookieExpiryKey) || 0);
  return Boolean(expires) && Date.now() >= expires - 10_000;
}

/**
 * The Bearer token to send, or "" when there is none. In a cookie session
 * this is always "": requests carry the cookie (credentials: "include").
 */
export function getApiToken() {
  const stored = localStorage.getItem(tokenStorageKey);
  if (stored === COOKIE_SESSION) {
    if (cookieSessionExpired()) handleUnauthorized();
    return "";
  }
  if (stored) {
    if (isTokenExpired(stored)) {
      handleUnauthorized();
      return "";
    }
    return stored;
  }
  return envApiToken ?? "";
}

export function getStoredAuthSession(): AuthSession | null {
  if (isCookieSession() && cookieSessionExpired()) clearAuthSession();
  // In a cookie session the marker stands in for the token, so "signed in"
  // checks (session.token) keep working.
  const token = isCookieSession() ? COOKIE_SESSION : getApiToken();
  const user = getStoredUser();

  if (!token && !user) {
    return null;
  }

  return { token, user: user ?? undefined };
}

/**
 * End this browser's session on the server too, so the token stops working
 * now rather than when it expires. Fire and forget: signing out locally
 * must never wait on (or fail because of) the network.
 */
export function revokeSessionOnServer() {
  const cookie = isCookieSession();
  const token = getApiToken();
  if ((!token && !cookie) || !apiBaseUrl) return;
  fetch(`${apiBaseUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json"
    },
    body: "{}",
    credentials: "include",
    keepalive: true,
  }).catch(() => undefined);
}

export function clearAuthSession() {
  localStorage.removeItem(tokenStorageKey);
  localStorage.removeItem(userStorageKey);
  localStorage.removeItem(cookieExpiryKey);
}

function getStoredUser() {
  const stored = localStorage.getItem(userStorageKey);

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as AuthUser;
  } catch {
    localStorage.removeItem(userStorageKey);
    return null;
  }
}

function saveAuthSession(session: AuthSession, cookieExpiresAt?: number) {
  localStorage.removeItem(cookieExpiryKey);
  if (session.token === COOKIE_SESSION && cookieExpiresAt) {
    localStorage.setItem(cookieExpiryKey, String(cookieExpiresAt));
  }
  if (session.token) {
    localStorage.setItem(tokenStorageKey, session.token);
  }

  if (session.user) {
    localStorage.setItem(userStorageKey, JSON.stringify(session.user));
  }
}

/** Replace the stored user (e.g. after GET /api/admin/me refreshes access). */
export function saveStoredUser(user: AuthUser) {
  localStorage.setItem(userStorageKey, JSON.stringify(user));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Authentication request failed.";
}

/**
 * The backend set the session cookie. Check the browser really sends it
 * back (it won't when this site runs on another domain, e.g. a preview
 * deploy) before dropping the token.
 */
async function cookieWorks(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/profile`, { credentials: "include" });
    return response.ok;
  } catch {
    return false;
  }
}

async function parseAuthResponse(response: AuthResponse | undefined, payload: LoginPayload, fallbackMessage: string) {
  const token =
    response?.token ??
    response?.accessToken ??
    response?.access_token ??
    response?.jwt ??
    response?.data?.token ??
    response?.data?.accessToken ??
    response?.data?.access_token ??
    response?.data?.jwt;
  // The backend's sendResponse(res, status, message, data, token) puts the
  // user record directly at response.data (not response.data.user) and the
  // token at the top level — only fall back to response.data.user for APIs
  // that nest it explicitly.
  const user =
    response?.user ??
    response?.data?.user ??
    (response?.data as AuthUser | undefined) ??
    { email: payload.email };
  const cookieMode =
    (user as { sessionMode?: string } | undefined)?.sessionMode === "cookie" && (await cookieWorks());
  const expiresAt = token ? decodeJwtPayload(token)?.exp : undefined;
  const session: AuthSession = { token: cookieMode ? COOKIE_SESSION : token, user };

  saveAuthSession(session, expiresAt ? expiresAt * 1000 : undefined);

  return {
    message: response?.message ?? fallbackMessage,
    session
  };
}

/** Staff and doctors confirm sign-in with an emailed code (backend STAFF_2FA_ENABLED). */
export type LoginChallenge = {
  challengeToken: string;
  /** "totp": the code comes from their authenticator app (or a recovery code). */
  method?: "email" | "totp";
  sentTo?: string;
  expiresInMinutes?: number;
};

export class SecondStepRequired extends Error {
  challenge: LoginChallenge;
  constructor(challenge: LoginChallenge, message: string) {
    super(message);
    this.challenge = challenge;
  }
}

async function postAuth(path: string, body: unknown): Promise<AuthResponse | undefined> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    body: JSON.stringify(body),
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      // Ask for the session in an httpOnly cookie (only honoured for staff
      // when the backend has STAFF_COOKIE_AUTH on).
      "X-Session-Mode": "cookie"
    },
    method: "POST"
  });

  let parsed: AuthResponse | undefined;
  try {
    parsed = (await response.json()) as AuthResponse;
  } catch {
    parsed = undefined;
  }

  if (!response.ok) {
    const validationMessages = parsed?.errors
      ?.map((error) => error.message)
      .filter(Boolean)
      .join(" ");
    throw new Error(
      validationMessages ||
        parsed?.message ||
        `Authentication failed with ${response.status} ${response.statusText}`
    );
  }
  return parsed;
}

/** Second step: the emailed code. Resolves like loginWithEmail. */
export async function verifyLoginCode(challengeToken: string, code: string, email: string): Promise<AuthResult> {
  try {
    const body = await postAuth("/api/auth/login/verify-code", { challengeToken, code });
    return await parseAuthResponse(body, { email, password: "" }, "Logged in successfully.");
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/** Email a new code for the same sign-in. */
export async function resendLoginCode(challengeToken: string): Promise<string> {
  try {
    const body = await postAuth("/api/auth/login/resend-code", { challengeToken });
    return body?.message ?? "We sent you a new code.";
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function loginWithEmail(payload: LoginPayload): Promise<AuthResult> {
  if (!apiBaseUrl) {
    const session = {
      token: `local-${uid()}`,
      user: { email: payload.email, role: "admin" }
    };

    saveAuthSession(session);

    return {
      message: "Logged in locally.",
      session
    };
  }

  let body: AuthResponse | undefined;
  try {
    body = await postAuth(loginEndpoint, payload);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }

  const challenge = body?.data as (LoginChallenge & { twoFactorRequired?: boolean }) | undefined;
  if (challenge?.twoFactorRequired && challenge.challengeToken) {
    throw new SecondStepRequired(challenge, body?.message ?? "Enter the code we emailed you.");
  }

  try {
    return await parseAuthResponse(body, payload, "Logged in successfully.");
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/* ------------------- Two-step sign-in (authenticator app) ------------------ */

export type TwoFactorStatus = {
  /** Is a second step asked at sign-in for this account right now? */
  required: boolean;
  method: "email" | "totp";
  totpEnabledAt: string | null;
  recoveryCodesLeft: number;
};

/** Signed-in request to the API (Bearer token or the session cookie). */
export async function authedRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = getApiToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let parsed: { data?: T; message?: string } | undefined;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }
  if (response.status === 401 && path !== "/api/auth/2fa/totp/disable" && path !== "/api/auth/2fa/recovery-codes") {
    handleUnauthorized();
  }
  if (!response.ok) throw new Error(parsed?.message || `Request failed (${response.status})`);
  return parsed?.data as T;
}

export const twoFactorApi = {
  status: () => authedRequest<TwoFactorStatus>("/api/auth/2fa"),
  setup: () => authedRequest<{ secret: string; otpauthUrl: string }>("/api/auth/2fa/totp/setup", "POST", {}),
  enable: (code: string) =>
    authedRequest<{ recoveryCodes: string[] }>("/api/auth/2fa/totp/enable", "POST", { code }),
  disable: (password: string) => authedRequest<null>("/api/auth/2fa/totp/disable", "POST", { password }),
  newRecoveryCodes: (password: string) =>
    authedRequest<{ recoveryCodes: string[] }>("/api/auth/2fa/recovery-codes", "POST", { password }),
  /** Super Admin: a team member lost their phone and recovery codes. */
  resetStaff: (userId: string) => authedRequest<null>(`/api/admin/staff/${encodeURIComponent(userId)}/reset-2fa`, "POST", {}),
  /** doctors.manage: same for a doctor (the Doctor profile id). */
  resetDoctor: (doctorId: string) =>
    authedRequest<null>(`/api/doctor/admin/${encodeURIComponent(doctorId)}/reset-2fa`, "POST", {})
};
