import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Search,
  Clock,
  XCircle,
  CheckCircle,
  MapPin,
  Phone,
  Copy,
  Download,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FileText,
  SlidersHorizontal,
  Inbox
} from "lucide-react";
import {
  SchemeApplication,
  SchemeApplicationStatus,
  ApplicationFilters,
  ApplicationSort,
  adminListApplications,
  adminReviewApplication,
  fetchApplicationFilters,
  applicantEmail,
  applicantName,
  applicantPhone,
  applicantState,
  schemeLevelLabel,
  schemeName
} from "../api/schemeApplicationsApi";
import { useAppContext } from "../context/AppContext";

const STATUS_FILTERS: { key: SchemeApplicationStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "submitted", label: "New" },
  { key: "in_review", label: "In review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Declined" },
  { key: "withdrawn", label: "Withdrawn" }
];

const STATUS_PILL: Record<SchemeApplicationStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "gy-pill-muted" },
  submitted: { label: "New", cls: "gy-pill-info" },
  in_review: { label: "In review", cls: "gy-pill-warn" },
  approved: { label: "Approved", cls: "gy-pill-ok" },
  rejected: { label: "Declined", cls: "gy-pill-muted" },
  withdrawn: { label: "Withdrawn", cls: "gy-pill-muted" }
};

const SORT_OPTIONS: { key: ApplicationSort; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "updated", label: "Recently updated" }
];

const PAGE_SIZES = [20, 50, 100];

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Two-letter initials for the applicant avatar, e.g. "Priya Shah" -> "PS". */
const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const SchemeApplicationsPage: React.FC = () => {
  const { authSession } = useAppContext();

  const [applications, setApplications] = useState<SchemeApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<SchemeApplicationStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [schemeFilter, setSchemeFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<"" | "central" | "state">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<ApplicationSort>("newest");
  const [pageSize, setPageSize] = useState(20);
  const [showFilters, setShowFilters] = useState(false);

  // Paging
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filter metadata (counts, states, schemes)
  const [meta, setMeta] = useState<ApplicationFilters | null>(null);

  // Row + bulk state
  const [actingId, setActingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadMeta = async () => {
    try {
      setMeta(await fetchApplicationFilters());
    } catch {
      /* filters are a nicety; the list still works without them */
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  const load = async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminListApplications({
        status: statusFilter,
        search: debouncedSearch || undefined,
        state: stateFilter || undefined,
        schemeId: schemeFilter || undefined,
        governmentLevel: levelFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sort,
        page: targetPage,
        limit: pageSize
      });
      setApplications(res.applications);
      setPage(res.pagination.page);
      setPages(res.pagination.pages || 1);
      setTotal(res.pagination.total || res.applications.length);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, debouncedSearch, stateFilter, schemeFilter, levelFilter, dateFrom, dateTo, sort, pageSize]);

  const advancedFilterCount = [stateFilter, schemeFilter, levelFilter, dateFrom, dateTo].filter(Boolean).length;
  const hasFilters = statusFilter !== "all" || Boolean(debouncedSearch) || advancedFilterCount > 0 || sort !== "newest";

  const resetFilters = () => {
    setStatusFilter("all");
    setSearch("");
    setStateFilter("");
    setSchemeFilter("");
    setLevelFilter("");
    setDateFrom("");
    setDateTo("");
    setSort("newest");
  };

  const clearAdvancedFilters = () => {
    setStateFilter("");
    setSchemeFilter("");
    setLevelFilter("");
    setDateFrom("");
    setDateTo("");
  };

  const statusCount = (key: SchemeApplicationStatus | "all") => {
    if (!meta) return undefined;
    if (key === "all") return meta.total;
    return meta.statusCounts?.[key] ?? 0;
  };

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === applications.length ? new Set() : new Set(applications.map((a) => a._id))
    );

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const applyReview = (app: SchemeApplication, status: "approved" | "rejected" | "in_review") => {
    let reviewNote: string | undefined;
    if (status === "rejected") {
      const input = window.prompt(
        `Decline "${schemeName(app)}" for ${applicantName(app)}. Add a reason (optional):`,
        ""
      );
      if (input === null) return Promise.resolve(false);
      reviewNote = input.trim() || undefined;
    }
    return adminReviewApplication(app._id, { status, reviewNote }).then((res) => {
      setApplications((prev) =>
        prev
          .map((a) => (a._id === app._id ? res.application : a))
          .filter((a) => statusFilter === "all" || a.status === statusFilter)
      );
      return true;
    });
  };

  const review = async (app: SchemeApplication, status: "approved" | "rejected" | "in_review") => {
    setActingId(app._id);
    setError(null);
    setNotice(null);
    try {
      const ok = await applyReview(app, status);
      if (ok) {
        setNotice(
          status === "approved"
            ? `Approved ${schemeName(app)} for ${applicantName(app)}.`
            : status === "rejected"
              ? `Declined ${schemeName(app)}.`
              : `Marked ${schemeName(app)} as in review.`
        );
        loadMeta();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this application.");
    } finally {
      setActingId(null);
    }
  };

  const bulkReview = async (status: "approved" | "rejected" | "in_review") => {
    const targets = applications.filter((a) => selected.has(a._id));
    if (targets.length === 0) return;
    let reviewNote: string | undefined;
    if (status === "rejected") {
      const input = window.prompt(`Decline ${targets.length} application(s). Add a reason (optional):`, "");
      if (input === null) return;
      reviewNote = input.trim() || undefined;
    } else if (
      !window.confirm(
        `${status === "approved" ? "Approve" : "Mark as in review"} ${targets.length} application(s)?`
      )
    ) {
      return;
    }

    setBulkBusy(true);
    setError(null);
    setNotice(null);
    let ok = 0;
    let failed = 0;
    await Promise.all(
      targets.map((app) =>
        adminReviewApplication(app._id, { status, reviewNote })
          .then((res) => {
            ok += 1;
            setApplications((prev) => prev.map((a) => (a._id === app._id ? res.application : a)));
          })
          .catch(() => {
            failed += 1;
          })
      )
    );
    setBulkBusy(false);
    setSelected(new Set());
    setNotice(`Updated ${ok} application(s)${failed ? `, ${failed} failed` : ""}.`);
    loadMeta();
    if (statusFilter !== "all") load(page);
  };

  const exportCsv = () => {
    const header = [
      "Applicant",
      "Email",
      "Phone",
      "State",
      "Scheme",
      "Level",
      "Status",
      "Submitted",
      "Review note"
    ];
    const rows = applications.map((a) => [
      applicantName(a),
      applicantEmail(a) ?? "",
      applicantPhone(a) ?? "",
      applicantState(a) ?? "",
      schemeName(a),
      schemeLevelLabel(a),
      STATUS_PILL[a.status]?.label ?? a.status,
      fmtDate(a.createdAt),
      a.reviewNote ?? ""
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scheme-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setNotice(`Copied ${label}.`);
  };

  const allSelected = applications.length > 0 && selected.size === applications.length;

  const rangeLabel = useMemo(() => {
    if (total === 0) return "0 results";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `${start}–${end} of ${total}`;
  }, [page, pageSize, total]);

  return (
    <div className="workspace-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Government Schemes</p>
          <h2>Scheme Applications</h2>
          <p className="subtitle-text">
            Review, filter, and action users&apos; saved scheme applications.
          </p>
        </div>
        <div className="header-actions">
          <button
            className="gy-btn gy-btn-ghost"
            type="button"
            onClick={exportCsv}
            disabled={applications.length === 0}
            title="Export the current page to CSV"
          >
            <Download size={15} /> Export
          </button>
        </div>
      </header>

      {!authSession && (
        <div className="gy-alert gy-alert-warn">
          <AlertCircle size={16} />
          <span>Sign in as an admin to review scheme applications.</span>
        </div>
      )}
      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="gy-alert gy-alert-ok">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      {/* Toolbar — search + status + sort + a Filters popover for the rest */}
      <div className="aq-toolbar">
        <label className="scheme-search">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone or scheme"
          />
        </label>

        <select
          className="app-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SchemeApplicationStatus | "all")}
        >
          {STATUS_FILTERS.map((f) => {
            const count = statusCount(f.key);
            return (
              <option key={f.key} value={f.key}>
                {f.label}
                {count !== undefined ? ` (${count})` : ""}
              </option>
            );
          })}
        </select>

        <select className="app-filter-select" value={sort} onChange={(e) => setSort(e.target.value as ApplicationSort)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="aq-filters-wrap">
          <button
            className="gy-btn gy-btn-ghost aq-filters-btn"
            type="button"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal size={15} /> Filters
            {advancedFilterCount > 0 && <span className="aq-filters-badge">{advancedFilterCount}</span>}
          </button>

          {showFilters && (
            <>
              <div className="aq-popover-backdrop" onClick={() => setShowFilters(false)} />
              <div className="aq-popover" role="dialog" aria-label="Filters">
                <div className="aq-popover-grid">
                  <label className="aq-popover-field">
                    <span>State</span>
                    <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                      <option value="">All states</option>
                      {(meta?.states ?? []).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="aq-popover-field">
                    <span>Scheme</span>
                    <select value={schemeFilter} onChange={(e) => setSchemeFilter(e.target.value)}>
                      <option value="">All schemes</option>
                      {(meta?.schemes ?? []).map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.shortName ? `${s.shortName} — ${s.name}` : s.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="aq-popover-field">
                    <span>Government level</span>
                    <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value as "" | "central" | "state")}>
                      <option value="">All levels</option>
                      <option value="central">Central</option>
                      <option value="state">State</option>
                    </select>
                  </label>

                  <div className="aq-popover-row">
                    <label className="aq-popover-field">
                      <span>From</span>
                      <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </label>
                    <label className="aq-popover-field">
                      <span>To</span>
                      <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </label>
                  </div>
                </div>

                <div className="aq-popover-actions">
                  <button className="gy-btn gy-btn-ghost" type="button" onClick={clearAdvancedFilters}>
                    Clear all
                  </button>
                  <button className="gy-btn gy-btn-primary" type="button" onClick={() => setShowFilters(false)}>
                    Done
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {hasFilters && (
          <button className="gy-btn gy-btn-ghost" type="button" onClick={resetFilters} title="Reset every filter">
            <RotateCcw size={15} /> Reset
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="aq-bulk-bar">
          <span>{selected.size} selected</span>
          <div className="aq-bulk-actions">
            {bulkBusy ? (
              <Loader2 size={18} className="spin" />
            ) : (
              <>
                <button className="gy-btn gy-btn-ok" type="button" onClick={() => bulkReview("approved")}>
                  <CheckCircle size={15} /> Approve
                </button>
                <button className="gy-btn gy-btn-ghost" type="button" onClick={() => bulkReview("in_review")}>
                  <Clock size={15} /> Review
                </button>
                <button className="gy-btn gy-btn-danger" type="button" onClick={() => bulkReview("rejected")}>
                  <XCircle size={15} /> Decline
                </button>
                <button className="gy-btn gy-btn-ghost" type="button" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="gy-empty">
          <Loader2 size={20} className="spin" />
          <span>Loading applications…</span>
        </div>
      ) : applications.length === 0 ? (
        <div className="gy-empty">
          <Inbox size={22} />
          <span>No applications match these filters.</span>
          {hasFilters && (
            <button className="gy-btn gy-btn-ghost" type="button" onClick={resetFilters}>
              <RotateCcw size={15} /> Reset filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="aq-table-card">
            <table className="aq-table">
              <thead>
                <tr>
                  <th className="aq-th-check">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th>Applicant</th>
                  <th>Scheme</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th className="aq-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => {
                  const pill = STATUS_PILL[app.status];
                  const name = applicantName(app);
                  const email = applicantEmail(app);
                  const phone = applicantPhone(app);
                  const state = applicantState(app);
                  const busy = actingId === app._id;
                  const level = schemeLevelLabel(app);
                  const isOpen = expanded.has(app._id);
                  const docs = app.documents ?? [];
                  const formEntries = Object.entries(app.formData ?? {});
                  const hasDetails = formEntries.length > 0 || docs.length > 0;
                  return (
                    <React.Fragment key={app._id}>
                      <tr className={`aq-row status-${app.status} ${selected.has(app._id) ? "is-selected" : ""}`}>
                        <td className="aq-td-check">
                          <input type="checkbox" checked={selected.has(app._id)} onChange={() => toggleRow(app._id)} />
                        </td>
                        <td>
                          <div className="aq-identity">
                            <div className="admin-avatar" aria-hidden>
                              {initials(name)}
                            </div>
                            <div className="aq-identity-text">
                              <div className="aq-identity-name">{name}</div>
                              <div className="aq-identity-sub">
                                {email && (
                                  <button type="button" title="Copy email" onClick={() => copyText(email, email)}>
                                    {email} <Copy size={11} />
                                  </button>
                                )}
                                {phone && (
                                  <span>
                                    <Phone size={11} style={{ verticalAlign: -1 }} /> {phone}
                                  </span>
                                )}
                                {state && (
                                  <span>
                                    <MapPin size={11} style={{ verticalAlign: -1 }} /> {state}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="aq-scheme-name">{schemeName(app)}</div>
                          <div className="aq-scheme-tags">
                            {level && <span className="gy-pill gy-pill-muted">{level}</span>}
                            {hasDetails && (
                              <button type="button" className="aq-details-toggle" onClick={() => toggleExpand(app._id)}>
                                {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {isOpen ? "Hide details" : "Details"}
                              </button>
                            )}
                          </div>
                        </td>
                        <td>{fmtDate(app.createdAt)}</td>
                        <td>
                          <span className={`gy-pill ${pill.cls}`}>{pill.label}</span>
                        </td>
                        <td className="aq-td-actions">
                          {busy ? (
                            <Loader2 size={18} className="spin" />
                          ) : (
                            <div className="aq-row-actions">
                              <button
                                type="button"
                                className="aq-action-btn ok"
                                title="Approve"
                                disabled={app.status === "approved"}
                                onClick={() => review(app, "approved")}
                              >
                                <CheckCircle size={15} />
                              </button>
                              <button
                                type="button"
                                className="aq-action-btn"
                                title="Mark as in review"
                                disabled={app.status === "in_review"}
                                onClick={() => review(app, "in_review")}
                              >
                                <Clock size={15} />
                              </button>
                              <button
                                type="button"
                                className="aq-action-btn danger"
                                title="Decline"
                                disabled={app.status === "rejected"}
                                onClick={() => review(app, "rejected")}
                              >
                                <XCircle size={15} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="aq-detail-row">
                          <td />
                          <td colSpan={5}>
                            <div className="aq-details">
                              {app.reviewNote && <p className="scheme-app-note">Note: {app.reviewNote}</p>}
                              {formEntries.length > 0 && (
                                <dl className="aq-detail-grid">
                                  {formEntries.map(([k, v]) => (
                                    <React.Fragment key={k}>
                                      <dt>{k}</dt>
                                      <dd>{v == null ? "—" : String(v)}</dd>
                                    </React.Fragment>
                                  ))}
                                </dl>
                              )}
                              {docs.length > 0 && (
                                <div className="aq-doc-list">
                                  {docs.map((d, i) => (
                                    <a key={i} className="gy-pill gy-pill-info" href={d.url} target="_blank" rel="noreferrer">
                                      <FileText size={12} /> {d.name || `Document ${i + 1}`}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="scheme-pagination">
            <label className="app-pagesize">
              Per page
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="gy-btn gy-btn-ghost" disabled={page <= 1} onClick={() => load(page - 1)}>
              Previous
            </button>
            <span className="scheme-page-indicator">
              {rangeLabel} · Page {page} of {pages}
            </span>
            <button type="button" className="gy-btn gy-btn-ghost" disabled={page >= pages} onClick={() => load(page + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};
