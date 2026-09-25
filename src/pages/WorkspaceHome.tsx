import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ClipboardList, Hourglass, Inbox, Send, Users } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { visibleSections } from "../navigation";
import { PERMISSIONS, roleLabel } from "../auth/access";
import { getAnalytics, isAdminApiConfigured, PlatformAnalytics } from "../api/adminApi";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/** Role-aware landing page: what needs attention, key numbers for the
 * areas this person works in, and shortcuts to everything they can open. */
export const WorkspaceHome: React.FC = () => {
  const { authSession, access, can, items, pendingContent, approvalSummary } = useAppContext();
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);

  const canAnalytics = can(PERMISSIONS.ANALYTICS_READ);
  const canContent = can(PERMISSIONS.CONTENT_READ);
  const isApprover = can(PERMISSIONS.CONTENT_APPROVE, PERMISSIONS.APP_APPROVE);

  useEffect(() => {
    if (!canAnalytics || !isAdminApiConfigured) return;
    getAnalytics().then(setAnalytics).catch(() => undefined);
  }, [canAnalytics]);

  const sections = useMemo(
    () =>
      visibleSections(can)
        .map((s) => ({ ...s, items: s.items.filter((i) => i.path !== "/" && i.path !== "/approvals") }))
        .filter((s) => s.items.length),
    [can]
  );

  const content = useMemo(
    () => ({
      published: items.filter((i) => i.status === "published").length,
      drafts: items.filter((i) => i.status === "draft").length
    }),
    [items]
  );

  const firstName = authSession?.user?.firstName || authSession?.user?.name?.split(" ")[0] || "there";
  const label = access?.roleLabel ?? roleLabel(authSession?.user?.role);

  return (
    <div className="workspace-page ws-home">
      <section className={`ws-hero dept-${access?.department ?? "organisation"}`}>
        <div>
          <p className="eyebrow">{label}</p>
          <h2>
            {greeting()}, {firstName}
          </h2>
          <p className="subtitle-text">
            {isApprover
              ? "Here's what your team is working on and what's waiting for your sign-off."
              : "Here's a quick look at your work. Changes that need approval are tracked in Approvals."}
          </p>
        </div>
        <Link to="/approvals" className="ws-hero-cta">
          <Inbox size={18} />
          {isApprover ? `${approvalSummary.toReview} to review` : `${approvalSummary.minePending} pending`}
          <ArrowRight size={16} />
        </Link>
      </section>

      <section className="ws-kpi-grid" aria-label="Key numbers">
        {isApprover && (
          <Kpi icon={<Inbox size={20} />} tone="alert" label="Waiting for your review" value={approvalSummary.toReview} to="/approvals" />
        )}
        <Kpi icon={<Hourglass size={20} />} tone="warn" label="Your pending requests" value={approvalSummary.minePending} to="/approvals" />
        {canContent && (
          <>
            <Kpi icon={<CheckCircle2 size={20} />} tone="ok" label="Live content" value={content.published} to="/content" />
            <Kpi icon={<ClipboardList size={20} />} label="Drafts" value={content.drafts} to="/content" hint={pendingContent.size ? `${pendingContent.size} awaiting approval` : undefined} />
          </>
        )}
        {canAnalytics && analytics && (
          <>
            <Kpi icon={<Users size={20} />} label="App users" value={analytics.users.total} to="/analytics" hint={`+${analytics.users.newLast7Days} this week`} />
            <Kpi icon={<Send size={20} />} tone="ok" label="Active users" value={analytics.users.active} to="/users" />
          </>
        )}
      </section>

      {sections.map((section) => (
        <section key={section.id} className="ws-shortcut-section">
          <h3 className="admin-section-title">{section.label}</h3>
          <div className="ws-shortcut-grid">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.path} to={item.path} className="ws-shortcut">
                  <span className={`ws-shortcut-icon dept-${section.id}`}>
                    <Icon size={18} />
                  </span>
                  <span className="ws-shortcut-text">
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </span>
                  <ArrowRight size={16} className="ws-shortcut-arrow" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

const Kpi: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  to: string;
  hint?: string;
  tone?: "ok" | "warn" | "alert";
}> = ({ icon, label, value, to, hint, tone }) => (
  <Link to={to} className={`ws-kpi ${tone ? `tone-${tone}` : ""}`}>
    <span className="ws-kpi-icon">{icon}</span>
    <span className="ws-kpi-label">{label}</span>
    <strong className="ws-kpi-value">{value.toLocaleString()}</strong>
    {hint && <span className="ws-kpi-hint">{hint}</span>}
  </Link>
);
