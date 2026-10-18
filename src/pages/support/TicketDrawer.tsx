import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCheck, Copy, Loader2, Mail, Phone, RefreshCw, Send, Smartphone, X } from "lucide-react";
import {
  REPLY_MAX,
  SupportStaff,
  SupportTicketDetail,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TicketPriority,
  TicketStatus,
  TicketUpdate,
  categoryLabel,
  getSupportTicket,
  personName,
  replyAuthor,
  replyToSupportTicket,
  updateSupportTicket
} from "../../api/supportApi";
import { useToast } from "../../components/Toast";
import { timeAgo } from "../../components/ui";
import {
  AwaitingBadge,
  PRIORITY_META,
  PriorityPill,
  STATUS_META,
  StatusPill,
  formatDateTime,
  initialsOf
} from "./supportUi";

/** JS getTimezoneOffset() minutes → "UTC+05:30". */
const utcOffset = (minutes: number) => {
  const total = -minutes;
  const sign = total >= 0 ? "+" : "-";
  const abs = Math.abs(total);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
};

type ThreadEntry = { key: string; from: "user" | "admin"; author: string; message: string; at: string };

/**
 * One ticket: the person's contact details, attached device info, the thread,
 * status / priority / assignee controls and the reply box. Read-only without
 * support.manage.
 */
export const TicketDrawer: React.FC<{
  ticketId: string;
  canManage: boolean;
  assignees: SupportStaff[];
  onClose: () => void;
  /** A change was saved; the queue should refresh. */
  onChanged: (ticket: SupportTicketDetail) => void;
}> = ({ ticketId, canManage, assignees, onClose, onChanged }) => {
  const toast = useToast();
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<keyof TicketUpdate | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState<"reply" | "resolve" | null>(null);

  const panel = useRef<HTMLElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const threadEnd = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSupportTicket(ticketId);
      setTicket(res.ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this ticket.");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    setTicket(null);
    setReply("");
    load();
  }, [load]);

  // Focus moves in on open and back to whatever opened it on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // Keep Tab inside the panel.
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Newest message in view once the thread loads or grows.
  const replyCount = ticket?.replies.length ?? 0;
  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: "end" });
  }, [ticketId, replyCount, loading]);

  const update = async (field: keyof TicketUpdate, input: TicketUpdate, success: string) => {
    if (!ticket) return;
    setSaving(field);
    try {
      const res = await updateSupportTicket(ticket._id, input);
      setTicket(res.ticket);
      onChanged(res.ticket);
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update this ticket.");
    } finally {
      setSaving(null);
    }
  };

  const send = async (resolve: boolean) => {
    if (!ticket) return;
    const message = reply.trim();
    if (!message) return;
    setSending(resolve ? "resolve" : "reply");
    try {
      const res = await replyToSupportTicket(ticket._id, resolve ? { message, status: "resolved" } : { message });
      setTicket(res.ticket);
      setReply("");
      onChanged(res.ticket);
      toast.success(resolve ? `Replied and resolved ${res.ticket.ticketNumber}.` : "Reply sent. They'll get a notification.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the reply.");
    } finally {
      setSending(null);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success(`Copied ${label}.`))
      .catch(() => toast.error("Could not copy."));
  };

  const user = ticket?.user;
  const userName = personName(user, "App user");
  const userGone = Boolean(user?.deletedAt) || user?.isActive === false;

  const thread: ThreadEntry[] = ticket
    ? [
        { key: "original", from: "user", author: userName, message: ticket.message, at: ticket.createdAt },
        ...ticket.replies.map((r, i) => {
          const staff = replyAuthor(r);
          return {
            key: r._id ?? `r${i}`,
            from: r.from,
            author: r.from === "user" ? userName : personName(staff, "Nura support"),
            message: r.message,
            at: r.at
          };
        })
      ]
    : [];

  const meta = ticket?.meta;
  const metaRows: [string, string | undefined][] = meta
    ? [
        ["Platform", [meta.platform, meta.osVersion].filter(Boolean).join(" ") || undefined],
        ["Device", meta.deviceModel],
        ["App version", [meta.appVersion, meta.buildNumber && `(build ${meta.buildNumber})`].filter(Boolean).join(" ") || undefined],
        ["Locale", meta.locale],
        ["Time zone", typeof meta.timezoneOffset === "number" ? utcOffset(meta.timezoneOffset) : undefined]
      ]
    : [];
  const shownMeta = metaRows.filter(([, v]) => Boolean(v));

  const assigneeId = ticket?.assignee?._id ?? "";
  // The current assignee may no longer be in the picker (role changed).
  const assigneeOptions =
    ticket?.assignee && !assignees.some((a) => a._id === ticket.assignee!._id)
      ? [ticket.assignee, ...assignees]
      : assignees;

  const busy = Boolean(saving || sending);
  const trimmed = reply.trim();
  const tooLong = reply.length > REPLY_MAX;

  return (
    <div className="rf-drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        className="rf-drawer sp-drawer"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={ticket ? `Ticket ${ticket.ticketNumber}` : "Support ticket"}
      >
        <header className="rf-drawer-head">
          <div className="sp-drawer-title">
            <p className="sp-ticket-no">
              {ticket?.ticketNumber ?? "Ticket"}
              {ticket && <span> · {categoryLabel(ticket)}</span>}
            </p>
            <h3>{ticket?.subject ?? (loading ? "Loading…" : "Support ticket")}</h3>
            {ticket && (
              <div className="sp-pill-row">
                <StatusPill status={ticket.status} />
                <PriorityPill priority={ticket.priority} />
                {ticket.awaitingStaff && <AwaitingBadge />}
              </div>
            )}
          </div>
          <button type="button" className="cf-icon-btn" ref={closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        {loading && !ticket ? (
          <div className="gy-empty sp-drawer-state">
            <Loader2 className="spin-icon" size={22} />
            <span>Loading ticket…</span>
          </div>
        ) : error && !ticket ? (
          <div className="gy-empty sp-drawer-state">
            <AlertCircle size={22} />
            <span>{error}</span>
            <button type="button" className="gy-btn gy-btn-ghost" onClick={load}>
              <RefreshCw size={15} /> Try again
            </button>
          </div>
        ) : ticket ? (
          <>
            <div className="rf-drawer-body sp-drawer-body">
              {/* Person */}
              <section className="sp-section">
                <h4 className="sp-section-title">Contact</h4>
                <div className="sp-person">
                  <div className="admin-avatar" aria-hidden>
                    {initialsOf(userName)}
                  </div>
                  <div className="sp-person-text">
                    <div className="sp-person-name">
                      {userName}
                      {userGone && (
                        <span className="gy-pill gy-pill-muted">{user?.deletedAt ? "Account deleted" : "Suspended"}</span>
                      )}
                    </div>
                    {user?.email && (
                      <button type="button" className="sp-contact-line" onClick={() => copy(user.email!, "email")} title="Copy email">
                        <Mail size={13} /> {user.email} <Copy size={11} />
                      </button>
                    )}
                    {user?.phone && (
                      <button type="button" className="sp-contact-line" onClick={() => copy(user.phone!, "phone number")} title="Copy phone number">
                        <Phone size={13} /> {user.phone} <Copy size={11} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="sp-muted">
                  Opened {formatDateTime(ticket.createdAt)}
                  {ticket.resolvedAt && ` · resolved ${formatDateTime(ticket.resolvedAt)}`}
                  {ticket.closedAt && ` · closed ${formatDateTime(ticket.closedAt)}`}
                </p>
              </section>

              {/* Device */}
              <section className="sp-section">
                <h4 className="sp-section-title">
                  <Smartphone size={13} /> Device & app
                </h4>
                {shownMeta.length > 0 ? (
                  <dl className="sp-meta">
                    {shownMeta.map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="sp-muted">The person didn't attach app info.</p>
                )}
              </section>

              {/* Controls */}
              <section className="sp-section">
                <h4 className="sp-section-title">Ticket</h4>
                <div className="sp-controls">
                  <label className="aq-popover-field">
                    <span>Status</span>
                    <select
                      value={ticket.status}
                      disabled={!canManage || busy}
                      onChange={(e) => {
                        const status = e.target.value as TicketStatus;
                        update("status", { status }, `Marked ${ticket.ticketNumber} as ${STATUS_META[status].label.toLowerCase()}.`);
                      }}
                    >
                      {TICKET_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="aq-popover-field">
                    <span>Priority</span>
                    <select
                      value={ticket.priority}
                      disabled={!canManage || busy}
                      onChange={(e) => {
                        const priority = e.target.value as TicketPriority;
                        update("priority", { priority }, `Priority set to ${PRIORITY_META[priority].label.toLowerCase()}.`);
                      }}
                    >
                      {TICKET_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_META[p].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="aq-popover-field sp-control-wide">
                    <span>Assignee</span>
                    <select
                      value={assigneeId}
                      disabled={!canManage || busy}
                      onChange={(e) => {
                        const id = e.target.value || null;
                        const who = assigneeOptions.find((a) => a._id === id);
                        update("assignee", { assignee: id }, id ? `Assigned to ${personName(who)}.` : "Unassigned.");
                      }}
                    >
                      <option value="">Unassigned</option>
                      {assigneeOptions.map((a) => (
                        <option key={a._id} value={a._id}>
                          {personName(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {saving && (
                  <p className="sp-muted sp-saving">
                    <Loader2 className="spin-icon" size={13} /> Saving…
                  </p>
                )}
                {!canManage && <p className="sp-muted">You can view tickets. Changing them needs support.manage.</p>}
              </section>

              {/* Thread */}
              <section className="sp-section">
                <h4 className="sp-section-title">Conversation · {thread.length}</h4>
                <ol className="sp-thread">
                  {thread.map((m) => (
                    <li key={m.key} className={`sp-bubble-row from-${m.from}`}>
                      <div className="sp-bubble">
                        <div className="sp-bubble-head">
                          <strong>{m.author}</strong>
                          <span>{m.from === "admin" ? "Staff" : "User"}</span>
                          <time dateTime={m.at} title={formatDateTime(m.at)}>
                            {timeAgo(m.at)}
                          </time>
                        </div>
                        <p className="sp-bubble-text">{m.message}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div ref={threadEnd} />
              </section>
            </div>

            {canManage && (
              <footer className="sp-reply">
                {ticket.status === "closed" && (
                  <p className="sp-muted">This ticket is closed. The person can't reply, but you can still add a message.</p>
                )}
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={`Reply to ${userName}…`}
                  rows={4}
                  disabled={Boolean(sending)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && trimmed && !tooLong && !busy) send(false);
                  }}
                  aria-label="Reply"
                />
                <div className="sp-reply-actions">
                  <span className={`sp-counter ${tooLong ? "is-over" : ""}`}>
                    {reply.length}/{REPLY_MAX}
                  </span>
                  <button
                    type="button"
                    className="gy-btn gy-btn-ghost"
                    disabled={!trimmed || tooLong || busy}
                    onClick={() => send(true)}
                    title="Send the reply and mark the ticket resolved"
                  >
                    {sending === "resolve" ? <Loader2 className="spin-icon" size={15} /> : <CheckCheck size={15} />}
                    Reply & resolve
                  </button>
                  <button
                    type="button"
                    className="gy-btn gy-btn-primary"
                    disabled={!trimmed || tooLong || busy}
                    onClick={() => send(false)}
                    title="Send (Ctrl/⌘ + Enter)"
                  >
                    {sending === "reply" ? <Loader2 className="spin-icon" size={15} /> : <Send size={15} />}
                    Reply
                  </button>
                </div>
              </footer>
            )}
          </>
        ) : null}
      </aside>
    </div>
  );
};
