import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import { Mic, MicOff, Video, VideoOff, Phone, X, MessageSquare, Send, User } from "lucide-react";
import type { ConsultationMessage } from "../../api/doctorApi";
import { CallMediaError, getCallMedia } from "../../lib/callMedia";
import { startRingTone } from "../../lib/ringTone";

/**
 * 1:1 WebRTC "meeting" between the clinician (this portal) and the patient
 * (Period Buddy app). Both sides join the shared consultation WebSocket room
 * (`consultation_<id>`) the parent already holds open, and connect peer-to-peer
 * — the same signaling the patient app uses, so no third-party room (no Jitsi).
 *
 * Meeting model (not a ring/accept call): whoever opens the call gets their
 * camera/mic and waits; when the other side joins, the two auto-connect. A
 * deterministic tiebreak on a random per-session id decides who sends the WebRTC
 * offer, so there's no glare when both join at once. If the patient joins first,
 * an inbound prompt surfaces right here so the clinician can jump in.
 *
 * Beyond raw audio/video it mirrors the patient app's in-call basics: an in-call
 * chat panel (same message log as the sheet, driven by the parent), a default
 * avatar whenever a camera is off, and mic-muted badges for both sides. Each
 * side's mic/camera state is shared via a lightweight `call_media` signal over
 * the same room.
 *
 * STUN only (no TURN infra), so calls behind symmetric NAT may fail to connect.
 */

type Phase = "idle" | "incoming" | "waiting" | "connecting" | "active" | "ended";

export type ConsultationCallHandle = {
  startCall: () => void;
  handleSignal: (data: any) => void;
  isBusy: () => boolean;
};

type Props = {
  peerName: string;
  roomId: string;
  socketRef: React.MutableRefObject<WebSocket | null>;
  /** Shared consultation message log (same as the chat sheet). */
  messages?: ConsultationMessage[];
  /** Sends a chat message on the consultation; parent persists + broadcasts it. */
  onSendMessage?: (text: string) => void;
};

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "PT"
  );
}

export const ConsultationCall = forwardRef<ConsultationCallHandle, Props>(
  function ConsultationCall({ peerName, roomId, socketRef, messages, onSendMessage }, ref) {
    const [phase, setPhase] = useState<Phase>("idle");
    const [endedReason, setEndedReason] = useState("");
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [remoteMuted, setRemoteMuted] = useState(false);
    const [remoteCameraOff, setRemoteCameraOff] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

    // In-call chat panel.
    const [chatOpen, setChatOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const [unread, setUnread] = useState(0);
    const chatMsgsRef = useRef<HTMLDivElement | null>(null);
    const prevMsgCountRef = useRef(0);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

    // Meeting negotiation state.
    const myIdRef = useRef<number>(Math.random());
    const negotiatedRef = useRef(false);
    const offererRef = useRef(false);
    const ackedRef = useRef(false);
    const incomingPeerIdRef = useRef<number | null>(null);

    // Current local media state, kept in refs so we can echo it to a peer that
    // (re)joins without re-creating the signal handler on every toggle.
    const isMutedRef = useRef(false);
    const isCameraOffRef = useRef(false);

    const send = useCallback(
      (type: string, extra: Record<string, unknown> = {}) => {
        try {
          socketRef.current?.send(JSON.stringify({ type, room: roomId, ...extra }));
        } catch (err) {
          console.warn("Failed to send consultation call signal:", err);
        }
      },
      [roomId, socketRef]
    );

    const cleanup = useCallback(() => {
      pcRef.current?.close();
      pcRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      pendingCandidatesRef.current = [];
      negotiatedRef.current = false;
      offererRef.current = false;
      ackedRef.current = false;
      incomingPeerIdRef.current = null;
      isMutedRef.current = false;
      isCameraOffRef.current = false;
      setLocalStream(null);
      setRemoteStream(null);
      setIsMuted(false);
      setIsCameraOff(false);
      setRemoteMuted(false);
      setRemoteCameraOff(false);
      setChatOpen(false);
      setDraft("");
      setUnread(0);
    }, []);

    // Always release camera/mic if this component unmounts mid-call.
    useEffect(() => cleanup, [cleanup]);

    // Attach streams to their <video> elements whenever either the stream or the
    // element changes — the elements mount/unmount as the phase changes, so we
    // can't rely on setting srcObject inline the moment a track arrives.
    useEffect(() => {
      if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
    }, [localStream, phase, isCameraOff]);
    useEffect(() => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    }, [remoteStream, phase, remoteCameraOff]);

    // Unread chat badge + auto-scroll.
    useEffect(() => {
      const count = messages?.length ?? 0;
      if (chatOpen) {
        setUnread(0);
        setTimeout(() => {
          if (chatMsgsRef.current) chatMsgsRef.current.scrollTop = chatMsgsRef.current.scrollHeight;
        }, 50);
      } else if (phase === "active" && count > prevMsgCountRef.current) {
        setUnread((n) => n + (count - prevMsgCountRef.current));
      }
      prevMsgCountRef.current = count;
    }, [messages, chatOpen, phase]);

    const flushPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
      const queued = pendingCandidatesRef.current;
      pendingCandidatesRef.current = [];
      for (const candidate of queued) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn("Failed to add queued ICE candidate:", err);
        }
      }
    }, []);

    const endWithReason = useCallback(
      (reason: string, notifyPeer: boolean) => {
        if (notifyPeer) send("call_end");
        cleanup();
        setEndedReason(reason);
        setPhase("ended");
      },
      [cleanup, send]
    );

    const setupPeerConnection = useCallback(async () => {
      const { stream, videoMissing } = await getCallMedia({ facingMode: "user" });
      if (videoMissing) {
        isCameraOffRef.current = true;
        setIsCameraOff(true);
      }
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) send("webrtc_ice_candidate", { candidate: event.candidate.toJSON() });
      };

      pc.ontrack = (event) => {
        if (event.streams[0]) setRemoteStream(event.streams[0]);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setPhase("active");
          // Sync our current mic/cam state to the peer on connect.
          send("call_media", { audioOff: isMutedRef.current, videoOff: isCameraOffRef.current });
        } else if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          setEndedReason("Call disconnected");
          cleanup();
          setPhase("ended");
        }
      };

      pcRef.current = pc;
      return pc;
    }, [cleanup, send]);

    // Decide who sends the offer: the peer with the higher random id. The other
    // side just waits for the offer. Runs once both sides know each other's id.
    const maybeNegotiate = useCallback(
      async (peerId: number) => {
        const pc = pcRef.current;
        if (!pc || negotiatedRef.current) return;
        negotiatedRef.current = true;
        setPhase("connecting");
        if (myIdRef.current > peerId) {
          offererRef.current = true;
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            send("webrtc_offer", { sdp: pc.localDescription });
          } catch (err) {
            console.warn("Failed to create offer:", err);
            endWithReason("Connection failed", true);
          }
        } else {
          offererRef.current = false;
        }
      },
      [endWithReason, send]
    );

    // Enter the call: get media, announce ourselves, and connect to whoever is
    // already here (or waits for them to arrive). Used both when we start the
    // call and when we accept an inbound prompt.
    const enterCall = useCallback(async () => {
      if (pcRef.current) return;
      const knownPeer = incomingPeerIdRef.current;
      try {
        await setupPeerConnection();
      } catch (err) {
        console.warn("Failed to enter consultation call:", err);
        endWithReason(err instanceof CallMediaError ? err.message : "Couldn't access camera/mic", true);
        return;
      }
      setPhase(knownPeer != null ? "connecting" : "waiting");
      ackedRef.current = true;
      send("call_join", { callId: myIdRef.current });
      if (knownPeer != null) maybeNegotiate(knownPeer);
    }, [endWithReason, maybeNegotiate, send, setupPeerConnection]);

    const endCall = useCallback(() => endWithReason("Call ended", true), [endWithReason]);

    // Ring while the patient is calling and we haven't answered.
    useEffect(() => {
      if (phase !== "incoming") return;
      return startRingTone();
    }, [phase]);

    const dismissIncoming = useCallback(() => {
      incomingPeerIdRef.current = null;
      setPhase("idle");
    }, []);

    // Auto-clear the transient "ended" banner back to idle.
    useEffect(() => {
      if (phase !== "ended") return;
      const timer = setTimeout(() => setPhase("idle"), 2200);
      return () => clearTimeout(timer);
    }, [phase]);

    const handleSignal = useCallback(
      async (data: any) => {
        switch (data?.type) {
          case "call_join": {
            const peerId = data.callId as number;
            incomingPeerIdRef.current = peerId;
            if (!pcRef.current) {
              // We haven't joined — surface an inbound prompt.
              if (phase === "idle") setPhase("incoming");
              return;
            }
            // We're in the call: make sure the peer has our id, then negotiate.
            if (!ackedRef.current) {
              ackedRef.current = true;
              send("call_join", { callId: myIdRef.current });
            }
            maybeNegotiate(peerId);
            // Echo our current mic/cam state to the (re)joining peer.
            send("call_media", { audioOff: isMutedRef.current, videoOff: isCameraOffRef.current });
            return;
          }
          case "call_media": {
            setRemoteMuted(!!data.audioOff);
            setRemoteCameraOff(!!data.videoOff);
            return;
          }
          case "webrtc_offer": {
            const pc = pcRef.current;
            if (!pc || offererRef.current) return; // we're the offerer — ignore (glare)
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              await flushPendingCandidates(pc);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              send("webrtc_answer", { sdp: pc.localDescription });
            } catch (err) {
              console.warn("Failed to handle offer:", err);
              endWithReason("Connection failed", true);
            }
            return;
          }
          case "webrtc_answer": {
            const pc = pcRef.current;
            if (!pc || !offererRef.current) return;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
              await flushPendingCandidates(pc);
            } catch (err) {
              console.warn("Failed to handle answer:", err);
              endWithReason("Connection failed", true);
            }
            return;
          }
          case "webrtc_ice_candidate": {
            const pc = pcRef.current;
            if (!data.candidate) return;
            if (pc?.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              } catch (err) {
                console.warn("Failed to add ICE candidate:", err);
              }
            } else {
              pendingCandidatesRef.current.push(data.candidate);
            }
            return;
          }
          case "call_end": {
            if (pcRef.current || phase === "incoming") endWithReason("Call ended", false);
            return;
          }
          default:
            return;
        }
      },
      [endWithReason, flushPendingCandidates, maybeNegotiate, phase, send]
    );

    useImperativeHandle(
      ref,
      () => ({ startCall: enterCall, handleSignal, isBusy: () => phase !== "idle" }),
      [enterCall, handleSignal, phase]
    );

    if (phase === "idle") return null;

    const toggleMute = () => {
      const next = !isMuted;
      setIsMuted(next);
      isMutedRef.current = next;
      localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
      send("call_media", { audioOff: next, videoOff: isCameraOffRef.current });
    };
    const toggleCamera = () => {
      const next = !isCameraOff;
      setIsCameraOff(next);
      isCameraOffRef.current = next;
      localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
      send("call_media", { audioOff: isMutedRef.current, videoOff: next });
    };

    const sendChat = (e: React.FormEvent) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text) return;
      onSendMessage?.(text);
      setDraft("");
    };

    const inCall = phase === "waiting" || phase === "connecting" || phase === "active";
    const peerInitials = initialsOf(peerName);
    const chatMessages = messages ?? [];
    const remoteHidden = !remoteStream || remoteCameraOff;

    return (
      <div className="gy-modal-overlay gy-vc-overlay">
        <div className="gy-vc-stage" onClick={(e) => e.stopPropagation()}>
          {phase === "incoming" ? (
            <div className="gy-vc-center">
              <div className="gy-vc-ring pulse">
                <Video size={30} />
              </div>
              <h3>{peerName} is in the call</h3>
              <p className="gy-vc-sub">Join to connect your camera and mic.</p>
              <div className="gy-vc-answer-row">
                <button type="button" className="gy-vc-ctrl danger" onClick={dismissIncoming} aria-label="Dismiss">
                  <X size={24} />
                </button>
                <button type="button" className="gy-vc-ctrl ok" onClick={enterCall} aria-label="Join">
                  <Video size={22} />
                </button>
              </div>
            </div>
          ) : phase === "ended" ? (
            <div className="gy-vc-center">
              <p>{endedReason}</p>
            </div>
          ) : (
            <>
              {/* Remote video (only meaningful when active, but mounted for the
                  whole in-call period so the stream attaches immediately). */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="gy-vc-remote"
                style={{ display: phase === "active" && !remoteCameraOff ? "block" : "none" }}
              />

              {/* Remote camera-off / not-yet-connected: default avatar. */}
              {phase === "active" && remoteHidden && (
                <div className="gy-vc-center">
                  <div className="gy-vc-avatar lg">{peerInitials}</div>
                  <h3>{peerName}</h3>
                  <p className="gy-vc-sub">
                    {remoteStream ? "Camera is off" : `Waiting for ${peerName}'s video…`}
                  </p>
                </div>
              )}

              {/* Peer name + muted pill */}
              {phase === "active" && (
                <div className="gy-vc-name-pill">
                  <span>{peerName}</span>
                  {remoteMuted && <MicOff size={13} />}
                </div>
              )}

              {phase !== "active" && (
                <div className="gy-vc-center">
                  <div className="gy-vc-preview-wrap">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      style={{ display: isCameraOff ? "none" : "block" }}
                    />
                    {isCameraOff && (
                      <div className="gy-vc-pip-fill">
                        <User size={40} />
                      </div>
                    )}
                  </div>
                  <h3>
                    {phase === "waiting" ? `Waiting for ${peerName} to join…` : "Connecting…"}
                  </h3>
                  <p className="gy-vc-sub">Your camera is on. They'll appear when connected.</p>
                </div>
              )}

              {/* Local picture-in-picture while active: video, or an avatar when
                  the camera is off, plus a mic-muted badge. */}
              {phase === "active" && (
                <div className="gy-vc-local-wrap">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{ display: isCameraOff ? "none" : "block" }}
                  />
                  {isCameraOff && (
                    <div className="gy-vc-pip-fill">
                      <User size={28} />
                      <span>You</span>
                    </div>
                  )}
                  {isMuted && (
                    <span className="gy-vc-mic-badge">
                      <MicOff size={13} />
                    </span>
                  )}
                </div>
              )}

              <div className="gy-vc-controls">
                <button
                  type="button"
                  className={`gy-vc-ctrl ${isMuted ? "danger" : ""}`}
                  onClick={toggleMute}
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button
                  type="button"
                  className={`gy-vc-ctrl ${isCameraOff ? "danger" : ""}`}
                  onClick={toggleCamera}
                  aria-label={isCameraOff ? "Turn camera on" : "Turn camera off"}
                  disabled={!inCall}
                >
                  {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
                </button>
                <button
                  type="button"
                  className="gy-vc-ctrl"
                  onClick={() => setChatOpen((v) => !v)}
                  aria-label="Toggle chat"
                  style={{ position: "relative" }}
                >
                  <MessageSquare size={20} />
                  {unread > 0 && <span className="gy-vc-unread">{unread > 9 ? "9+" : unread}</span>}
                </button>
                <button type="button" className="gy-vc-ctrl end" onClick={endCall} aria-label="Leave call">
                  <Phone size={22} style={{ transform: "rotate(135deg)" }} />
                </button>
              </div>

              {/* In-call chat panel */}
              {chatOpen && phase === "active" && (
                <div className="gy-vc-chat" onClick={(e) => e.stopPropagation()}>
                  <div className="gy-vc-chat-head">
                    <span>In-call chat</span>
                    <button type="button" onClick={() => setChatOpen(false)} aria-label="Close chat">
                      <X size={18} />
                    </button>
                  </div>
                  <div className="gy-vc-chat-msgs" ref={chatMsgsRef}>
                    {chatMessages.length === 0 ? (
                      <p className="gy-muted gy-center">No messages yet. Say hello to your patient.</p>
                    ) : (
                      chatMessages.map((m, i) => (
                        <div
                          key={m._id ?? i}
                          className={`gy-bubble ${m.sender === "doctor" ? "mine" : "theirs"}`}
                        >
                          <p>{m.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <form className="gy-vc-chat-form" onSubmit={sendChat}>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Type a message…"
                      autoComplete="off"
                    />
                    <button type="submit" className="gy-vc-chat-send" disabled={!draft.trim()} aria-label="Send">
                      <Send size={16} />
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
);
