import React, { useEffect, useRef, useState } from "react";
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
  ClipboardList
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
import { GynacHead } from "./GynacHead";
import { ConsultationCall, ConsultationCallHandle } from "./ConsultationCall";

const FILTERS: { key: ConsultationStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paid", label: "New" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" }
];

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
  const [filter, setFilter] = useState<ConsultationStatus | "all">("all");
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
      setError(err instanceof Error ? err.message : "Failed to load messages.");
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
      setError(err instanceof Error ? err.message : "Could not send message.");
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
      setError("Still connecting to the consultation room. Try again in a moment.");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save prescription.");
    } finally {
      setRxSaving(false);
    }
  };

  const finish = async () => {
    if (!selected) return;
    try {
      const updated = await completeConsultation(selected._id);
      setSelected(updated);
      setBookings((prev) => prev.map((b) => (b._id === updated._id ? updated : b)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete session.");
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
      setError(err instanceof Error ? err.message : "Could not cancel session.");
    }
  };

  const isLive = selected && ["paid", "active"].includes(selected.status);
  const isConnected = selected && ["paid", "active", "completed"].includes(selected.status);

  return (
    <div className="workspace-page">
      <GynacHead
        title="Bookings & Consultations"
        subtitle="Review bookings, chat with patients, connect over video, and share prescriptions."
      />

      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="gy-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`gy-chip ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="gy-bookings-layout">
        <div className="gy-booking-list">
          {loading ? (
            <div className="gy-empty">
              <Loader2 className="spin-icon" size={20} />
              <p>Loading…</p>
            </div>
          ) : bookings.length === 0 ? (
            <div className="gy-empty">
              <p>No bookings in this view.</p>
            </div>
          ) : (
            bookings.map((b) => (
              <button
                key={b._id}
                type="button"
                className={`gy-booking-item ${selected?._id === b._id ? "active" : ""}`}
                onClick={() => openChat(b)}
              >
                <div className="gy-booking-item-head">
                  <strong>{patientName(b.userId)}</strong>
                  <em className={`gy-pill gy-status-${b.status}`}>{b.status}</em>
                </div>
                <p className="gy-muted">
                  {formatMoney(b.amountPaid, b.currency)} ·{" "}
                  {b.createdAt ? new Date(b.createdAt).toLocaleDateString() : ""}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="gy-chat-panel">
          {!selected ? (
            <div className="gy-empty gy-chat-empty">
              <FileText size={26} />
              <p>Select a booking to view the conversation.</p>
            </div>
          ) : (
            <>
              <div className="gy-chat-head">
                <div>
                  <strong>{patientName(selected.userId)}</strong>
                  <em className={`gy-pill gy-status-${selected.status}`}>{selected.status}</em>
                </div>
                <div className="gy-chat-actions">
                  {isConnected && (
                    <button className="gy-btn gy-btn-ghost" type="button" onClick={openPatient}>
                      <UserIcon size={15} /> Patient records
                    </button>
                  )}
                  <button className="gy-btn gy-btn-primary" type="button" onClick={beginCall} disabled={!isLive}>
                    <Video size={15} /> Video call
                  </button>
                  <button className="gy-btn gy-btn-ghost" type="button" onClick={() => setShowRx(true)}>
                    <FileText size={15} /> Prescription
                  </button>
                  {isLive && (
                    <>
                      <button className="gy-btn gy-btn-ok" type="button" onClick={finish}>
                        <CheckCircle2 size={15} /> Complete
                      </button>
                      <button className="gy-btn gy-btn-danger" type="button" onClick={abort}>
                        <XCircle size={15} /> Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="gy-messages" ref={scrollRef}>
                {msgLoading ? (
                  <div className="gy-empty">
                    <Loader2 className="spin-icon" size={18} />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="gy-muted gy-center">No messages yet. Say hello to your patient.</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m._id}
                      className={`gy-bubble ${m.sender === "doctor" ? "mine" : "theirs"}`}
                    >
                      <p>{m.text}</p>
                      {m.attachmentUrl && (
                        <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="gy-attach">
                          Attachment
                        </a>
                      )}
                      <span className="gy-bubble-time">
                        {m.sentAt ? new Date(m.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <form className="gy-composer" onSubmit={send}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={isLive ? "Type a message…" : "Session is not active"}
                  disabled={!isLive || sending}
                />
                <button className="gy-btn gy-btn-primary" type="submit" disabled={!isLive || sending || !draft.trim()}>
                  {sending ? <Loader2 className="spin-icon" size={16} /> : <Send size={16} />}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {selected && (
        <ConsultationCall
          key={selected._id}
          ref={callRef}
          roomId={`consultation_${selected._id}`}
          peerName={patientName(selected.userId)}
          socketRef={socketRef}
          messages={messages}
          onSendMessage={sendMessageText}
        />
      )}

      {showPatient && selected && (
        <div className="gy-modal-overlay" onClick={() => setShowPatient(false)}>
          <aside className="gy-patient-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="gy-modal-head">
              <span><UserIcon size={16} /> Patient records</span>
              <button className="gy-icon-btn" type="button" onClick={() => setShowPatient(false)}>
                <X size={18} />
              </button>
            </div>

            {patientLoading ? (
              <div className="gy-empty">
                <Loader2 className="spin-icon" size={20} />
                <p>Loading patient records…</p>
              </div>
            ) : patientError ? (
              <div className="gy-alert gy-alert-error">
                <AlertCircle size={16} />
                <span>{patientError}</span>
              </div>
            ) : patient ? (
              <div className="gy-patient-body">
                <div className="gy-patient-id">
                  <span className="gy-patient-avatar" aria-hidden>
                    {patient.profile.name.trim().charAt(0).toUpperCase() || "P"}
                  </span>
                  <div>
                    <h4>{patient.profile.name}</h4>
                    <p className="gy-muted">{patient.profile.email}</p>
                    <div className="gy-patient-tags">
                      {patient.profile.age != null && <span className="gy-tag">{patient.profile.age} yrs</span>}
                      {patient.profile.gender && <span className="gy-tag">{patient.profile.gender}</span>}
                      {patient.profile.country && <span className="gy-tag">{patient.profile.country}</span>}
                    </div>
                  </div>
                </div>

                <section className="gy-patient-section">
                  <h5><Activity size={14} /> Cycle overview</h5>
                  {patient.cycle ? (
                    <div className="gy-patient-metrics">
                      <div className="gy-metric">
                        <span className="gy-metric-value">{patient.cycle.cycleLength ?? "—"}</span>
                        <span className="gy-metric-label">Cycle length (days)</span>
                      </div>
                      <div className="gy-metric">
                        <span className="gy-metric-value">{patient.cycle.periodLength ?? "—"}</span>
                        <span className="gy-metric-label">Period length (days)</span>
                      </div>
                      <div className="gy-metric">
                        <span className="gy-metric-value">
                          {patient.cycle.lastPeriodStartDate
                            ? new Date(patient.cycle.lastPeriodStartDate).toLocaleDateString()
                            : "—"}
                        </span>
                        <span className="gy-metric-label">Last period start</span>
                      </div>
                      {patient.cycle.pregnancyMode && (
                        <div className="gy-metric">
                          <span className="gy-metric-value">Yes</span>
                          <span className="gy-metric-label">Pregnancy mode</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="gy-muted">No cycle data shared.</p>
                  )}
                </section>

                <section className="gy-patient-section">
                  <h5><Droplet size={14} /> Recent logs</h5>
                  {patient.recentLogs.length === 0 ? (
                    <p className="gy-muted">No recent logs.</p>
                  ) : (
                    <div className="gy-log-list">
                      {patient.recentLogs.map((log) => (
                        <div className="gy-log-row" key={log._id}>
                          <span className="gy-log-date">
                            <CalendarDays size={12} />
                            {log.date ? new Date(log.date).toLocaleDateString() : log.dateKey}
                          </span>
                          <div className="gy-log-tags">
                            {log.flow && log.flow !== "none" && <span className={`gy-tag gy-flow-${log.flow}`}>{log.flow}</span>}
                            {log.phase && <span className="gy-tag">{log.phase}</span>}
                            {log.mood && <span className="gy-tag">{log.mood}</span>}
                            {(log.symptoms ?? []).slice(0, 3).map((s) => (
                              <span className="gy-tag gy-tag-symptom" key={s}>{s}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {patient.screenings.length > 0 && (
                  <section className="gy-patient-section">
                    <h5><ClipboardList size={14} /> Screening assessments</h5>
                    <div className="gy-screen-list">
                      {patient.screenings.map((s) => (
                        <div className={`gy-screen-card gy-risk-${s.riskLevel}`} key={s._id}>
                          <div className="gy-screen-head">
                            <strong>{s.condition.toUpperCase()}</strong>
                            <span className="gy-risk-badge">{s.riskLevel} risk · {s.score}</span>
                          </div>
                          <p className="gy-muted">{s.doctorDiscussionSummary || s.summary}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            ) : null}
          </aside>
        </div>
      )}

      {showRx && selected && (
        <div className="gy-modal-overlay" onClick={() => setShowRx(false)}>
          <div className="gy-card gy-rx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gy-modal-head">
              <span><FileText size={16} /> Prescription for {patientName(selected.userId)}</span>
              <button className="gy-icon-btn" type="button" onClick={() => setShowRx(false)}>
                <X size={18} />
              </button>
            </div>
            <textarea
              rows={8}
              value={rxText}
              onChange={(e) => setRxText(e.target.value)}
              placeholder="Medication, dosage, advice, follow-up…"
            />
            <div className="gy-form-actions">
              <button className="gy-btn gy-btn-ghost" type="button" onClick={() => setShowRx(false)}>
                Cancel
              </button>
              <button className="gy-btn gy-btn-primary" type="button" onClick={saveRx} disabled={rxSaving || !rxText.trim()}>
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
