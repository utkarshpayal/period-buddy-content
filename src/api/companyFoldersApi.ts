import { getApiToken, handleUnauthorized } from "./authApi";
import { fetchWithTimeout } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export type CompanyFolder = {
  _id: string;
  name: string;
  parentId: string | null;
  createdBy?: string;
  subfolderCount?: number;
  assetCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type FolderCrumb = { _id: string; name: string };

type ApiEnvelope<T> = {
  success?: boolean;
  statusCode?: number;
  message?: string;
  data?: T;
};

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

  return (body?.data ?? (body as unknown as T)) as T;
}

/** Subfolders of `parentId` (root when omitted/null), plus the breadcrumb path to get there. */
export const listCompanyFolders = (parentId?: string | null) =>
  request<{ folders: CompanyFolder[]; path: FolderCrumb[] }>(
    `/api/company-folders${parentId ? `?parentId=${parentId}` : ""}`
  );

export const createCompanyFolder = (name: string, parentId?: string | null) =>
  request<{ folder: CompanyFolder }>("/api/company-folders", {
    method: "POST",
    body: JSON.stringify({ name, parentId: parentId ?? null })
  });

export type UpdateCompanyFolderInput = Partial<{ name: string; parentId: string | null }>;

export const updateCompanyFolder = (id: string, updates: UpdateCompanyFolderInput) =>
  request<{ folder: CompanyFolder }>(`/api/company-folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });

export const deleteCompanyFolder = (id: string) =>
  request<{ success?: boolean; deletedFolders: number; deletedAssets: number }>(
    `/api/company-folders/${id}`,
    { method: "DELETE" }
  );
