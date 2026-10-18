export type ContentType = "blog" | "qa" | "video" | "guide" | "tip" | "issue";
/** "review" is the API's `in_review`: waiting for medical review, never live. */
export type ContentStatus = "draft" | "review" | "published" | "archived";
/** Medical-review actions (POST /api/content/:type/:id/review). */
export type ReviewAction = "submit" | "approve" | "mark_reviewed" | "send_back";
/** The server-set medical review stamp and workflow; read-only in the portal. */
export type ContentReview = {
  medicallyReviewed: boolean;
  by: string | null;
  at: string | null;
  note: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  sentBackAt: string | null;
  sentBackBy: string | null;
  sentBackNote: string | null;
};
export type Audience = "All users" | "Teens" | "Adults" | "Parents" | "Partners";
export type CycleStage =
  | "General"
  | "Period"
  | "PMS"
  | "Ovulation"
  | "Tracking"
  | "Wellness"
  | "Emergency";

export type ContentItem = {
  id: string;
  type: ContentType;
  title: string;
  status: ContentStatus;
  audience: Audience;
  stage: CycleStage;
  summary: string;
  body: string;
  question: string;
  answer: string;
  isSensitive: boolean;
  /** Read-only: set by the server's medical review (see `review`). */
  medicallyReviewed: boolean;
  videoUrl: string;
  imageUrl?: string;
  tags: string[];
  author: string;
  /** Read-only: the reviewer's name from the server's stamp. */
  reviewedBy: string;
  /** Medical review stamp + workflow from the API (absent in local mode). */
  review?: ContentReview;
  sourceLinks: string[];
  updatedAt: string;
  reviewRequired: boolean;
  /** Blogs: minutes to read, computed by the server from the content (read-only). */
  readTimeMinutes?: number;
  /** Blogs: real reading from the app — unique readers, visits, average active time per visit (seconds), share of readers who reached the end (0–1). */
  readStats?: { reads: number; visits: number; averageReadSeconds: number | null; completionRate: number | null };
  /** Reels only: app engagement counters (period-buddy-be serializeVideo `metrics`). */
  engagement?: { views: number; likes: number; comments: number; saves: number };
  /** Backend category (blogs: general | health | lifestyle | beauty). */
  category?: string;
  seoTitle?: string;
  seoDescription?: string;
  keywords?: string[];
  
  // WellbeingResource & HealthIssue fields
  color?: string;
  icon?: string;
  order?: number;
  
  // WellbeingResource specific
  itemsCount?: number; // maps to 'items' count
  estimatedReadTime?: number;
  audioUrl?: string;
  extendedGuide?: string[];
  
  // HealthIssue specific
  symptoms?: string[];
  causes?: string[];
  treatment?: string;
  prevention?: string;
  whenToSeeDoctor?: string;
  
  // Video Reel Poll specific
  pollQuestion?: string;
  pollOptions?: Array<{ optionId: string; topic: string; votes?: number }>;
};

