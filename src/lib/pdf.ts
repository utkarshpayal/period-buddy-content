import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
// Vite copies the worker into the build and gives us its URL, so pdf.js
// parses PDFs off the main thread with no CDN involved.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export type LoadedPdf = PDFDocumentProxy;

/** Open a PDF from a Blob (template or generated document). */
export async function loadPdf(data: Blob): Promise<LoadedPdf> {
  const bytes = new Uint8Array(await data.arrayBuffer());
  return getDocument({ data: bytes }).promise;
}

/**
 * Draw one page (0-based) into `canvas` at `cssWidth` CSS pixels wide,
 * sharp on high-DPI screens. `promise` resolves to the scale in CSS px per
 * PDF point, which callers use to convert clicks into PDF coordinates.
 * Call `cancel()` from an effect cleanup: pdf.js refuses two renders on one
 * canvas at once (which React's dev double-effects would otherwise cause).
 */
export function renderPage(pdf: LoadedPdf, pageIndex: number, canvas: HTMLCanvasElement, cssWidth: number) {
  let cancelled = false;
  let task: { cancel: () => void } | null = null;
  const promise = (async () => {
    const page = await pdf.getPage(pageIndex + 1);
    if (cancelled) throw new Error("cancelled");
    const base = page.getViewport({ scale: 1 });
    const scale = cssWidth / base.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: scale * dpr });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${(base.height * scale).toFixed(1)}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return scale;
    const render = page.render({ canvasContext: ctx, viewport });
    task = render;
    await render.promise;
    return scale;
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    }
  };
}

/** One printed line of a design that has typed field names in it. */
export type DetectedLine = {
  page: number;
  /** Printed box of the whole line, PDF points from the page's top-left. */
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  /** Sits on the page's centre line (e.g. a certificate name). */
  centered: boolean;
  pageWidth: number;
  /** The line as printed, placeholders included ("from [ DD Month YYYY ] to …"). */
  text: string;
  /** The design's font looks like a serif (from the PDF's font info). */
  serif: boolean;
  /** Each placeholder's raw text and the words just before it (for "from … to …" dates). */
  placeholders: { raw: string; name: string; before: string }[];
  /** The line is nothing but one placeholder ("[ Candidate Full Name ]"). */
  alone: boolean;
  /** No placeholder of its own, but part of one moved up from it: redraw what's left. */
  remainder?: boolean;
};

const TYPED_FIELD = /\{\{\s*([^{}]{1,60}?)\s*\}\}|\{\s*([A-Za-z][^{}]{0,58}?)\s*\}|\[\s*([^[\]]{1,50}?)\s*\]/g;

/**
 * Find the lines of a Canva design that have field names typed into them
 * ("{{First Name}}", "{Role}", "[ Candidate Full Name ]"). Text runs on the
 * same baseline are joined into one line, and a placeholder broken over two
 * lines ("[ DD" / "Month YYYY ]") is joined onto the first. The editor turns
 * each line into a field and covers the printed line.
 */
export async function detectPlaceholders(pdf: LoadedPdf): Promise<DetectedLine[]> {
  const out: DetectedLine[] = [];
  for (let i = 0; i < pdf.numPages; i += 1) {
    const page = await pdf.getPage(i + 1);
    const { width: pageWidth, height: pageHeight } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    type Run = { str: string; x: number; base: number; w: number; size: number; serif: boolean };
    const styles = content.styles as Record<string, { fontFamily?: string }>;
    const runs: Run[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , c, d, e, f] = item.transform as number[];
      const family = `${styles[item.fontName]?.fontFamily ?? ""} ${item.fontName}`.toLowerCase();
      runs.push({
        str: item.str,
        x: e,
        base: f,
        w: item.width,
        size: Math.hypot(c, d) || item.height || 12,
        serif: /serif|garamond|cormorant|playfair|times|georgia|lora|merriweather/.test(family) && !/sans/.test(family)
      });
    }
    // Lines: runs sharing a baseline, left to right; lines top to bottom. A
    // wide gap starts a new segment, so "Utkarsh" on the left and "Ref: …" on
    // the right of the same row stay separate.
    const rows: Run[][] = [];
    for (const r of [...runs].sort((a, b) => b.base - a.base || a.x - b.x)) {
      const row = rows.find((l) => Math.abs(l[0].base - r.base) < Math.max(1.5, r.size * 0.25));
      if (row) row.push(r);
      else rows.push([r]);
    }
    const lines: Run[][] = [];
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      let seg: Run[] = [];
      for (const r of row) {
        const prev = seg[seg.length - 1];
        if (prev && r.x - (prev.x + prev.w) > Math.max(prev.size, r.size) * 3) {
          lines.push(seg);
          seg = [];
        }
        seg.push(r);
      }
      if (seg.length) lines.push(seg);
    }
    const merged = lines.map((l) => {
      l.sort((a, b) => a.x - b.x);
      let text = "";
      let end = l[0].x;
      for (const r of l) {
        if (text && r.x - end > r.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(r.str)) text += " ";
        text += r.str;
        end = r.x + r.w;
      }
      const x = l[0].x;
      const size = Math.max(...l.map((r) => r.size));
      const biggest = l.reduce((a, b) => (b.size > a.size ? b : a));
      return { text, x, width: end - x, base: l[0].base, size, serif: biggest.serif, remainder: false };
    });
    // Join a placeholder broken across two lines onto the first line.
    for (let k = 0; k < merged.length - 1; k += 1) {
      const open = /(\[[^\]]*|\{\{[^}]*)$/.exec(merged[k].text);
      const next = merged[k + 1];
      if (!open || next.base < merged[k].base - merged[k].size * 2.2) continue;
      const close = open[0].startsWith("[") ? /^[^\]]*\]/.exec(next.text) : /^[^}]*\}\}/.exec(next.text);
      if (!close) continue;
      merged[k].text += ` ${close[0].trim()}`;
      next.text = next.text.slice(close[0].length).trim();
      next.remainder = true;
    }
    for (const l of merged) {
      const placeholders: DetectedLine["placeholders"] = [];
      for (const m of l.text.matchAll(TYPED_FIELD)) {
        placeholders.push({
          raw: m[0],
          name: (m[1] ?? m[2] ?? m[3] ?? "").replace(/\s+/g, " ").trim(),
          before: l.text.slice(0, m.index).slice(-24)
        });
      }
      if (!placeholders.length && !l.remainder) continue;
      out.push({
        page: i,
        x: l.x,
        // Cap height to just under the baseline: the printed glyphs, not the
        // line box, so a cover never clips a rule drawn under the text.
        y: pageHeight - l.base - l.size * 0.8,
        width: l.width,
        height: l.size * 1.02,
        fontSize: l.size,
        centered: Math.abs(l.x + l.width / 2 - pageWidth / 2) < pageWidth * 0.04,
        pageWidth,
        text: l.text,
        serif: l.serif,
        placeholders,
        alone: placeholders.length === 1 && l.text.trim() === placeholders[0].raw.trim(),
        remainder: !placeholders.length && l.remainder
      });
    }
  }
  return out;
}
