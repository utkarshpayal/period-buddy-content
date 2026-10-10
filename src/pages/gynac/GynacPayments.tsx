import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Download, Gift, Percent, Receipt, Send } from "lucide-react";
import {
  Earning,
  PaymentsData,
  Payout,
  WalletData,
  formatMoney,
  getMyPayouts,
  getPayments,
  getWallet,
  patientName
} from "../../api/doctorApi";
import { Avatar, ErrorState, PageHeader, PageSkeleton, formatDate } from "../../components/ui";
import { Pagination, type PageInfo } from "../../components/Pagination";
import { useToast } from "../../components/Toast";
import { EmptyRow, Kpi, Notice, Pill, SearchField, Segmented, useLatestRequest, type PillTone } from "../../components/financeUi";
import { PayoutMethodsCard, WithdrawDialog, WithdrawalsCard, isCoolingDown } from "./GynacWallet";
import { MyReferrals, getMyReferrals } from "../../api/referralApi";

// Table rows per page. Totals, the session count and the CSV export always
// cover every row in the chosen period — only the table itself is paged.
const ROWS_PER_PAGE = 20;

type Range = "all" | "30d" | "90d" | "year";

const RANGES: { value: Range; label: string }[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" }
];

type Row = PaymentsData["payments"][number];

const paidAt = (p: Row) => p.completedAt || p.startedAt || p.createdAt;

const inRange = (iso: string | undefined, range: Range) => {
  if (range === "all") return true;
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  if (range === "year") return d.getFullYear() === now.getFullYear();
  const days = range === "30d" ? 30 : 90;
  return now.getTime() - d.getTime() <= days * 86_400_000;
};

/** What the doctor gets for a session, after commission. Every paid session
 * (past ones included) gets an earning; one paid a moment ago may not have it
 * yet (`earning: null`), so that shows nothing rather than the gross. An API
 * from before wallets sends no `earning` field at all: show the gross then. */
const netOf = (p: Row) => {
  if (p.earning === undefined) return p.amountPaid ?? 0;
  return p.earning && p.earning.status !== "reversed" ? p.earning.net : 0;
};

/** A cancelled / refunded session, or one whose earning was reversed: the doctor keeps nothing. */
const isReversed = (p: Row) =>
  p.status === "cancelled" || p.paymentStatus === "refunded" || Boolean(p.refundStatus) || p.earning?.status === "reversed";

const refundLabel = (p: Row) =>
  p.status === "cancelled" || p.refundStatus
    ? p.refundStatus === "processed" || p.paymentStatus === "refunded"
      ? "Cancelled · refunded"
      : "Cancelled · refund due"
    : "Reversed";

const earningLabel = (e?: Earning | null): { text: string; tone: PillTone } => {
  if (!e) return { text: "Adding…", tone: "muted" };
  if (e.status === "reversed") return { text: "Reversed", tone: "muted" };
  if (!e.availableAt) return { text: "On hold", tone: "warn" };
  if (new Date(e.availableAt) > new Date()) return { text: `On hold until ${formatDate(e.availableAt)}`, tone: "warn" };
  return { text: "In wallet", tone: "ok" };
};

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

export const GynacPayments: React.FC = () => {
  const toast = useToast();
  const [data, setData] = useState<PaymentsData | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [payoutPage, setPayoutPage] = useState(1);
  const [payoutPagination, setPayoutPagination] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("all");
  const [search, setSearch] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  // Commission-free sessions from referrals; absent on an API without them.
  const [referrals, setReferrals] = useState<MyReferrals | null>(null);
  const walletRequest = useLatestRequest();

  useEffect(() => {
    getMyReferrals()
      .then(setReferrals)
      .catch(() => undefined);
  }, []);

  const loadWallet = useCallback(async () => {
    const token = walletRequest.begin();
    try {
      const [w, p] = await Promise.all([getWallet(), getMyPayouts(payoutPage)]);
      if (!walletRequest.isLatest(token)) return;
      setWallet(w);
      setPayouts(p.payouts);
      setPayoutPagination(p.pagination);
      setWalletError(null);
    } catch (err) {
      if (walletRequest.isLatest(token)) setWalletError(err instanceof Error ? err.message : "Could not load your wallet.");
    }
  }, [payoutPage, walletRequest]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getPayments());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.payments ?? [])
      .filter((p) => inRange(paidAt(p), range))
      .filter((p) => !q || patientName(p.userId).toLowerCase().includes(q))
      .sort((a, b) => new Date(paidAt(b) ?? 0).getTime() - new Date(paidAt(a) ?? 0).getTime());
  }, [data, range, search]);

  const [tablePage, setTablePage] = useState(1);
  useEffect(() => {
    setTablePage(1);
  }, [range, search]);
  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const currentPage = Math.min(tablePage, pageCount);
  const pageRows = rows.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  // Only money the doctor keeps counts: cancelled/refunded and reversed rows
  // stay in the list but out of the totals. Unfiltered, the server's own
  // totals are used.
  const kept = rows.filter((p) => !isReversed(p));
  const unfiltered = range === "all" && !search.trim();
  const gross = unfiltered && data ? data.total : kept.reduce((sum, p) => sum + (p.amountPaid ?? 0), 0);
  const net = unfiltered && data?.net != null ? data.net : kept.reduce((sum, p) => sum + netOf(p), 0);
  const commission =
    unfiltered && data?.commission != null
      ? data.commission
      : kept.reduce((sum, p) => sum + (p.earning && p.earning.status !== "reversed" ? p.earning.commission : 0), 0);
  const keptCount = unfiltered && data ? data.count : kept.length;

  const exportCsv = () => {
    const lines = [
      ["Date", "Patient", "Session status", "Paid by patient", "Commission %", "Commission", "Your earning", "Wallet status", "Currency", "Consultation ID"].map(csvCell).join(","),
      ...rows.map((p) =>
        [
          paidAt(p) ? new Date(paidAt(p)!).toISOString().slice(0, 10) : "",
          patientName(p.userId),
          p.status,
          String(p.amountPaid ?? 0),
          p.earning && !isReversed(p) ? (p.earning.freeSession ? "0 (referral)" : String(p.earning.commissionPercent)) : "",
          p.earning && !isReversed(p) ? String(p.earning.commission) : "",
          String(isReversed(p) ? 0 : netOf(p)),
          isReversed(p) ? refundLabel(p) : earningLabel(p.earning).text,
          "INR",
          p._id
        ]
          .map(csvCell)
          .join(",")
      )
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nura-earnings-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <PageSkeleton stats={4} rows={6} />;
  if (error || !data) {
    return (
      <div className="gx-page">
        <ErrorState message={error ?? "No data."} onRetry={() => { setLoading(true); load(); }} />
      </div>
    );
  }

  const w = wallet?.wallet;
  const rules = wallet?.rules;
  const hasUsableMethod = Boolean(wallet?.methods.some((m) => !isCoolingDown(m)));
  const withdrawBlocked = !wallet
    ? "Loading your wallet…"
    : !rules?.payoutsEnabled
      ? "Withdrawals are paused right now."
      : w!.openPayouts > 0
        ? "You have a withdrawal in progress."
        : w!.withdrawable < rules.minWithdrawal
          ? `You can withdraw once you have ${formatMoney(rules.minWithdrawal)}.`
          : !hasUsableMethod
            ? wallet.methods.length
              ? "Your new payout method can be used soon."
              : "Add a payout method below to withdraw."
            : null;

  return (
    <div className="gx-page">
      <PageHeader
        eyebrow="Practice"
        title="Earnings & Wallet"
        subtitle={
          rules
            ? `Nura keeps ${rules.commissionPercent}% of each session. Your share reaches your wallet ${rules.holdDays ? `${rules.holdDays} day${rules.holdDays === 1 ? "" : "s"} after` : "when"} you complete the session.`
            : "Your earnings after commission, and withdrawals to your bank or UPI."
        }
        actions={
          <button className="cf-btn cf-btn-secondary" type="button" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={16} /> Export CSV
          </button>
        }
      />

      {walletError && <ErrorState message={walletError} onRetry={loadWallet} />}
      {w && w.available < 0 && (
        <Notice tone="warn">
          Your wallet is at {formatMoney(w.available)} after an adjustment by the Nura team. New earnings cover this before you can withdraw again.
        </Notice>
      )}

      {w && rules && (
        <div className="gw-hero">
          <div className="gw-balance">
            <span className="gw-balance-label">Available to withdraw</span>
            <span className="gw-balance-value">{formatMoney(w.withdrawable)}</span>
            <span className="gw-balance-note">
              {w.inFlight > 0 ? `${formatMoney(w.inFlight)} on its way to you` : `After ${rules.commissionPercent}% commission`}
            </span>
            <div className="gw-balance-actions">
              <button className="cf-btn cf-btn-primary" type="button" onClick={() => setWithdrawing(true)} disabled={Boolean(withdrawBlocked)}>
                <Send size={16} /> Withdraw
              </button>
              {withdrawBlocked && <span className="gw-balance-hint">{withdrawBlocked}</span>}
            </div>
          </div>
          <div className="gw-minis">
            <Kpi
              icon={<Clock size={15} />}
              tone="amber"
              label="On hold"
              value={formatMoney(w.onHold)}
              hint={w.nextReleaseAt ? `Next release ${formatDate(w.nextReleaseAt)}` : "Released after sessions are completed"}
            />
            <Kpi icon={<Send size={15} />} tone="teal" label="Withdrawn" value={formatMoney(w.withdrawn)} hint="All time" />
            <Kpi
              icon={<Percent size={15} />}
              tone="accent"
              label="Total earned"
              value={formatMoney(w.lifetimeNet)}
              hint={`${formatMoney(w.lifetimeGross)} paid · ${formatMoney(w.lifetimeCommission)} commission`}
            />
            {referrals && (referrals.summary.freeSessionsGranted > 0 || referrals.program.enabled) && (
              <Kpi
                icon={<Gift size={15} />}
                tone="teal"
                label="Commission-free sessions"
                value={referrals.summary.freeSessionsRemaining}
                hint={
                  referrals.summary.freeSessionsGranted > 0 ? (
                    `${formatMoney(referrals.summary.commissionSaved)} commission saved so far`
                  ) : (
                    <Link to="/referrals">Refer a colleague to earn {referrals.program.rewardSessions}</Link>
                  )
                }
              />
            )}
          </div>
        </div>
      )}

      {wallet && (
        <div className="gw-grid">
          <WithdrawalsCard payouts={payouts} pagination={payoutPagination} onPage={setPayoutPage} onChanged={loadWallet} notify={toast.success} />
          <PayoutMethodsCard data={wallet} onChanged={loadWallet} notify={toast.success} />
        </div>
      )}

      {wallet && wallet.adjustments.length > 0 && (
        <section className="gw-card">
          <div className="gw-card-head">
            <div>
              <h2>Adjustments</h2>
              <p>Credits and debits made by the Nura team</p>
            </div>
          </div>
          <div className="gw-card-body">
            <ul className="gw-adjustments">
              {wallet.adjustments.map((a) => (
                <li key={a._id}>
                  <span>
                    <strong className={a.net < 0 ? "gw-minus" : "gw-plus"}>{a.net > 0 ? "+" : ""}{formatMoney(a.net)}</strong>
                    <span className="cf-cell-sub" style={{ display: "inline", marginLeft: 8 }}>{formatDate(a.createdAt)}</span>
                  </span>
                  <span className="cf-cell-sub">{a.status === "reversed" ? "Reversed" : a.note}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="gw-card">
        <div className="gw-card-head">
          <div>
            <h2>Sessions</h2>
            <p>
              {formatMoney(net)} earned from {formatMoney(gross)} paid
              {commission ? ` · ${formatMoney(commission)} commission` : ""}
            </p>
          </div>
          <div className="cf-toolbar-group">
            <Segmented label="Period" items={RANGES} value={range} onChange={setRange} />
            <SearchField value={search} onChange={setSearch} placeholder="Search patient" />
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyRow icon={<Receipt size={22} />} title="No payments in this period">
            {data.payments.length ? "Try a longer period or clear the search." : "Your paid consultations will be listed here."}
          </EmptyRow>
        ) : (
          <div className="cf-table-scroll">
            <table className="cf-table is-wide is-stack">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Wallet</th>
                  <th className="num">Paid</th>
                  <th className="num">Commission</th>
                  <th className="num">You earn</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => {
                  const name = patientName(p.userId);
                  const reversed = isReversed(p);
                  const label = reversed ? { text: refundLabel(p), tone: "muted" as PillTone } : earningLabel(p.earning);
                  return (
                    <tr key={p._id} className={reversed ? "is-reversed" : undefined}>
                      <td className="c-who">
                        <span className="gx-person">
                          <Avatar name={name} size="sm" /> {name}
                        </span>
                      </td>
                      <td className="cf-cell-sub c-date" style={{ whiteSpace: "nowrap" }}>{formatDate(paidAt(p))}</td>
                      <td className="c-state"><Pill tone={label.tone}>{label.text}</Pill></td>
                      <td className="num c-paid" data-label="Paid">
                        {reversed ? <s>{formatMoney(p.amountPaid)}</s> : formatMoney(p.amountPaid)}
                        {reversed && <div className="cf-cell-sub">Not counted</div>}
                      </td>
                      <td className="num c-fee" data-label="Commission">
                        {p.earning && !reversed ? formatMoney(p.earning.commission) : "—"}
                        {p.earning && !reversed && (p.earning.freeSession ? (
                          <div><Pill tone="ok">Free · referral</Pill></div>
                        ) : (
                          <div className="cf-cell-sub">{p.earning.commissionPercent}%</div>
                        ))}
                      </td>
                      <td className="num cf-cell-title c-net">{reversed ? "—" : formatMoney(netOf(p))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="cf-cell-title c-who">Total · {keptCount} paid session{keptCount === 1 ? "" : "s"}
                    {rows.length > kept.length && <div className="cf-cell-sub">{rows.length - kept.length} cancelled / refunded not counted</div>}</td>
                  <td className="num c-paid" data-label="Paid">{formatMoney(gross)}</td>
                  <td className="num c-fee" data-label="Commission">{formatMoney(commission)}</td>
                  <td className="num cf-cell-title c-net">{formatMoney(net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {pageCount > 1 && (
          <div className="cf-table-foot">
            <Pagination pagination={{ page: currentPage, pages: pageCount, total: rows.length }} onPageChange={setTablePage} itemLabel="sessions" />
          </div>
        )}
      </section>

      {withdrawing && wallet && (
        <WithdrawDialog
          data={wallet}
          onClose={() => setWithdrawing(false)}
          onDone={(payout) => {
            setWithdrawing(false);
            toast.success(
              payout.status === "requested"
                ? `Withdrawal of ${formatMoney(payout.amount)} requested. We'll email you when it's sent.`
                : payout.status === "failed"
                  ? `The withdrawal failed: ${payout.failureReason ?? "unknown reason"}. The money is back in your wallet.`
                  : `Withdrawal of ${formatMoney(payout.amount)} is on its way.`
            );
            // Changing the page reloads by itself; on page 1 reload directly.
            if (payoutPage !== 1) setPayoutPage(1);
            else loadWallet();
          }}
        />
      )}
    </div>
  );
};
