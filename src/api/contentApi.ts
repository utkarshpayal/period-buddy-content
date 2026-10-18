import { throwIfPendingApproval } from "./approval";
import { starterContent } from "../data/starterContent";
import { ContentItem, ContentReview, ContentStatus, ContentType, CycleStage, ReviewAction } from "../types/content";
import { getApiToken, handleUnauthorized } from "./authApi";
import { uid } from "../lib/uid";

export type ApiSource = "api" | "blocked" | "local";

type BackendContentItem = Omit<Partial<ContentItem>, "status" | "type" | "review"> & {
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
  imageUrl?: string;
  coverImageUrl?: string;
  thumbnailUrl?: string;
  status?: string;
  type?: string;
  // Production counter names
  viewCount?: number;
  metrics?: {
    readerCount?: number;
    readSessionCount?: number;
    averageReadSeconds?: number | null;
    completionRate?: number | null;
    // Reels (videos)
    views?: number;
    likes?: number;
    comments?: number;
    saves?: number;
  };
  commentCount?: number;
  saveCount?: number;
  likeCount?: number;
  keywords?: string[];
  version?: number;
  authorId?: string;
  seoTitle?: string;
  seoDescription?: string;
  
  // Custom wellbeing and health issue fields
  color?: string;
  icon?: string;
  order?: number;
  items?: number;
  estimatedReadTime?: number;
  audioUrl?: string;
  extendedGuide?: string[];
  resourceType?: string;
  symptoms?: string[];
  causes?: string[];
  treatment?: string;
  prevention?: string;
  whenToSeeDoctor?: string;
  category?: string;
  reviewedAt?: string;
  review?: Partial<ContentReview>;
};

// Grouped-by-type shape returned by GET /api/content: each content type is
// kept in its own bucket instead of being interleaved into one array, so
// one type's recent activity can never crowd another type out.
type GroupedContent = Record<string, BackendContentItem[]>;

type ContentCollectionResponse =
  | BackendContentItem[]
  | {
    data?:
    | BackendContentItem[]
    | {
      content?: BackendContentItem[] | GroupedContent;
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

/** Blog categories: the backend's lowercase enum (enums.js blogCategoryEnum). */
export const BLOG_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "health", label: "Health" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "beauty", label: "Beauty" }
] as const;

/** Statuses a type can actually hold. Only blogs can be archived; every type
 * can wait for medical review ("review" = the API's `in_review`). */
export function statusesFor(type: ContentType): ContentStatus[] {
  return type === "blog" ? ["published", "review", "draft", "archived"] : ["published", "review", "draft"];
}

/**
 * The `status` the content API expects for a type: blogs take
 * published/draft/archived, Q&As published/draft, and videos, health issues
 * and wellbeing resources active/inactive (see GET /api/content/types).
 */
function backendStatusFor(type: ContentType, status: ContentStatus) {
  if (status === "review") return "in_review";
  const live = status === "published";
  if (type === "blog") return live ? "published" : status === "archived" ? "archived" : "draft";
  if (type === "qa") return live ? "published" : "draft";
  return live ? "active" : "inactive";
}

/** Same estimate the backend stores (utils/blogReadTime.js): ~200 words a minute, at least 1. */
export function estimateReadMinutes(content: string) {
  const words = String(content ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\]\([^)]*\)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
  return Math.max(1, Math.round(words / 200));
}

const backendCategoryByStage: Record<ContentItem["stage"], string> = {
  Emergency: "health",
  General: "general",
  Ovulation: "fertility",
  Period: "periods",
  PMS: "symptoms",
  Tracking: "tracking",
  Wellness: "health"
};

function endpoint(path = "") {
  return `${contentEndpoint}${path}`;
}

function backendTypeFor(type: ContentType) {
  if (type === "qa") {
    return "question-answer";
  }

  if (type === "guide" || type === "tip") {
    return "wellbeing";
  }
  
  if (type === "issue") {
    return "health-issue";
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

    const normalized = parsed.map(normalizeLocalItem);
    localStorage.setItem(storageKey, JSON.stringify(normalized));
    return normalized;
  } catch {
    localStorage.setItem(storageKey, JSON.stringify(starterContent));
    return starterContent;
  }
}

function writeLocalContent(items: ContentItem[]) {
  localStorage.setItem(storageKey, JSON.stringify(items));
}

function normalizeStatus(item: BackendContentItem) {
  if (item.status === "in_review") {
    return "review";
  }

  if (item.status === "active" || item.isActive === true) {
    return "published";
  }

  if (item.status === "inactive" || item.isActive === false) {
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
  if (type === "question-answer" || type === "question" || type === "answer" || type === "qa") {
    return "qa";
  }

  if (type === "wellbeing" || type === "wellbeing_resource" || type === "sexual_wellbeing" || type === "hygiene") {
    return "guide";
  }
  
  if (type === "health-issue" || type === "health_issue" || type === "issue") {
    return "issue";
  }

  if (type === "blog" || type === "video" || type === "tip") {
    return type as ContentType;
  }

  return "blog";
}

function normalizeLocalItem(item: ContentItem & { type?: string }): ContentItem {
  return {
    ...item,
    id: item.id || uid(),
    type: normalizeType(item.type),
    title: item.title || item.question || "Untitled content",
    status: item.status ?? "draft",
    audience: item.audience ?? "All users",
    stage: item.stage ?? "General",
    summary: item.summary ?? "",
    body: item.body ?? "",
    question: item.question ?? "",
    answer: item.answer ?? "",
    isSensitive: item.isSensitive ?? false,
    medicallyReviewed: item.medicallyReviewed ?? false,
    videoUrl: item.videoUrl ?? "",
    imageUrl: item.imageUrl ?? "",
    tags: Array.isArray(item.tags) ? item.tags : [],
    author: item.author ?? "Content Team",
    reviewedBy: item.reviewedBy ?? "",
    sourceLinks: Array.isArray(item.sourceLinks) ? item.sourceLinks : [],
    updatedAt: item.updatedAt ?? new Date().toISOString(),
    reviewRequired: item.reviewRequired ?? !item.medicallyReviewed,
    readTimeMinutes: typeof item.readTimeMinutes === "number" ? item.readTimeMinutes : 0,
    seoTitle: item.seoTitle ?? "",
    seoDescription: item.seoDescription ?? "",
    keywords: Array.isArray(item.keywords) ? item.keywords : []
  };
}

/** The server's review stamp + workflow, from `review` or the top-level fields. */
function normalizeReview(item: BackendContentItem): ContentReview {
  const review = item.review ?? {};
  return {
    medicallyReviewed: Boolean(review.medicallyReviewed ?? item.medicallyReviewed),
    by: review.by ?? (item.reviewedBy || null),
    at: review.at ?? item.reviewedAt ?? null,
    note: review.note ?? null,
    submittedAt: review.submittedAt ?? null,
    submittedBy: review.submittedBy ?? null,
    sentBackAt: review.sentBackAt ?? null,
    sentBackBy: review.sentBackBy ?? null,
    sentBackNote: review.sentBackNote ?? null
  };
}

function normalizeItem(item: BackendContentItem): ContentItem {
  const review = normalizeReview(item);
  let type = normalizeType(item.type);
  
  if (type === "guide" && (item.resourceType === "sexual_wellbeing" || item.type === "sexual_wellbeing")) {
    type = "tip";
  }

  const stageByCategory: Record<string, CycleStage> = {
    periods: "Period",
    symptoms: "PMS",
    fertility: "Ovulation",
    tracking: "Tracking",
    health: "Wellness",
    general: "General"
  };

  const blogStageByCategory: Record<string, CycleStage> = {
    general: "General",
    health: "Wellness",
    lifestyle: "Wellness",
    beauty: "Wellness"
  };

  return {
    id: String(item.id ?? item._id ?? uid()),
    type,
    title: item.title ?? item.question ?? "Untitled content",
    status: normalizeStatus(item) as ContentItem["status"],
    audience: item.audience ?? "All users",
    stage: item.stage ?? (
      type === "qa" ? (stageByCategory[item.category || ""] ?? "General") :
      type === "blog" ? (blogStageByCategory[item.category || ""] ?? "General") :
      (item.category ? (item.category as CycleStage) : "General")
    ),
    summary: item.summary ?? item.excerpt ?? item.shortAnswer ?? "",
    body: item.body ?? item.content ?? item.guide ?? (Array.isArray(item.extendedGuide) ? item.extendedGuide.join("\n") : ""),
    question: item.question ?? "",
    answer: item.answer ?? "",
    isSensitive: item.isSensitive ?? false,
    medicallyReviewed: review.medicallyReviewed,
    videoUrl: item.videoUrl ?? item.directMp4Url ?? "",
    imageUrl: item.imageUrl ?? item.coverImageUrl ?? item.thumbnailUrl ?? "",
    tags: Array.isArray(item.tags) ? item.tags : [],
    author: item.author ?? "Period Buddy Team",
    reviewedBy: review.by ?? "",
    review,
    sourceLinks: Array.isArray(item.sourceLinks) ? item.sourceLinks : [],
    updatedAt: item.updatedAt ?? item.createdAt ?? new Date().toISOString(),
    reviewRequired: !review.medicallyReviewed,
    readTimeMinutes: typeof item.readTimeMinutes === "number" ? item.readTimeMinutes : (typeof item.estimatedReadTime === "number" ? item.estimatedReadTime : 0),
    readStats: item.metrics
      ? {
          reads: item.metrics.readerCount ?? item.metrics.readSessionCount ?? 0,
          visits: item.metrics.readSessionCount ?? 0,
          averageReadSeconds: item.metrics.averageReadSeconds ?? null,
          completionRate: item.metrics.completionRate ?? null
        }
      : undefined,
    engagement: type === "video"
      ? {
          views: item.metrics?.views ?? item.viewCount ?? 0,
          likes: item.metrics?.likes ?? item.likeCount ?? 0,
          comments: item.metrics?.comments ?? item.commentCount ?? 0,
          saves: item.metrics?.saves ?? item.saveCount ?? 0
        }
      : undefined,
    category: type === "blog" ? item.category || "general" : item.category,
    seoTitle: item.seoTitle ?? "",
    seoDescription: item.seoDescription ?? "",
    keywords: Array.isArray(item.keywords) ? item.keywords : [],
    
    // Wellbeing & Health Issue fields
    color: item.color ?? "",
    icon: item.icon ?? "",
    order: typeof item.order === "number" ? item.order : 0,
    
    // WellbeingResource specific
    itemsCount: typeof item.items === "number" ? item.items : 0,
    estimatedReadTime: typeof item.estimatedReadTime === "number" ? item.estimatedReadTime : 0,
    audioUrl: item.audioUrl ?? "",
    extendedGuide: Array.isArray(item.extendedGuide) ? item.extendedGuide : [],
    
    // HealthIssue specific
    symptoms: Array.isArray(item.symptoms) ? item.symptoms : [],
    causes: Array.isArray(item.causes) ? item.causes : [],
    treatment: item.treatment ?? "",
    prevention: item.prevention ?? "",
    whenToSeeDoctor: item.whenToSeeDoctor ?? "",
    
    // Video Reel Poll specific
    pollQuestion: item.pollQuestion ?? "",
    pollOptions: Array.isArray(item.pollOptions) ? item.pollOptions : []
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

  const content = response.data?.content;

  if (content && !Array.isArray(content)) {
    // Grouped-by-type: { blog: [...], video: [...], ... } — flatten for the
    // admin's local search/filter, which slices this back apart by `type`.
    return Object.values(content).flat();
  }

  return response.data?.items ?? content ?? response.data?.results ?? response.data?.data ?? [];
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

  if (item.type === "qa") {
    const question = item.question || item.title;
    const answer = item.answer || item.body;
    // The review stamp is server-only: never send it back.
    const { medicallyReviewed, reviewedBy, review, reviewRequired, ...rest } = item;

    return {
      ...rest,
      answer,
      category: backendCategoryByStage[item.stage] ?? "general",
      content: answer,
      status: backendStatusFor("qa", item.status),
      isSensitive: item.isSensitive,
      question,
      shortAnswer: item.summary,
      sourceLinks: item.sourceLinks,
      title: question
    };
  }

  if (item.type === "issue") {
    return {
      title: item.title,
      category: item.stage || "General",
      icon: item.icon || "alert-circle-outline",
      color: item.color || "#ef4444",
      summary: item.summary,
      guide: item.body || item.summary,
      imageUrl: item.imageUrl || "https://images.unsplash.com/photo-1511556532299-8f662fc26c06?q=80&w=600&auto=format&fit=crop",
      symptoms: item.symptoms || [],
      causes: item.causes || [],
      treatment: item.treatment || "",
      prevention: item.prevention || "",
      whenToSeeDoctor: item.whenToSeeDoctor || "",
      order: Number(item.order) || 0,
      status: backendStatusFor("issue", item.status)
    };
  }

  if (item.type === "video") {
    return {
      title: item.title,
      creatorId: "pb_creator_admin",
      creatorName: item.author || "Period Buddy Expert",
      creatorAvatar: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=150&auto=format&fit=crop",
      duration: "0:30",
      category: item.stage || "Wellness",
      verified: true,
      imageUrl: item.imageUrl || "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=600&auto=format&fit=crop",
      directMp4Url: item.videoUrl,
      pollQuestion: item.pollQuestion || "",
      pollOptions: item.pollOptions || [],
      // Caption and #tags shown under the reel in the app.
      description: item.summary || "",
      tags: item.tags.filter(Boolean),
      status: backendStatusFor("video", item.status)
    };
  }

  if (item.type === "guide" || item.type === "tip") {
    return {
      type: item.type === "tip" ? "sexual_wellbeing" : "hygiene",
      title: item.title,
      icon: item.icon || (item.type === "tip" ? "heart-outline" : "water-outline"),
      color: item.color || (item.type === "tip" ? "#d946a6" : "#0ea5e9"),
      summary: item.summary,
      extendedGuide: item.extendedGuide || (item.body ? item.body.split("\n").filter(Boolean) : []),
      items: Number(item.itemsCount) || 0,
      estimatedReadTime: Number(item.estimatedReadTime) || Number(item.readTimeMinutes) || 0,
      videoUrl: item.videoUrl || "",
      audioUrl: item.audioUrl || "",
      order: Number(item.order) || 0,
      status: backendStatusFor(item.type, item.status)
    };
  }

  // Blog: only the fields the API reads. `readTimeMinutes` is computed by the
  // server from `content`, and `category` is the lowercase enum (an older
  // out-of-list value is echoed back unchanged, which the API leaves alone).
  return {
    title: item.title,
    content,
    excerpt: item.summary,
    category: item.category || "general",
    tags: item.tags.filter(Boolean),
    author: item.author,
    coverImageUrl: item.imageUrl || undefined,
    seoTitle: item.seoTitle,
    seoDescription: item.seoDescription,
    keywords: (item.keywords ?? []).filter(Boolean),
    status: backendStatusFor("blog", item.status)
  };
}

/** Save body for create/update. An item waiting for medical review keeps its
 * status: the editor never moves it (only the review actions do). */
function toSavePayload(item: ContentItem) {
  const payload: Record<string, unknown> = toBackendPayload(item);
  if (item.status === "review") delete payload.status;
  return payload;
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

  // Abort a hung request after 20s so the UI can surface an error instead of
  // spinning forever (matches the backend request timeout).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      credentials: "include",
      headers,
      signal: options.signal ?? controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The request timed out. Check your connection and try again.");
    }
    throw error instanceof Error ? error : new Error("Network request failed.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = `API request failed with ${response.status} ${response.statusText}`;

    try {
      const body = (await response.json()) as { error?: string; message?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // Keep the HTTP status message when the body is not JSON.
    }

    if (response.status === 401) {
      // Token missing/expired/invalid — drop the session and bounce to login.
      handleUnauthorized();
      message = "Your session has expired. Please sign in again.";
    }


    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json()) as T;
  throwIfPendingApproval(response.status, body);
  return body;
}

const BACKEND_TYPES = ["blog", "video", "question-answer", "health-issue", "wellbeing"];
const PAGE_SIZE = 100;
/** Safety stop: 50 pages = 5000 items of one type. */
const MAX_PAGES = 50;

async function loadAllOfType(type: string): Promise<ContentItem[]> {
  const all: ContentItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await apiRequest<ContentCollectionResponse>(endpoint(`?type=${type}&limit=${PAGE_SIZE}&page=${page}`));
    const items = parseItems(response);
    all.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  return all;
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
    // The API caps a request at 100 per type, so load each type page by page
    // until it runs out: lists and status counts then cover everything.
    const items = (await Promise.all(BACKEND_TYPES.map(loadAllOfType))).flat();

    return {
      items,
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
      body: JSON.stringify(toSavePayload(item)),
      method: "POST"
    });

    return {
      item: parseItem(response),
      message: "Saved through the content API.",
      source: "api"
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error(getErrorMessage(error));
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
      body: JSON.stringify(toSavePayload(item)),
      method: "PUT"
    });

    return {
      item: parseItem(response),
      message: "Updated through the content API.",
      source: "api"
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error(getErrorMessage(error));
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
    throw error instanceof Error ? error : new Error(getErrorMessage(error));
  }
}

/**
 * Publish / unpublish / archive one item: PATCH /api/content/:type/:id/publish
 * with the status the type expects. Resolves to the saved item from the
 * response (staff without content.publish get a PendingApprovalError).
 */
export async function setContentStatus(item: ContentItem, status: ContentStatus): Promise<MutationResult> {
  if (!isApiConfigured) {
    const saved = { ...item, status, updatedAt: new Date().toISOString() };
    writeLocalContent(readLocalContent().map((contentItem) => (contentItem.id === item.id ? saved : contentItem)));
    return { item: saved, message: "Updated local browser storage.", source: "local" };
  }

  const response = await apiRequest<ContentResponse>(`${endpointWithId(item.type, item.id)}/publish`, {
    body: JSON.stringify({ status: backendStatusFor(item.type, status) }),
    method: "PATCH"
  });
  const saved = parseItem(response);
  // Guides and wellbeing tips share one backend type; keep the page's own type.
  return {
    item: { ...saved, type: item.type },
    message: "Updated through the content API.",
    source: "api"
  };
}

/**
 * Medical review: POST /api/content/:type/:id/review with
 * `submit` (writers), or `approve` / `mark_reviewed` / `send_back` (needs
 * content.approve; `send_back` needs a note). Resolves to the saved item.
 */
export async function reviewContent(item: ContentItem, action: ReviewAction, note?: string): Promise<MutationResult> {
  if (!isApiConfigured) {
    const status: ContentStatus =
      action === "submit" ? "review" : action === "approve" ? "published" : action === "send_back" ? "draft" : item.status === "review" ? "draft" : item.status;
    const stamped = action === "approve" || action === "mark_reviewed";
    const saved: ContentItem = {
      ...item,
      status,
      medicallyReviewed: stamped ? true : action === "send_back" ? false : item.medicallyReviewed,
      updatedAt: new Date().toISOString()
    };
    writeLocalContent(readLocalContent().map((contentItem) => (contentItem.id === item.id ? saved : contentItem)));
    return { item: saved, message: "Updated local browser storage.", source: "local" };
  }

  const response = await apiRequest<ContentResponse>(`${endpointWithId(item.type, item.id)}/review`, {
    body: JSON.stringify(note ? { action, note } : { action }),
    method: "POST"
  });
  const saved = parseItem(response);
  return {
    item: { ...saved, type: item.type },
    message: "Updated through the content API.",
    source: "api"
  };
}
