import { getApiToken, handleUnauthorized } from "./authApi";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export const isSchemeApiConfigured = Boolean(apiBaseUrl);

/* ----------------------------- Types ----------------------------- */

export type SchemeApplicationStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "withdrawn";

export type ApplicantUser = {
  _id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  state?: string;
};

export type ApplicationScheme = {
  _id?: string;
  name?: string;
  shortName?: string;
  slug?: string;
  governmentLevel?: "central" | "state";
  state?: string | null;
  actionType?: string;
};

export type ApplicationDocument = { name?: string; url?: string };

export type SchemeApplication = {
  _id: string;
  userId?: ApplicantUser | string;
  schemeId?: ApplicationScheme | string;
  schemeName?: string;
  status: SchemeApplicationStatus;
  notes?: string;
  reviewNote?: string;
  reviewedAt?: string;
  formData?: Record<string, unknown>;
  documents?: ApplicationDocument[];
  createdAt: string;
  updatedAt: string;
};

export type ApplicationSort = "newest" | "oldest" | "updated";

export type ApplicationFilters = {
  statusCounts: Partial<Record<SchemeApplicationStatus, number>>;
  total: number;
  states: string[];
  schemes: { _id: string; name?: string; shortName?: string }[];
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
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

  const response = await fetch(`${apiBaseUrl}${path}`, {
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

  if (response.status === 401 || response.status === 403) {
    handleUnauthorized();
    throw new Error(body?.message ?? "Your session has expired. Please sign in again.");
  }

  if (!response.ok) {
    throw new Error(
      body?.message ?? `Request failed with ${response.status} ${response.statusText}`
    );
  }

  return (body?.data ?? (body as unknown as T)) as T;
}

/* --------------------------- Helpers --------------------------- */

function toQuery(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function applicantName(app: SchemeApplication): string {
  if (typeof app.userId === "object" && app.userId) {
    const name = [app.userId.firstName, app.userId.lastName].filter(Boolean).join(" ").trim();
    return name || app.userId.email || "Applicant";
  }
  return "Applicant";
}

export function applicantEmail(app: SchemeApplication): string | undefined {
  return typeof app.userId === "object" ? app.userId?.email : undefined;
}

export function applicantPhone(app: SchemeApplication): string | undefined {
  return typeof app.userId === "object" ? app.userId?.phone : undefined;
}

export function applicantState(app: SchemeApplication): string | undefined {
  return typeof app.userId === "object" ? app.userId?.state : undefined;
}

export function schemeName(app: SchemeApplication): string {
  if (typeof app.schemeId === "object" && app.schemeId?.name) return app.schemeId.name;
  return app.schemeName || "Scheme application";
}

export function schemeLevelLabel(app: SchemeApplication): string {
  const s = typeof app.schemeId === "object" ? app.schemeId : undefined;
  if (!s) return "";
  return s.governmentLevel === "central" ? "Central" : s.state || "State";
}

/* --------------------------- Admin endpoints --------------------------- */

export const adminListApplications = (params?: {
  status?: SchemeApplicationStatus | "all";
  search?: string;
  state?: string;
  schemeId?: string;
  governmentLevel?: "central" | "state";
  dateFrom?: string;
  dateTo?: string;
  sort?: ApplicationSort;
  page?: number;
  limit?: number;
}) =>
  request<{ applications: SchemeApplication[]; pagination: Pagination }>(
    `/api/scheme-applications/admin/all${toQuery({
      status: params?.status && params.status !== "all" ? params.status : undefined,
      search: params?.search,
      state: params?.state,
      schemeId: params?.schemeId,
      governmentLevel: params?.governmentLevel,
      dateFrom: params?.dateFrom,
      dateTo: params?.dateTo,
      sort: params?.sort,
      page: params?.page,
      limit: params?.limit
    })}`
  );

export const fetchApplicationFilters = () =>
  request<ApplicationFilters>("/api/scheme-applications/admin/filters");

export const adminReviewApplication = (
  id: string,
  input: { status: "in_review" | "approved" | "rejected"; reviewNote?: string }
) =>
  request<{ application: SchemeApplication }>(`/api/scheme-applications/admin/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
