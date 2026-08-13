export type AuthUser = {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
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

export function getApiToken() {
  const stored = localStorage.getItem(tokenStorageKey);
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
  const token = getApiToken();
  const user = getStoredUser();

  if (!token && !user) {
    return null;
  }

  return { token, user: user ?? undefined };
}

export function clearAuthSession() {
  localStorage.removeItem(tokenStorageKey);
  localStorage.removeItem(userStorageKey);
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

function saveAuthSession(session: AuthSession) {
  if (session.token) {
    localStorage.setItem(tokenStorageKey, session.token);
  }

  if (session.user) {
    localStorage.setItem(userStorageKey, JSON.stringify(session.user));
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Authentication request failed.";
}

function parseAuthResponse(response: AuthResponse | undefined, payload: LoginPayload, fallbackMessage: string) {
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
  const session: AuthSession = { token, user };

  saveAuthSession(session);

  return {
    message: response?.message ?? fallbackMessage,
    session
  };
}

export async function loginWithEmail(payload: LoginPayload): Promise<AuthResult> {
  if (!apiBaseUrl) {
    const session = {
      token: `local-${crypto.randomUUID()}`,
      user: { email: payload.email, role: "admin" }
    };

    saveAuthSession(session);

    return {
      message: "Logged in locally.",
      session
    };
  }

  try {
    const response = await fetch(`${apiBaseUrl}${loginEndpoint}`, {
      body: JSON.stringify(payload),
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    let body: AuthResponse | undefined;

    try {
      body = (await response.json()) as AuthResponse;
    } catch {
      body = undefined;
    }

    if (!response.ok) {
      const validationMessages = body?.errors
        ?.map((error) => error.message)
        .filter(Boolean)
        .join(" ");

      throw new Error(
        validationMessages ??
          body?.message ??
          `Authentication failed with ${response.status} ${response.statusText}`
      );
    }

    return parseAuthResponse(body, payload, "Logged in successfully.");
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
