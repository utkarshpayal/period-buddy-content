import React, { useEffect, useState } from "react";
import { AlertCircle, IndianRupee, Loader2, Package, Users } from "lucide-react";
import { Entitlement, SubscriptionOverview, getSubscriptionOverview } from "../../api/subscriptionApi";

type Tone = "rose" | "plum" | "teal" | "amber" | "green";

// Mirrors AnalyticsPage.tsx's local Metric tile so this tab visually matches
// the rest of the admin's stat displays.
const Metric: React.FC<{ icon: React.ReactNode; tone: Tone; label: string; value: React.ReactNode; hint?: string }> = ({
  icon,
  tone,
  label,
  value,
  hint
}) => (
  <div className="admin-metric">
    <div className="admin-metric-top">
      <span className={`admin-metric-icon i-${tone}`}>{icon}</span>
      <span className="admin-metric-label">{label}</span>
    </div>
    <div className="admin-metric-value">{value}</div>
    {hint && <div className="admin-metric-hint">{hint}</div>}
  </div>
);

const txLabel = (tx: Entitlement) => {
  if (tx.source === "plan") {
    return typeof tx.plan === "object" && tx.plan ? tx.plan.name : "Plan";
  }
  return tx.featureKey ?? "Feature";
};

// `user` is null when the buyer's account was deleted after purchasing
// (populate() finds nothing) — must not crash the whole page.
const userLabel = (tx: Entitlement) => {
  if (!tx.user) return "Deleted account";
  if (typeof tx.user === "string") return tx.user;
  return [tx.user.firstName, tx.user.lastName].filter(Boolean).join(" ") || tx.user.email || tx.user._id;
};

const STATUS_TONE: Record<Entitlement["status"], string> = {
  active: "gy-pill-ok",
  expired: "gy-pill-muted",
  pending: "gy-pill-warn",
  cancelled: "gy-pill-muted",
  failed: "gy-pill-danger"
};

export const OverviewTab: React.FC = () => {
  const [data, setData] = useState<SubscriptionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSubscriptionOverview({ page: targetPage, limit: 20 });
      setData(res);
      setPage(res.pagination.page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the subscription overview.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  if (loading && !data) {
    return (
      <div className="gy-empty">
        <Loader2 size={20} className="spin" />
        <span>Loading overview…</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="gy-alert gy-alert-error">
        <AlertCircle size={16} />
        <span>{error}</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <p className="admin-section-title" style={{ marginTop: 4 }}>At a glance</p>
      <div className="admin-metric-grid">
        <Metric icon={<Users size={17} />} tone="teal" label="Active subscribers" value={data.activeSubscribers} />
        <Metric
          icon={<IndianRupee size={17} />}
          tone="amber"
          label="Total revenue"
          value={data.totalRevenue.toLocaleString()}
          hint={`${data.totalPaidTransactions} paid transactions`}
        />
        <Metric icon={<Package size={17} />} tone="plum" label="Plans generating revenue" value={data.revenueByPlan.length} />
        <Metric icon={<Package size={17} />} tone="rose" label="Features generating revenue" value={data.revenueByFeature.length} />
      </div>

      {data.revenueByPlan.length > 0 && (
        <>
          <p className="admin-section-title">Revenue by plan</p>
          <div className="admin-metric-grid">
            {data.revenueByPlan.map((row) => (
              <Metric
                key={row._id ?? "unknown"}
                icon={<Package size={17} />}
                tone="teal"
                label={row.name ?? "Deleted plan"}
                value={row.total.toLocaleString()}
                hint={`${row.count} purchase${row.count === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        </>
      )}

      {data.revenueByFeature.length > 0 && (
        <>
          <p className="admin-section-title">Revenue by feature</p>
          <div className="admin-metric-grid">
            {data.revenueByFeature.map((row) => (
              <Metric
                key={row._id}
                icon={<Package size={17} />}
                tone="rose"
                label={row._id}
                value={row.total.toLocaleString()}
                hint={`${row.count} purchase${row.count === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        </>
      )}

      <p className="admin-section-title">Recent transactions</p>
      {data.recentTransactions.length === 0 ? (
        <div className="gy-empty">
          <span>No purchases yet.</span>
        </div>
      ) : (
        <div className="gy-table gy-table-5">
          <div className="gy-tr gy-th">
            <span>User</span>
            <span>Item</span>
            <span>Amount</span>
            <span>Status</span>
            <span>Date</span>
          </div>
          {data.recentTransactions.map((tx) => (
            <div className="gy-tr" key={tx._id}>
              <span>{userLabel(tx)}</span>
              <span>{txLabel(tx)}</span>
              <span>
                {tx.currency} {(tx.amount ?? 0).toLocaleString()}
              </span>
              <span>
                <span className={`gy-pill ${STATUS_TONE[tx.status]}`}>{tx.status}</span>
              </span>
              <span>{new Date(tx.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      {data.pagination.pages > 1 && (
        <div className="scheme-pagination">
          <button
            type="button"
            className="gy-btn gy-btn-ghost"
            disabled={page <= 1}
            onClick={() => load(page - 1)}
          >
            Previous
          </button>
          <span className="scheme-page-indicator">
            Page {page} of {data.pagination.pages}
          </span>
          <button
            type="button"
            className="gy-btn gy-btn-ghost"
            disabled={page >= data.pagination.pages}
            onClick={() => load(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
