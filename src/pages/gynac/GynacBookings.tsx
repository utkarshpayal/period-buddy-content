import React, { useEffect, useRef, useState } from "react";
import {
  Loader2,
  AlertCircle,
  Send,
  Video,
  FileText,
  CheckCircle2,
  XCircle,
  Phone,
  X
} from "lucide-react";
import {
  Consultation,
  ConsultationMessage,
  ConsultationStatus,
  getConsultations,
  getConsultationMessages,
  sendConsultationMessage,
  startVideoCall,
  setPrescription,
  completeConsultation,
  cancelConsultation,
  patientName,
  formatMoney
} from "../../api/doctorApi";
import { GynacHead } from "./GynacHead";

const FILTERS: { key: ConsultationStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paid", label: "New" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" }
];

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

  const [callLink, setCallLink] = useState<string | null>(null);
  const [showRx, setShowRx] = useState(false);
  const [rxText, setRxText] = useState("");
  const [rxSaving, setRxSaving] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

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
    setMsgLoading(true);
    try {
      setMessages(await getConsultationMessages(booking._id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages.");
    } finally {
      setMsgLoading(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !draft.trim()) return;
    setSending(true);
    try {
      const msg = await sendConsultationMessage(selected._id, draft.trim());
      setMessages((prev) => [...prev, msg]);
      setDraft("");
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

  const beginCall = async () => {
    if (!selected) return;
    try {
      const { meetingLink } = await startVideoCall(selected._id);
      setCallLink(meetingLink);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the call.");
    }
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

      {callLink && (
        <div className="gy-modal-overlay" onClick={() => setCallLink(null)}>
          <div className="gy-call-modal" onClick={(e) => e.stopPropagation()}>
            <div className="gy-modal-head">
              <span><Phone size={16} /> Video consultation</span>
              <button className="gy-icon-btn" type="button" onClick={() => setCallLink(null)}>
                <X size={18} />
              </button>
            </div>
            <iframe
              title="Video consultation"
              src={`${callLink}#config.prejoinPageEnabled=false`}
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              className="gy-call-frame"
            />
            <p className="gy-muted gy-call-hint">
              The same secure room link is available to your patient. Share it if needed:{" "}
              <a href={callLink} target="_blank" rel="noreferrer">{callLink}</a>
            </p>
          </div>
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
