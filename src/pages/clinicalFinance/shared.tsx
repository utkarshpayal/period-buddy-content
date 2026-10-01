import React from "react";
import { Loader2 } from "lucide-react";
import type { PayoutStatus } from "../../api/doctorApi";
import { Notice, Pill, type PillTone } from "../../components/financeUi";

/** ₹ with Indian grouping, up to 2 decimals; negative amounts get a minus. */
export const inr = (n?: number | null) => {
  const value = n ?? 0;
  const text = Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `${value < 0 ? "−" : ""}₹${text}`;
};

export const dateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

export const PAYOUT_STATUS: Record<PayoutStatus, { label: string; tone: PillTone }> = {
  requested: { label: "Awaiting approval", tone: "warn" },
  approved: { label: "Sending", tone: "info" },
  processing: { label: "Processing", tone: "info" },
  success: { label: "Paid", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  rejected: { label: "Declined", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
  reversed: { label: "Returned by bank", tone: "danger" }
};

export const PayoutPill: React.FC<{ status: PayoutStatus }> = ({ status }) => {
  const meta = PAYOUT_STATUS[status] ?? { label: status, tone: "muted" as PillTone };
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
};

/** On hold / withdrawable / reversed, from an earning row. */
export const earningState = (e: { status: string; availableAt?: string | null }): { label: string; tone: PillTone } => {
  if (e.status === "reversed") return { label: "Reversed", tone: "muted" };
  if (!e.availableAt) return { label: "On hold", tone: "warn" };
  if (new Date(e.availableAt) > new Date()) {
    return { label: `On hold until ${new Date(e.availableAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`, tone: "warn" };
  }
  return { label: "Withdrawable", tone: "ok" };
};

export const ErrorAlert: React.FC<{ message: string | null }> = ({ message }) =>
  message ? <Notice tone="error">{message}</Notice> : null;

export const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export const Loading: React.FC<{ label: string }> = ({ label }) => (
  <div className="cf-empty" role="status">
    <Loader2 size={20} className="spin" aria-hidden />
    <span>{label}</span>
  </div>
);
