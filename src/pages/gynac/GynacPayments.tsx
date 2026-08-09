import React, { useEffect, useState } from "react";
import { Loader2, AlertCircle, Wallet, TrendingUp, Hash } from "lucide-react";
import { PaymentsData, getPayments, patientName, formatMoney } from "../../api/doctorApi";
import { GynacHead } from "./GynacHead";

export const GynacPayments: React.FC = () => {
  const [data, setData] = useState<PaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setData(await getPayments());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load payments.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="workspace-page">
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading payments…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="workspace-page">
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error ?? "No data."}</span>
        </div>
      </div>
    );
  }

  const currency = data.currency || "INR";

  return (
    <div className="workspace-page">
      <GynacHead title="Payments & Earnings" subtitle="Your paid consultations and total revenue." />

      <section className="gy-stat-grid">
        <article className="gy-stat-card">
          <div className="gy-stat-icon gy-icon-green"><Wallet size={20} /></div>
          <div>
            <p className="gy-stat-value">{formatMoney(data.total, currency)}</p>
            <p className="gy-stat-label">Total earnings</p>
          </div>
        </article>
        <article className="gy-stat-card">
          <div className="gy-stat-icon gy-icon-blue"><Hash size={20} /></div>
          <div>
            <p className="gy-stat-value">{data.count}</p>
            <p className="gy-stat-label">Paid sessions</p>
          </div>
        </article>
        <article className="gy-stat-card">
          <div className="gy-stat-icon gy-icon-rose"><TrendingUp size={20} /></div>
          <div>
            <p className="gy-stat-value">
              {formatMoney(data.count ? Math.round(data.total / data.count) : 0, currency)}
            </p>
            <p className="gy-stat-label">Avg. per session</p>
          </div>
        </article>
      </section>

      <section className="gy-card">
        <div className="gy-card-head">
          <h3>Transaction history</h3>
        </div>
        {data.payments.length === 0 ? (
          <p className="gy-muted">No payments yet.</p>
        ) : (
          <div className="gy-table gy-table-4">
            <div className="gy-tr gy-th">
              <span>Patient</span>
              <span>Amount</span>
              <span>Status</span>
              <span>Date</span>
            </div>
            {data.payments.map((p) => (
              <div className="gy-tr" key={p._id}>
                <span>{patientName(p.userId)}</span>
                <span>{formatMoney(p.amountPaid, p.currency || currency)}</span>
                <span><em className={`gy-pill gy-status-${p.status}`}>{p.status}</em></span>
                <span className="gy-muted">
                  {p.startedAt
                    ? new Date(p.startedAt).toLocaleDateString()
                    : p.createdAt
                    ? new Date(p.createdAt).toLocaleDateString()
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
