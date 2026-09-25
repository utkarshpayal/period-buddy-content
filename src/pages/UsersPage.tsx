import { isPendingApprovalError } from "../api/approval";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Loader2,
  Search,
  ShieldOff,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  X
} from "lucide-react";
import {
  listUsers,
  getUser,
  setUserStatus,
  AdminUser,
  Pagination,
  UserActivity
} from "../api/adminApi";
import { useNoticeToast } from "../components/Toast";

const ROLE_FILTERS = [
  { value: "", label: "All roles" },
  { value: "user", label: "Users" },
  { value: "partner", label: "Partners" },
  { value: "doctor", label: "Gynacs" },
  { value: "admin", label: "Admins" }
];

const STATUS_FILTERS: { value: "" | "active" | "suspended"; label: string }[] = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" }
];

const ROLE_PILL: Record<string, string> = {
  user: "gy-pill-muted",
  partner: "gy-pill-plum",
  doctor: "gy-pill-teal",
  admin: "gy-pill-info"
};

const fullName = (u: AdminUser) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ") || "(no name)";

const initials = (u: AdminUser) =>
  ([u.firstName?.[0], u.lastName?.[0]].filter(Boolean).join("") || u.email?.[0] || "?").toUpperCase();

const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

export const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useNoticeToast(notice, () => setNotice(null));

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState<"" | "active" | "suspended">("");
  const [page, setPage] = useState(1);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ user: AdminUser; activity: UserActivity } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [debouncedSearch, role, status]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listUsers({ search: debouncedSearch, role, status: status || undefined, page });
      setUsers(res.users);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, role, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async (u: AdminUser) => {
    const nextActive = !u.isActive;
    const verb = nextActive ? "activate" : "suspend";
    if (!window.confirm(`Are you sure you want to ${verb} ${fullName(u)} (${u.email})?`)) return;
    setBusyId(u._id);
    setNotice(null);
    setError(null);
    try {
      const res = await setUserStatus(u._id, nextActive);
      setUsers((prev) => prev.map((x) => (x._id === u._id ? { ...x, isActive: res.user.isActive } : x)));
      setNotice(`${fullName(u)} ${nextActive ? "activated" : "suspended"}.`);
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : `Failed to ${verb} user.`);
    } finally {
      setBusyId(null);
    }
  };

  const openDetail = async (u: AdminUser) => {
    setDetailLoading(true);
    setDetail({ user: u, activity: { cycleLogs: 0, documents: 0, consultations: 0 } });
    try {
      const res = await getUser(u._id);
      setDetail(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user detail.");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="workspace-page">
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">Operations</p>
          <h2>User Management</h2>
          <p className="subtitle-text">
            Search, filter, view, and activate or suspend accounts. Status is enforced by the
            backend on the account's next request.
          </p>
        </div>
        {pagination && (
          <span className="gy-pill gy-pill-muted" style={{ fontSize: "0.78rem" }}>
            {pagination.total} total
          </span>
        )}
      </div>

      {error && (
        <div className="gy-alert gy-alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="app-filter-bar">
        <select className="app-filter-select" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLE_FILTERS.map((r) => (
            <option key={r.value || "all"} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        <select
          className="app-filter-select"
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | "active" | "suspended")}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value || "all"} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <label className="scheme-search app-filter-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search name, email, or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading users…</p>
        </div>
      ) : users.length === 0 ? (
        <div className="gy-empty">
          <p>No users match your filters.</p>
        </div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td>
                    <div className="admin-user-cell">
                      <div className="admin-avatar">
                        {u.profilePicture ? <img src={u.profilePicture} alt="" /> : initials(u)}
                      </div>
                      <div>
                        <div className="admin-user-name">{fullName(u)}</div>
                        <div className="admin-user-sub">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`gy-pill ${ROLE_PILL[u.role || ""] || "gy-pill-muted"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span className={`gy-pill ${u.isActive ? "gy-pill-ok" : "gy-pill-danger"}`}>
                      <span className={`admin-dot ${u.isActive ? "admin-dot-on" : "admin-dot-off"}`} />
                      {u.isActive ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    <div className="admin-cell-actions">
                      {u.isActive && !u.deletedAt && (
                        <button
                          type="button"
                          className="gy-icon-btn"
                          title="Send push notification"
                          onClick={() => navigate("/notifications", { state: { recipient: u } })}
                        >
                          <Bell size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="gy-icon-btn"
                        title="View details"
                        onClick={() => openDetail(u)}
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        className={`gy-btn ${u.isActive ? "gy-btn-danger" : "gy-btn-ok"}`}
                        disabled={busyId === u._id}
                        onClick={() => toggleStatus(u)}
                      >
                        {busyId === u._id ? (
                          <Loader2 className="spin-icon" size={14} />
                        ) : u.isActive ? (
                          <ShieldOff size={14} />
                        ) : (
                          <ShieldCheck size={14} />
                        )}
                        {u.isActive ? "Suspend" : "Activate"}
                      </button>
                    </div>
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
            Page {pagination.page} of {pagination.pages}
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

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="gy-card gy-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="gy-card-head">
              <div className="admin-user-cell">
                <div className="admin-avatar">
                  {detail.user.profilePicture ? <img src={detail.user.profilePicture} alt="" /> : initials(detail.user)}
                </div>
                <div>
                  <div className="admin-user-name">{fullName(detail.user)}</div>
                  <div className="admin-user-sub">{detail.user.email}</div>
                </div>
              </div>
              <button type="button" className="gy-icon-btn" onClick={() => setDetail(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="admin-detail-grid">
              <DetailRow label="Phone" value={detail.user.phone || "—"} />
              <DetailRow label="Role" value={detail.user.role} />
              <DetailRow label="Status" value={detail.user.isActive ? "Active" : "Suspended"} />
              <DetailRow label="Email verified" value={detail.user.isEmailVerified ? "Yes" : "No"} />
              <DetailRow label="Auth provider" value={detail.user.authProvider} />
              <DetailRow label="Plan" value={detail.user.subscriptionPlan} />
              <DetailRow
                label="Location"
                value={[detail.user.state, detail.user.country].filter(Boolean).join(", ") || "—"}
              />
              <DetailRow label="Last login" value={formatDate(detail.user.lastLogin)} />
              <DetailRow label="Joined" value={formatDate(detail.user.createdAt)} />
            </div>

            <p className="admin-section-title" style={{ marginTop: 18 }}>
              Activity · counts only, no health data
            </p>
            {detailLoading ? (
              <div className="gy-center"><Loader2 className="spin-icon" size={18} /></div>
            ) : (
              <div className="admin-activity-grid">
                <div className="admin-activity-tile">
                  <div className="n">{detail.activity.cycleLogs}</div>
                  <div className="l">Cycle logs</div>
                </div>
                <div className="admin-activity-tile">
                  <div className="n">{detail.activity.documents}</div>
                  <div className="l">Documents</div>
                </div>
                <div className="admin-activity-tile">
                  <div className="n">{detail.activity.consultations}</div>
                  <div className="l">Consults</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="admin-detail-row">
    <span className="k">{label}</span>
    <span className="v">{value || "—"}</span>
  </div>
);
