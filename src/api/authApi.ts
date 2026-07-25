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
const envApiToken = import.meta.env.VITE_API_TOKEN;
const tokenStorageKey = "period-buddy-api-token";
const userStorageKey = "period-buddy-auth-user";

export function getApiToken() {
  return localStorage.getItem(tokenStorageKey) ?? envApiToken ?? "";
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
