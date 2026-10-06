import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, PhoneOff, RotateCcw, Video, VideoOff, Headphones, WifiOff, MessageCircle, Send, X } from "lucide-react";
import {
  ApiRequestError,
  joinVideoConsultation,
  reportVideoAttendance,
  type ConsultationMessage
} from "../../api/doctorApi";
import {
  JITSI_CONFIG_OVERWRITE,
  JITSI_INTERFACE_OVERWRITE,
  loadJitsiApi,
  type JitsiApi,
  type JitsiEventHandler
} from "../../lib/jitsi";
import { subscribeDoctorEvents } from "../../lib/doctorEvents";

type Phase =
  | { kind: "connecting" }
  | { kind: "in-call" }
  | { kind: "error"; message: string; canRetry: boolean };

type Props = {
  consultationId: string;
  peerName: string;
  /** The booking's existing chat, shown in a panel beside the call (same messages, saved). */
  messages: ConsultationMessage[];
  onSendMessage: (text: string) => Promise<void> | void;
  /** False once the session is closed. */
  canSend: boolean;
  sending: boolean;
  onClose: () => void;
};

const formatTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

/** A refused join (window not open, session closed...) as a sentence for the doctor. */
function describeJoinError(err: unknown): { message: string; canRetry: boolean } {
  if (err instanceof ApiRequestError) {
    if (err.code === "JOIN_WINDOW_NOT_OPEN") {
      const opensAt = typeof err.body?.opensAt === "string" ? err.body.opensAt : null;
      return {
        message: opensAt ? `The video room opens at ${formatTime(opensAt)}.` : err.message,
        canRetry: true
      };
    }
    if (["JOIN_WINDOW_CLOSED", "CONSULTATION_NOT_LIVE", "PAYMENT_REQUIRED"].includes(err.code ?? "")) {
      return { message: err.message, canRetry: false };
    }
    if (err.status === 429 || err.status >= 500) return { message: err.message, canRetry: true };
    return { message: err.message, canRetry: false };
  }
  return { message: err instanceof Error ? err.message : "Couldn't join the call.", canRetry: true };
}

/**
 * The doctor's side of a video consultation on the self-hosted Jitsi server
 * (meet.thenura.care). The API decides who may join and when, and hands back a
 * short-lived moderator token for this one room. Jitsi's own toolbar is hidden:
 * these buttons (mic, camera, audio only, leave) are the only controls, so
 * there is no invite, recording or sharing. Leaving never completes the
 * session; that stays the Complete button.
 */
export function JitsiConsultationCall({
  consultationId,
  peerName,
  messages,
  onSendMessage,
  canSend,
  sending,
  onClose
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const leavingRef = useRef(false);
  const joinedRef = useRef(false);
  const peersRef = useRef(new Set<string>());
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "connecting" });
  const [peerPresent, setPeerPresent] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  // Browser refused the mic/camera inside the call, or the patient declined the ring.
  const [deviceProblem, setDeviceProblem] = useState<"mic" | "camera" | null>(null);
  const [declined, setDeclined] = useState(false);
  // In-call chat: the booking's chat, with an unread count for patient messages.
  const [chatOpen, setChatOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const patientCount = messages.filter((m) => m.sender === "user").length;
  const seenPatientCountRef = useRef(patientCount);
  if (chatOpen) seenPatientCountRef.current = patientCount;
  const unread = Math.max(0, patientCount - seenPatientCountRef.current);
  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatOpen, messages.length]);
  const sendDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !canSend || sending) return;
    setDraft("");
    await onSendMessage(text);
  };
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  // Latest onClose without re-running the join effect when the parent re-renders.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closedRef = useRef(false);

  const disposeApi = useCallback(() => {
    const api = apiRef.current;
    apiRef.current = null;
    if (api) {
      try {
        api.dispose();
      } catch {
        /* already gone */
      }
    }
  }, []);

  const finish = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (joinedRef.current) reportVideoAttendance(consultationId, "left").catch(() => undefined);
    joinedRef.current = false;
    disposeApi();
    onCloseRef.current();
  }, [consultationId, disposeApi]);

  // Join (and re-join on retry): fresh token every time, so an expired one never sticks.
  useEffect(() => {
    let cancelled = false;
    leavingRef.current = false;
    peersRef.current = new Set();
    setPeerPresent(false);
    setPhase({ kind: "connecting" });

    (async () => {
      let join;
      try {
        join = await joinVideoConsultation(consultationId);
      } catch (err) {
        if (!cancelled) setPhase({ kind: "error", ...describeJoinError(err) });
        return;
      }
      let JitsiMeetExternalAPI;
      try {
        JitsiMeetExternalAPI = await loadJitsiApi(join.domain);
      } catch (err) {
        if (!cancelled) {
          setPhase({ kind: "error", message: err instanceof Error ? err.message : "Couldn't load video.", canRetry: true });
        }
        return;
      }
      if (cancelled || !containerRef.current) return;
      containerRef.current.innerHTML = "";
      const api = new JitsiMeetExternalAPI(join.domain, {
        roomName: join.roomName,
        jwt: join.token,
        parentNode: containerRef.current,
        width: "100%",
        height: "100%",
        configOverwrite: JITSI_CONFIG_OVERWRITE,
        interfaceConfigOverwrite: JITSI_INTERFACE_OVERWRITE,
        userInfo: { displayName: join.displayName }
      });
      apiRef.current = api;

      const updatePeers = () => setPeerPresent(peersRef.current.size > 0);
      const handlers: Record<string, JitsiEventHandler> = {
        videoConferenceJoined: () => {
          joinedRef.current = true;
          setPhase({ kind: "in-call" });
          reportVideoAttendance(consultationId, "joined").catch(() => undefined);
          if (api.getNumberOfParticipants() > 1 && peersRef.current.size === 0) peersRef.current.add("present");
          updatePeers();
        },
        participantJoined: (p: { id?: string }) => {
          setDeclined(false);
          peersRef.current.delete("present");
          if (p?.id) peersRef.current.add(p.id);
          updatePeers();
        },
        participantLeft: (p: { id?: string }) => {
          if (p?.id) peersRef.current.delete(p.id);
          peersRef.current.delete("present");
          updatePeers();
        },
        audioMuteStatusChanged: (e: { muted?: boolean }) => setMicMuted(Boolean(e?.muted)),
        videoMuteStatusChanged: (e: { muted?: boolean }) => setCameraOff(Boolean(e?.muted)),
        lowBandwidthModeChanged: (e: { enabled?: boolean }) => setAudioOnly(Boolean(e?.enabled)),
        cameraError: () => {
          setCameraOff(true);
          setDeviceProblem((p) => p ?? "camera");
        },
        micError: () => {
          setMicMuted(true);
          setDeviceProblem("mic");
        },
        errorOccurred: (e: { error?: { isFatal?: boolean; name?: string } }) => {
          if (!e?.error?.isFatal || leavingRef.current) return;
          const name = e.error.name ?? "";
          const authProblem = /password|auth|notAllowed|token/i.test(name);
          reportLeftIfJoined();
          disposeApi();
          setPhase({
            kind: "error",
            message: authProblem
              ? "Your access to this call expired. Rejoin to continue."
              : "The call lost its connection. Rejoin to continue.",
            canRetry: true
          });
        },
        videoConferenceLeft: () => {
          if (leavingRef.current) return;
          reportLeftIfJoined();
          disposeApi();
          setPhase({ kind: "error", message: "You were disconnected from the call.", canRetry: true });
        },
        readyToClose: () => {
          if (leavingRef.current) finish();
        }
      };
      for (const [event, handler] of Object.entries(handlers)) api.addListener(event, handler);
    })();

    return () => {
      cancelled = true;
      disposeApi();
    };
  }, [consultationId, attempt, disposeApi, finish]);

  // The patient declined the "doctor is waiting" ring.
  useEffect(
    () =>
      subscribeDoctorEvents((e) => {
        if (e.event === "call_declined" && String(e.consultationId) === consultationId) setDeclined(true);
      }),
    [consultationId]
  );

  // Out of the call without Leave (dropped, booking closed, page navigated):
  // still report "left" once.
  const reportLeftIfJoined = useCallback(() => {
    if (!joinedRef.current) return;
    joinedRef.current = false;
    reportVideoAttendance(consultationId, "left").catch(() => undefined);
  }, [consultationId]);
  useEffect(() => reportLeftIfJoined, [reportLeftIfJoined]);

  // Tell the server we left if the page/tab goes away mid-call.
  useEffect(() => {
    const onUnload = () => {
      if (joinedRef.current) reportVideoAttendance(consultationId, "left").catch(() => undefined);
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [consultationId]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const leave = () => {
    leavingRef.current = true;
    const api = apiRef.current;
    if (!api) {
      finish();
      return;
    }
    api.executeCommand("hangup");
    // readyToClose normally follows; don't hang if it doesn't.
    window.setTimeout(finish, 1500);
  };

  const toggleAudioOnly = () => {
    const api = apiRef.current;
    if (!api) return;
    const next = !audioOnly;
    // Jitsi's low bandwidth mode: stop receiving video. Also turn our camera off.
    api.executeCommand("setLowBandwidthMode", next);
    if (next && !cameraOff) api.executeCommand("toggleVideo");
    setAudioOnly(next);
  };

  const inCall = phase.kind === "in-call";

  return (
    <div className="gy-modal-overlay gy-vc-overlay" role="dialog" aria-modal="true" aria-label={`Video consultation with ${peerName}`}>
      <div className="gy-vc-stage">
        <div ref={containerRef} className="gy-jitsi-frame" hidden={phase.kind === "error"} />

        {phase.kind === "connecting" && (
          <div className="gy-vc-center gy-jitsi-cover">
            <Loader2 className="spin-icon" size={28} />
            <h3>Opening the video room…</h3>
            <p className="gy-vc-sub">Allow camera and microphone when your browser asks.</p>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="gy-vc-center">
            <div className="gy-vc-ring">
              <VideoOff size={28} />
            </div>
            <h3>{phase.message}</h3>
            <div className="gy-vc-answer-row">
              <button type="button" className="gx-btn gx-btn-ghost gy-jitsi-light" onClick={finish}>
                Close
              </button>
              {phase.canRetry && (
                <button type="button" className="gx-btn gx-btn-primary" onClick={() => setAttempt((n) => n + 1)}>
                  <RotateCcw size={16} /> Rejoin
                </button>
              )}
            </div>
          </div>
        )}

        <div className="gy-jitsi-banners">
          {inCall && !peerPresent && !declined && (
            <div className="gy-jitsi-banner" role="status">
              Waiting for {peerName} to join…
            </div>
          )}
          {inCall && !peerPresent && declined && (
            <div className="gy-jitsi-banner warn" role="status">
              {peerName} can't join right now. You can wait or leave the call.
            </div>
          )}
          {inCall && deviceProblem && (
            <div className="gy-jitsi-banner warn" role="status">
              {deviceProblem === "mic"
                ? "Your browser blocked the microphone. Allow it in the site settings, then rejoin."
                : "Your browser blocked the camera. You're on audio only."}
            </div>
          )}
          {offline && phase.kind !== "error" && (
            <div className="gy-jitsi-banner warn" role="status">
              <WifiOff size={14} /> You're offline. The call will reconnect when the network is back.
            </div>
          )}
        </div>

        {phase.kind !== "error" && (
          <div className="gy-vc-controls gy-jitsi-controls">
            <button
              type="button"
              className={`gy-vc-ctrl${micMuted ? " off" : ""}`}
              onClick={() => apiRef.current?.executeCommand("toggleAudio")}
              disabled={!inCall}
              aria-pressed={micMuted}
              aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
              title={micMuted ? "Unmute" : "Mute"}
            >
              {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <button
              type="button"
              className={`gy-vc-ctrl${cameraOff ? " off" : ""}`}
              onClick={() => apiRef.current?.executeCommand("toggleVideo")}
              disabled={!inCall}
              aria-pressed={cameraOff}
              aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
              title={cameraOff ? "Camera on" : "Camera off"}
            >
              {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
            </button>
            <button
              type="button"
              className={`gy-vc-ctrl${audioOnly ? " on" : ""}`}
              onClick={toggleAudioOnly}
              disabled={!inCall}
              aria-pressed={audioOnly}
              aria-label={audioOnly ? "Turn audio-only mode off" : "Audio only"}
              title="Audio only"
            >
              <Headphones size={22} />
            </button>
            <button
              type="button"
              className={`gy-vc-ctrl${chatOpen ? " on" : ""}`}
              onClick={() => setChatOpen((open) => !open)}
              aria-pressed={chatOpen}
              aria-label={unread ? `Chat, ${unread} new` : "Chat"}
              title="Chat"
            >
              <MessageCircle size={22} />
              {unread > 0 && <span className="gy-jitsi-unread">{unread > 9 ? "9+" : unread}</span>}
            </button>
            <button type="button" className="gy-vc-ctrl end" onClick={leave} aria-label="Leave call" title="Leave call">
              <PhoneOff size={24} />
            </button>
          </div>
        )}
        {chatOpen && phase.kind !== "error" && (
          <aside className="gy-jitsi-chat" aria-label={`Chat with ${peerName}`}>
            <header className="gy-jitsi-chat-head">
              <div>
                <strong>Chat with {peerName}</strong>
                <span>Saved in the booking. The call keeps going.</span>
              </div>
              <button type="button" className="gx-icon-btn" aria-label="Close chat" onClick={() => setChatOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="gy-jitsi-chat-msgs">
              {messages.length === 0 ? (
                <p className="gy-jitsi-chat-empty">No messages yet.</p>
              ) : (
                messages.map((m) => (
                  <div key={m._id} className={`gy-jitsi-msg ${m.sender === "doctor" ? "mine" : ""}`}>
                    {m.text || (m.attachmentUrl ? "Shared a file (see the booking chat)." : "")}
                    {m.sentAt && (
                      <time>{new Date(m.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                    )}
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            {canSend ? (
              <form className="gy-jitsi-chat-form" onSubmit={sendDraft}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a message…"
                  maxLength={2000}
                  aria-label={`Message ${peerName}`}
                />
                <button type="submit" disabled={!draft.trim() || sending} aria-label="Send">
                  {sending ? <Loader2 className="spin-icon" size={16} /> : <Send size={16} />}
                </button>
              </form>
            ) : (
              <p className="gy-jitsi-chat-empty">This chat is closed.</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
