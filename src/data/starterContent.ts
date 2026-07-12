import { ContentItem } from "../types/content";

export const starterContent: ContentItem[] = [
  {
    id: "pb-blog-1",
    type: "blog",
    title: "How to track period symptoms without feeling overwhelmed",
    status: "published",
    audience: "All users",
    stage: "Tracking",
    summary: "A gentle article that shows users how to log cramps, mood, flow, and energy in a useful way.",
    body: "Start with the details that affect your day most: pain level, flow, mood, sleep, and cravings. Tracking should help you notice patterns, not create pressure to record everything perfectly.",
    question: "",
    answer: "",
    videoUrl: "",
    tags: ["tracking", "symptoms", "beginner"],
    author: "Asha Mehta",
    updatedAt: "2026-07-05T10:30:00.000Z",
    reviewRequired: true
  },
  {
    id: "pb-qa-1",
    type: "question",
    title: "Is it normal for periods to be late sometimes?",
    status: "review",
    audience: "Teens",
    stage: "Period",
    summary: "A short educational Q&A entry for common cycle variation.",
    body: "",
    question: "Is it normal for periods to be late sometimes?",
    answer: "Cycle timing can vary because of stress, travel, sleep changes, illness, intense exercise, or hormonal shifts. If a period is very late, pregnancy is possible, or symptoms feel unusual, it is worth checking with a clinician.",
    videoUrl: "",
    tags: ["late period", "cycle", "teen health"],
    author: "Medical Review Queue",
    updatedAt: "2026-07-09T15:40:00.000Z",
    reviewRequired: true
  },
  {
    id: "pb-video-1",
    type: "video",
    title: "Two-minute breathing reset for PMS days",
    status: "draft",
    audience: "All users",
    stage: "PMS",
    summary: "A calm video script and link placeholder for an in-app wellness card.",
    body: "Use a steady inhale, longer exhale, and relaxed shoulders. Keep the tone supportive and avoid claiming this replaces care.",
    question: "",
    answer: "",
    videoUrl: "https://example.com/period-buddy/pms-breathing-reset",
    tags: ["pms", "wellness", "video"],
    author: "Wellness Team",
    updatedAt: "2026-07-10T12:10:00.000Z",
    reviewRequired: false
  }
];
