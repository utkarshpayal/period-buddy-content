export type ContentType = "blog" | "qa" | "video" | "guide" | "tip" | "issue";
export type ContentStatus = "draft" | "review" | "published" | "archived";
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
  medicallyReviewed: boolean;
  videoUrl: string;
  imageUrl?: string;
  tags: string[];
  author: string;
  reviewedBy: string;
  sourceLinks: string[];
  updatedAt: string;
  reviewRequired: boolean;
  readTimeMinutes?: number;
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

