import React, { useCallback, useEffect, useState } from "react";
import { Loader2, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { listAuditLogs, AuditLogEntry, Pagination } from "../api/adminApi";

const ACTION_FILTERS = [
  { value: "", label: "All" },
  { value: "user.status_changed", label: "User status" },
  { value: "doctor.invited", label: "Gynac invited" },
  { value: "doctor.updated", label: "Gynac updated" },
  { value: "doctor.deactivated", label: "Gynac deactivated" },
  { value: "scheme.created", label: "Scheme created" },
  { value: "scheme.updated", label: "Scheme updated" },
  { value: "scheme.deleted", label: "Scheme deleted" },
  { value: "content.created", label: "Content created" },
  { value: "content.updated", label: "Content updated" },
  { value: "content.deleted", label: "Content deleted" },
  { value: "account.deleted", label: "Account deleted" }
];

// Colour the action pill by its domain prefix.
const actionPill = (action: string): string => {
  if (action.startsWith("account.") || action.endsWith(".deleted") || action.endsWith(".deactivated"))
    return "gy-pill-danger";
  if (action.startsWith("user.")) return "gy-pill-info";
  if (action.startsWith("doctor.")) return "gy-pill-teal";
  if (action.startsWith("scheme.")) return "gy-pill-plum";
  return "gy-pill-muted";
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [action]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAuditLogs({ action: action || undefined, page });
      setLogs(res.logs);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [action, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="workspace-page">
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>Audit Logs</h2>
          <p className="subtitle-text">
            Privileged and security-sensitive actions. Entries reference IDs only — never medical
            content.
          </p>
        </div>
        <button type="button" className="gy-btn gy-btn-ghost" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="spin-icon" size={16} /> : <RefreshCw size={16} />} Refresh
        </button>
      </div>

      {error && (
        <div className="gy-alert gy-alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="admin-filter-row">
        <span className="admin-filter-label">Action</span>
        {ACTION_FILTERS.map((a) => (
          <button
            key={a.value || "all"}
            type="button"
            className={`admin-chip ${action === a.value ? "is-active" : ""}`}
            onClick={() => setAction(a.value)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading audit logs…</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="gy-empty">
          <p>No audit activity for this filter.</p>
        </div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Resource</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l._id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatWhen(l.createdAt)}</td>
                  <td>
                    <span className={`gy-pill ${actionPill(l.action)}`}>{l.action}</span>
                  </td>
                  <td>
                    <div className="admin-user-name" style={{ textTransform: "capitalize" }}>
                      {l.actorRole || "—"}
                    </div>
                    {l.actorId && <div className="admin-user-sub">…{l.actorId.slice(-6)}</div>}
                  </td>
                  <td>
                    <div className="admin-user-name" style={{ textTransform: "capitalize" }}>
                      {l.resourceType || "—"}
                    </div>
                    {l.resourceId && (
                      <div className="admin-user-sub">…{String(l.resourceId).slice(-6)}</div>
                    )}
                  </td>
                  <td>
                    {l.metadata ? (
                      <code className="admin-meta-code" title={JSON.stringify(l.metadata)}>
                        {JSON.stringify(l.metadata)}
                      </code>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="admin-pagination">
          <button
            type="button"
            className="gy-btn gy-btn-ghost"
            disabled={!pagination.hasPrevPage}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span className="admin-page-indicator">
            Page {pagination.page} of {pagination.pages} · {pagination.total} entries
          </span>
          <button
            type="button"
            className="gy-btn gy-btn-ghost"
            disabled={!pagination.hasNextPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};
