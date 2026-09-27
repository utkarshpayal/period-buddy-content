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
