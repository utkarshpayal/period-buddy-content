import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Download,
  Eye,
  FilePlus2,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  UserPlus,
  X
} from "lucide-react";
import {
  CustomField,
  HrDocument,
  HrMember,
  HrMemberInput,
  MemberStatus,
  downloadBlob,
  fullName,
  hrApi
} from "../../api/hrApi";
import { useToast } from "../../components/Toast";
import { DocStatusPill, Dialog, PdfModal, labelOf, useHrMeta } from "./shared";
import { SendDocumentDialog } from "./SendDocumentDialog";

const STATUS_PILL: Record<MemberStatus, string> = {
  offered: "gy-pill-warn",
  active: "gy-pill-ok",
  completed: "gy-pill-info",
  exited: "gy-pill-muted"
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

const docFilename = (d: HrDocument, signed: boolean) =>
  `${d.number} - ${d.templateName} - ${d.member?.fullName ?? "document"}${signed ? " (signed)" : ""}.pdf`;

export const PeoplePage: React.FC = () => {
  const toast = useToast();
  const { meta } = useHrMeta();
  const [members, setMembers] = useState<HrMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [editing, setEditing] = useState<HrMember | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<HrMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await hrApi.listMembers({ status: status || undefined });
      setMembers(res.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load team members.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter(
      (m) =>
        (!type || m.employmentType === type) &&
        (!q || `${fullName(m)} ${m.email} ${m.designation ?? ""} ${m.department ?? ""}`.toLowerCase().includes(q))
    );
  }, [members, search, type]);

  const counts = useMemo(
    () => ({
      total: members.length,
      active: members.filter((m) => m.status === "active").length,
      interns: members.filter((m) => m.employmentType === "intern").length,
      offered: members.filter((m) => m.status === "offered").length
    }),
    [members]
  );

  const upsert = (m: HrMember) =>
    setMembers((prev) => (prev.some((x) => x._id === m._id) ? prev.map((x) => (x._id === m._id ? { ...x, ...m } : x)) : [m, ...prev]));

  const remove = async (m: HrMember) => {
    if (!window.confirm(`Delete ${fullName(m)}? Their letters and signed copies are deleted too. This can't be undone.`)) return;
    try {
      await hrApi.deleteMember(m._id);
      setMembers((prev) => prev.filter((x) => x._id !== m._id));
      if (openId === m._id) setOpenId(null);
      toast.success(`${fullName(m)} deleted.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete.");
    }
  };

  return (
    <div className="workspace-page">
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">Organisation</p>
          <h2>People &amp; Letters</h2>
          <p className="subtitle-text">
            Everyone you've hired: full-timers, interns and contractors. Send them offer letters, completion letters and
            certificates from your Canva templates, and collect their signature online.
          </p>
        </div>
        <button type="button" className="primary-action" onClick={() => setEditing("new")}>
          <UserPlus size={18} /> Add team member
        </button>
      </div>

      <section className="ws-stat-row" aria-label="Team summary">
        <div className="ws-stat"><span>Team members</span><strong>{counts.total}</strong></div>
        <div className="ws-stat"><span>Active</span><strong>{counts.active}</strong></div>
        <div className="ws-stat"><span>Interns</span><strong>{counts.interns}</strong></div>
        <div className="ws-stat"><span>Offer out</span><strong>{counts.offered}</strong></div>
      </section>

      {error && (
        <div className="gy-alert gy-alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="app-filter-bar">
        <select className="app-filter-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          {meta?.memberStatuses.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select className="app-filter-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {meta?.employmentTypes.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <label className="scheme-search app-filter-search">
          <Search size={16} />
          <input type="search" placeholder="Search name, email, role or team…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading your team…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="gy-empty">
          <p>{members.length ? "No one matches these filters." : "No team members yet. Add your first hire."}</p>
        </div>
      ) : (
        <div className="admin-table-card">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Type</th>
                <th>Status</th>
                <th>Dates</th>
                <th>Letters</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m._id} className="hr-click-row" onClick={() => setOpenId(m._id)}>
                  <td>
                    <div className="admin-user-cell">
                      <div className="admin-avatar dept-organisation">{initials(fullName(m))}</div>
                      <div>
                        <div className="admin-user-name">{fullName(m)}</div>
                        <div className="admin-user-sub">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Role">
                    {m.designation ?? "—"}
                    {m.department && <div className="admin-user-sub">{m.department}</div>}
                  </td>
                  <td data-label="Type">{labelOf(meta?.employmentTypes, m.employmentType)}</td>
                  <td data-label="Status">
                    <span className={`gy-pill ${STATUS_PILL[m.status]}`}>{labelOf(meta?.memberStatuses, m.status)}</span>
                  </td>
                  <td data-label="Dates" className="admin-user-sub">
                    {formatDate(m.startDate)}
                    {m.endDate && ` → ${formatDate(m.endDate)}`}
                  </td>
                  <td data-label="Letters">{m.documentCount ?? 0}</td>
                  <td>
                    <div className="admin-cell-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="gy-btn gy-btn-ghost" onClick={() => setSendFor(m)}>
                        <FilePlus2 size={14} /> Send letter
                      </button>
                      <button type="button" className="gy-icon-btn" title="Edit" onClick={() => setEditing(m)}>
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="gy-icon-btn danger" title="Delete" onClick={() => remove(m)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <MemberDialog
          member={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(m, created) => {
            upsert(m);
            setEditing(null);
            toast.success(created ? `${fullName(m)} added.` : "Saved.");
          }}
        />
      )}

      {openId && (
        <MemberDrawer
          memberId={openId}
          onClose={() => setOpenId(null)}
          onEdit={(m) => setEditing(m)}
          onSend={(m) => setSendFor(m)}
          refreshKey={members.find((m) => m._id === openId)?.documentCount ?? 0}
        />
      )}

      {sendFor && (
        <SendDocumentDialog
          member={sendFor}
          onClose={() => setSendFor(null)}
          onDone={() => {
            setMembers((prev) =>
              prev.map((x) => (x._id === sendFor._id ? { ...x, documentCount: (x.documentCount ?? 0) + 1 } : x))
            );
          }}
        />
      )}
    </div>
  );
};

/* ----------------------------- Member dialog ----------------------------- */

const EMPTY: HrMemberInput = {
  firstName: "",
  lastName: null,
  email: "",
  phone: null,
  designation: null,
  department: null,
  employmentType: "full_time",
  status: "offered",
  startDate: null,
  endDate: null,
  compensation: null,
  location: null,
  managerName: null,
  address: null,
  customFields: [],
  notes: null
};

const CUSTOM_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,30}$/;
const toInput = (m: HrMember): HrMemberInput => {
  const { _id: _i, documentCount: _d, createdAt: _c, updatedAt: _u, ...rest } = m;
  return {
    ...rest,
    startDate: m.startDate ? m.startDate.slice(0, 10) : null,
    endDate: m.endDate ? m.endDate.slice(0, 10) : null
  };
};

const MemberDialog: React.FC<{
  member: HrMember | null;
  onClose: () => void;
  onSaved: (m: HrMember, created: boolean) => void;
}> = ({ member, onClose, onSaved }) => {
  const { meta } = useHrMeta();
  const [form, setForm] = useState<HrMemberInput>(member ? toInput(member) : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof HrMemberInput>(key: K, value: HrMemberInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const text = (key: keyof HrMemberInput) => ({
    value: (form[key] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set(key, (e.target.value || null) as never)
  });
  const setCustom = (i: number, patch: Partial<CustomField>) =>
    set(
      "customFields",
      form.customFields.map((f, j) => (j === i ? { ...f, ...patch } : f))
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.email.trim()) return setError("First name and email are required.");
    const bad = form.customFields.find((f) => f.key && !CUSTOM_KEY.test(f.key));
    if (bad) return setError(`Custom field name “${bad.key}” must start with a letter and use only letters, numbers and _.`);
    if (form.startDate && form.endDate && form.endDate < form.startDate) return setError("The end date is before the start date.");
    setSaving(true);
    setError(null);
    const payload: HrMemberInput = {
      ...form,
      firstName: form.firstName.trim(),
      email: form.email.trim(),
      customFields: form.customFields.filter((f) => f.key.trim()).map((f) => ({ key: f.key.trim(), value: f.value }))
    };
    try {
      const res = member ? await hrApi.updateMember(member._id, payload) : await hrApi.createMember(payload);
      onSaved(res.member, !member);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      as="form"
      onSubmit={submit}
      wide
      title={member ? `Edit ${fullName(member)}` : "Add a team member"}
      subtitle="These details fill your letters. Only Super Admins can see them."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="gy-btn gy-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-action" disabled={saving}>
            {saving && <Loader2 className="spin-icon" size={16} />} {member ? "Save changes" : "Add member"}
          </button>
        </>
      }
    >
      {error && <div className="gy-alert gy-alert-error"><span>{error}</span></div>}
      <div className="hr-grid">
        <label className="ws-field"><span>First name *</span><input autoFocus value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></label>
        <label className="ws-field"><span>Last name</span><input {...text("lastName")} /></label>
        <label className="ws-field"><span>Email *</span><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="priya@gmail.com" /></label>
        <label className="ws-field"><span>Phone</span><input {...text("phone")} placeholder="+91 98765 43210" /></label>
        <label className="ws-field"><span>Designation</span><input {...text("designation")} placeholder="Product Design Intern" /></label>
        <label className="ws-field"><span>Department / team</span><input {...text("department")} placeholder="Design" /></label>
        <label className="ws-field">
          <span>Type</span>
          <select value={form.employmentType} onChange={(e) => set("employmentType", e.target.value as HrMemberInput["employmentType"])}>
            {meta?.employmentTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="ws-field">
          <span>Status</span>
          <select value={form.status} onChange={(e) => set("status", e.target.value as MemberStatus)}>
            {meta?.memberStatuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="ws-field"><span>Start date</span><input type="date" {...text("startDate")} /></label>
        <label className="ws-field"><span>End date</span><input type="date" {...text("endDate")} /></label>
        <label className="ws-field"><span>Compensation</span><input {...text("compensation")} placeholder="₹15,000 / month" /></label>
        <label className="ws-field"><span>Location</span><input {...text("location")} placeholder="Remote · Bengaluru" /></label>
        <label className="ws-field"><span>Reporting manager</span><input {...text("managerName")} /></label>
        <label className="ws-field hr-span-2"><span>Address</span><textarea rows={2} {...text("address")} /></label>
      </div>

      <div className="hr-custom">
        <div className="hr-custom-head">
          <span>Custom fields</span>
          <small>Use them in templates as <code>{"{{custom.name}}"}</code>, e.g. project, college, stipend date.</small>
        </div>
        {form.customFields.map((f, i) => (
          <div className="hr-custom-row" key={i}>
            <input placeholder="name, e.g. college" value={f.key} onChange={(e) => setCustom(i, { key: e.target.value.replace(/\s+/g, "_") })} aria-label="Field name" />
            <input placeholder="value" value={f.value} onChange={(e) => setCustom(i, { value: e.target.value })} aria-label="Field value" />
            <button type="button" className="gy-icon-btn danger" aria-label="Remove field" onClick={() => set("customFields", form.customFields.filter((_, j) => j !== i))}>
              <X size={16} />
            </button>
          </div>
        ))}
        <button type="button" className="gy-btn gy-btn-ghost" onClick={() => set("customFields", [...form.customFields, { key: "", value: "" }])}>
          <Plus size={14} /> Add a field
        </button>
      </div>

      <label className="ws-field"><span>Private notes</span><textarea rows={2} {...text("notes")} /></label>
    </Dialog>
  );
};

/* ----------------------------- Member drawer ----------------------------- */

const MemberDrawer: React.FC<{
  memberId: string;
  refreshKey: number;
  onClose: () => void;
  onEdit: (m: HrMember) => void;
  onSend: (m: HrMember) => void;
}> = ({ memberId, refreshKey, onClose, onEdit, onSend }) => {
  const toast = useToast();
  const { meta } = useHrMeta();
  const [member, setMember] = useState<HrMember | null>(null);
  const [docs, setDocs] = useState<HrDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ title: string; file: Blob; filename: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hrApi.getMember(memberId);
      setMember(res.member);
      setDocs(res.documents);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load this member.");
    } finally {
      setLoading(false);
    }
  }, [memberId, toast]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id);
    try {
      await action();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const replace = (d: HrDocument) => setDocs((prev) => prev.map((x) => (x._id === d._id ? d : x)));

  const detail = (label: string, value?: string | null) =>
    value ? (
      <div className="hr-detail">
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    ) : null;

  return (
    <div className="modal-overlay hr-drawer-overlay" onClick={onClose}>
      <aside className="hr-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Team member">
        {loading || !member ? (
          <div className="gy-empty"><Loader2 className="spin-icon" size={22} /><p>Loading…</p></div>
        ) : (
          <>
            <div className="ws-dialog-head">
              <div>
                <h3>{fullName(member)}</h3>
                <p>{[member.designation, labelOf(meta?.employmentTypes, member.employmentType)].filter(Boolean).join(" · ")}</p>
              </div>
              <button type="button" className="gy-icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
            </div>
            <div className="hr-drawer-body">
              <div className="hr-row-actions">
                <button type="button" className="primary-action" onClick={() => onSend(member)}>
                  <FilePlus2 size={16} /> Send a document
                </button>
                <button type="button" className="gy-btn gy-btn-ghost" onClick={() => onEdit(member)}>
                  <Pencil size={14} /> Edit details
                </button>
              </div>

              <dl className="hr-details">
                {detail("Email", member.email)}
                {detail("Phone", member.phone)}
                {detail("Department", member.department)}
                {detail("Status", labelOf(meta?.memberStatuses, member.status))}
                {detail("Start date", member.startDate ? formatDate(member.startDate) : null)}
                {detail("End date", member.endDate ? formatDate(member.endDate) : null)}
                {detail("Compensation", member.compensation)}
                {detail("Location", member.location)}
                {detail("Manager", member.managerName)}
                {detail("Address", member.address)}
                {member.customFields.map((f) => detail(f.key, f.value))}
              </dl>
              {member.notes && <p className="hr-notes">{member.notes}</p>}

              <h4 className="hr-subhead">Documents</h4>
              {docs.length === 0 ? (
                <p className="admin-user-sub">Nothing sent yet.</p>
              ) : (
                <ul className="hr-doc-list">
                  {docs.map((d) => (
                    <li key={d._id} className="hr-doc">
                      <div className="hr-doc-main">
                        <strong>{d.templateName}</strong>
                        <DocStatusPill status={d.status} />
                        {d.requiresSignature && d.status !== "signed" && d.status !== "revoked" && (
                          <span className="gy-pill gy-pill-muted">Awaiting signature</span>
                        )}
                      </div>
                      <div className="admin-user-sub">
                        {d.number} · created {formatDate(d.createdAt)}
                        {d.sentAt && ` · emailed ${formatDate(d.sentAt)}`}
                        {d.viewedAt && ` · opened ${formatDate(d.viewedAt)}`}
                        {d.signedAt && ` · signed ${formatDate(d.signedAt)} by ${d.signerName ?? "them"}`}
                      </div>
                      <div className="hr-row-actions">
                        {busy === d._id && <Loader2 className="spin-icon" size={15} />}
                        <button
                          type="button"
                          className="gy-btn gy-btn-ghost"
                          disabled={busy === d._id}
                          onClick={() =>
                            run(d._id, async () => {
                              const file = await hrApi.documentFile(d._id, d.hasSignedFile ? "signed" : "original");
                              setViewing({ title: `${d.templateName} · ${d.number}`, file, filename: docFilename(d, d.hasSignedFile) });
                            })
                          }
                        >
                          <Eye size={14} /> View
                        </button>
                        <button
                          type="button"
                          className="gy-btn gy-btn-ghost"
                          disabled={busy === d._id}
                          onClick={() => run(d._id, async () => downloadBlob(await hrApi.documentFile(d._id, "original"), docFilename(d, false)))}
                        >
                          <Download size={14} /> Original
                        </button>
                        {d.hasSignedFile && (
                          <button
                            type="button"
                            className="gy-btn gy-btn-ok"
                            disabled={busy === d._id}
                            onClick={() => run(d._id, async () => downloadBlob(await hrApi.documentFile(d._id, "signed"), docFilename(d, true)))}
                          >
                            <Download size={14} /> Signed copy
                          </button>
                        )}
                        {d.status !== "revoked" && d.status !== "signed" && (
                          <>
                            <button
                              type="button"
                              className="gy-btn gy-btn-ghost"
                              disabled={busy === d._id}
                              onClick={() =>
                                run(d._id, async () => {
                                  const res = await hrApi.resendDocument(d._id);
                                  replace(res.document);
                                  toast[res.emailed ? "success" : "error"](
                                    res.emailed ? `Emailed again to ${res.document.sentTo ?? member.email}.` : "The email didn't send. Check the mail settings."
                                  );
                                })
                              }
                            >
                              <RotateCw size={14} /> {d.sentAt ? "Resend" : "Email it"}
                            </button>
                            <button
                              type="button"
                              className="gy-btn gy-btn-quiet-danger"
                              disabled={busy === d._id}
                              onClick={() =>
                                run(d._id, async () => {
                                  if (!window.confirm(`Revoke ${d.templateName}? The signing link stops working.`)) return;
                                  replace((await hrApi.revokeDocument(d._id)).document);
                                  toast.success("Revoked.");
                                })
                              }
                            >
                              <Ban size={14} /> Revoke
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </aside>
      {viewing && <PdfModal {...viewing} onClose={() => setViewing(null)} />}
    </div>
  );
};
