import { getApiToken, handleUnauthorized } from "./authApi";
import { fetchWithTimeout } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export const isCompanyAssetsApiConfigured = Boolean(apiBaseUrl);

/* ----------------------------- Types ----------------------------- */

export type CompanyAssetCategory = "pitch" | "flow" | "brand" | "legal" | "policy" | "other";

export const COMPANY_ASSET_CATEGORIES: CompanyAssetCategory[] = [
  "pitch",
  "flow",
  "brand",
  "legal",
  "policy",
  "other"
];

export const CATEGORY_LABELS: Record<CompanyAssetCategory, string> = {
  pitch: "Pitch",
  flow: "Flow / Process",
  brand: "Brand",
  legal: "Legal",
  policy: "Policy",
  other: "Other"
};

export type CompanyAssetType = "file" | "link";

export type CompanyAsset = {
  _id: string;
  title: string;
  description?: string;
  category: CompanyAssetCategory;
  assetType: CompanyAssetType;
  // Present when assetType === "file"
  fileUrl?: string;
  fileKey?: string;
  mimeType?: string;
  originalFileName?: string;
  fileSize?: number;
  // Present when assetType === "link"
  linkUrl?: string;
  isPublic: boolean;
  uploadedBy?: { firstName?: string; lastName?: string; email?: string } | string;
  createdAt?: string;
  updatedAt?: string;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
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
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetchWithTimeout(
    `${apiBaseUrl}${path}`,
    { ...options, credentials: "include", headers },
    // Uploads can be large — allow more time than a plain JSON request.
    options.body instanceof FormData ? 120_000 : 20_000
  );

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

function toQuery(params: Record<string, string | number | boolean | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

/* --------------------------- Admin endpoints --------------------------- */

export const listCompanyAssets = (params?: {
  search?: string;
  category?: CompanyAssetCategory;
  isPublic?: boolean;
  page?: number;
  limit?: number;
}) =>
  request<{ assets: CompanyAsset[]; pagination: Pagination }>(
    `/api/company-assets${toQuery({
      search: params?.search,
      category: params?.category,
      isPublic: params?.isPublic,
      page: params?.page,
      limit: params?.limit
    })}`
  );

export type UploadCompanyAssetInput = {
  file: File;
  title: string;
  description?: string;
  category: CompanyAssetCategory;
  isPublic: boolean;
};

export const uploadCompanyAsset = (input: UploadCompanyAssetInput) => {
  const formData = new FormData();
  formData.append("file", input.file, input.file.name);
  formData.append("title", input.title);
  formData.append("description", input.description ?? "");
  formData.append("category", input.category);
  formData.append("isPublic", String(input.isPublic));

  return request<{ asset: CompanyAsset }>("/api/company-assets", {
    method: "POST",
    body: formData
  });
};

export type AddCompanyAssetLinkInput = {
  title: string;
  description?: string;
  category: CompanyAssetCategory;
  isPublic: boolean;
  linkUrl: string;
};

export const addCompanyAssetLink = (input: AddCompanyAssetLinkInput) =>
  request<{ asset: CompanyAsset }>("/api/company-assets/link", {
    method: "POST",
    body: JSON.stringify(input)
  });

export type UpdateCompanyAssetInput = Partial<{
  title: string;
  description: string;
  category: CompanyAssetCategory;
  isPublic: boolean;
  linkUrl: string;
}>;

export const updateCompanyAsset = (id: string, updates: UpdateCompanyAssetInput) =>
  request<{ asset: CompanyAsset }>(`/api/company-assets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });

export const deleteCompanyAsset = (id: string) =>
  request<{ success?: boolean }>(`/api/company-assets/${id}`, { method: "DELETE" });

/**
 * A short-lived signed S3 URL that forces a real download. The object's
 * plain fileUrl is public-read, but S3 rejects response-header overrides
 * (like forcing Content-Disposition: attachment) on anonymous requests, so
 * this goes through the backend to get a signed link instead.
 */
export const getDownloadUrl = (id: string) =>
  request<{ url: string }>(`/api/company-assets/${id}/download`);

/* ------------------------------ Helpers -------------------------------- */

/** Human-readable file size, e.g. 1536000 -> "1.5 MB". */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/** "image" | "video" | "pdf" for files we can preview inline on this page; null otherwise. */
export type PreviewKind = "image" | "video" | "pdf";

export function previewKind(mimeType?: string): PreviewKind | null {
  if (!mimeType) return null;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  return null;
}

export function uploaderLabel(asset: CompanyAsset): string | undefined {
  if (!asset.uploadedBy || typeof asset.uploadedBy === "string") return undefined;
  const name = [asset.uploadedBy.firstName, asset.uploadedBy.lastName].filter(Boolean).join(" ");
  return name || asset.uploadedBy.email;
}
