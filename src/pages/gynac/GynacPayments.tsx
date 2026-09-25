import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Hash, Receipt, Search, TrendingUp, Wallet } from "lucide-react";
import { PaymentsData, getPayments, patientName, formatMoney } from "../../api/doctorApi";
import {
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PageSkeleton,
  StatCard,
  StatusBadge,
  Tabs,
  formatDate
} from "../../components/ui";
import { Pagination } from "../../components/Pagination";

// Table rows per page. Totals, the session count and the CSV export always
// cover every row in the chosen period — only the table itself is paged.
const ROWS_PER_PAGE = 25;

type Range = "all" | "30d" | "90d" | "year";

const RANGES: { value: Range; label: string }[] = [
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" }
];

const paidAt = (p: PaymentsData["payments"][number]) => p.completedAt || p.startedAt || p.createdAt;

const inRange = (iso: string | undefined, range: Range) => {
  if (range === "all") return true;
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  if (range === "year") return d.getFullYear() === now.getFullYear();
  const days = range === "30d" ? 30 : 90;
  return now.getTime() - d.getTime() <= days * 86_400_000;
};

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

export const GynacPayments: React.FC = () => {
  const [data, setData] = useState<PaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("all");
  const [search, setSearch] = useState("");

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

  const currency = data?.currency || "INR";

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

  const total = rows.reduce((sum, p) => sum + (p.amountPaid ?? 0), 0);
  const avg = rows.length ? Math.round(total / rows.length) : 0;

  const exportCsv = () => {
    const lines = [
      ["Date", "Patient", "Status", "Amount", "Currency", "Consultation ID"].map(csvCell).join(","),
      ...rows.map((p) =>
        [
          paidAt(p) ? new Date(paidAt(p)!).toISOString().slice(0, 10) : "",
          patientName(p.userId),
          p.status,
          String(p.amountPaid ?? 0),
          p.currency || currency,
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

  if (loading) return <PageSkeleton stats={3} rows={6} />;
  if (error || !data) {
    return (
      <div className="gx-page">
        <ErrorState message={error ?? "No data."} onRetry={() => { setLoading(true); load(); }} />
      </div>
    );
  }

  return (
    <div className="gx-page">
      <PageHeader
        eyebrow="Practice"
        title="Payments & Earnings"
        subtitle="Every paid consultation, with totals for the period you choose."
        actions={
          <button className="gx-btn gx-btn-ghost" type="button" onClick={exportCsv} disabled={rows.length === 0}>
            <Download size={16} /> Export CSV
          </button>
        }
      />

      <Tabs label="Period" items={RANGES} value={range} onChange={setRange} />

      <div className="gx-stat-grid is-3">
        <StatCard tone="teal" icon={<Wallet size={20} />} label="Earnings" value={formatMoney(total, currency)} hint={range === "all" ? "All time" : RANGES.find((r) => r.value === range)?.label} />
        <StatCard tone="berry" icon={<Hash size={20} />} label="Paid sessions" value={rows.length} />
        <StatCard tone="plum" icon={<TrendingUp size={20} />} label="Average per session" value={formatMoney(avg, currency)} />
      </div>

      <Card
        title="Transactions"
        action={
          <label className="gx-search is-compact">
            <Search size={16} />
            <input type="search" placeholder="Search patient" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        }
        flush
      >
        {rows.length === 0 ? (
          <EmptyState icon={<Receipt size={22} />} title="No payments in this period">
            {data.payments.length ? "Try a longer period or clear the search." : "Your paid consultations will be listed here."}
          </EmptyState>
        ) : (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => {
                  const name = patientName(p.userId);
                  return (
                    <tr key={p._id}>
                      <td>
                        <span className="gx-person">
                          <Avatar name={name} size="sm" /> {name}
                        </span>
                      </td>
                      <td className="gx-muted">{formatDate(paidAt(p))}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td className="num strong">{formatMoney(p.amountPaid, p.currency || currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total · {rows.length} session{rows.length === 1 ? "" : "s"}</td>
                  <td className="num strong">{formatMoney(total, currency)}</td>
                </tr>
              </tfoot>
            </table>
            <div style={{ padding: "12px 16px" }}>
              <Pagination
                pagination={{ page: currentPage, pages: pageCount, total: rows.length }}
                onPageChange={setTablePage}
                itemLabel="payments"
              />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
