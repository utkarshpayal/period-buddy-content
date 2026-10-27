/**
 * Rich content format shared by the editor here, the website (The-Nura-website,
 * src/lib/richText.js) and the app (period-buddy, lib/richText.ts). Keep the
 * three in step.
 *
 * Content is Markdown (GFM tables included) plus a small allowlist:
 *   <span data-color="rose">text</span>   colored text, named palette only
 *   <mark data-color="yellow">text</mark> highlighted text
 *   <u>text</u>                           underline
 *   ```chart                              a chart; the block body is a ChartSpec as JSON
 * Anything else in raw HTML is dropped by every renderer. Colors are names,
 * not hex, so each platform can pick shades that read in light and dark mode.
 */

export const TEXT_COLORS = ["rose", "violet", "blue", "teal", "green", "amber", "red", "gray"] as const;
export const HIGHLIGHT_COLORS = ["yellow", "pink", "green", "blue", "violet"] as const;

export type TextColor = (typeof TEXT_COLORS)[number];
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

/** Light-mode shades, matching the website's. */
export const TEXT_COLOR_HEX: Record<TextColor, string> = {
  rose: "#C2416F",
  violet: "#6A5BC9",
  blue: "#2F5FB3",
  teal: "#0F7A64",
  green: "#3B7A1E",
  amber: "#956410",
  red: "#B42318",
  gray: "#5E5566"
};

export const HIGHLIGHT_HEX: Record<HighlightColor, string> = {
  yellow: "#FFF1B8",
  pink: "#FCE1EC",
  green: "#DDF3E4",
  blue: "#DDE9FB",
  violet: "#ECE8FB"
};

export const isTextColor = (value: unknown): value is TextColor =>
  typeof value === "string" && (TEXT_COLORS as readonly string[]).includes(value);
export const isHighlightColor = (value: unknown): value is HighlightColor =>
  typeof value === "string" && (HIGHLIGHT_COLORS as readonly string[]).includes(value);

export type ChartType = "bar" | "line" | "pie";

export type ChartSpec = {
  type: ChartType;
  title?: string;
  /** Source or note shown under the chart. */
  caption?: string;
  /** Appended to values, e.g. "%" or " days". */
  unit?: string;
  labels: string[];
  /** Pie charts use the first series only. */
  series: { name: string; values: number[] }[];
};

/** Series colors, in order. */
export const CHART_COLORS: TextColor[] = ["rose", "violet", "teal", "amber", "blue", "green", "red", "gray"];

export const emptyChart = (): ChartSpec => ({
  type: "bar",
  title: "",
  caption: "",
  unit: "",
  labels: ["Jan", "Feb", "Mar"],
  series: [{ name: "Series 1", values: [3, 5, 4] }]
});

/** A ChartSpec from a chart block's JSON, or null when it isn't one. */
export function parseChartSpec(source: string): ChartSpec | null {
  try {
    const raw = JSON.parse(source) as Partial<ChartSpec>;
    if (!raw || !["bar", "line", "pie"].includes(String(raw.type))) return null;
    const labels = Array.isArray(raw.labels) ? raw.labels.map((l) => String(l ?? "")) : [];
    const series = (Array.isArray(raw.series) ? raw.series : [])
      .filter((s) => s && Array.isArray(s.values))
      .map((s) => ({
        name: String(s.name ?? ""),
        values: labels.map((_, i) => {
          const n = Number(s.values[i]);
          return Number.isFinite(n) ? n : 0;
        })
      }));
    if (!labels.length || !series.length) return null;
    return {
      type: raw.type as ChartType,
      title: raw.title ? String(raw.title) : "",
      caption: raw.caption ? String(raw.caption) : "",
      unit: raw.unit ? String(raw.unit) : "",
      labels,
      series
    };
  } catch {
    return null;
  }
}

/** Compact JSON for a chart block, without empty optional fields. */
export function stringifyChartSpec(spec: ChartSpec): string {
  const out: Record<string, unknown> = { type: spec.type };
  if (spec.title?.trim()) out.title = spec.title.trim();
  if (spec.caption?.trim()) out.caption = spec.caption.trim();
  if (spec.unit) out.unit = spec.unit;
  out.labels = spec.labels;
  out.series = spec.series;
  return JSON.stringify(out);
}

const CHART_FENCE = /```chart[^\n]*\n[\s\S]*?```/g;

/** Readable plain text from rich content: for cards, search snippets and previews. */
export function richTextToPlain(content: string): string {
  return String(content ?? "")
    .replace(CHART_FENCE, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
    .replace(/(\*\*|__|~~|\*|_|`)/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
