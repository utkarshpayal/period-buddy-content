import { getApiToken } from "./authApi";

export type MediaFolder = "reels" | "audio" | "thumbnails";

export type UploadedMedia = {
  url: string;
  key: string;
};

type UploadResponse = {
  message?: string;
  error?: string;
  data?: UploadedMedia;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
const contentEndpoint = import.meta.env.VITE_CONTENT_ENDPOINT ?? "/api/content";
const isApiConfigured = Boolean(apiBaseUrl);

export function isUploadConfigured() {
  return isApiConfigured;
}

export async function uploadMediaFile(
  file: File | Blob,
  folder: MediaFolder,
  filename: string
): Promise<UploadedMedia> {
  if (!isApiConfigured) {
    throw new Error(
      "File upload requires the content API. Add VITE_API_BASE_URL to a root .env file, then restart the dev server."
    );
  }

  const formData = new FormData();
  formData.append("file", file, filename);
  formData.append("folder", folder);

  const headers = new Headers();
  const apiToken = getApiToken();

  if (apiToken) {
    headers.set("Authorization", `Bearer ${apiToken}`);
  }

  const response = await fetch(`${apiBaseUrl}${contentEndpoint}/media/upload`, {
    body: formData,
    credentials: "include",
    headers,
    method: "POST"
  });

  let body: UploadResponse | undefined;

  try {
    body = (await response.json()) as UploadResponse;
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    throw new Error(body?.message ?? body?.error ?? `Upload failed with ${response.status} ${response.statusText}`);
  }

  if (!body?.data?.url) {
    throw new Error("Upload succeeded but the server did not return a file URL.");
  }

  return body.data;
}
