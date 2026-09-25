import { throwIfPendingApproval } from "./approval";
import { getApiToken, handleUnauthorized } from "./authApi";
import { fetchWithTimeout } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export const isSchemesApiConfigured = Boolean(apiBaseUrl);

/* ----------------------------- Types ----------------------------- */

export type GovernmentLevel = "central" | "state";

export type SchemeActionType =
  | "APPLY"
  | "CHECK_ELIGIBILITY"
  | "FIND_FACILITY"
  | "LEARN_MORE"
  | "EXTERNAL_APPLICATION";

export type SchemeType = "scheme" | "programme" | "service" | "entitlement";

export type SchemeCategory =
  | "menstrual_hygiene"
  | "adolescent_health"
  | "sexual_reproductive_health"
  | "family_planning"
  | "pregnancy_antenatal"
  | "maternity_postpartum"
  | "mother_newborn_care"
  | "maternal_nutrition"
  | "reproductive_health";

export type SchemeEligibilityRule = {
  text: string;
  field?: string;
  operator?: "eq" | "neq" | "gte" | "lte" | "in" | "exists";
  value?: unknown;
};

export type SchemeApplicationStep = { title: string; detail?: string };

export type GovernmentBenefit = {
  _id: string;
  name: string;
  slug: string;
  shortName?: string;
  type: SchemeType;
  governmentLevel: GovernmentLevel;
  state?: string | null;
  categories: SchemeCategory[];
  description: string;
  benefits: string[];
  eligibility: SchemeEligibilityRule[];
  documents: string[];
  actionType: SchemeActionType;
  applicationMethod?: string;
  applicationSteps?: SchemeApplicationStep[];
  whereToGet?: string;
  officialUrl?: string;
  source?: string;
  helpline?: string;
  order?: number;
  lastVerifiedAt?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

// Writable fields for the create/edit form.
export type SchemeInput = {
  name: string;
  slug?: string;
  shortName?: string;
  type: SchemeType;
  governmentLevel: GovernmentLevel;
  state?: string | null;
  categories: SchemeCategory[];
  description: string;
  benefits?: string[];
  eligibility?: SchemeEligibilityRule[];
  documents?: string[];
  actionType: SchemeActionType;
  applicationMethod?: string;
  applicationSteps?: SchemeApplicationStep[];
  whereToGet?: string;
  officialUrl?: string;
  source?: string;
  helpline?: string;
  order?: number;
  isActive?: boolean;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export const SCHEME_TYPES: SchemeType[] = [
  "scheme",
  "programme",
  "service",
  "entitlement",
];

export const GOVERNMENT_LEVELS: GovernmentLevel[] = ["central", "state"];

export const SCHEME_ACTION_TYPES: SchemeActionType[] = [
  "APPLY",
  "CHECK_ELIGIBILITY",
  "FIND_FACILITY",
  "LEARN_MORE",
  "EXTERNAL_APPLICATION",
];

export const SCHEME_CATEGORIES: SchemeCategory[] = [
  "menstrual_hygiene",
  "adolescent_health",
  "sexual_reproductive_health",
  "family_planning",
  "pregnancy_antenatal",
  "maternity_postpartum",
  "mother_newborn_care",
  "maternal_nutrition",
  "reproductive_health",
];

export const prettifyEnum = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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
    throw new Error(
      body?.message ?? `Request failed with ${response.status} ${response.statusText}`
    );
  }

  throwIfPendingApproval(response.status, body);

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

/* --------------------------- Admin endpoints --------------------------- */

export const adminListSchemes = (params?: {
  search?: string;
  governmentLevel?: GovernmentLevel;
  page?: number;
  limit?: number;
}) =>
  request<{ schemes: GovernmentBenefit[]; pagination: Pagination }>(
    `/api/schemes/admin/all${toQuery({
      search: params?.search,
      governmentLevel: params?.governmentLevel,
      page: params?.page,
      limit: params?.limit
    })}`
  );

export const createScheme = (input: SchemeInput) =>
  request<{ scheme: GovernmentBenefit }>("/api/schemes", {
    method: "POST",
    body: JSON.stringify(input)
  });

export const updateScheme = (id: string, updates: Partial<SchemeInput>) =>
  request<{ scheme: GovernmentBenefit }>(`/api/schemes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });

export const deleteScheme = (id: string) =>
  request<{ success?: boolean }>(`/api/schemes/${id}`, { method: "DELETE" });

/* --------------------------- Form helpers --------------------------- */

/** Split a textarea's newline-separated lines into a trimmed, non-empty array. */
export function linesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Inverse of linesToArray for seeding the editor's textareas. */
export function arrayToLines(items?: string[]): string {
  return (items ?? []).join("\n");
}
