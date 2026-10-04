import React, { useState } from "react";
import { BookOpenText, LayoutGrid, RotateCcw, Send, Sliders, Stethoscope } from "lucide-react";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { OverviewTab } from "./OverviewTab";
import { PayoutsTab } from "./PayoutsTab";
import { DoctorsTab } from "./DoctorsTab";
import { LedgerTab } from "./LedgerTab";
import { SettingsTab } from "./SettingsTab";
import { RefundsTab } from "./RefundsTab";

type TabKey = "overview" | "payouts" | "refunds" | "doctors" | "ledger" | "settings";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <LayoutGrid size={15} /> },
  { key: "payouts", label: "Withdrawals", icon: <Send size={15} /> },
  { key: "refunds", label: "Refunds", icon: <RotateCcw size={15} /> },
  { key: "doctors", label: "Doctors & rates", icon: <Stethoscope size={15} /> },
  { key: "ledger", label: "Earnings ledger", icon: <BookOpenText size={15} /> },
  { key: "settings", label: "Settings", icon: <Sliders size={15} /> }
];

/**
 * Commission & Payouts: the platform's cut of each paid consultation, every
 * doctor's wallet and the withdrawal queue. Only Clinical Admin and Super
 * Admin can open it (payouts.read; changes need payouts.manage). Writes go
 * through api/financeApi.ts to /api/admin/clinical-finance/*. Design: docs/doctor-payouts.md.
 */
export const ClinicalFinancePage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="workspace-page cf-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Clinical</p>
          <h2>Commission & Payouts</h2>
          <p className="subtitle-text">
            Set the platform commission on consultations, see what every gynecologist has earned, and approve
            withdrawals to their bank account or UPI ID. Track refunds owed for cancelled sessions.
          </p>
        </div>
      </header>

      <div className="sub-layout">
        <nav className="sub-tab-nav" aria-label="Commission and payout sections">
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
            </button>
          ))}
        </nav>

        <div className="sub-panel">
          <ErrorBoundary key={tab} label={`the ${tab} tab`}>
            {tab === "overview" && <OverviewTab onOpenPayouts={() => setTab("payouts")} />}
            {tab === "payouts" && <PayoutsTab />}
            {tab === "refunds" && <RefundsTab />}
            {tab === "doctors" && <DoctorsTab />}
            {tab === "ledger" && <LedgerTab />}
            {tab === "settings" && <SettingsTab />}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};
