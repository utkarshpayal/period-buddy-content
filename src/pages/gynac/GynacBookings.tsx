import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Loader2,
  AlertCircle,
  Send,
  Video,
  FileText,
  CheckCircle2,
  XCircle,
  X,
  User as UserIcon,
  Activity,
  Droplet,
  CalendarDays,
  ClipboardList,
  ArrowLeft,
  Search,
  MessagesSquare,
  Inbox,
  Pill
} from "lucide-react";
import {
  Consultation,
  ConsultationMessage,
  ConsultationStatus,
  PatientOverview,
  getConsultations,
  getConsultationMessages,
  getConsultationPatient,
  sendConsultationMessage,
  setPrescription,
  completeConsultation,
  cancelConsultation,
  patientName,
  formatMoney,
  getWebSocketUrl
} from "../../api/doctorApi";
import { Avatar, EmptyState, PageHeader, StatusBadge, Tabs, timeAgo } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { ConsultationCall, ConsultationCallHandle } from "./ConsultationCall";

type Filter = ConsultationStatus | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "New" },
  { value: "active", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" }
];

/** "Today" / "Yesterday" / a date — for separators in the conversation. */
const dayLabel = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

/**
 * Collapses a message list so the same message never renders twice. The load,
 * WebSocket broadcast, and send response can all carry overlapping messages, so
 * without this an echoed message shows up multiple times. Messages with an `_id`
 * dedupe on it; any without one dedupe on sender+text.
 */
function dedupeMessages(messages: ConsultationMessage[]): ConsultationMessage[] {
  const seen = new Set<string>();
  const out: ConsultationMessage[] = [];
  for (const msg of messages) {
    const key = msg._id ? `id:${msg._id}` : `tmp:${msg.sender}:${msg.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(msg);
  }
  return out;
}

export const GynacBookings: React.FC = () => {
  const toast = useToast();
  const location = useLocation();
  const openOnLoad = (location.state as { open?: string } | null)?.open;
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [bookings, setBookings] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Consultation | null>(null);
  const [messages, setMessages] = useState<ConsultationMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [showPatient, setShowPatient] = useState(false);
  const [patient, setPatient] = useState<PatientOverview | null>(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientError, setPatientError] = useState<string | null>(null);
  const [showRx, setShowRx] = useState(false);
  const [rxText, setRxText] = useState("");
  const [rxSaving, setRxSaving] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const callRef = useRef<ConsultationCallHandle | null>(null);

  const loadBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getConsultations(filter === "all" ? undefined : filter);
      setBookings(list);
      // Arriving from the dashboard's "Up next" list opens that booking.
      if (openOnLoad && !selected) {
        const target = list.find((b) => b._id === openOnLoad);
        if (target) openChat(target);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const openChat = async (booking: Consultation) => {
    setSelected(booking);
    setRxText(booking.prescription ?? "");
    // Reset the patient panel for the newly-selected booking.
    setPatient(null);
    setPatientError(null);
    setShowPatient(false);
    setMsgLoading(true);
    try {
      setMessages(dedupeMessages(await getConsultationMessages(booking._id)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load messages.");
    } finally {
      setMsgLoading(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Live consultation socket: while a booking is open we join its shared room
  // (`consultation_<id>`) for live chat and to send/receive WebRTC call
  // signaling — the same room the patient app joins, so an inbound call from
  // the patient surfaces right here (ConsultationCall handles `call_request`).
  useEffect(() => {
    if (!selected) return;
    const roomId = `consultation_${selected._id}`;
    let closed = false;
    let socket: WebSocket;
    try {
      socket = new WebSocket(getWebSocketUrl());
    } catch {
      return;
    }
    socketRef.current = socket;

    socket.onopen = () => {
      if (closed) return;
      socket.send(JSON.stringify({ type: "join", room: roomId }));
    };

    socket.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data?.type === "message" && data.room === roomId && Array.isArray(data.messages)) {
        // Merge in any new messages we don't already have (dedupe by _id).
        setMessages((prev) => dedupeMessages([...prev, ...data.messages]));
      } else if (data?.type && data.room === roomId) {
        // Everything else on this room is call signaling — hand it to the call UI.
        callRef.current?.handleSignal(data);
      }
    };

    return () => {
      closed = true;
      try {
        socket.send(JSON.stringify({ type: "leave", room: roomId }));
      } catch {
        /* socket may not be open yet */
      }
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [selected?._id]);

  // Core send used by both the chat sheet form and the in-call chat panel.
  const sendMessageText = async (text: string) => {
    const body = text.trim();
    if (!selected || !body || sending) return;
    setSending(true);
    try {
      const msg = await sendConsultationMessage(selected._id, body);
      setMessages((prev) => dedupeMessages([...prev, msg]));
      // A reply moves a 'paid' booking to 'active'.
      if (selected.status === "paid") {
        setSelected({ ...selected, status: "active" });
        setBookings((prev) =>
          prev.map((b) => (b._id === selected._id ? { ...b, status: "active" } : b))
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    const text = draft;
    setDraft("");
    await sendMessageText(text);
  };

  const openPatient = async () => {
    if (!selected) return;
    setShowPatient(true);
    if (patient || patientLoading) return; // already loaded / loading
    setPatientLoading(true);
    setPatientError(null);
    try {
      setPatient(await getConsultationPatient(selected._id));
    } catch (err) {
      setPatientError(
        err instanceof Error ? err.message : "Could not load patient records."
      );
    } finally {
      setPatientLoading(false);
    }
  };

  const beginCall = () => {
    if (!selected) return;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      toast.show("Still connecting to the consultation room. Try again in a moment.", "info");
      return;
    }
    callRef.current?.startCall();
  };

  const saveRx = async () => {
    if (!selected || !rxText.trim()) return;
    setRxSaving(true);
    try {
      const updated = await setPrescription(selected._id, rxText.trim());
      setSelected(updated);
      setBookings((prev) => prev.map((b) => (b._id === updated._id ? updated : b)));
      setShowRx(false);
      toast.success("Prescription saved and shared with the patient.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save prescription.");
    } finally {
      setRxSaving(false);
    }
  };

  const finish = async () => {
    if (!selected) return;
    try {
      if (!window.confirm("Mark this consultation as completed? Chat will close for this session.")) return;
      const updated = await completeConsultation(selected._id);
      setSelected(updated);
      toast.success("Consultation completed.");
      setBookings((prev) => prev.map((b) => (b._id === updated._id ? updated : b)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete session.");
    }
  };

  const abort = async () => {
    if (!selected) return;
    if (!window.confirm("Cancel this consultation?")) return;
    try {
      const updated = await cancelConsultation(selected._id);
      setSelected(updated);
      setBookings((prev) => prev.map((b) => (b._id === updated._id ? updated : b)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel session.");
    }
  };

  const isLive = Boolean(selected && ["paid", "active"].includes(selected.status));
  // Patient records (and the prescription editor) should only be reachable
  // while the session is actually live — once a booking is completed or
  // cancelled, both close back down rather than staying open indefinitely.
  const isConnected = isLive;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? bookings.filter((b) => patientName(b.userId).toLowerCase().includes(q)) : bookings;
  }, [bookings, search]);

  // Messages with a date separator wherever the day changes.
  const thread = useMemo(() => {
    const out: Array<{ kind: "day"; label: string } | { kind: "msg"; msg: ConsultationMessage }> = [];
    let lastDay = "";
    for (const msg of messages) {
      const label = dayLabel(msg.sentAt);
      if (label && label !== lastDay) {
        out.push({ kind: "day", label });
        lastDay = label;
      }
      out.push({ kind: "msg", msg });
    }
    return out;
  }, [messages]);

  const onComposerKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const selectedName = selected ? patientName(selected.userId) : "";

  return (
    <div className="gx-page gx-page-fill">
      <PageHeader
        eyebrow="Consultations"
        title="Bookings & Chat"
        subtitle="Chat with patients, start video calls, and share prescriptions — all in one place."
      />

      {error && (
        <div className="gx-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className={`gx-inbox ${selected ? "has-selection" : ""}`}>
        <aside className="gx-inbox-list" aria-label="Bookings">
          <div className="gx-inbox-tools">
            <label className="gx-search">
              <Search size={16} />
              <input
                type="search"
                placeholder="Search patients"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <Tabs label="Filter bookings" items={FILTERS} value={filter} onChange={setFilter} />
          </div>

          <div className="gx-inbox-items">
            {loading ? (
              <div className="gx-center-pad">
                <Loader2 className="spin-icon" size={20} />
              </div>
            ) : visible.length === 0 ? (
              <EmptyState icon={<Inbox size={22} />} title={search ? "No matching patients" : "Nothing here"}>
                {search ? "Try a different name." : "Bookings in this view will show up here."}
              </EmptyState>
            ) : (
              visible.map((b) => {
                const name = patientName(b.userId);
                return (
                  <button
                    key={b._id}
                    type="button"
                    className={`gx-inbox-item ${selected?._id === b._id ? "is-active" : ""} ${b.status === "paid" ? "is-new" : ""}`}
                    onClick={() => openChat(b)}
                  >
                    <Avatar name={name} />
                    <span className="gx-inbox-item-text">
                      <span className="gx-inbox-item-top">
                        <strong>{name}</strong>
                        <time>{timeAgo(b.updatedAt || b.createdAt)}</time>
                      </span>
                      <span className="gx-inbox-item-bottom">
                        <StatusBadge status={b.status} />
                        <span className="gx-muted">{formatMoney(b.amountPaid, b.currency)}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="gx-conversation" aria-label="Conversation">
          {!selected ? (
            <EmptyState icon={<MessagesSquare size={24} />} title="Select a booking">
              Pick a patient on the left to see your conversation, start a call, or write a prescription.
            </EmptyState>
          ) : (
            <>
              <header className="gx-conv-head">
                <button type="button" className="gx-icon-btn gx-back" aria-label="Back to bookings" onClick={() => setSelected(null)}>
                  <ArrowLeft size={18} />
                </button>
                <Avatar name={selectedName} />
                <div className="gx-conv-title">
                  <strong>{selectedName}</strong>
                  <span>
                    <StatusBadge status={selected.status} /> {formatMoney(selected.amountPaid, selected.currency)} · booked{" "}
                    {timeAgo(selected.createdAt)}
                  </span>
                </div>
                <div className="gx-conv-actions">
                  {isConnected && (
                    <button className="gx-btn gx-btn-ghost" type="button" onClick={openPatient}>
                      <UserIcon size={16} /> <span className="gx-hide-sm">Records</span>
                    </button>
                  )}
                  <button className="gx-btn gx-btn-ghost" type="button" onClick={() => setShowRx(true)} disabled={!isLive}>
                    <Pill size={16} /> <span className="gx-hide-sm">Prescription</span>
                  </button>
                  <button className="gx-btn gx-btn-primary" type="button" onClick={beginCall} disabled={!isLive}>
                    <Video size={16} /> <span className="gx-hide-sm">Video call</span>
                  </button>
                </div>
              </header>

              {isLive && (
                <div className="gx-conv-bar">
                  <span>
                    {selected.status === "paid"
                      ? "New booking — reply to start the consultation."
                      : "Consultation in progress."}
                  </span>
                  <span className="gx-conv-bar-actions">
                    <button className="gx-btn gx-btn-sm gx-btn-success" type="button" onClick={finish}>
                      <CheckCircle2 size={14} /> Complete
                    </button>
                    <button className="gx-btn gx-btn-sm gx-btn-quiet-danger" type="button" onClick={abort}>
                      <XCircle size={14} /> Cancel
                    </button>
                  </span>
                </div>
              )}

              {selected.prescription && (
                <div className="gx-rx-pinned">
                  <FileText size={16} />
                  <div>
                    <strong>Prescription shared</strong>
                    <p>{selected.prescription}</p>
                  </div>
                  {isLive && (
                    <button type="button" className="gx-link" onClick={() => setShowRx(true)}>
                      Edit
                    </button>
                  )}
                </div>
              )}

              <div className="gx-messages" ref={scrollRef}>
                {msgLoading ? (
                  <div className="gx-center-pad">
                    <Loader2 className="spin-icon" size={18} />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="gx-thread-empty">No messages yet. Say hello to {selectedName.split(" ")[0]}.</p>
                ) : (
                  thread.map((entry, i) =>
                    entry.kind === "day" ? (
                      <div className="gx-day-sep" key={`day-${entry.label}-${i}`}>
                        <span>{entry.label}</span>
                      </div>
                    ) : (
                      <div key={entry.msg._id ?? i} className={`gx-bubble ${entry.msg.sender === "doctor" ? "mine" : "theirs"}`}>
                        <p>{entry.msg.text}</p>
                        {entry.msg.attachmentUrl && (
                          <a href={entry.msg.attachmentUrl} target="_blank" rel="noreferrer" className="gx-attach">
                            <FileText size={14} /> View attachment
                          </a>
                        )}
                        <time>
                          {entry.msg.sentAt
                            ? new Date(entry.msg.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : ""}
                        </time>
                      </div>
                    )
                  )
                )}
              </div>

              <form className="gx-composer" onSubmit={send}>
                <textarea
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onComposerKey}
                  placeholder={isLive ? "Write a message…" : "This consultation is closed"}
                  title="Enter to send · Shift+Enter for a new line"
                  disabled={!isLive || sending}
                  aria-label="Message"
                />
                <button className="gx-btn gx-btn-primary gx-send" type="submit" disabled={!isLive || sending || !draft.trim()} aria-label="Send">
                  {sending ? <Loader2 className="spin-icon" size={18} /> : <Send size={18} />}
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {selected && (
        <ConsultationCall
          key={selected._id}
          ref={callRef}
          roomId={`consultation_${selected._id}`}
          peerName={selectedName}
          socketRef={socketRef}
          messages={messages}
          onSendMessage={sendMessageText}
        />
      )}

      {showPatient && selected && (
        <div className="gx-overlay" onClick={() => setShowPatient(false)}>
          <aside className="gx-drawer" onClick={(e) => e.stopPropagation()} aria-label="Patient records">
            <div className="gx-drawer-head">
              <span><UserIcon size={16} /> Patient records</span>
              <button className="gx-icon-btn" type="button" aria-label="Close" onClick={() => setShowPatient(false)}>
                <X size={18} />
              </button>
            </div>

            {patientLoading ? (
              <div className="gx-center-pad">
                <Loader2 className="spin-icon" size={20} />
              </div>
            ) : patientError ? (
              <div className="gx-error">
                <AlertCircle size={16} />
                <span>{patientError}</span>
              </div>
            ) : patient ? (
              <div className="gx-drawer-body">
                <div className="gx-patient-id">
                  <Avatar name={patient.profile.name} size="lg" src={patient.profile.profilePicture} />
                  <div>
                    <h3>{patient.profile.name}</h3>
                    <p className="gx-muted">{patient.profile.email}</p>
                    <div className="gx-tags">
                      {patient.profile.age != null && <span className="gx-tag">{patient.profile.age} yrs</span>}
                      {patient.profile.gender && <span className="gx-tag">{patient.profile.gender}</span>}
                      {patient.profile.country && <span className="gx-tag">{patient.profile.country}</span>}
                    </div>
                  </div>
                </div>

                <section className="gx-drawer-section">
                  <h4><Activity size={14} /> Cycle overview</h4>
                  {patient.cycle ? (
                    <div className="gx-metrics">
                      <div><strong>{patient.cycle.cycleLength ?? "—"}</strong><span>Cycle length (days)</span></div>
                      <div><strong>{patient.cycle.periodLength ?? "—"}</strong><span>Period length (days)</span></div>
                      <div>
                        <strong>
                          {patient.cycle.lastPeriodStartDate
                            ? new Date(patient.cycle.lastPeriodStartDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                            : "—"}
                        </strong>
                        <span>Last period start</span>
                      </div>
                      {patient.cycle.pregnancyMode && <div><strong>Yes</strong><span>Pregnancy mode</span></div>}
                    </div>
                  ) : (
                    <p className="gx-muted">No cycle data shared.</p>
                  )}
                </section>

                <section className="gx-drawer-section">
                  <h4><Droplet size={14} /> Recent logs</h4>
                  {patient.recentLogs.length === 0 ? (
                    <p className="gx-muted">No recent logs.</p>
                  ) : (
                    <ul className="gx-log-list">
                      {patient.recentLogs.map((log) => (
                        <li key={log._id}>
                          <span className="gx-log-date">
                            <CalendarDays size={12} />
                            {log.date ? new Date(log.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : log.dateKey}
                          </span>
                          <span className="gx-tags">
                            {log.flow && log.flow !== "none" && <span className={`gx-tag flow-${log.flow}`}>{log.flow}</span>}
                            {log.phase && <span className="gx-tag">{log.phase}</span>}
                            {log.mood && <span className="gx-tag">{log.mood}</span>}
                            {(log.symptoms ?? []).slice(0, 3).map((sym) => (
                              <span className="gx-tag is-symptom" key={sym}>{sym}</span>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {patient.screenings.length > 0 && (
                  <section className="gx-drawer-section">
                    <h4><ClipboardList size={14} /> Screening assessments</h4>
                    {patient.screenings.map((sc) => (
                      <div className={`gx-screen risk-${sc.riskLevel}`} key={sc._id}>
                        <div className="gx-screen-head">
                          <strong>{sc.condition.toUpperCase()}</strong>
                          <span>{sc.riskLevel} risk · score {sc.score}</span>
                        </div>
                        <p>{sc.doctorDiscussionSummary || sc.summary}</p>
                      </div>
                    ))}
                  </section>
                )}
              </div>
            ) : null}
          </aside>
        </div>
      )}

      {showRx && selected && (
        <div className="gx-overlay is-centered" onClick={() => setShowRx(false)}>
          <div className="gx-dialog" role="dialog" aria-label="Prescription" onClick={(e) => e.stopPropagation()}>
            <div className="gx-drawer-head">
              <span><Pill size={16} /> Prescription for {selectedName}</span>
              <button className="gx-icon-btn" type="button" aria-label="Close" onClick={() => setShowRx(false)}>
                <X size={18} />
              </button>
            </div>
            <p className="gx-muted">The patient sees this in their app as soon as you save.</p>
            <textarea
              className="gx-textarea"
              rows={9}
              value={rxText}
              onChange={(e) => setRxText(e.target.value)}
              placeholder={"Medication — dosage — duration\nAdvice\nFollow-up"}
              autoFocus
            />
            <div className="gx-dialog-actions">
              <button className="gx-btn gx-btn-ghost" type="button" onClick={() => setShowRx(false)}>
                Cancel
              </button>
              <button className="gx-btn gx-btn-primary" type="button" onClick={saveRx} disabled={rxSaving || !rxText.trim()}>
                {rxSaving ? <Loader2 className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}
                Save prescription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
