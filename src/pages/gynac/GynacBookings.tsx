import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  Pill,
  Star,
  Clock,
  WifiOff,
  RotateCcw
} from "lucide-react";
import {
  Consultation,
  ConsultationMessage,
  ConsultationStatus,
  PatientOverview,
  getConsultation,
  getConsultationsPage,
  getConsultationMessages,
  getConsultationPatient,
  sendConsultationMessage,
  setPrescription,
  completeConsultation,
  cancelConsultation,
  patientName,
  formatMoney,
  formatSlot,
  getWebSocketUrl,
  startVideoCall
} from "../../api/doctorApi";
import { reconnectDelay, setOpenConsultation, subscribeDoctorEvents } from "../../lib/doctorEvents";
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

const CANCELLED_BY: Record<string, string> = {
  patient: "Cancelled by the patient",
  doctor: "Cancelled by you",
  system: "Cancelled automatically"
};

/** A server response merged into the row we have, keeping the populated patient. */
const mergeBooking = (old: Consultation, updated: Consultation): Consultation => ({
  ...old,
  ...updated,
  userId: typeof updated.userId === "object" && updated.userId ? updated.userId : old.userId
});

type SocketState = "connecting" | "open" | "reconnecting";

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
  const navigate = useNavigate();
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

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [startingCall, setStartingCall] = useState(false);

  // Live room connection for the open booking.
  const [socketState, setSocketState] = useState<SocketState>("connecting");
  /** Set when the server refuses the room (the session is no longer live). */
  const [roomClosed, setRoomClosed] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const callRef = useRef<ConsultationCallHandle | null>(null);
  const selectedRef = useRef<Consultation | null>(null);
  selectedRef.current = selected;
  const bookingsRef = useRef<Consultation[]>([]);
  bookingsRef.current = bookings;
  /** True once the server confirmed we joined the open booking's room. */
  const roomJoinedRef = useRef(false);
  /** A call to start as soon as the room is joined (answering a ring). */
  const pendingCallRef = useRef<string | null>(null);

  // Paged 20 at a time ("Load more" at the bottom of the list); the patient
  // search runs on the server so it covers every booking, not just the
  // loaded ones.
  const [bookingsPage, setBookingsPage] = useState(1);
  const [hasMoreBookings, setHasMoreBookings] = useState(false);
  const [loadingMoreBookings, setLoadingMoreBookings] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const loadGeneration = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchBookingsPage = (page: number) =>
    getConsultationsPage({
      page,
      status: filter === "all" ? undefined : filter,
      search: debouncedSearch || undefined,
    });

  /** Applies a server copy of one booking to the list and the open conversation. */
  const applyUpdate = (updated: Consultation) => {
    setSelected((prev) => (prev && prev._id === updated._id ? mergeBooking(prev, updated) : prev));
    setBookings((prev) => prev.map((b) => (b._id === updated._id ? mergeBooking(b, updated) : b)));
  };

  /** `silent` refreshes in place (live events) without the loading spinner. */
  const loadBookings = async (silent = false) => {
    const generation = ++loadGeneration.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const { consultations: list, pagination } = await fetchBookingsPage(1);
      if (generation !== loadGeneration.current) return;
      setBookings(list);
      setBookingsPage(1);
      setHasMoreBookings(Boolean(pagination?.hasNextPage));
      // Keep the open conversation in step with the fresh copy.
      setSelected((prev) => {
        if (!prev) return prev;
        const fresh = list.find((b) => b._id === prev._id);
        return fresh ? mergeBooking(prev, fresh) : prev;
      });
    } catch (err) {
      if (generation !== loadGeneration.current) return;
      if (!silent) setError(err instanceof Error ? err.message : "Failed to load bookings.");
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  };
  const loadBookingsRef = useRef(loadBookings);
  loadBookingsRef.current = loadBookings;

  const loadMoreBookings = async () => {
    if (loadingMoreBookings || !hasMoreBookings) return;
    const generation = loadGeneration.current;
    setLoadingMoreBookings(true);
    try {
      const next = bookingsPage + 1;
      const { consultations: list, pagination } = await fetchBookingsPage(next);
      if (generation !== loadGeneration.current) return;
      setBookings((prev) => {
        const seen = new Set(prev.map((b) => b._id));
        return prev.concat(list.filter((b) => !seen.has(b._id)));
      });
      setBookingsPage(next);
      setHasMoreBookings(Boolean(pagination?.hasNextPage));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load more bookings.");
    } finally {
      setLoadingMoreBookings(false);
    }
  };

  useEffect(() => {
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, debouncedSearch]);

  // New, cancelled or completed bookings (personal socket, see GynacIncomingCall).
  useEffect(
    () =>
      subscribeDoctorEvents((evt) => {
        if (evt.event === "consultation_booked" || evt.event === "consultation_cancelled" || evt.event === "consultation_completed") {
          loadBookingsRef.current(true);
        }
      }),
    []
  );

  /** Loads a booking's chat log; drops the answer if another booking was opened meanwhile. */
  const loadMessages = async (bookingId: string, showSpinner: boolean) => {
    if (showSpinner) setMsgLoading(true);
    try {
      const list = await getConsultationMessages(bookingId);
      if (selectedRef.current?._id !== bookingId) return;
      setMessages((prev) => dedupeMessages(showSpinner ? list : [...prev, ...list]));
    } catch (err) {
      if (selectedRef.current?._id === bookingId && showSpinner) {
        toast.error(err instanceof Error ? err.message : "Failed to load messages.");
      }
    } finally {
      if (showSpinner && selectedRef.current?._id === bookingId) setMsgLoading(false);
    }
  };

  const openChat = async (booking: Consultation) => {
    selectedRef.current = booking;
    setSelected(booking);
    setMessages([]);
    setRxText(booking.prescription ?? "");
    // Reset the patient panel for the newly-selected booking.
    setPatient(null);
    setPatientError(null);
    setShowPatient(false);
    await loadMessages(booking._id, true);
  };

  /** Opens a booking by id (dashboard link or an answered ring), fetching it if not loaded. */
  const openById = async (id: string, autoCall: boolean) => {
    if (autoCall) pendingCallRef.current = id;
    if (selectedRef.current?._id === id) {
      if (autoCall && roomJoinedRef.current) {
        pendingCallRef.current = null;
        beginCall();
      }
      return;
    }
    let target = bookingsRef.current.find((b) => b._id === id);
    if (!target) {
      try {
        target = await getConsultation(id);
      } catch {
        /* reported below */
      }
    }
    if (!target) {
      pendingCallRef.current = null;
      toast.error("Could not find that booking.");
      return;
    }
    openChat(target);
  };

  // `navigate("/bookings", { state: { open, call } })` from the dashboard or the ringer.
  useEffect(() => {
    const state = location.state as { open?: string; call?: boolean } | null;
    if (!state?.open) return;
    navigate(location.pathname, { replace: true, state: null });
    openById(state.open, Boolean(state.call));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Live consultation socket: while a booking is open we join its shared room
  // (`consultation_<id>`) for live chat and to send/receive WebRTC call
  // signaling — the same room the patient app joins, so an inbound call from
  // the patient surfaces right here (ConsultationCall handles `call_request`).
  // Reconnects with backoff, re-joins and refetches the chat after a drop.
  useEffect(() => {
    if (!selected) return;
    const bookingId = selected._id;
    const roomId = `consultation_${bookingId}`;
    let disposed = false;
    let attempt = 0;
    let everOpened = false;
    let refused = false;
    let retryTimer: number | undefined;
    let socket: WebSocket | null = null;

    setRoomClosed(null);
    setSocketState("connecting");
    roomJoinedRef.current = false;

    const schedule = () => {
      if (disposed || refused) return;
      setSocketState("reconnecting");
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(connect, reconnectDelay(attempt++));
    };

    function connect() {
      if (disposed) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(getWebSocketUrl());
      } catch {
        schedule();
        return;
      }
      socket = ws;
      socketRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        ws.send(JSON.stringify({ type: "join", room: roomId }));
      };

      ws.onmessage = (event) => {
        let data: any;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        // Personal-room events are handled by the portal-wide listener.
        if (data?.room !== roomId) return;

        if (data.type === "joined") {
          attempt = 0;
          roomJoinedRef.current = true;
          setOpenConsultation(bookingId);
          setSocketState("open");
          // Catch up on anything sent while we were away.
          if (everOpened) loadMessages(bookingId, false);
          everOpened = true;
          if (pendingCallRef.current === bookingId) {
            pendingCallRef.current = null;
            beginCall();
          }
          return;
        }
        if (data.type === "error") {
          // The server only lets us in while the session is paid/active.
          refused = true;
          roomJoinedRef.current = false;
          pendingCallRef.current = null;
          setOpenConsultation(null);
          setRoomClosed(data.message || "This session has ended.");
          loadBookingsRef.current(true);
          return;
        }
        if (data.type === "message" && Array.isArray(data.messages)) {
          // Merge in any new messages we don't already have (dedupe by _id).
          setMessages((prev) => dedupeMessages([...prev, ...data.messages]));
          return;
        }
        if (data.type === "message" && data.event) {
          if (data.event === "consultation_cancelled" || data.event === "consultation_completed") {
            const status: ConsultationStatus = data.event === "consultation_cancelled" ? "cancelled" : "completed";
            applyUpdate({ ...(selectedRef.current as Consultation), _id: bookingId, status });
            loadBookingsRef.current(true);
          } else if (data.event === "call_started") {
            if (selectedRef.current?.status === "paid") applyUpdate({ ...selectedRef.current, status: "active" });
          } else if (data.event === "prescription_updated") {
            loadBookingsRef.current(true);
          }
          return;
        }
        if (data.type && data.type !== "message" && data.type !== "left") {
          // Everything else on this room is call signaling — hand it to the call UI.
          callRef.current?.handleSignal(data);
        }
      };

      ws.onclose = () => {
        if (socketRef.current === ws) socketRef.current = null;
        roomJoinedRef.current = false;
        if (!disposed) setOpenConsultation(null);
        schedule();
      };
      ws.onerror = () => {
        /* onclose follows */
      };
    }

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      roomJoinedRef.current = false;
      setOpenConsultation(null);
      const ws = socket;
      if (ws) {
        ws.onclose = null;
        try {
          ws.send(JSON.stringify({ type: "leave", room: roomId }));
        } catch {
          /* socket may not be open yet */
        }
        ws.close();
        if (socketRef.current === ws) socketRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        applyUpdate({ ...selected, status: "active" });
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
    const bookingId = selected._id;
    setPatientLoading(true);
    setPatientError(null);
    try {
      const overview = await getConsultationPatient(bookingId);
      if (selectedRef.current?._id === bookingId) setPatient(overview);
    } catch (err) {
      if (selectedRef.current?._id === bookingId) {
        setPatientError(err instanceof Error ? err.message : "Could not load patient records.");
      }
    } finally {
      setPatientLoading(false);
    }
  };

  /** Marks the session active on the server, then starts the in-page call. */
  async function beginCall() {
    const booking = selectedRef.current;
    if (!booking || startingCall) return;
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !roomJoinedRef.current) {
      toast.show("Still connecting to the consultation room. Try again in a moment.", "info");
      return;
    }
    if (callRef.current?.isBusy()) return;
    setStartingCall(true);
    try {
      await startVideoCall(booking._id);
      if (booking.status === "paid") applyUpdate({ ...booking, status: "active" });
      if (selectedRef.current?._id !== booking._id) return;
      callRef.current?.startCall();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the call.");
    } finally {
      setStartingCall(false);
    }
  }

  const saveRx = async () => {
    if (!selected || !rxText.trim()) return;
    setRxSaving(true);
    try {
      applyUpdate(await setPrescription(selected._id, rxText.trim()));
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
      applyUpdate(await completeConsultation(selected._id));
      toast.success("Consultation completed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete session.");
    }
  };

  const openCancel = () => {
    setCancelReason("");
    setShowCancel(true);
  };

  const confirmCancel = async () => {
    if (!selected || cancelling) return;
    setCancelling(true);
    try {
      applyUpdate(await cancelConsultation(selected._id, cancelReason));
      setShowCancel(false);
      toast.success("Consultation cancelled. The patient has been notified and their refund is queued.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel session.");
    } finally {
      setCancelling(false);
    }
  };

  const isLive = Boolean(selected && ["paid", "active"].includes(selected.status) && !roomClosed);
  // Patient records (and the prescription editor) should only be reachable
  // while the session is actually live — once a booking is completed or
  // cancelled, both close back down rather than staying open indefinitely.
  const isConnected = isLive;

  // Search is applied server-side (see fetchBookingsPage).
  const visible = bookings;

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
                      {b.scheduledFor && (
                        <span className="gx-inbox-item-slot">
                          <Clock size={12} /> {formatSlot(b.scheduledFor, b.slotEndsAt)}
                        </span>
                      )}
                      <span className="gx-inbox-item-bottom">
                        <StatusBadge status={b.status} />
                        <span className="gx-muted">
                          {formatMoney(b.amountPaid)}
                          {b.status === "cancelled" && b.refundStatus
                            ? ` · ${b.refundStatus === "processed" ? "Refunded" : "Refund due"}`
                            : ""}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
            {!loading && hasMoreBookings ? (
              <div className="gx-center-pad">
                <button
                  type="button"
                  className="gy-btn gy-btn-ghost"
                  onClick={loadMoreBookings}
                  disabled={loadingMoreBookings}
                >
                  {loadingMoreBookings ? <Loader2 className="spin-icon" size={16} /> : null} Load more
                </button>
              </div>
            ) : null}
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
                    <StatusBadge status={selected.status} /> {formatMoney(selected.amountPaid)} ·{" "}
                    {selected.scheduledFor ? formatSlot(selected.scheduledFor, selected.slotEndsAt) : `booked ${timeAgo(selected.createdAt)}`}
                  </span>
                  {["paid", "active"].includes(selected.status) && !roomClosed && socketState !== "open" && (
                    <span className="gx-conn-state" role="status">
                      {socketState === "reconnecting" ? <WifiOff size={12} /> : <Loader2 className="spin-icon" size={12} />}
                      {socketState === "reconnecting" ? "Reconnecting to live chat…" : "Connecting…"}
                    </span>
                  )}
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
                  <button className="gx-btn gx-btn-primary" type="button" onClick={beginCall} disabled={!isLive || startingCall}>
                    {startingCall ? <Loader2 className="spin-icon" size={16} /> : <Video size={16} />} <span className="gx-hide-sm">Video call</span>
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
                    <button className="gx-btn gx-btn-sm gx-btn-quiet-danger" type="button" onClick={openCancel}>
                      <XCircle size={14} /> Cancel
                    </button>
                  </span>
                </div>
              )}

              {roomClosed && ["paid", "active"].includes(selected.status) && (
                <div className="gx-conv-bar">
                  <span>This session is no longer live, so chat and calls are closed.</span>
                </div>
              )}

              {selected.status === "cancelled" && (
                <div className="gx-rx-pinned gx-cancel-pinned">
                  <XCircle size={16} />
                  <div>
                    <strong>{CANCELLED_BY[selected.cancelledBy ?? ""] ?? "Cancelled"}</strong>
                    {selected.cancelReason && <p>“{selected.cancelReason}”</p>}
                    {selected.refundStatus && (
                      <p>
                        <RotateCcw size={12} />{" "}
                        {selected.refundStatus === "processed"
                          ? `${formatMoney(selected.amountPaid)} refunded to the patient.`
                          : `Refund of ${formatMoney(selected.amountPaid)} is being processed.`}
                      </p>
                    )}
                  </div>
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

              {selected.rating ? (
                <div className="gx-rx-pinned gx-rating-pinned">
                  <Star size={16} />
                  <div>
                    <strong>
                      Patient rated this session {selected.rating}/5{" "}
                      <span aria-hidden>{"★".repeat(selected.rating)}{"☆".repeat(5 - selected.rating)}</span>
                    </strong>
                    {selected.feedback && <p>“{selected.feedback}”</p>}
                  </div>
                </div>
              ) : null}

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

      {showCancel && selected && (
        <div className="gx-overlay is-centered" onClick={() => !cancelling && setShowCancel(false)}>
          <div className="gx-dialog" role="dialog" aria-label="Cancel consultation" onClick={(e) => e.stopPropagation()}>
            <div className="gx-drawer-head">
              <span><XCircle size={16} /> Cancel consultation with {selectedName}?</span>
              <button className="gx-icon-btn" type="button" aria-label="Close" onClick={() => setShowCancel(false)} disabled={cancelling}>
                <X size={18} />
              </button>
            </div>
            <p className="gx-muted">
              {selectedName.split(" ")[0]} will be notified straight away and refunded {formatMoney(selected.amountPaid)} in full.
              Chat and calls for this session close.
            </p>
            <textarea
              className="gx-textarea"
              rows={3}
              maxLength={500}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Reason (optional, shared with the patient) — e.g. I'm unwell today, please rebook"
              autoFocus
            />
            <div className="gx-dialog-actions">
              <button className="gx-btn gx-btn-ghost" type="button" onClick={() => setShowCancel(false)} disabled={cancelling}>
                Keep booking
              </button>
              <button className="gx-btn gx-btn-quiet-danger" type="button" onClick={confirmCancel} disabled={cancelling}>
                {cancelling ? <Loader2 className="spin-icon" size={16} /> : <XCircle size={16} />}
                Cancel and refund
              </button>
            </div>
          </div>
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
