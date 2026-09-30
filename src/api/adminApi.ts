import { throwIfPendingApproval } from "./approval";
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

export async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error("Admin API is not configured (VITE_API_BASE_URL is unset).");
  }

  const headers = new Headers(options.headers);
  // FormData sets its own multipart boundary.
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
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
    if (response.status === 403 && !message) {
      message = "You don't have permission to do this.";
    }
    throw new Error(message);
  }

  const body = (await response.json()) as Envelope<T>;
  throwIfPendingApproval(response.status, body);
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
  /** Optional FCM data payload; `route` is the in-app screen a tap opens. */
  data?: PushData | null;
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
  /** Set when this send was made by a scheduled/repeating push. */
  scheduleId?: string | null;
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

/** `route`: in-app screen a tap opens. `icon`: one of PUSH_ICONS. `image`: https big picture. */
export type PushData = { route?: string; icon?: string; image?: string };

/** Look of a push, sent alongside title/body. Blank = not set. */
export type PushLook = {
  icon?: string;
  image?: string;
};

export type BroadcastInput = PushLook & {
  title: string;
  body: string;
  audience: BroadcastAudience;
  /** Required when audience is "selected". */
  userIds?: string[];
  saveToInbox: boolean;
  /** In-app path opened when the notification is tapped, e.g. "/tracker". Omit for the notifications list. */
  route?: string;
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

export async function sendTestNotification(input: PushLook & {
  title: string;
  body: string;
  email: string;
  route?: string;
}): Promise<{ messageId: string; detailsHidden?: boolean }> {
  return adminRequest(`/api/admin/notifications/test`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

/** Upload a push's big-picture image; returns its public https URL. */
export async function uploadNotificationImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const { url } = await adminRequest<{ url: string }>(`/api/admin/notifications/upload`, {
    method: "POST",
    body: form
  });
  return url;
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

/* ------------------ Scheduled / repeating push notifications ------------------ */

export type ScheduleRepeat = "none" | "daily" | "weekly" | "monthly";
export type ScheduleStatus = "active" | "paused" | "completed" | "cancelled";

export type ScheduleTiming = {
  /** ISO time of the first send; also fixes the time of day (IST). */
  startAt: string;
  repeat: ScheduleRepeat;
  /** Every N days/weeks/months (1–30). */
  interval?: number;
  /** Weekly only: 0 = Sunday … 6 = Saturday, in IST. */
  daysOfWeek?: number[];
  endAt?: string | null;
  maxRuns?: number | null;
};

export type PushSchedule = ScheduleTiming & {
  _id: string;
  title: string;
  body: string;
  audience: BroadcastAudience;
  recipientPreview?: string[] | null;
  saveToInbox: boolean;
  data?: PushData | null;
  status: ScheduleStatus;
  nextRunAt?: string | null;
  runCount: number;
  skippedCount: number;
  lastRunAt?: string | null;
  lastBroadcastId?: string | null;
  lastError?: string | null;
  /** Server-written label, e.g. "Weekly on Mon, Thu at 09:00 IST". */
  description: string;
  createdBy?: { _id: string; firstName?: string; lastName?: string; email?: string } | null;
  createdAt: string;
};

export type ScheduleInput = BroadcastInput & ScheduleTiming;

export async function listSchedules(
  status: ScheduleStatus[] = [],
  page = 1,
  limit = 20
): Promise<{ schedules: PushSchedule[]; pagination: Pagination }> {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status.length) q.set("status", status.join(","));
  return adminRequest(`/api/admin/notifications/schedules?${q.toString()}`);
}

export async function getSchedule(
  id: string
): Promise<{ schedule: PushSchedule & { userIds?: string[] }; recentSends: PushBroadcast[]; recipients: Recipient[] }> {
  return adminRequest(`/api/admin/notifications/schedules/${id}`);
}

export async function createSchedule(input: ScheduleInput): Promise<{ schedule: PushSchedule }> {
  return adminRequest(`/api/admin/notifications/schedules`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateSchedule(id: string, input: ScheduleInput): Promise<{ schedule: PushSchedule }> {
  return adminRequest(`/api/admin/notifications/schedules/${id}`, {
    method: "PUT",
    body: JSON.stringify(input)
  });
}

export async function pauseSchedule(id: string): Promise<{ schedule: PushSchedule }> {
  return adminRequest(`/api/admin/notifications/schedules/${id}/pause`, { method: "POST" });
}

export async function resumeSchedule(id: string): Promise<{ schedule: PushSchedule }> {
  return adminRequest(`/api/admin/notifications/schedules/${id}/resume`, { method: "POST" });
}

export async function cancelSchedule(id: string): Promise<{ schedule: PushSchedule }> {
  return adminRequest(`/api/admin/notifications/schedules/${id}`, { method: "DELETE" });
}
