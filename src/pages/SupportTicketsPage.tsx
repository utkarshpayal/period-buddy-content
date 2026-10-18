import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, Inbox, LifeBuoy, Loader2, RefreshCw, RotateCcw, Search } from "lucide-react";
import {
  Pagination as PageMeta,
  StatusCounts,
  SUPPORT_CATEGORIES,
  SupportStaff,
  SupportTicket,
  SupportTicketDetail,
  TICKET_PRIORITIES,
  TicketCategory,
  TicketPriority,
  TicketStatusFilter,
  categoryLabel,
  isSupportApiConfigured,
  listSupportAssignees,
  listSupportTickets,
  notifySupportChanged,
  personName
} from "../api/supportApi";
import { PERMISSIONS } from "../auth/access";
import { useAppContext } from "../context/AppContext";
import { Pagination } from "../components/Pagination";
import { Tabs, timeAgo } from "../components/ui";
import { AwaitingBadge, PRIORITY_META, PriorityPill, StatusPill, formatDateTime, initialsOf } from "./support/supportUi";
import { TicketDrawer } from "./support/TicketDrawer";

const PAGE_SIZE = 20;

const STATUS_TABS: { value: TicketStatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" }
];

const tabCount = (counts: StatusCounts | null, tab: TicketStatusFilter) => {
  if (!counts) return undefined;
  if (tab === "active") return counts.open + counts.in_progress;
  if (tab === "all") return counts.open + counts.in_progress + counts.resolved + counts.closed;
  return counts[tab];
};

/**
 * Help & support queue: tickets people raise from the app (Profile → Help &
 * support). The selected ticket opens in a side panel and lives in `?id=` so
 * a ticket can be linked to directly.
 */
export const SupportTicketsPage: React.FC = () => {
  const { can } = useAppContext();
  const canManage = !isSupportApiConfigured || can(PERMISSIONS.SUPPORT_MANAGE);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("id");

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [pagination, setPagination] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<SupportStaff[]>([]);

  // Filters
  const [status, setStatus] = useState<TicketStatusFilter>("active");
  const [priority, setPriority] = useState<TicketPriority | "">("");
  const [category, setCategory] = useState<TicketCategory | "">("");
  const [assignee, setAssignee] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change starts again from page 1.
  useEffect(() => {
    setPage(1);
  }, [status, priority, category, assignee, debouncedSearch]);

  // Ignore responses from superseded requests (fast typing / tab switching).
  const requestSeq = useRef(0);

  const load = useCallback(
    async (quiet = false) => {
      const seq = ++requestSeq.current;
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await listSupportTickets({
          status,
          priority,
          category,
          assignee,
          search: debouncedSearch,
          page,
          limit: PAGE_SIZE
        });
        if (seq !== requestSeq.current) return;
        // A page past the end (after a change shrank the list): step back.
        if (res.tickets.length === 0 && page > 1 && res.pagination.pages < page) {
          setPage(Math.max(1, res.pagination.pages));
          return;
        }
        setTickets(res.tickets);
        setCounts(res.statusCounts);
        setPagination(res.pagination);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : "Could not load support tickets.");
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [status, priority, category, assignee, debouncedSearch, page]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listSupportAssignees()
      .then((res) => setAssignees(res.assignees))
      .catch(() => {
        /* the picker is a nicety; the queue still works without it */
      });
  }, []);

  const openTicket = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("id", id);
    setSearchParams(next);
  };

  const closeTicket = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("id");
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const onTicketChanged = useCallback(
    (updated: SupportTicketDetail) => {
      // Patch the row straight away, then refetch so counts and filters catch up.
      setTickets((prev) =>
        prev.map((t) =>
          t._id === updated._id
            ? {
                ...t,
                status: updated.status,
                priority: updated.priority,
                assignee: updated.assignee,
                awaitingStaff: updated.awaitingStaff,
                lastActivityAt: updated.lastActivityAt,
                lastReplyFrom: updated.lastReplyFrom,
                replyCount: updated.replyCount
              }
            : t
        )
      );
      load(true);
      notifySupportChanged();
    },
    [load]
  );

  const hasFilters = Boolean(priority || category || assignee || debouncedSearch);
  const resetFilters = () => {
    setPriority("");
    setCategory("");
    setAssignee("");
    setSearch("");
  };

  const tabs = useMemo(
    () => STATUS_TABS.map((t) => ({ ...t, count: tabCount(counts, t.value) })),
    [counts]
  );

  return (
    <div className="workspace-page sp-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">App & Growth</p>
          <h2>Support</h2>
          <p className="subtitle-text">Help & support tickets people raise from the app. Reply, assign and resolve them here.</p>
        </div>
        <div className="header-actions">
          <button className="gy-btn gy-btn-ghost" type="button" onClick={() => load(true)} disabled={loading || refreshing}>
            <RefreshCw size={15} className={refreshing ? "spin-icon" : undefined} /> Refresh
          </button>
        </div>
      </header>

      <div className="sp-tabs">
        <Tabs label="Ticket status" items={tabs} value={status} onChange={setStatus} />
      </div>

      <div className="aq-toolbar">
        <label className="scheme-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticket number, name or email"
            aria-label="Search tickets"
          />
        </label>

        <select
          className="app-filter-select"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TicketPriority | "")}
          aria-label="Priority"
        >
          <option value="">Any priority</option>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_META[p].label}
            </option>
          ))}
        </select>

        <select
          className="app-filter-select"
          value={category}
          onChange={(e) => setCategory(e.target.value as TicketCategory | "")}
          aria-label="Category"
        >
          <option value="">All categories</option>
          {SUPPORT_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        <select className="app-filter-select" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee">
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="none">Unassigned</option>
          {assignees.map((a) => (
            <option key={a._id} value={a._id}>
              {personName(a)}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button className="gy-btn gy-btn-ghost" type="button" onClick={resetFilters} title="Clear filters and search">
            <RotateCcw size={15} /> Reset
          </button>
        )}
      </div>

      {error && (
        <div className="gy-alert gy-alert-error sp-alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button className="gy-btn gy-btn-ghost" type="button" onClick={() => load()}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="gy-empty">
          <Loader2 size={20} className="spin-icon" />
          <span>Loading tickets…</span>
        </div>
      ) : tickets.length === 0 ? (
        !error && (
          <div className="gy-empty">
            {hasFilters ? <Inbox size={22} /> : <LifeBuoy size={22} />}
            <span>
              {hasFilters
                ? "No tickets match these filters."
                : status === "active"
                  ? "No active tickets. Everyone's been answered."
                  : "No tickets here yet."}
            </span>
            {hasFilters && (
              <button className="gy-btn gy-btn-ghost" type="button" onClick={resetFilters}>
                <RotateCcw size={15} /> Reset filters
              </button>
            )}
          </div>
        )
      ) : (
        <>
          <div className="aq-table-card sp-table-card">
            <table className="aq-table sp-table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>User</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Assignee</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const name = personName(t.user, "App user");
                  return (
                    <tr
                      key={t._id}
                      className={`aq-row sp-row ${t.awaitingStaff ? "is-awaiting" : ""} ${selectedId === t._id ? "is-selected" : ""}`}
                      onClick={() => openTicket(t._id)}
                    >
                      <td className="sp-td-ticket">
                        <div className="sp-ticket-no">
                          {t.ticketNumber}
                          {t.awaitingStaff && <AwaitingBadge />}
                        </div>
                        <button
                          type="button"
                          className="sp-subject"
                          onClick={(e) => {
                            e.stopPropagation();
                            openTicket(t._id);
                          }}
                        >
                          {t.subject}
                        </button>
                        {t.preview && <div className="sp-preview">{t.preview}</div>}
                      </td>
                      <td>
                        <div className="aq-identity">
                          <div className="admin-avatar" aria-hidden>
                            {initialsOf(name)}
                          </div>
                          <div className="aq-identity-text">
                            <div className="aq-identity-name">{name}</div>
                            {t.user?.email && <div className="sp-preview">{t.user.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td>{categoryLabel(t)}</td>
                      <td>
                        <div className="sp-pill-stack">
                          <StatusPill status={t.status} />
                          <PriorityPill priority={t.priority} />
                        </div>
                      </td>
                      <td>{t.assignee ? personName(t.assignee) : <span className="sp-muted">Unassigned</span>}</td>
                      <td>
                        <time dateTime={t.lastActivityAt} title={formatDateTime(t.lastActivityAt)}>
                          {timeAgo(t.lastActivityAt)}
                        </time>
                        <div className="sp-preview">{t.lastReplyFrom === "admin" ? "Staff replied" : "User wrote"}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination pagination={pagination} onPageChange={setPage} disabled={refreshing} itemLabel="tickets" />
        </>
      )}

      {selectedId && (
        <TicketDrawer
          ticketId={selectedId}
          canManage={canManage}
          assignees={assignees}
          onClose={closeTicket}
          onChanged={onTicketChanged}
        />
      )}
    </div>
  );
};
