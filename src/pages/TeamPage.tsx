import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  KeyRound,
  Loader2,
  MailPlus,
  RotateCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
  X
} from "lucide-react";
import {
  AssignableRole,
  StaffMember,
  changeStaffRole,
  inviteStaff,
  listStaff,
  removeStaff,
  resendStaffInvite,
  setStaffStatus
} from "../api/workspaceApi";
import { DEPARTMENT_LABEL, Department, ROLE_META, StaffRole } from "../auth/access";
import { useAppContext } from "../context/AppContext";
import { twoFactorApi } from "../api/authApi";
import { useToast } from "../components/Toast";

const STATUS_PILL: Record<StaffMember["status"], string> = {
  active: "gy-pill-ok",
  invited: "gy-pill-warn",
  suspended: "gy-pill-danger"
};

const STATUS_LABEL: Record<StaffMember["status"], string> = {
  active: "Active",
  invited: "Invite sent",
  suspended: "Suspended"
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

/** What each role can do, shown in the invite dialog so managers pick right. */
const ROLE_SUMMARY: Record<StaffRole, string> = {
  admin: "Full access to every area, including staff, audit logs and company files.",
  content_super_admin: "Publishes content directly, approves Content Admin requests, manages Content Admins.",
  content_admin: "Creates and edits drafts. Publishing, deleting and edits to live content need approval.",
  app_super_admin: "Users, push, analytics, subscriptions and scheme applications. Approves App Admin requests.",
  app_admin: "Views users and analytics, drafts pushes and pricing. Wide pushes, suspensions and pricing need approval.",
  clinical_admin: "Invites and manages gynecologists."
};

export const TeamPage: React.FC = () => {
  const { authSession } = useAppContext();
  const toast = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listStaff({ status: statusFilter || undefined });
      setStaff(res.staff);
      setRoles(res.assignableRoles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the team.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const myId = authSession?.user?._id ?? authSession?.user?.id;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter(
      (m) =>
        (!deptFilter || m.department === deptFilter) &&
        (!q || `${m.name} ${m.email} ${m.roleLabel}`.toLowerCase().includes(q))
    );
  }, [staff, search, deptFilter]);

  const counts = useMemo(
    () => ({
      total: staff.length,
      active: staff.filter((m) => m.status === "active").length,
      invited: staff.filter((m) => m.status === "invited").length,
      suspended: staff.filter((m) => m.status === "suspended").length
    }),
    [staff]
  );

  const departments = useMemo(
    () => Array.from(new Set(staff.map((m) => m.department).filter(Boolean))) as Department[],
    [staff]
  );

  const replace = (updated: StaffMember) =>
    setStaff((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  };

  const onRoleChange = (m: StaffMember, role: string) =>
    run(m.id, async () => {
      const label = ROLE_META[role as StaffRole]?.label ?? role;
      if (!window.confirm(`Change ${m.name}'s role to ${label}?`)) return;
      replace(await changeStaffRole(m.id, role));
      toast.success(`${m.name} is now ${label}.`);
    });

  const onToggleStatus = (m: StaffMember) =>
    run(m.id, async () => {
      const suspend = m.status !== "suspended";
      if (suspend && !window.confirm(`Suspend ${m.name}? They'll be signed out on their next request.`)) return;
      replace(await setStaffStatus(m.id, !suspend));
      toast.success(suspend ? `${m.name} suspended.` : `${m.name}'s access restored.`);
    });

  const onResend = (m: StaffMember) =>
    run(m.id, async () => {
      const res = await resendStaffInvite(m.id);
      setLastInviteUrl(res.inviteUrl);
      toast.success(res.inviteEmailDelivered ? `Invite re-sent to ${m.email}.` : "Email didn't send — copy the link below.");
    });

  const onResetTwoStep = (m: StaffMember) =>
    run(m.id, async () => {
      if (
        !window.confirm(
          `Reset ${m.name}'s authenticator app? Do this only if they lost their phone and recovery codes. They'll sign in with emailed codes and can set up a new app.`
        )
      )
        return;
      await twoFactorApi.resetStaff(m.id);
      replace({ ...m, authenticator: false });
      toast.success(`${m.name}'s authenticator app was reset.`);
    });

  const onRemove = (m: StaffMember) =>
    run(m.id, async () => {
      if (!window.confirm(`Remove ${m.name} from the workspace? Their account is deactivated and all access revoked.`)) return;
      await removeStaff(m.id);
      setStaff((prev) => prev.filter((x) => x.id !== m.id));
      toast.success(`${m.name} removed.`);
    });

  return (
    <div className="workspace-page">
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">Organisation</p>
          <h2>Team &amp; Access</h2>
          <p className="subtitle-text">
            Invite teammates and decide what they can do. You can manage roles below your own in your department.
          </p>
        </div>
        {roles.length > 0 && (
          <button type="button" className="primary-action" onClick={() => setInviteOpen(true)}>
            <UserPlus size={18} />
            Invite teammate
          </button>
        )}
      </div>

      <section className="ws-stat-row" aria-label="Team summary">
        <div className="ws-stat"><span>Team members</span><strong>{counts.total}</strong></div>
        <div className="ws-stat"><span>Active</span><strong>{counts.active}</strong></div>
        <div className="ws-stat"><span>Pending invites</span><strong>{counts.invited}</strong></div>
        <div className="ws-stat"><span>Suspended</span><strong>{counts.suspended}</strong></div>
      </section>

      {lastInviteUrl && (
        <div className="ws-invite-link">
          <span>Invite link (valid 48 hours):</span>
          <code>{lastInviteUrl}</code>
          <button
            type="button"
            className="gy-btn gy-btn-ghost"
            onClick={() => navigator.clipboard.writeText(lastInviteUrl).then(() => toast.success("Link copied."))}
          >
            <Copy size={14} /> Copy
          </button>
          <button type="button" className="gy-icon-btn" aria-label="Dismiss" onClick={() => setLastInviteUrl(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="gy-alert gy-alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="app-filter-bar">
        {departments.length > 1 && (
          <select aria-label="Filter by department" className="app-filter-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{DEPARTMENT_LABEL[d]}</option>
            ))}
          </select>
        )}
        <select aria-label="Filter by status" className="app-filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="invited">Invite sent</option>
          <option value="suspended">Suspended</option>
        </select>
        <label className="scheme-search app-filter-search">
          <Search size={16} />
          <input type="search" placeholder="Search name, email or role…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading your team…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="gy-empty">
          <p>{staff.length ? "No one matches these filters." : "No teammates yet — invite your first one."}</p>
        </div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last active</th>
                <th>Invited by</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const isMe = m.id === myId;
                const manageable = m.canManage && !isMe;
                const roleOptions = roles.some((r) => r.value === m.role)
                  ? roles
                  : [{ value: m.role, label: m.roleLabel, department: m.department ?? "" }, ...roles];
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="admin-user-cell">
                        <div className={`admin-avatar dept-${m.department}`}>{initials(m.name)}</div>
                        <div>
                          <div className="admin-user-name">
                            {m.name} {isMe && <span className="ws-you">You</span>}
                          </div>
                          <div className="admin-user-sub">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {manageable ? (
                        <select
                          className="app-filter-select ws-role-select"
                          value={m.role}
                          disabled={busyId === m.id}
                          onChange={(e) => onRoleChange(m, e.target.value)}
                          aria-label={`Role for ${m.name}`}
                        >
                          {roleOptions.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`ws-role-chip dept-${m.department}`}>{m.roleLabel}</span>
                      )}
                    </td>
                    <td>
                      <span className={`gy-pill ${STATUS_PILL[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                    </td>
                    <td data-label="Last active">{m.status === "invited" ? "—" : formatDate(m.lastLogin)}</td>
                    <td data-label="Invited by" className="admin-user-sub">{m.invitedBy?.name ?? "—"}</td>
                    <td>
                      <div className="admin-cell-actions">
                        {busyId === m.id && <Loader2 className="spin-icon" size={16} />}
                        {manageable && m.status === "invited" && (
                          <button type="button" className="gy-icon-btn" title="Resend invite" onClick={() => onResend(m)}>
                            <RotateCw size={16} />
                          </button>
                        )}
                        {manageable && (
                          <button
                            type="button"
                            className={`gy-btn ${m.status === "suspended" ? "gy-btn-ok" : "gy-btn-danger"}`}
                            disabled={busyId === m.id}
                            onClick={() => onToggleStatus(m)}
                          >
                            {m.status === "suspended" ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
                            {m.status === "suspended" ? "Restore" : "Suspend"}
                          </button>
                        )}
                        {manageable && m.authenticator && (
                          <button type="button" className="gy-icon-btn" title="Reset authenticator app" onClick={() => onResetTwoStep(m)}>
                            <KeyRound size={16} />
                          </button>
                        )}
                        {manageable && (
                          <button type="button" className="gy-icon-btn danger" title="Remove from workspace" onClick={() => onRemove(m)}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {inviteOpen && (
        <InviteDialog
          roles={roles}
          onClose={() => setInviteOpen(false)}
          onInvited={(member, url, delivered) => {
            setStaff((prev) => [member, ...prev]);
            setInviteOpen(false);
            setLastInviteUrl(url);
            toast.success(delivered ? `Invite sent to ${member.email}.` : "Account created — email didn't send, copy the link.");
          }}
        />
      )}
    </div>
  );
};

const InviteDialog: React.FC<{
  roles: AssignableRole[];
  onClose: () => void;
  onInvited: (member: StaffMember, inviteUrl: string, delivered: boolean) => void;
}> = ({ roles, onClose, onInvited }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[roles.length - 1]?.value ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, AssignableRole[]>();
    roles.forEach((r) => map.set(r.department, [...(map.get(r.department) ?? []), r]));
    return Array.from(map.entries());
  }, [roles]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !role) return setError("Name, email and role are required.");
    setSubmitting(true);
    setError(null);
    try {
      const res = await inviteStaff({ name: name.trim(), email: email.trim(), role });
      onInvited(res.staff, res.inviteUrl, res.inviteEmailDelivered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the invite.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" data-esc-close onClick={onClose}>
      <form className="ws-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="ws-dialog-head">
          <div>
            <h3 id="invite-title">Invite a teammate</h3>
            <p>They'll get an email with a link to set their password.</p>
          </div>
          <button type="button" className="gy-icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="ws-dialog-body">
        {error && <div className="gy-alert gy-alert-error"><span>{error}</span></div>}

        <label className="ws-field">
          <span>Full name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" />
        </label>
        <label className="ws-field">
          <span>Work email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@thenura.care" />
        </label>

        <fieldset className="ws-role-picker">
          <legend>Role</legend>
          {grouped.map(([dept, list]) => (
            <div key={dept} className="ws-role-group">
              <p className="ws-role-dept">{DEPARTMENT_LABEL[dept as Department] ?? dept}</p>
              {list.map((r) => (
                <label key={r.value} className={`ws-role-option ${role === r.value ? "is-selected" : ""}`}>
                  <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} />
                  <div>
                    <strong>{r.label}</strong>
                    <span>{ROLE_SUMMARY[r.value as StaffRole]}</span>
                  </div>
                </label>
              ))}
            </div>
          ))}
        </fieldset>
        </div>

        <div className="ws-dialog-actions">
          <button type="button" className="gy-btn gy-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-action" disabled={submitting}>
            {submitting ? <Loader2 className="spin-icon" size={16} /> : <MailPlus size={16} />}
            Send invite
          </button>
        </div>
      </form>
    </div>
  );
};
