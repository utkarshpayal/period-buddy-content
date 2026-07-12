import { starterContent } from "../data/starterContent";
import { ContentItem, ContentType } from "../types/content";
import { getApiToken } from "./authApi";

export type ApiSource = "api" | "blocked" | "local";

type BackendContentItem = Omit<Partial<ContentItem>, "status" | "type"> & {
  _id?: string;
  createdAt?: string;
  content?: string;
  excerpt?: string;
  guide?: string;
  isActive?: boolean;
  isPublished?: boolean;
  question?: string;
  shortAnswer?: string;
  directMp4Url?: string;
  status?: string;
  type?: string;
};

type ContentCollectionResponse =
  | BackendContentItem[]
  | {
      data?:
        | BackendContentItem[]
        | {
            content?: BackendContentItem[];
            data?: BackendContentItem[];
            items?: BackendContentItem[];
            results?: BackendContentItem[];
          };
      items?: BackendContentItem[];
      results?: BackendContentItem[];
    };
type ContentResponse =
  | BackendContentItem
  | {
      data?: BackendContentItem;
      item?: BackendContentItem;
    };

type LoadResult = {
  items: ContentItem[];
  message: string;
  source: ApiSource;
};

type MutationResult = {
  item?: ContentItem;
  message: string;
  source: ApiSource;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
const contentEndpoint = import.meta.env.VITE_CONTENT_ENDPOINT ?? "/api/content";
const storageKey = "period-buddy-content-items";

const isApiConfigured = Boolean(apiBaseUrl);

function endpoint(path = "") {
  return `${contentEndpoint}${path}`;
}

function backendTypeFor(type: ContentType) {
  if (type === "question" || type === "answer") {
    return "question-answer";
  }

  if (type === "guide" || type === "tip") {
    return "wellbeing";
  }

  return type;
}

function endpointWithType(type: ContentType, path = "") {
  return endpoint(`/${backendTypeFor(type)}${path}`);
}

function endpointWithId(type: ContentType, id: string) {
  return endpointWithType(type, `/${encodeURIComponent(id)}`);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong while calling the API.";
}

function isPermissionError(message: string) {
  return message.toLowerCase().includes("permission") || message.includes("403");
}

function readLocalContent() {
  const stored = localStorage.getItem(storageKey);

  if (!stored) {
    localStorage.setItem(storageKey, JSON.stringify(starterContent));
    return starterContent;
  }

  try {
    const parsed = JSON.parse(stored) as unknown;

    if (!Array.isArray(parsed)) {
      localStorage.setItem(storageKey, JSON.stringify(starterContent));
      return starterContent;
    }

    return parsed as ContentItem[];
  } catch {
    localStorage.setItem(storageKey, JSON.stringify(starterContent));
    return starterContent;
  }
}

function writeLocalContent(items: ContentItem[]) {
  localStorage.setItem(storageKey, JSON.stringify(items));
}

function normalizeStatus(item: BackendContentItem) {
  if (item.status === "active") {
    return "published";
  }

  if (item.status === "inactive") {
    return "draft";
  }

  if (item.status) {
    return item.status;
  }

  if (item.isPublished || item.isActive) {
    return "published";
  }

  return "draft";
}

function normalizeType(type: BackendContentItem["type"]): ContentType {
  if (type === "question-answer") {
    return "question";
  }

  if (type === "wellbeing" || type === "health-issue") {
    return "guide";
  }

  if (type === "blog" || type === "video" || type === "tip" || type === "answer" || type === "question") {
    return type;
  }

  return "blog";
}

function normalizeItem(item: BackendContentItem): ContentItem {
  const type = normalizeType(item.type);

  return {
    id: String(item.id ?? item._id ?? crypto.randomUUID()),
    type,
    title: item.title ?? item.question ?? "Untitled content",
    status: normalizeStatus(item) as ContentItem["status"],
    audience: item.audience ?? "All users",
    stage: item.stage ?? "General",
    summary: item.summary ?? item.excerpt ?? item.shortAnswer ?? "",
    body: item.body ?? item.content ?? item.guide ?? "",
    question: item.question ?? "",
    answer: item.answer ?? "",
    videoUrl: item.videoUrl ?? item.directMp4Url ?? "",
    tags: Array.isArray(item.tags) ? item.tags : [],
    author: item.author ?? "Period Buddy Team",
    updatedAt: item.updatedAt ?? item.createdAt ?? new Date().toISOString(),
    reviewRequired: item.reviewRequired ?? true
  };
}

function extractItems(response: ContentCollectionResponse) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response.items)) {
    return response.items;
  }

  if (Array.isArray(response.results)) {
    return response.results;
  }

  if (Array.isArray(response.data)) {
    return response.data;
  }

  return response.data?.items ?? response.data?.content ?? response.data?.results ?? response.data?.data ?? [];
}

function parseItems(response: ContentCollectionResponse) {
  return extractItems(response).map(normalizeItem);
}

function isWrappedContentResponse(
  response: ContentResponse
): response is { data?: BackendContentItem; item?: BackendContentItem } {
  return "item" in response || "data" in response;
}

function parseItem(response: ContentResponse) {
  if (isWrappedContentResponse(response)) {
    const item = response.item ?? response.data;

    if (!item) {
      throw new Error("The API response did not include a content item.");
    }

    return normalizeItem(item);
  }

  return normalizeItem(response);
}

function toBackendPayload(item: ContentItem) {
  const content = item.body || item.answer || item.summary || item.title;

  return {
    ...item,
    content,
    excerpt: item.summary,
    category: item.stage || "General",
    directMp4Url: item.videoUrl,
    isActive: item.status === "published",
    isPublished: item.status === "published",
    resourceType: item.stage || "general",
    thumbnailUrl: item.videoUrl ? "https://placehold.co/640x360?text=Period+Buddy" : undefined
  };
}

async function apiRequest<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const apiToken = getApiToken();

  if (apiToken) {
    headers.set("Authorization", `Bearer ${apiToken}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers
  });

  if (!response.ok) {
    let message = `API request failed with ${response.status} ${response.statusText}`;

    try {
      const body = (await response.json()) as { error?: string; message?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // Keep the HTTP status message when the body is not JSON.
    }

    if (response.status === 401) {
      message = `${message}. Login with email and password, or check your auth endpoints.`;
    }

    if (response.status === 403) {
      message = `${message}. This account is signed in but does not have content admin permission. Use an admin account or grant this user content permissions in the backend.`;
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function loadContent(): Promise<LoadResult> {
  if (!isApiConfigured) {
    return {
      items: readLocalContent(),
      message: "Local mode: add VITE_API_BASE_URL to a root .env file, then restart the dev server.",
      source: "local"
    };
  }

  try {
    const response = await apiRequest<ContentCollectionResponse>(endpoint());

    return {
      items: parseItems(response),
      message: "Connected to the Period Buddy content API.",
      source: "api"
    };
  } catch (error) {
    const message = getErrorMessage(error);
    const blocked = isPermissionError(message);

    return {
      items: readLocalContent(),
      message: blocked
        ? `${message} Showing saved local content until permission is granted.`
        : `API unavailable: ${message} Showing saved local content.`,
      source: blocked ? "blocked" : "local"
    };
  }
}

export async function createContent(item: ContentItem): Promise<MutationResult> {
  if (!isApiConfigured) {
    writeLocalContent([item, ...readLocalContent()]);

    return {
      item,
      message: "Saved to local browser storage.",
      source: "local"
    };
  }

  try {
    const response = await apiRequest<ContentResponse>(endpointWithType(item.type), {
      body: JSON.stringify(toBackendPayload(item)),
      method: "POST"
    });

    return {
      item: parseItem(response),
      message: "Saved through the content API.",
      source: "api"
    };
  } catch (error) {
    const message = getErrorMessage(error);

    if (!isPermissionError(message)) {
      throw error;
    }

    writeLocalContent([item, ...readLocalContent()]);

    return {
      item,
      message: `${message} Saved locally instead.`,
      source: "blocked"
    };
  }
}

export async function updateContent(id: string, item: ContentItem): Promise<MutationResult> {
  if (!isApiConfigured) {
    writeLocalContent(readLocalContent().map((contentItem) => (contentItem.id === id ? item : contentItem)));

    return {
      item,
      message: "Updated local browser storage.",
      source: "local"
    };
  }

  try {
    const response = await apiRequest<ContentResponse>(endpointWithId(item.type, id), {
      body: JSON.stringify(toBackendPayload(item)),
      method: "PUT"
    });

    return {
      item: parseItem(response),
      message: "Updated through the content API.",
      source: "api"
    };
  } catch (error) {
    const message = getErrorMessage(error);

    if (!isPermissionError(message)) {
      throw error;
    }

    writeLocalContent(readLocalContent().map((contentItem) => (contentItem.id === id ? item : contentItem)));

    return {
      item,
      message: `${message} Updated locally instead.`,
      source: "blocked"
    };
  }
}

export async function deleteContent(id: string, type: ContentType): Promise<MutationResult> {
  if (!isApiConfigured) {
    writeLocalContent(readLocalContent().filter((contentItem) => contentItem.id !== id));

    return {
      message: "Deleted from local browser storage.",
      source: "local"
    };
  }

  try {
    await apiRequest<void>(endpointWithId(type, id), {
      method: "DELETE"
    });

    return {
      message: "Deleted through the content API.",
      source: "api"
    };
  } catch (error) {
    const message = getErrorMessage(error);

    if (!isPermissionError(message)) {
      throw error;
    }

    writeLocalContent(readLocalContent().filter((contentItem) => contentItem.id !== id));

    return {
      message: `${message} Deleted locally instead.`,
      source: "blocked"
    };
  }
}
