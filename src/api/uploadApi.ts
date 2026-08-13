import { getApiToken } from "./authApi";
import { fetchWithTimeout } from "./http";

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

// The admin media upload is admin-only; a signed-in gynecologist (role
// "doctor") must use the doctor-scoped endpoint instead, or the server
// returns 403. Pick the path from the stored session role.
function mediaUploadPath() {
  try {
    const stored = localStorage.getItem("period-buddy-auth-user");
    const role = stored ? (JSON.parse(stored) as { role?: string }).role : undefined;
    if (role === "doctor") return "/api/doctor/media/upload";
  } catch {
    // fall through to the content endpoint
  }
  return `${contentEndpoint}/media/upload`;
}

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

  const response = await fetchWithTimeout(
    `${apiBaseUrl}${mediaUploadPath()}`,
    {
      body: formData,
      credentials: "include",
      headers,
      method: "POST"
    },
    // Media files can be large — allow more time than a JSON request.
    120_000
  );

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
