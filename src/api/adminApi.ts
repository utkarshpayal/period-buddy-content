import { getApiToken, handleUnauthorized } from "./authApi";
import { fetchWithTimeout } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export const isAdminApiConfigured = Boolean(apiBaseUrl);

/* ------------------------------- Types -------------------------------- */

export type AdminUser = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  authProvider?: string;
  subscriptionPlan?: string;
  country?: string;
  state?: string;
  language?: string;
  lastLogin?: string;
  createdAt?: string;
  deletedAt?: string | null;
  profilePicture?: string;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export type UserActivity = { cycleLogs: number; documents: number; consultations: number };

export type PlatformAnalytics = {
  users: {
    total: number;
    active: number;
    suspended: number;
    byRole: Record<string, number>;
    newLast7Days: number;
    newLast30Days: number;
  };
  doctors: { total: number; active: number };
  consultations: { byStatus: Record<string, number>; revenue: number };
  schemes: { total: number; active: number };
  content: { blogs: number; reels: number };
  generatedAt: string;
};

export type AuditLogEntry = {
  _id: string;
  actorId?: string;
  actorRole?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
};

type Envelope<T> = { data?: T; message?: string; error?: string };

/* ----------------------------- Request ------------------------------- */

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error("Admin API is not configured (VITE_API_BASE_URL is unset).");
  }

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetchWithTimeout(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as Envelope<unknown>;
      message = body.message ?? body.error ?? message;
    } catch {
      /* keep status message */
    }
    if (response.status === 401) {
      handleUnauthorized();
      message = "Your session has expired. Please sign in again.";
    }
    if (response.status === 403) {
      message = "This account does not have Super Admin permission.";
    }
    throw new Error(message);
  }

  const body = (await response.json()) as Envelope<T>;
  return (body.data ?? (body as unknown as T)) as T;
}

/* ------------------------------- Users ------------------------------- */

export type ListUsersParams = {
  search?: string;
  role?: string;
  status?: "active" | "suspended";
  page?: number;
  limit?: number;
};

export async function listUsers(
  params: ListUsersParams = {}
): Promise<{ users: AdminUser[]; pagination: Pagination }> {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.role) q.set("role", params.role);
  if (params.status) q.set("status", params.status);
  q.set("page", String(params.page ?? 1));
  q.set("limit", String(params.limit ?? 20));
  return adminRequest(`/api/admin/users?${q.toString()}`);
}

export async function getUser(id: string): Promise<{ user: AdminUser; activity: UserActivity }> {
  return adminRequest(`/api/admin/users/${id}`);
}

export async function setUserStatus(
  id: string,
  isActive: boolean
): Promise<{ user: AdminUser }> {
  return adminRequest(`/api/admin/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive })
  });
}

/* ----------------------------- Analytics ----------------------------- */

export async function getAnalytics(): Promise<PlatformAnalytics> {
  return adminRequest(`/api/admin/analytics`);
}

/* ----------------------------- Audit logs ---------------------------- */

export type ListAuditParams = {
  action?: string;
  resourceType?: string;
  page?: number;
  limit?: number;
};

export async function listAuditLogs(
  params: ListAuditParams = {}
): Promise<{ logs: AuditLogEntry[]; pagination: Pagination }> {
  const q = new URLSearchParams();
  if (params.action) q.set("action", params.action);
  if (params.resourceType) q.set("resourceType", params.resourceType);
  q.set("page", String(params.page ?? 1));
  q.set("limit", String(params.limit ?? 25));
  return adminRequest(`/api/audit-logs?${q.toString()}`);
}

/* ------------------------ Push notifications ------------------------- */

export type BroadcastAudience = "all" | "user" | "partner" | "doctor" | "selected";
export type BroadcastStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type PushBroadcast = {
  _id: string;
  title: string;
  body: string;
  audience: BroadcastAudience;
  recipientPreview?: string[];
  saveToInbox: boolean;
  status: BroadcastStatus;
  cancelRequested: boolean;
  totalUsers: number;
  totalWithToken: number;
  processedUsers: number;
  sentCount: number;
  failedCount: number;
  invalidTokenCount: number;
  inboxCount: number;
  batchesCompleted: number;
  attempts: number;
  lastError?: string | null;
  createdBy?: { _id: string; firstName?: string; lastName?: string; email?: string } | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
};

export type AudienceCount = {
  audience: BroadcastAudience;
  totalUsers: number;
  totalWithToken: number;
  fcmConfigured: boolean;
};

export type BroadcastInput = {
  title: string;
  body: string;
  audience: BroadcastAudience;
  /** Required when audience is "selected". */
  userIds?: string[];
  saveToInbox: boolean;
};

export type Recipient = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
  profilePicture?: string;
  /** Unknown until looked up (e.g. a user handed over from the Users page). */
  hasDevice?: boolean;
};

export async function searchRecipients(search: string): Promise<{ users: Recipient[] }> {
  return adminRequest(`/api/admin/notifications/recipients?search=${encodeURIComponent(search)}`);
}

export async function getAudienceCount(audience: Exclude<BroadcastAudience, "selected">): Promise<AudienceCount> {
  return adminRequest(`/api/admin/notifications/audience?audience=${audience}`);
}

export async function sendTestNotification(input: {
  title: string;
  body: string;
  email: string;
}): Promise<{ messageId: string }> {
  return adminRequest(`/api/admin/notifications/test`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function createBroadcast(input: BroadcastInput): Promise<{ broadcast: PushBroadcast }> {
  return adminRequest(`/api/admin/notifications/broadcasts`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listBroadcasts(
  page = 1,
  limit = 10
): Promise<{ broadcasts: PushBroadcast[]; pagination: Pagination }> {
  return adminRequest(`/api/admin/notifications/broadcasts?page=${page}&limit=${limit}`);
}

export async function cancelBroadcast(id: string): Promise<{ broadcast: PushBroadcast }> {
  return adminRequest(`/api/admin/notifications/broadcasts/${id}/cancel`, { method: "POST" });
}

export async function retryBroadcast(id: string): Promise<{ broadcast: PushBroadcast }> {
  return adminRequest(`/api/admin/notifications/broadcasts/${id}/retry`, { method: "POST" });
}
