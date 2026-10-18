import { getApiToken, handleUnauthorized } from "./authApi";
import { fetchWithTimeout } from "./http";

/*
 * Reel comment moderation (Video Reels → Comments).
 * Backend: period-buddy-be src/routes/reelRoutes.js. `?moderation=1` needs
 * content.write and also returns hidden (reported) comments; DELETE by a
 * content.write holder is audited as `reel_comment.deleted`.
 */

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export type ModeratedReelComment = {
  id: string;
  reelId: string;
  text: string;
  createdAt: string;
  author: { name: string; avatar: string | null };
  canDelete: boolean;
  /** Hidden from the app after 5 reports. */
  isHidden?: boolean;
  reportCount?: number;
};

export type ReelCommentPage = {
  comments: ModeratedReelComment[];
  nextCursor: string | null;
  /** Visible comments (what the app shows). */
  commentCount: number;
};

type ApiEnvelope<T> = { message?: string; data?: T };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error("This needs the API. Add VITE_API_BASE_URL to a root .env file, then restart the dev server.");
  }
  const headers = new Headers(options.headers);
  const token = getApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetchWithTimeout(`${apiBaseUrl}${path}`, { ...options, credentials: "include", headers });
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
  if (response.status === 403) throw new Error(body?.message ?? "You don't have permission to do this.");
  if (!response.ok) throw new Error(body?.message ?? `Request failed with ${response.status} ${response.statusText}`);
  return (body?.data ?? (body as unknown as T)) as T;
}

/** Newest first, including hidden ones; pass `nextCursor` for the next page. */
export function listReelComments(reelId: string, cursor?: string | null): Promise<ReelCommentPage> {
  const query = new URLSearchParams({ moderation: "1", limit: "30" });
  if (cursor) query.set("cursor", cursor);
  return request<ReelCommentPage>(`/api/reels/${encodeURIComponent(reelId)}/comments?${query.toString()}`);
}

export function deleteReelComment(reelId: string, commentId: string): Promise<{ commentCount: number }> {
  return request<{ commentCount: number }>(
    `/api/reels/${encodeURIComponent(reelId)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" }
  );
}
