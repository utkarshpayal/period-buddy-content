import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Gift, IndianRupee, Send, Sliders, Ticket, UserPlus } from "lucide-react";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { Kpi, Notice } from "../../components/financeUi";
import { ReferralStatus, ReferralSummary, getReferralSummary } from "../../api/referralApi";
import { inr } from "../clinicalFinance/shared";
import { ReferralsTab } from "./ReferralsTab";
import { CreditsTab } from "./CreditsTab";
import { ReferralSettingsTab } from "./ReferralSettingsTab";
import { SessionMeter } from "./referralUi";

/** A KPI card that jumps to the matching list. */
const KpiButton: React.FC<{ active: boolean; onClick: () => void; label: string; children: React.ReactNode }> = ({ active, onClick, label, children }) => (
  <button type="button" className={`rf-kpi-btn ${active ? "is-active" : ""}`} onClick={onClick} title={label} aria-pressed={active}>
    {children}
  </button>
);

type TabKey = "referrals" | "credits" | "settings";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "referrals", label: "Referrals", icon: <UserPlus size={15} /> },
  { key: "credits", label: "Free sessions", icon: <Ticket size={15} /> },
  { key: "settings", label: "Settings", icon: <Sliders size={15} /> }
];

/**
 * Gynac Referrals: gynacs refer colleagues from their portal; a Clinical
 * Admin reviews each one and sends the invite. When the colleague joins, the
 * referrer gets commission-free sessions. Needs referrals.read (Clinical
 * Admin, Super Admin); changes need referrals.manage. Design:
 * docs/gynac-referrals-plan.md.
 */
export const GynacReferralsPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>("referrals");
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  // The Referrals tab's filter lives here so the KPI cards can set it.
  const [status, setStatus] = useState<ReferralStatus | "">("");
  const openList = (next: ReferralStatus | "") => {
    setStatus(next);
    setTab("referrals");
  };

  // KPIs refresh after any change made in a tab.
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const refreshSummary = useCallback(() => {
    getReferralSummary()
      .then((next) => {
        setSummary(next);
        setSummaryError(null);
      })
      .catch((err) => setSummaryError(err instanceof Error ? err.message : "Could not load the referral summary."));
  }, []);
  useEffect(refreshSummary, [refreshSummary]);

  const s = summary;
  return (
    <div className="workspace-page cf-page rf-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Clinical</p>
          <h2>Gynac Referrals</h2>
          <p className="subtitle-text">
            Colleagues gynacs refer are invited straight away. When one joins, their referrer gets {s?.settings.rewardSessions ?? 5}{" "}
            commission-free sessions.
          </p>
        </div>
      </header>

      {summaryError && (
        <Notice
          tone="error"
          action={
            <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={refreshSummary}>
              Retry
            </button>
          }
        >
          {summaryError}
        </Notice>
      )}

      {s && !s.settings.enabled && (
        <Notice tone="warn">
          The referral program is paused: gynacs can't send new referrals. Referrals already invited still earn their reward, and
          free sessions already granted keep working.
        </Notice>
      )}

      {s && (
        <div className="rf-kpis">
          <KpiButton active={tab === "referrals" && status === ""} onClick={() => openList("")} label="Show all referrals">
            <Kpi
              icon={<UserPlus size={15} />}
              tone="amber"
              label="Referred"
              value={Object.values(s.referrals).reduce((a, b) => a + b, 0)}
              hint={s.referrals.submitted ? `${s.referrals.submitted} to review` : "All time"}
            />
          </KpiButton>
          <KpiButton active={tab === "referrals" && status === "invited"} onClick={() => openList("invited")} label="Show invited referrals">
            <Kpi icon={<Send size={15} />} tone="brand" label="Invited" value={s.referrals.invited} hint="Not joined yet" />
          </KpiButton>
          <KpiButton active={tab === "referrals" && status === "onboarded"} onClick={() => openList("onboarded")} label="Show joined referrals">
            <Kpi icon={<CheckCircle2 size={15} />} tone="teal" label="Joined" value={s.referrals.onboarded} hint="Successful" />
          </KpiButton>
          <KpiButton active={tab === "credits"} onClick={() => setTab("credits")} label="Show free sessions">
            <Kpi
              icon={<Gift size={15} />}
              tone="accent"
              label="Free sessions"
              value={`${s.sessions.used}/${s.sessions.granted}`}
              hint={
                s.sessions.granted ? (
                  <SessionMeter used={s.sessions.used} total={s.sessions.granted} />
                ) : (
                  "Given when a referred gynac joins"
                )
              }
            />
          </KpiButton>
          <KpiButton active={false} onClick={() => setTab("credits")} label="Show free sessions">
            <Kpi icon={<IndianRupee size={15} />} tone="amber" label="Waived" value={inr(s.commissionForgone)} hint="On free sessions" />
          </KpiButton>
        </div>
      )}

      <div className="sub-layout">
        <nav className="sub-tab-nav" aria-label="Referral sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`sub-tab ${tab === t.key ? "active" : ""}`}
              aria-current={tab === t.key ? "page" : undefined}
              onClick={() => setTab(t.key)}
            >
              {t.icon}
              {t.label}
              {t.key === "referrals" && s?.referrals.submitted ? <span className="cf-segment-count">{s.referrals.submitted}</span> : null}
            </button>
          ))}
        </nav>

        <div className="sub-panel">
          <ErrorBoundary key={tab} label={`the ${tab} tab`}>
            {tab === "referrals" && (
              <ReferralsTab status={status} onStatusChange={setStatus} onChanged={refreshSummary} pendingLeads={s?.referrals.submitted ?? 0} />
            )}
            {tab === "credits" && <CreditsTab onChanged={refreshSummary} />}
            {tab === "settings" && <ReferralSettingsTab onChanged={refreshSummary} />}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};
