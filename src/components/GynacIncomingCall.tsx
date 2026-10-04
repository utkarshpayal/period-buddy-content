import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneOff, Video } from "lucide-react";
import { declineIncomingCall, getWebSocketUrl, isDoctorApiConfigured } from "../api/doctorApi";
import { getOpenConsultation, publishDoctorEvent, reconnectDelay, type DoctorPersonalEvent } from "../lib/doctorEvents";
import { Avatar } from "./ui";
import { useToast } from "./Toast";

/** Stop ringing on our own if nobody answers. */
const RING_TIMEOUT_MS = 45 * 1000;

type Ringing = { consultationId: string; callerName: string; callerAvatarUrl?: string | null };

/**
 * A two-tone phone ring made with Web Audio (no sound file). Browsers may keep
 * the audio context suspended until the page has had a click; then the ring is
 * silent but the modal still shows.
 */
function startRingTone(): () => void {
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => undefined;
  let ctx: AudioContext;
  try {
    ctx = new Ctx();
  } catch {
    return () => undefined;
  }
  ctx.resume?.().catch(() => undefined);

  const beep = (at: number) => {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.18, at + 0.03);
    gain.gain.setValueAtTime(0.18, at + 0.36);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    gain.connect(ctx.destination);
    for (const freq of [440, 480]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + 0.42);
    }
  };
  const ring = () => {
    if (ctx.state === "closed") return;
    const now = ctx.currentTime;
    beep(now);
    beep(now + 0.6);
  };
  ring();
  const timer = window.setInterval(ring, 2400);
  return () => {
    window.clearInterval(timer);
    ctx.close().catch(() => undefined);
  };
}

/**
 * Global incoming-call listener for signed-in doctors, mounted once in the
 * clinician portal shell. Holds the personal WebSocket (the server auto-joins
 * `user_<id>`), re-broadcasts its events to the page (doctorEvents), and rings
 * when a patient calls while the doctor isn't in that consultation's room.
 */
export const GynacIncomingCall: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [ringing, setRinging] = useState<Ringing | null>(null);
  const [declining, setDeclining] = useState(false);
  const ringingRef = useRef<Ringing | null>(null);
  ringingRef.current = ringing;

  const stopRinging = useCallback((consultationId?: string) => {
    setRinging((current) => (!consultationId || current?.consultationId === consultationId ? null : current));
  }, []);

  // Personal socket with reconnect + backoff.
  useEffect(() => {
    if (!isDoctorApiConfigured) return;
    let socket: WebSocket | null = null;
    let disposed = false;
    let attempt = 0;
    let retryTimer: number | undefined;

    const connect = () => {
      if (disposed) return;
      try {
        socket = new WebSocket(getWebSocketUrl());
      } catch {
        schedule();
        return;
      }
      socket.onopen = () => {
        attempt = 0;
      };
      socket.onmessage = (event) => {
        let data: DoctorPersonalEvent;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data?.type !== "message" || !data.room?.startsWith("user_") || !data.event) return;
        publishDoctorEvent(data);
        const id = data.consultationId ? String(data.consultationId) : "";
        if (data.event === "incoming_call" && id) {
          // The Bookings page already has this call's room (and its own prompt) open.
          if (getOpenConsultation() === id) return;
          if (ringingRef.current && ringingRef.current.consultationId !== id) return; // already ringing for another
          setRinging({ consultationId: id, callerName: data.callerName || "Your patient", callerAvatarUrl: data.callerAvatarUrl });
        } else if (["call_cancelled", "call_declined", "consultation_cancelled", "consultation_completed"].includes(data.event)) {
          stopRinging(id || undefined);
        }
      };
      socket.onclose = () => {
        socket = null;
        schedule();
      };
      socket.onerror = () => {
        /* onclose follows */
      };
    };

    const schedule = () => {
      if (disposed) return;
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(connect, reconnectDelay(attempt++));
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [stopRinging]);

  // Sound + timeout while ringing.
  useEffect(() => {
    if (!ringing) return;
    const stopTone = startRingTone();
    const timeout = window.setTimeout(() => setRinging(null), RING_TIMEOUT_MS);
    return () => {
      stopTone();
      window.clearTimeout(timeout);
    };
  }, [ringing?.consultationId]);

  if (!ringing) return null;

  const accept = () => {
    const id = ringing.consultationId;
    setRinging(null);
    navigate("/bookings", { state: { open: id, call: true } });
  };

  const decline = async () => {
    const id = ringing.consultationId;
    setDeclining(true);
    setRinging(null);
    try {
      await declineIncomingCall(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not decline the call.");
    } finally {
      setDeclining(false);
    }
  };

  return (
    <div className="gy-modal-overlay gy-vc-overlay" role="alertdialog" aria-modal="true" aria-label={`Incoming call from ${ringing.callerName}`}>
      <div className="gy-vc-stage">
        <div className="gy-vc-center">
          <div className="gy-vc-ring pulse">
            {ringing.callerAvatarUrl ? <Avatar name={ringing.callerName} src={ringing.callerAvatarUrl} size="lg" /> : <Video size={30} />}
          </div>
          <h3>{ringing.callerName} is calling</h3>
          <p className="gy-vc-sub">Video consultation · answer to join with your camera and mic.</p>
          <div className="gy-vc-answer-row">
            <button type="button" className="gy-vc-ctrl danger" onClick={decline} disabled={declining} aria-label="Decline">
              <PhoneOff size={24} />
            </button>
            <button type="button" className="gy-vc-ctrl ok" onClick={accept} aria-label="Accept" autoFocus>
              <Video size={22} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
