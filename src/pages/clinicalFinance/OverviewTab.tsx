import React, { useEffect, useState } from "react";
import { Clock, HandCoins, IndianRupee, Percent, RefreshCw, Send, Wallet } from "lucide-react";
import { FinanceOverview, getFinanceOverview } from "../../api/financeApi";
import { Kpi, Notice } from "../../components/financeUi";
import { ErrorAlert, Loading, errorText, inr } from "./shared";

export const OverviewTab: React.FC<{ onOpenPayouts: () => void }> = ({ onOpenPayouts }) => {
  const [data, setData] = useState<FinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getFinanceOverview());
    } catch (err) {
      setError(errorText(err, "Could not load the overview."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) return <Loading label="Loading overview…" />;
  if (!data) return <ErrorAlert message={error ?? "Nothing to show."} />;

  const s = data.settings;
  return (
    <div className="cf-stack">
      <ErrorAlert message={error} />

      {data.awaitingApproval.count > 0 && (
        <Notice
          tone="warn"
          action={
            <button type="button" className="cf-btn cf-btn-primary cf-btn-sm" onClick={onOpenPayouts}>
              <Send size={14} /> Review
            </button>
          }
        >
          <strong>
            {data.awaitingApproval.count} withdrawal{data.awaitingApproval.count === 1 ? "" : "s"} waiting
          </strong>{" "}
          · {inr(data.awaitingApproval.amount)} in total
        </Notice>
      )}
      {!s.payoutsEnabled && (
        <Notice tone="warn">Withdrawals are paused. Doctors keep earning but can't request new withdrawals.</Notice>
      )}
      {s.activeProvider === "manual" && (
        <Notice tone="info">
          Withdrawals are paid manually: transfer the money from your bank, then use <strong>Pay &amp; mark paid</strong> under Withdrawals.
          {s.payoutsConfigured ? " Cashfree Payouts is connected; switch to it in Settings to pay automatically." : ""}
        </Notice>
      )}

      <div className="cf-row-between">
        <span className="cf-help">All amounts in INR, across every gynecologist.</span>
        <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : undefined} /> Refresh
        </button>
      </div>

      <div className="cf-kpis">
        <Kpi icon={<IndianRupee size={15} />} tone="brand" label="Patients paid" value={inr(data.gross)} hint={`${data.sessions} paid session${data.sessions === 1 ? "" : "s"}`} />
        <Kpi icon={<Percent size={15} />} tone="accent" label="Nura commission" value={inr(data.commission)} hint={`Default rate ${s.defaultCommissionPercent}%`} />
        <Kpi icon={<HandCoins size={15} />} tone="teal" label="Doctors' share" value={inr(data.doctorNet)} hint="After commission" />
        <Kpi icon={<Wallet size={15} />} tone="amber" label="Withdrawable now" value={inr(data.owedAvailable)} hint="Owed to doctors, not yet requested" />
        <Kpi icon={<Clock size={15} />} tone="amber" label="On hold" value={inr(data.onHold)} hint={`Session open, or within the ${s.holdDays}-day hold`} />
        <Kpi
          icon={<Send size={15} />}
          tone="teal"
          label="Paid out"
          value={inr(data.paidOut)}
          hint={data.inFlight ? `${inr(data.inFlight)} on its way` : data.failedCount ? `${data.failedCount} failed, returned to wallets` : "All time"}
        />
      </div>
    </div>
  );
};
