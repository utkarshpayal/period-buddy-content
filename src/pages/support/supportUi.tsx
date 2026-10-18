import React from "react";
import { MessageCircleReply } from "lucide-react";
import type { TicketPriority, TicketStatus } from "../../api/supportApi";

export const STATUS_META: Record<TicketStatus, { label: string; cls: string }> = {
  open: { label: "Open", cls: "gy-pill-info" },
  in_progress: { label: "In progress", cls: "gy-pill-warn" },
  resolved: { label: "Resolved", cls: "gy-pill-ok" },
  closed: { label: "Closed", cls: "gy-pill-muted" }
};

export const PRIORITY_META: Record<TicketPriority, { label: string; cls: string }> = {
  low: { label: "Low", cls: "gy-pill-muted" },
  normal: { label: "Normal", cls: "gy-pill-plum" },
  high: { label: "High", cls: "gy-pill-warn" },
  urgent: { label: "Urgent", cls: "gy-pill-danger" }
};

export const StatusPill: React.FC<{ status: TicketStatus }> = ({ status }) => {
  const meta = STATUS_META[status] ?? { label: status, cls: "gy-pill-muted" };
  return <span className={`gy-pill ${meta.cls}`}>{meta.label}</span>;
};

export const PriorityPill: React.FC<{ priority: TicketPriority }> = ({ priority }) => {
  const meta = PRIORITY_META[priority] ?? { label: priority, cls: "gy-pill-muted" };
  return <span className={`gy-pill sp-priority ${meta.cls}`}>{meta.label}</span>;
};

/** The person replied last: staff owe an answer. */
export const AwaitingBadge: React.FC = () => (
  <span className="sp-awaiting" title="The person replied last and is waiting on us">
    <MessageCircleReply size={12} /> Awaiting reply
  </span>
);

/** Absolute time for tooltips and the thread. */
export const formatDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      })
    : "—";

export const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
