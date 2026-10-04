/**
 * Tiny in-page bus for the clinician portal's personal WebSocket
 * (`user_<id>` room). GynacIncomingCall owns the socket and publishes every
 * personal-room event here; pages (e.g. Bookings) subscribe to refresh live.
 */

export type DoctorPersonalEvent = {
  type?: string;
  room?: string;
  event?: string;
  consultationId?: string;
  callerName?: string;
  callerAvatarUrl?: string | null;
  callerRole?: "patient" | "doctor";
  scheduledFor?: string;
  [key: string]: unknown;
};

type Listener = (event: DoctorPersonalEvent) => void;

const listeners = new Set<Listener>();

export function publishDoctorEvent(event: DoctorPersonalEvent) {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (err) {
      console.warn("Doctor event listener failed:", err);
    }
  }
}

export function subscribeDoctorEvents(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * The consultation whose room the Bookings page has joined (its call UI is
 * mounted there). The global ringer stays quiet for it, so a call is never
 * announced twice.
 */
let openConsultationId: string | null = null;

export const setOpenConsultation = (id: string | null) => {
  openConsultationId = id;
};

export const getOpenConsultation = () => openConsultationId;

/** Reconnect delay: 1s, 2s, 4s … capped at 30s, with a little jitter. */
export const reconnectDelay = (attempt: number) =>
  Math.min(30000, 1000 * 2 ** Math.min(attempt, 5)) + Math.floor(Math.random() * 400);
