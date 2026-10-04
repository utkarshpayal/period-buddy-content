import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  MessageCircle,
  Star,
  Stethoscope,
  UserRound,
  Wallet
} from "lucide-react";
import {
  DashboardData,
  PaymentsData,
  getDashboard,
  getPayments,
  updateMyProfile,
  patientName,
  formatMoney,
  formatSlot
} from "../../api/doctorApi";
import {
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PageSkeleton,
  StatCard,
  StatusBadge,
  Toggle,
  timeAgo
} from "../../components/ui";
import { useToast } from "../../components/Toast";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/** Earnings after commission, bucketed into the last 6 calendar months
 * (oldest first). */
function monthlyEarnings(payments: PaymentsData | null) {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: "short" }), total: 0 };
  });
  payments?.payments.forEach((p) => {
    const at = p.completedAt || p.startedAt || p.createdAt;
    if (!at) return;
    const d = new Date(at);
    const bucket = months.find((m) => m.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (!bucket) return;
    // No `earning` field at all = an API from before wallets: use the gross.
    if (p.earning === undefined) {
      if (p.status !== "cancelled" && !p.refundStatus) bucket.total += p.amountPaid ?? 0;
    }
    else if (p.earning && p.earning.status !== "reversed") bucket.total += p.earning.net;
  });
  return months;
}

export const GynacDashboard: React.FC = () => {
  const toast = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [payments, setPayments] = useState<PaymentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dash, pay] = await Promise.all([getDashboard(), getPayments().catch(() => null)]);
      setData(dash);
      setPayments(pay);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleAvailable = async () => {
    if (!data) return;
    const next = !data.doctor.isAvailable;
    setToggling(true);
    // Optimistic: flip immediately, roll back on failure.
    setData({ ...data, doctor: { ...data.doctor, isAvailable: next } });
    try {
      await updateMyProfile({ isAvailable: next });
      toast.success(next ? "You're accepting new bookings." : "New bookings paused.");
    } catch (err) {
      setData({ ...data, doctor: { ...data.doctor, isAvailable: !next } });
      toast.error(err instanceof Error ? err.message : "Could not update availability.");
    } finally {
      setToggling(false);
    }
  };

  const months = useMemo(() => monthlyEarnings(payments), [payments]);
  const maxMonth = Math.max(1, ...months.map((m) => m.total));

  if (loading) return <PageSkeleton stats={4} rows={5} />;
  if (error || !data) {
    return (
      <div className="gx-page">
        <ErrorState message={error ?? "No data available."} onRetry={() => { setLoading(true); load(); }} />
      </div>
    );
  }

  const { doctor, stats, recentBookings } = data;
  // Live sessions, soonest booked slot first.
  const queue = recentBookings
    .filter((b) => b.status === "active" || b.status === "paid")
    .sort((a, b) => new Date(a.scheduledFor ?? a.createdAt ?? 0).getTime() - new Date(b.scheduledFor ?? b.createdAt ?? 0).getTime());
  const thisMonth = months[months.length - 1]?.total ?? 0;
  const lastMonth = months[months.length - 2]?.total ?? 0;
  const trend = lastMonth ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  return (
    <div className="gx-page">
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting()}, ${doctor.name.startsWith("Dr") ? doctor.name : `Dr. ${doctor.name}`}`}
        subtitle={
          <span className="gx-inline-meta">
            <Stethoscope size={14} /> {doctor.specialty}
            <span className="gx-dot-sep" /> <Star size={14} className="gx-star" />{" "}
            {doctor.ratingCount && doctor.rating
              ? `${doctor.rating.toFixed(1)} from ${doctor.ratingCount} patient rating${doctor.ratingCount === 1 ? "" : "s"}`
              : "No ratings yet"}
          </span>
        }
        actions={
          <div className={`gx-availability ${doctor.isAvailable ? "is-on" : ""}`}>
            <Toggle
              checked={Boolean(doctor.isAvailable)}
              onChange={toggleAvailable}
              disabled={toggling}
              label={
                <span>
                  <strong>{doctor.isAvailable ? "Accepting bookings" : "Bookings paused"}</strong>
                  <small>{doctor.isAvailable ? "Patients can book you now" : "You're hidden from new bookings"}</small>
                </span>
              }
            />
          </div>
        }
      />

      <div className="gx-stat-grid">
        <StatCard
          tone="berry"
          icon={<MessageCircle size={20} />}
          label="Needs your attention"
          value={stats.paid + stats.active}
          hint={`${stats.paid} new · ${stats.active} in progress`}
        />
        <StatCard tone="green" icon={<CheckCircle2 size={20} />} label="Completed" value={stats.completed} hint={`of ${stats.totalBookings} total bookings`} />
        <StatCard
          tone="teal"
          icon={<Wallet size={20} />}
          label={data?.wallet ? "Your earnings" : "Total earnings"}
          value={formatMoney(data?.wallet ? data.wallet.lifetimeNet : stats.totalEarnings)}
          hint={
            data?.wallet
              ? `After commission · ${formatMoney(data.wallet.withdrawable)} ready to withdraw`
              : `${stats.paidSessions} paid sessions`
          }
        />
        <StatCard
          tone="plum"
          icon={<CalendarClock size={20} />}
          label="This month"
          value={formatMoney(thisMonth)}
          hint={trend === null ? "No earnings last month" : `${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend)}% vs last month`}
        />
      </div>

      <div className="gx-grid-2">
        <Card
          title="Up next"
          action={
            <Link className="gx-link" to="/bookings">
              Open inbox <ArrowRight size={14} />
            </Link>
          }
          flush
        >
          {queue.length === 0 ? (
            <EmptyState icon={<CalendarCheck size={22} />} title="You're all caught up">
              New paid bookings will appear here the moment a patient books you.
            </EmptyState>
          ) : (
            <ul className="gx-queue">
              {queue.map((b) => {
                const name = patientName(b.userId);
                return (
                  <li key={b._id}>
                    <Link to="/bookings" state={{ open: b._id }} className="gx-queue-row">
                      <Avatar name={name} />
                      <div className="gx-queue-text">
                        <strong>{name}</strong>
                        <span>
                          {formatMoney(b.amountPaid)} ·{" "}
                          {b.scheduledFor ? formatSlot(b.scheduledFor, b.slotEndsAt) : `booked ${timeAgo(b.createdAt)}`}
                        </span>
                      </div>
                      <StatusBadge status={b.status} />
                      <ArrowRight size={16} className="gx-queue-arrow" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Earnings, last 6 months"
          action={
            <Link className="gx-link" to="/payments">
              Details <ArrowRight size={14} />
            </Link>
          }
        >
          <div className="gx-bars" role="img" aria-label={months.map((m) => `${m.label}: ${formatMoney(m.total)}`).join(", ")}>
            {months.map((m, i) => (
              <div className="gx-bar-col" key={m.key}>
                <span className="gx-bar-value">{m.total ? formatMoney(m.total) : ""}</span>
                <span
                  className={`gx-bar ${i === months.length - 1 ? "is-current" : ""}`}
                  style={{ height: `${Math.max(4, (m.total / maxMonth) * 100)}%` }}
                />
                <span className="gx-bar-label">{m.label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card
        title="Recent bookings"
        action={
          <Link className="gx-link" to="/bookings">
            View all <ArrowRight size={14} />
          </Link>
        }
        flush
      >
        {recentBookings.length === 0 ? (
          <EmptyState icon={<UserRound size={22} />} title="No bookings yet">
            Make sure your profile and weekly availability are complete so patients can find you.
          </EmptyState>
        ) : (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                  <th>Session</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b) => {
                  const name = patientName(b.userId);
                  return (
                    <tr key={b._id}>
                      <td>
                        <span className="gx-person">
                          <Avatar name={name} size="sm" /> {name}
                        </span>
                      </td>
                      <td><StatusBadge status={b.status} /></td>
                      <td className="num">{formatMoney(b.amountPaid)}</td>
                      <td data-label="Session" className="gx-muted">
                        {b.scheduledFor ? formatSlot(b.scheduledFor, b.slotEndsAt) : `Booked ${timeAgo(b.createdAt)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
