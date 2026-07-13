export type ContentType = "blog" | "qa" | "video" | "guide" | "tip";
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
  tags: string[];
  author: string;
  reviewedBy: string;
  sourceLinks: string[];
  updatedAt: string;
  reviewRequired: boolean;
};
