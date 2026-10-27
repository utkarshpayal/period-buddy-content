import React, { Suspense, lazy } from "react";
import type { RichTextVariant } from "./RichTextEditor";

export type { RichTextVariant };

// TipTap is large: load it when an editor first opens, not with the app.
const LazyEditor = lazy(() => import("./RichTextEditor").then((m) => ({ default: m.RichTextEditor })));

type Props = React.ComponentProps<typeof LazyEditor>;

export const RichTextEditor: React.FC<Props> = (props) => (
  <Suspense fallback={<div aria-busy="true" className={`rte rte-${props.variant ?? "full"} rte-loading`} />}>
    <LazyEditor {...props} />
  </Suspense>
);

const LazyPreview = lazy(() => import("./RichPreview").then((m) => ({ default: m.RichPreview })));

/** Read-only rendering of rich content, for preview panes. */
export const RichPreview: React.FC<{ content: string; empty?: string }> = ({ content, empty }) =>
  content.trim() ? (
    <Suspense fallback={<div aria-busy="true" className="rte-preview rte-preview-loading" />}>
      <LazyPreview content={content} />
    </Suspense>
  ) : (
    <p className="rte-preview-empty">{empty}</p>
  );
