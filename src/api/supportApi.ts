import { getApiToken, handleUnauthorized } from "./authApi";
import { fetchWithTimeout } from "./http";

/*
 * Help & support tickets raised from the app (Profile → Help & support).
 * Backend: period-buddy-be src/routes/supportAdminRoutes.js →
 * /api/admin/support/*. support.read to view, support.manage to change.
 */

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export const isSupportApiConfigured = Boolean(apiBaseUrl);

/* ----------------------------- Types ----------------------------- */

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketCategory = "account" | "period_tracking" | "payments" | "consultation" | "bug" | "other";
/** `active` = open + in progress. */
export type TicketStatusFilter = TicketStatus | "active" | "all";

export const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];
export const TICKET_PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];

export const SUPPORT_CATEGORIES: { id: TicketCategory; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "period_tracking", label: "Period tracking" },
  { id: "payments", label: "Payments / Subscription" },
  { id: "consultation", label: "Consultation" },
  { id: "bug", label: "Bug / App issue" },
  { id: "other", label: "Other" }
];

/** Backend REPLY_MAX. */
export const REPLY_MAX = 4000;

/** Populated `userId` (firstName lastName email phone role isActive deletedAt). */
export type TicketUser = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
  deletedAt?: string | null;
};

/** Populated staff member (firstName lastName email role). */
export type SupportStaff = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
};

/** Device/app info, only when the person chose to attach it. */
export type TicketMeta = {
  platform?: string;
  osVersion?: string;
  appVersion?: string;
  deviceModel?: string;
  buildNumber?: string;
  locale?: string;
  /** JS getTimezoneOffset() minutes (IST = -330). */
  timezoneOffset?: number;
};

export type TicketReply = {
  _id?: string;
  from: "user" | "admin";
  /** Admin replies: the staff member (populated), or a bare id / null. */
  authorId?: SupportStaff | string | null;
  message: string;
  at: string;
};

export type SupportTicket = {
  _id: string;
  ticketNumber: string;
  category: TicketCategory;
  categoryLabel?: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  user: TicketUser;
  assignee: SupportStaff | null;
  lastReplyFrom: "user" | "admin";
  lastActivityAt: string;
  /** The person replied last on an open / in-progress ticket: staff owe an answer. */
  awaitingStaff: boolean;
  replyCount: number;
  adminEmailDelivered: boolean;
  createdAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
  /** List rows only: first ~140 chars of the latest message. */
  preview?: string;
};

export type SupportTicketDetail = SupportTicket & {
  message: string;
  meta: TicketMeta | null;
  replies: TicketReply[];
};

export type StatusCounts = Record<TicketStatus, number>;

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
};

export type TicketListParams = {
  status?: TicketStatusFilter;
  priority?: TicketPriority | "";
  category?: TicketCategory | "";
  /** Staff id, `me` or `none`. */
  assignee?: string;
  /** Ticket number (NURA-000123 or digits) or the person's name / email. */
  search?: string;
  page?: number;
  limit?: number;
};

export type TicketUpdate = {
  status?: TicketStatus;
  priority?: TicketPriority;
  /** Staff id, or null to unassign. */
  assignee?: string | null;
};

type ApiEnvelope<T> = {
  success?: boolean;
  statusCode?: number;
  message?: string;
  data?: T;
};

/* --------------------------- Request helper --------------------------- */

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error(
      "This page requires the API. Add VITE_API_BASE_URL to a root .env file, then restart the dev server."
    );
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

  let body: ApiEnvelope<T> | undefined;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    body = undefined;
  }

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error(body?.message ?? "Your session has expired. Please sign in again.");
  }
  // 403 = signed in, but this role lacks the permission. Not a session problem.
  if (response.status === 403) {
    throw new Error(body?.message ?? "You don't have permission to do this.");
  }
  if (!response.ok) {
    throw new Error(body?.message ?? `Request failed with ${response.status} ${response.statusText}`);
  }

  return (body?.data ?? (body as unknown as T)) as T;
}

function toQuery(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

/* --------------------------- Display helpers --------------------------- */

export const personName = (p?: { firstName?: string; lastName?: string; email?: string } | null, fallback = "Unknown") =>
  [p?.firstName, p?.lastName].filter(Boolean).join(" ").trim() || p?.email || fallback;

export const categoryLabel = (ticket: Pick<SupportTicket, "category" | "categoryLabel">) =>
  ticket.categoryLabel || SUPPORT_CATEGORIES.find((c) => c.id === ticket.category)?.label || "Other";

/** Staff author of an admin reply, when the backend populated it. */
export const replyAuthor = (reply: TicketReply): SupportStaff | null =>
  reply.authorId && typeof reply.authorId === "object" ? reply.authorId : null;

/* --------------------------- Admin endpoints --------------------------- */

const BASE = "/api/admin/support";

export const listSupportTickets = (params: TicketListParams = {}) =>
  request<{ tickets: SupportTicket[]; statusCounts: StatusCounts; pagination: Pagination }>(
    `${BASE}/tickets${toQuery({
      status: params.status && params.status !== "all" ? params.status : undefined,
      priority: params.priority || undefined,
      category: params.category || undefined,
      assignee: params.assignee || undefined,
      search: params.search || undefined,
      page: params.page,
      limit: params.limit
    })}`
  );

export const listSupportAssignees = () => request<{ assignees: SupportStaff[] }>(`${BASE}/assignees`);

export const getSupportTicket = (id: string) =>
  request<{ ticket: SupportTicketDetail }>(`${BASE}/tickets/${encodeURIComponent(id)}`);

export const updateSupportTicket = (id: string, input: TicketUpdate) =>
  request<{ ticket: SupportTicketDetail }>(`${BASE}/tickets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });

export const replyToSupportTicket = (id: string, input: { message: string; status?: TicketStatus }) =>
  request<{ ticket: SupportTicketDetail }>(`${BASE}/tickets/${encodeURIComponent(id)}/reply`, {
    method: "POST",
    body: JSON.stringify(input)
  });

/**
 * Tickets waiting on a staff answer, for the sidebar badge. There's no count
 * endpoint, so this reads the most recent active tickets and counts the
 * flagged ones (best-effort; capped at `limit`).
 */
export async function countAwaitingTickets(limit = 100): Promise<number> {
  const res = await listSupportTickets({ status: "active", limit });
  return res.tickets.filter((t) => t.awaitingStaff).length;
}

/** Fired by the Support page after a change so the sidebar badge refreshes. */
export const SUPPORT_CHANGED_EVENT = "nura:support-changed";
export const notifySupportChanged = () => window.dispatchEvent(new Event(SUPPORT_CHANGED_EVENT));
