import React, { useState } from "react";
import { LayoutGrid, ListChecks, Package, Sliders, Tag } from "lucide-react";
import { OverviewTab } from "./OverviewTab";
import { FeaturesTab } from "./FeaturesTab";
import { PlansTab } from "./PlansTab";
import { CouponsTab } from "./CouponsTab";
import { SettingsTab } from "./SettingsTab";
import { ErrorBoundary } from "../../components/ErrorBoundary";

type TabKey = "overview" | "features" | "plans" | "coupons" | "settings";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <LayoutGrid size={15} /> },
  { key: "features", label: "Features", icon: <ListChecks size={15} /> },
  { key: "plans", label: "Plans", icon: <Package size={15} /> },
  { key: "coupons", label: "Coupons", icon: <Tag size={15} /> },
  { key: "settings", label: "Settings", icon: <Sliders size={15} /> }
];

/**
 * The Subscriptions workspace — one route with its own section menu rather
 * than four separate sidebar links (matches how "Studio Settings" is a
 * single destination). Features/Plans/Settings all write through
 * api/subscriptionApi.ts to /api/admin/subscriptions/*.
 */
export const SubscriptionsPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="workspace-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Monetization</p>
          <h2>Subscriptions</h2>
          <p className="subtitle-text">
            Turn premium features on or off, price them individually or bundle them into plans,
            and track purchases — all without touching the app or backend.
          </p>
        </div>
      </header>

      <div className="sub-layout">
        <nav className="sub-tab-nav" aria-label="Subscription sections">
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
          {/* keyed by tab so switching tabs clears a previous tab's crash */}
          <ErrorBoundary key={tab} label={`the ${tab} tab`}>
            {tab === "overview" && <OverviewTab />}
            {tab === "features" && <FeaturesTab />}
            {tab === "plans" && <PlansTab />}
            {tab === "coupons" && <CouponsTab />}
            {tab === "settings" && <SettingsTab />}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};
