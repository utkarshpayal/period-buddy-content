import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { DocumentStatus, HrMeta, downloadBlob, hrApi } from "../../api/hrApi";

/* Shared bits for the HR pages (People & Letters, Letter Templates). */

export const DOC_STATUS: Record<DocumentStatus, { label: string; pill: string }> = {
  generated: { label: "Generated", pill: "gy-pill-muted" },
  sent: { label: "Sent", pill: "gy-pill-info" },
  viewed: { label: "Viewed", pill: "gy-pill-warn" },
  signed: { label: "Signed", pill: "gy-pill-ok" },
  revoked: { label: "Revoked", pill: "gy-pill-danger" }
};

export const DocStatusPill: React.FC<{ status: DocumentStatus }> = ({ status }) => (
  <span className={`gy-pill ${DOC_STATUS[status]?.pill ?? "gy-pill-muted"}`}>{DOC_STATUS[status]?.label ?? status}</span>
);

// /meta rarely changes: load it once per session and share it.
let metaPromise: Promise<HrMeta> | null = null;

export function useHrMeta() {
  const [meta, setMeta] = useState<HrMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    metaPromise ??= hrApi.meta();
    metaPromise
      .then((m) => alive && setMeta(m))
      .catch((err) => {
        metaPromise = null;
        if (alive) setError(err instanceof Error ? err.message : "Couldn't load HR settings.");
      });
    return () => {
      alive = false;
    };
  }, []);
  return { meta, error };
}

export const labelOf = <T extends string>(options: { value: T; label: string }[] | undefined, value: T) =>
  options?.find((o) => o.value === value)?.label ?? value;

/** A centred dialog in the workspace style (ws-invite-dialog). */
export const Dialog: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  wide?: boolean;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  as?: "div" | "form";
  onSubmit?: (e: React.FormEvent) => void;
}> = ({ title, subtitle, wide, onClose, footer, children, as = "div", onSubmit }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const Tag = as as "div";
  return (
    <div className="modal-overlay" onClick={onClose}>
      <Tag
        className={`ws-invite-dialog hr-dialog ${wide ? "is-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        {...(as === "form" ? { onSubmit } : {})}
      >
        <div className="ws-dialog-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="gy-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="ws-dialog-body">{children}</div>
        {footer && <div className="ws-dialog-actions">{footer}</div>}
      </Tag>
    </div>
  );
};

/** Show a PDF Blob in an overlay, with a download button. */
export const PdfModal: React.FC<{ title: string; file: Blob; filename: string; onClose: () => void }> = ({
  title,
  file,
  filename,
  onClose
}) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="modal-overlay hr-pdf-overlay" onClick={onClose}>
      <div className="hr-pdf-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="hr-pdf-head">
          <strong>{title}</strong>
          <div className="hr-row-actions">
            <button type="button" className="gy-btn gy-btn-ghost" onClick={() => downloadBlob(file, filename)}>
              <Download size={14} /> Download
            </button>
            <button type="button" className="gy-icon-btn" aria-label="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        {url && <iframe className="hr-pdf-frame" src={url} title={title} />}
      </div>
    </div>
  );
};

/** Turns "custom.team" into "Team (custom)" and built-ins into their meta label. */
export const placeholderLabel = (key: string, meta: HrMeta | null) =>
  key.startsWith("custom.")
    ? `${key.slice(7)} (custom)`
    : meta?.placeholders.find((p) => p.key === key)?.label ?? key;
