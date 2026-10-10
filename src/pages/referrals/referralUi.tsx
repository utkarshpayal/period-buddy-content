import React from "react";
import { Check, X } from "lucide-react";
import type { Referral } from "../../api/referralApi";

/*
 * Shared pieces for the referral pages (styles/referrals.css, rf-*): the
 * Admin Workspace's Gynac Referrals and the clinician portal's Refer & Earn.
 * Presentational only.
 */

const STAGES = ["Referred", "Invited", "Joined", "Rewarded"] as const;

/** How far a referral got: index of the last stage reached, and whether it stopped there. */
export function referralProgress(r: Pick<Referral, "status" | "rewardStatus">): { reached: number; stopped: boolean } {
  switch (r.status) {
    case "submitted":
      return { reached: 0, stopped: false };
    case "invited":
      return { reached: 1, stopped: false };
    case "onboarded":
      return r.rewardStatus === "granted" ? { reached: 3, stopped: false } : { reached: 2, stopped: r.rewardStatus === "skipped" };
    case "cancelled":
      // Closed after the invite went out.
      return { reached: 1, stopped: true };
    default:
      // rejected / withdrawn: stopped at review.
      return { reached: 0, stopped: true };
  }
}

/** Referred → Invited → Joined → Rewarded, with where this one is. */
export const ReferralStepper: React.FC<{ referral: Pick<Referral, "status" | "rewardStatus">; compact?: boolean }> = ({ referral, compact }) => {
  const { reached, stopped } = referralProgress(referral);
  return (
    <ol className={`rf-stepper ${compact ? "is-compact" : ""} ${stopped ? "is-stopped" : ""}`} aria-label="Referral progress">
      {STAGES.map((label, i) => {
        // Reached stages are done; the one after is where it stopped, or what's next.
        const state = i <= reached ? "done" : i === reached + 1 ? (stopped ? "stop" : "next") : "todo";
        return (
          <li key={label} className={`rf-step is-${state}`} aria-current={state === "next" ? "step" : undefined}>
            <span className="rf-step-dot" aria-hidden>
              {state === "done" ? <Check size={compact ? 10 : 12} strokeWidth={3} /> : state === "stop" ? <X size={compact ? 10 : 12} strokeWidth={3} /> : null}
            </span>
            {!compact && <span className="rf-step-label">{label}</span>}
          </li>
        );
      })}
    </ol>
  );
};

/** used / granted as a segmented bar (one segment per session up to 10, a plain bar beyond). */
export const SessionMeter: React.FC<{ used: number; total: number; label?: string; tone?: "teal" | "light" }> = ({
  used,
  total,
  label,
  tone = "teal"
}) => {
  const safeTotal = Math.max(0, total);
  const pct = safeTotal ? Math.min(100, (used / safeTotal) * 100) : 0;
  return (
    <div
      className={`rf-meter is-${tone}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-valuenow={used}
      aria-label={label ?? `${used} of ${safeTotal} free sessions used`}
    >
      {safeTotal > 0 && safeTotal <= 10 ? (
        <div className="rf-meter-segments">
          {Array.from({ length: safeTotal }, (_, i) => (
            <span key={i} className={i < used ? "is-used" : ""} />
          ))}
        </div>
      ) : (
        <div className="rf-meter-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
};

/** Two-letter initials in a soft circle. */
export const Initials: React.FC<{ name?: string; size?: "sm" | "md" }> = ({ name = "?", size = "sm" }) => {
  const text =
    name
      .replace(/^dr\.?\s+/i, "")
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <span className={`rf-initials is-${size}`} aria-hidden>
      {text}
    </span>
  );
};

/** "today" / "yesterday" / "5 days ago" by calendar day in the viewer's time zone. */
export const relativeDay = (iso?: string | null) => {
  if (!iso) return "";
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(new Date()) - midnight(new Date(iso))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
