import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, IndianRupee, Loader2, Package, Receipt, RefreshCw, Sparkles, TrendingUp, Users } from "lucide-react";
import {
  Entitlement,
  SubscriptionOverview,
  adminListFeatures,
  getSubscriptionOverview,
  getSubscriptionSettings
} from "../../api/subscriptionApi";

type Tone = "rose" | "plum" | "teal" | "amber";

const Kpi: React.FC<{ icon: React.ReactNode; tone: Tone; label: string; value: React.ReactNode; hint?: string }> = ({
  icon,
  tone,
  label,
  value,
  hint
}) => (
  <div className="sub-kpi">
    <span className={`sub-kpi-icon i-${tone}`} aria-hidden="true">{icon}</span>
    <div className="sub-kpi-text">
      <span className="sub-kpi-label">{label}</span>
      <span className="sub-kpi-value">{value}</span>
      {hint && <span className="sub-kpi-hint">{hint}</span>}
    </div>
  </div>
);

type BreakdownRow = { id: string; name: string; total: number; count: number };

/** A ranked list with a share bar per row: the dashboard's revenue breakdowns. */
const Breakdown: React.FC<{
  title: string;
  icon: React.ReactNode;
  rows: BreakdownRow[];
  empty: string;
  money: (n: number) => string;
}> = ({ title, icon, rows, empty, money }) => {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const sum = sorted.reduce((acc, r) => acc + r.total, 0);
  return (
    <section className="sub-panel-card">
      <header className="sub-panel-head">
        <h3>
          {icon}
          {title}
        </h3>
        {sum > 0 && <span>{money(sum)}</span>}
      </header>
      {sorted.length === 0 ? (
        <p className="sub-panel-empty">{empty}</p>
      ) : (
        <ul className="sub-breakdown">
          {sorted.map((row) => {
            const share = sum ? Math.round((row.total / sum) * 100) : 0;
            return (
              <li key={row.id}>
                <div className="sub-breakdown-row">
                  <span className="sub-breakdown-name" title={row.name}>{row.name}</span>
                  <span className="sub-breakdown-total">{money(row.total)}</span>
                </div>
                <div className="sub-breakdown-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(share, 2)}%` }} />
                </div>
                <div className="sub-breakdown-meta">
                  {row.count} purchase{row.count === 1 ? "" : "s"} · {share}% of revenue
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
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

const STATUS_LABEL: Record<Entitlement["status"], string> = {
  active: "Active",
  expired: "Expired",
  pending: "Pending",
  cancelled: "Cancelled",
  failed: "Failed"
};

function moneyFormatter(currency: string) {
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });
  } catch {
    fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
  }
  return (n: number) => fmt.format(n || 0);
}

export const OverviewTab: React.FC = () => {
  const [data, setData] = useState<SubscriptionOverview | null>(null);
  const [currency, setCurrency] = useState("INR");
  const [featureNames, setFeatureNames] = useState<Record<string, string>>({});
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
    // Currency and feature names only make the numbers friendlier; the
    // overview still renders (INR, raw keys) if either request fails.
    getSubscriptionSettings()
      .then((s) => s?.currency && setCurrency(s.currency))
      .catch(() => {});
    adminListFeatures()
      .then((list) => setFeatureNames(Object.fromEntries(list.map((f) => [f.key, f.name]))))
      .catch(() => {});
  }, []);

  const money = useMemo(() => moneyFormatter(currency), [currency]);
  const featureName = (key?: string) => (key ? featureNames[key] ?? key : "Feature");
  const txLabel = (tx: Entitlement) =>
    tx.source === "plan" ? (typeof tx.plan === "object" && tx.plan ? tx.plan.name : "Plan") : featureName(tx.featureKey);

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

  const avg = data.totalPaidTransactions ? data.totalRevenue / data.totalPaidTransactions : 0;

  return (
    <div className="sub-dashboard">
      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="sub-kpi-grid">
        <Kpi icon={<Users size={18} />} tone="teal" label="Active subscribers" value={data.activeSubscribers.toLocaleString("en-IN")} />
        <Kpi icon={<IndianRupee size={18} />} tone="rose" label="Total revenue" value={money(data.totalRevenue)} hint="All time" />
        <Kpi
          icon={<Receipt size={18} />}
          tone="amber"
          label="Paid transactions"
          value={data.totalPaidTransactions.toLocaleString("en-IN")}
        />
        <Kpi icon={<TrendingUp size={18} />} tone="plum" label="Average per transaction" value={money(avg)} />
      </div>

      <div className="sub-panel-grid">
        <Breakdown
          title="Revenue by plan"
          icon={<Package size={16} />}
          money={money}
          empty="No plan purchases yet."
          rows={data.revenueByPlan.map((r) => ({
            id: r._id ?? "deleted",
            name: r.name ?? "Deleted plan",
            total: r.total,
            count: r.count
          }))}
        />
        <Breakdown
          title="Revenue by feature"
          icon={<Sparkles size={16} />}
          money={money}
          empty="No single-feature purchases yet."
          rows={data.revenueByFeature.map((r) => ({ id: r._id, name: featureName(r._id), total: r.total, count: r.count }))}
        />
      </div>

      <section className="sub-panel-card">
        <header className="sub-panel-head">
          <h3>
            <Receipt size={16} />
            Recent transactions
          </h3>
          <button type="button" className="gy-btn gy-btn-ghost" onClick={() => load(page)} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : undefined} /> Refresh
          </button>
        </header>
        {data.recentTransactions.length === 0 ? (
          <p className="sub-panel-empty">No purchases yet. They'll appear here as soon as someone subscribes.</p>
        ) : (
          <div className="sub-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Purchase</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTransactions.map((tx) => (
                  <tr key={tx._id}>
                    <td>
                      <div className="admin-user-name">{userLabel(tx)}</div>
                      {tx.user && typeof tx.user === "object" && tx.user.email && (
                        <div className="admin-user-sub">{tx.user.email}</div>
                      )}
                    </td>
                    <td>
                      <div>{txLabel(tx)}</div>
                      <div className="admin-user-sub">{tx.source === "plan" ? "Plan" : "Single feature"}</div>
                    </td>
                    <td>
                      <span className={`gy-pill ${STATUS_TONE[tx.status]}`}>{STATUS_LABEL[tx.status]}</span>
                    </td>
                    <td data-label="Date">
                      {new Date(tx.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                      {moneyFormatter(tx.currency || currency)(tx.amount ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.pagination.pages > 1 && (
          <div className="sub-table-foot">
            <button
              type="button"
              className="gy-btn gy-btn-ghost"
              disabled={page <= 1 || loading}
              onClick={() => load(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {data.pagination.pages}
            </span>
            <button
              type="button"
              className="gy-btn gy-btn-ghost"
              disabled={page >= data.pagination.pages || loading}
              onClick={() => load(page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
