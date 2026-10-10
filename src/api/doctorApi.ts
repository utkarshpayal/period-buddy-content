import type { PageInfo } from "../components/Pagination";
import { getApiToken, handleUnauthorized } from "./authApi";
import { fetchWithTimeout } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export const isDoctorApiConfigured = Boolean(apiBaseUrl);

/* ----------------------------- Shared types ----------------------------- */

export type Patient = {
  _id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  profilePicture?: string;
};

export type ConsultationStatus =
  | "pending"
  | "paid"
  | "active"
  | "completed"
  | "cancelled";

export type Consultation = {
  _id: string;
  userId?: Patient | string;
  doctorId?: string;
  status: ConsultationStatus;
  paymentStatus?: "unpaid" | "paid" | "refunded" | "failed";
  amountPaid?: number;
  currency?: string;
  meetingLink?: string;
  prescription?: string;
  /** The structured prescription (absent on older, free-text ones). */
  rx?: Rx | null;
  /** The patient's 1-5 rating of a completed session, and its optional comment. */
  rating?: number;
  feedback?: string;
  ratedAt?: string;
  /** The booked slot (UTC ISO instants) and the zone the doctor's hours are in. */
  scheduledFor?: string;
  slotEndsAt?: string;
  slotTimezone?: string;
  cancelledBy?: "patient" | "doctor" | "system";
  cancelReason?: string;
  cancelledAt?: string;
  /** Set once a cancelled paid session needs (or has had) its refund. */
  refundStatus?: "required" | "processed";
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  /** When the video room (self-hosted Jitsi) can be joined, decided by the server. Null once
   * the session is closed. */
  videoCall?: VideoCallInfo | null;
};

/** Every consultation call runs on the self-hosted Jitsi server (meet.thenura.care). */
export type VideoCallInfo = {
  /** false while the API has no Jitsi server configured. */
  available: boolean;
  joinOpensAt: string | null;
  joinClosesAt: string | null;
  canJoinNow: boolean;
};

/** A short-lived pass into one consultation's Jitsi room (POST .../video/join). */
export type VideoJoin = {
  domain: string;
  roomName: string;
  meetingUrl: string;
  token: string;
  role: "moderator" | "participant";
  expiresAt: string;
  joinWindow: { opensAt: string | null; closesAt: string | null };
  displayName: string;
  peerName: string;
};

export type ConsultationMessage = {
  _id: string;
  consultationId: string;
  sender: "user" | "doctor";
  text: string;
  attachmentUrl?: string;
  sentAt?: string;
  readAt?: string | null;
};

export type DoctorProfile = {
  _id: string;
  userId?: string;
  email?: string;
  name: string;
  specialty: string;
  /** Average of patients' session ratings; only meaningful when ratingCount > 0. */
  rating?: number;
  ratingCount?: number;
  pricePerSession: number;
  currency?: string;
  /** @deprecated replaced by avatarUrl */
  avatarEmoji?: string;
  /** Profile photo shown to patients; set with uploadMyAvatar / uploadDoctorAvatar. */
  avatarUrl?: string | null;
  bio?: string;
  languages?: string[];
  experience?: string;
  hospital?: string;
  education?: string[];
  /** Medical council registration number(s), printed on prescriptions. */
  licenses?: string[];
  isAvailable?: boolean;
  totalConsultations?: number;
};

export type PatientCycleLog = {
  _id: string;
  date?: string;
  dateKey?: string;
  flow?: string;
  mood?: string;
  energy?: string;
  symptoms?: string[];
  phase?: string;
  cycleDay?: number;
  note?: string;
};

export type PatientScreening = {
  _id: string;
  condition: string;
  score: number;
  riskLevel: "low" | "moderate" | "high";
  summary: string;
  doctorDiscussionSummary?: string;
  createdAt?: string;
};

export type PatientOverview = {
  profile: {
    id: string;
    name: string;
    email?: string;
    profilePicture?: string;
    gender?: string;
    age?: number | null;
    dateOfBirth?: string;
    country?: string;
  };
  cycle: {
    lastPeriodStartDate?: string;
    cycleLength?: number;
    periodLength?: number;
    pregnancyMode?: boolean;
    trackingGoal?: string;
  } | null;
  recentLogs: PatientCycleLog[];
  screenings: PatientScreening[];
  consultation: {
    id: string;
    status: ConsultationStatus;
    prescription?: string;
    startedAt?: string;
  };
};

export type DashboardData = {
  doctor: {
    name: string;
    specialty: string;
    avatarEmoji?: string;
    avatarUrl?: string | null;
    rating?: number;
    ratingCount?: number;
    isAvailable?: boolean;
  };
  stats: {
    totalBookings: number;
    active: number;
    paid: number;
    pending: number;
    completed: number;
    cancelled: number;
    totalEarnings: number;
    paidSessions: number;
    currency?: string;
  };
  /** Net of commission (newer API only). */
  wallet?: Wallet;
  recentBookings: Consultation[];
};

/** A session's split: gross paid by the patient, platform commission, the
 * doctor's net, and when it can be withdrawn (null = session not completed). */
export type Earning = {
  _id: string;
  type: "consultation" | "adjustment";
  consultationId?: string;
  currency: string;
  gross: number;
  commissionPercent: number;
  /** "referral": a commission-free session from a referral credit (newer API only). */
  commissionSource?: "default" | "doctor" | "none" | "referral";
  freeSession?: boolean;
  commission: number;
  net: number;
  status: "active" | "reversed";
  paidAt?: string;
  completedAt?: string;
  availableAt?: string | null;
  reversalReason?: string;
  note?: string;
  createdAt?: string;
};

export type PaymentsData = {
  total: number;
  count: number;
  currency?: string;
  /** Net of commission / commission, over every tracked session. */
  net?: number;
  commission?: number;
  payments: (Consultation & { earning?: Earning | null })[];
};

export type Wallet = {
  currency: string;
  /** Can be negative after an admin debit. */
  available: number;
  withdrawable: number;
  onHold: number;
  inFlight: number;
  withdrawn: number;
  lifetimeGross: number;
  lifetimeCommission: number;
  lifetimeNet: number;
  nextReleaseAt?: string | null;
  openPayouts: number;
};

export type PayoutMethod = {
  _id: string;
  type: "bank" | "upi";
  accountHolderName: string;
  display: string;
  ifsc?: string;
  vpa?: string;
  last4?: string;
  isDefault: boolean;
  usableFrom?: string;
  createdAt?: string;
};

export type PayoutStatus =
  | "requested"
  | "approved"
  | "processing"
  | "success"
  | "failed"
  | "rejected"
  | "cancelled"
  | "reversed";

export type Payout = {
  _id: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  method?: { type?: string; display?: string; accountHolderName?: string };
  utr?: string;
  failureReason?: string;
  reviewNote?: string;
  createdAt?: string;
  approvedAt?: string;
  completedAt?: string;
  events?: { at: string; status: string; by: string; note?: string }[];
};

export type WalletData = {
  wallet: Wallet;
  rules: {
    commissionPercent: number;
    holdDays: number;
    minWithdrawal: number;
    maxWithdrawal: number;
    payoutsEnabled: boolean;
    requireApproval: boolean;
    newMethodCooldownHours: number;
    /** "manual": the Nura team transfers it by hand; "cashfree": sent automatically. */
    provider?: "manual" | "cashfree";
  };
  methods: PayoutMethod[];
  adjustments: Earning[];
};

export type NewPayoutMethod =
  | { type: "bank"; accountHolderName: string; accountNumber: string; confirmAccountNumber: string; ifsc: string; password: string }
  | { type: "upi"; accountHolderName: string; vpa: string; password: string };

export type AvailabilitySlot = {
  _id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone?: string;
  isAvailable?: boolean;
  maxSlots?: number;
};

export type Reel = {
  _id: string;
  title: string;
  creatorId: string;
  creatorName?: string;
  creatorAvatar?: string;
  duration?: string;
  category?: string;
  thumbnailUrl: string;
  directMp4Url: string;
  pollQuestion?: string;
  pollOptions?: { optionId: string; topic: string; votes: number }[];
  viewCount?: number;
  likeCount?: number;
  isActive?: boolean;
  publishedAt?: string;
};

export type AdminDoctor = Omit<DoctorProfile, "userId"> & {
  userId?:
    | {
        _id: string;
        email?: string;
        isActive?: boolean;
        mustSetPassword?: boolean;
        lastLogin?: string;
        /** Set when they sign in with an authenticator app. */
        twoFactor?: { totpEnabledAt?: string | null };
      }
    | string;
  createdAt?: string;
  /** The gynac who referred them (newer API only). */
  referredBy?: { referralId: string; status: "invited" | "onboarded"; doctorId?: string; name?: string } | null;
  /** Commission-free sessions they can still use (newer API only). */
  freeSessionsRemaining?: number;
};

/* ------------------------------- Core fetch ----------------------------- */

/** A failed request: the server's message, plus its status and machine-readable `code` when sent. */
export class ApiRequestError extends Error {
  status: number;
  code?: string;
  body?: Record<string, unknown>;
  constructor(message: string, status: number, body?: Record<string, unknown>) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
    this.code = typeof body?.code === "string" ? body.code : undefined;
  }
}

type ApiEnvelope<T> = {
  success?: boolean;
  code?: string;
  message?: string;
  data?: T;
  /** Present on list endpoints called with ?page=/?limit= (backend sendPaginatedList). */
  pagination?: PageInfo;
  token?: string;
};

async function requestEnvelope<T>(path: string, options: RequestInit = {}): Promise<ApiEnvelope<T>> {
  if (!apiBaseUrl) {
    throw new Error(
      "The clinician portal requires the API. Add VITE_API_BASE_URL to a root .env file, then restart the dev server."
    );
  }

  const headers = new Headers(options.headers);
  // FormData sets its own multipart boundary.
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetchWithTimeout(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers
  });

  let body: ApiEnvelope<T> | undefined;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    body = undefined;
  }

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error(body?.message ?? "Your session has expired. Please sign in again.");
  }
  // 403 = signed in, but this role lacks the permission. Not a session problem.
  if (response.status === 403) {
    throw new ApiRequestError(
      body?.message ?? "You don't have permission to do this.",
      403,
      body as Record<string, unknown> | undefined
    );
  }

  if (!response.ok) {
    throw new ApiRequestError(
      body?.message ?? `Request failed with ${response.status} ${response.statusText}`,
      response.status,
      body as Record<string, unknown> | undefined
    );
  }

  return body ?? {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const body = await requestEnvelope<T>(path, options);
  return (body?.data ?? (body as unknown as T)) as T;
}

/* --------------------------- Public: set password ----------------------- */

export async function setPasswordFromInvite(payload: {
  email: string;
  token: string;
  password: string;
}): Promise<{ token?: string; user?: unknown }> {
  const response = await fetchWithTimeout(`${apiBaseUrl}/api/doctor/set-password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = (await response.json().catch(() => undefined)) as
    | (ApiEnvelope<unknown> & { data?: unknown })
    | undefined;

  if (!response.ok) {
    throw new Error(body?.message ?? "Could not set your password. The link may have expired.");
  }

  return { token: body?.token, user: body?.data };
}

/* ------------------------------- Doctor: me ----------------------------- */

export const getMyProfile = () => request<DoctorProfile>("/api/doctor/me");

export const updateMyProfile = (updates: Partial<DoctorProfile>) =>
  request<DoctorProfile>("/api/doctor/me", {
    method: "PUT",
    body: JSON.stringify(updates)
  });

const photoForm = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return form;
};

/** Upload the signed-in doctor's profile photo (image, up to 5 MB). */
export const uploadMyAvatar = (file: File) =>
  request<DoctorProfile>("/api/doctor/me/avatar", { method: "POST", body: photoForm(file) });

export const removeMyAvatar = () =>
  request<DoctorProfile>("/api/doctor/me/avatar", { method: "DELETE" });

export const getDashboard = () => request<DashboardData>("/api/doctor/dashboard");

/* --------------------------- Doctor: consultations ---------------------- */

/** One of the signed-in doctor's bookings, with the patient. */
export const getConsultation = (id: string) => request<Consultation>(`/api/doctor/consultations/${id}`);

export const getConsultations = (status?: ConsultationStatus) =>
  request<Consultation[]>(
    `/api/doctor/consultations${status ? `?status=${status}` : ""}`
  );

/** One page of the doctor's bookings (newest first). */
export const getConsultationsPage = async (params: {
  page: number;
  limit?: number;
  status?: ConsultationStatus;
  /** Patient first/last name, matched on the server. */
  search?: string;
}) => {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit ?? 20) });
  if (params.status) query.set("status", params.status);
  if (params.search?.trim()) query.set("search", params.search.trim());
  const body = await requestEnvelope<Consultation[]>(`/api/doctor/consultations?${query}`);
  return { consultations: body.data ?? [], pagination: body.pagination ?? null };
};

export const getConsultationPatient = (id: string) =>
  request<PatientOverview>(`/api/doctor/consultations/${id}/patient`);

export const getConsultationMessages = (id: string) =>
  request<ConsultationMessage[]>(`/api/doctor/consultations/${id}/messages`);

export const sendConsultationMessage = (id: string, text: string) =>
  request<ConsultationMessage>(`/api/doctor/consultations/${id}/message`, {
    method: "POST",
    body: JSON.stringify({ text })
  });

/** A fresh moderator token for this booking's Jitsi room. Refusals carry `code`
 * (JOIN_WINDOW_NOT_OPEN with `opensAt`, JOIN_WINDOW_CLOSED, CONSULTATION_NOT_LIVE, ...). */
export const joinVideoConsultation = (id: string) =>
  request<VideoJoin>(`/api/doctor/consultations/${id}/video/join`, { method: "POST" });

/** Informational only: never completes or changes the session. */
export const reportVideoAttendance = (id: string, event: "joined" | "left") =>
  request<unknown>(`/api/doctor/consultations/${id}/video/attendance`, {
    method: "POST",
    body: JSON.stringify({ event })
  });

/** Decline a call the patient is ringing us with. */
export const declineIncomingCall = (id: string) =>
  request<unknown>(`/api/doctor/consultations/${id}/call/decline`, { method: "POST" });

/**
 * WebSocket URL for live consultation chat and session events. Derived
 * from VITE_API_BASE_URL (http→ws) with the auth token as a query param, the
 * same scheme the patient app uses so both sides share the consultation room.
 */
export function getWebSocketUrl(): string {
  const wsBase = apiBaseUrl.replace(/^http/, "ws");
  const token = getApiToken();
  return `${wsBase}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export type RxMedicine = { name: string; dose: string; frequency: string; timing: string; duration: string; notes: string };
/** A prescription as the portal writes it and the PDF prints it. */
export type Rx = {
  complaints: string;
  diagnosis: string;
  medicines: RxMedicine[];
  investigations: string;
  advice: string;
  followUp: string;
};

export const setPrescription = (id: string, rx: Rx) =>
  request<Consultation>(`/api/doctor/consultations/${id}/prescription`, {
    method: "PATCH",
    body: JSON.stringify({ rx })
  });

/** The printable prescription the patient downloads: a full HTML page. */
export type PrescriptionDocument = { html: string; fileName: string; number: string };

export const getPrescriptionDocument = (id: string) =>
  request<PrescriptionDocument>(`/api/doctor/consultations/${id}/prescription`);

export const completeConsultation = (id: string) =>
  request<Consultation>(`/api/doctor/consultations/${id}/complete`, {
    method: "PATCH"
  });

/** Cancel a paid or active session. The patient is notified and a refund is queued. */
export const cancelConsultation = (id: string, reason?: string) =>
  request<Consultation>(`/api/doctor/consultations/${id}/cancel`, {
    method: "PATCH",
    body: JSON.stringify(reason?.trim() ? { reason: reason.trim() } : {})
  });

/* ------------------------------ Doctor: payments ------------------------ */

export const getPayments = () => request<PaymentsData>("/api/doctor/payments");

/* ------------------------------ Doctor: wallet -------------------------- */

export const getWallet = () => request<WalletData>("/api/doctor/wallet");

export const getMyPayouts = (page = 1, limit = 10) =>
  request<{ payouts: Payout[]; pagination: PageInfo }>(`/api/doctor/wallet/payouts?page=${page}&limit=${limit}`);

/** `idempotencyKey` must stay the same across retries of one request, so a
 * double click or a retried timeout can never create two withdrawals. */
export const requestWithdrawal = (payload: { amount: number; methodId: string }, idempotencyKey: string) =>
  request<Payout>("/api/doctor/wallet/payouts", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(payload)
  });

export const cancelWithdrawal = (id: string) =>
  request<Payout>(`/api/doctor/wallet/payouts/${id}/cancel`, { method: "POST" });

export const addPayoutMethod = (method: NewPayoutMethod) =>
  request<PayoutMethod>("/api/doctor/wallet/methods", { method: "POST", body: JSON.stringify(method) });

export const removePayoutMethod = (id: string) =>
  request<PayoutMethod>(`/api/doctor/wallet/methods/${id}`, { method: "DELETE" });

export const setDefaultPayoutMethod = (id: string) =>
  request<PayoutMethod>(`/api/doctor/wallet/methods/${id}/default`, { method: "POST" });

/* ---------------------------- Doctor: availability ---------------------- */

export const getAvailability = () =>
  request<AvailabilitySlot[]>("/api/doctor/availability");

export const setAvailability = (slots: AvailabilitySlot[]) =>
  request<AvailabilitySlot[]>("/api/doctor/availability", {
    method: "PUT",
    body: JSON.stringify({ slots })
  });

export type ScheduleRange = { startTime: string; endTime: string; maxSlots?: number; slotMinutes?: number };

/** Hours on one date ("YYYY-MM-DD" in the schedule's zone), replacing that
 * weekday's hours. No ranges = day off. */
export type DateOverride = { date: string; ranges: ScheduleRange[]; note?: string };

export type DoctorSchedule = {
  timezone: string;
  /** Length of one consultation; every range is cut into slots this long. */
  consultationMinutes: number;
  bookingWindowDays: number;
  minNoticeMinutes: number;
  weekly: (ScheduleRange & { dayOfWeek: number })[];
  overrides: DateOverride[];
  limits?: { maxBookingWindowDays: number; maxMinNoticeMinutes: number };
};

export type SavedSchedule = DoctorSchedule & {
  /** Upcoming booked sessions the new hours no longer cover (still booked). */
  outsideHours: { id: string; scheduledFor: string }[];
};

export const getSchedule = () => request<DoctorSchedule>("/api/doctor/availability/schedule");

export const saveSchedule = (schedule: Omit<DoctorSchedule, "limits">) =>
  request<SavedSchedule>("/api/doctor/availability/schedule", {
    method: "PUT",
    body: JSON.stringify(schedule)
  });

/* ------------------------------- Doctor: reels -------------------------- */

export const getMyReels = () => request<Reel[]>("/api/doctor/reels");

export const createReel = (reel: {
  title: string;
  thumbnailUrl: string;
  directMp4Url: string;
  category?: string;
  duration?: string;
  pollQuestion?: string;
  pollOptions?: { optionId?: string; topic: string }[];
}) =>
  request<Reel>("/api/doctor/reels", {
    method: "POST",
    body: JSON.stringify(reel)
  });

export const updateReel = (id: string, updates: Partial<Reel>) =>
  request<Reel>(`/api/doctor/reels/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates)
  });

export const deleteReel = (id: string) =>
  request<void>(`/api/doctor/reels/${id}`, { method: "DELETE" });

/* -------------------------------- Admin --------------------------------- */

export const inviteDoctor = (payload: {
  name: string;
  email: string;
  specialty: string;
  pricePerSession: number;
  bio?: string;
  languages?: string[];
  experience?: string;
  hospital?: string;
  /** The gynac who referred them; they earn free sessions when this one joins. */
  referrerDoctorId?: string;
}) =>
  request<{ doctor: AdminDoctor; inviteEmailDelivered: boolean; inviteUrl?: string; referralId?: string | null }>(
    "/api/doctor/invite",
    { method: "POST", body: JSON.stringify(payload) }
  );

export const listDoctorsForAdmin = (search?: string) =>
  request<AdminDoctor[]>(
    `/api/doctor/admin/list${search ? `?search=${encodeURIComponent(search)}` : ""}`
  );

export const listDoctorsForAdminPage = async (params: { page: number; limit?: number; search?: string }) => {
  const query = new URLSearchParams({ page: String(params.page), limit: String(params.limit ?? 20) });
  if (params.search?.trim()) query.set("search", params.search.trim());
  const body = await requestEnvelope<AdminDoctor[]>(`/api/doctor/admin/list?${query}`);
  return { doctors: body.data ?? [], pagination: body.pagination ?? null };
};

export const updateDoctorByAdmin = (id: string, updates: Partial<DoctorProfile>) =>
  request<AdminDoctor>(`/api/doctor/admin/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });

export const resendInvite = (id: string) =>
  request<{ inviteEmailDelivered: boolean; inviteUrl?: string }>(
    `/api/doctor/admin/${id}/resend-invite`,
    { method: "POST" }
  );

export const deactivateDoctor = (id: string) =>
  request<AdminDoctor>(`/api/doctor/admin/${id}`, { method: "DELETE" });

/** Admin: set a doctor's profile photo (image, up to 5 MB). */
export const uploadDoctorAvatar = (id: string, file: File) =>
  request<AdminDoctor>(`/api/doctor/admin/${id}/avatar`, { method: "POST", body: photoForm(file) });

export const removeDoctorAvatar = (id: string) =>
  request<AdminDoctor>(`/api/doctor/admin/${id}/avatar`, { method: "DELETE" });

/** Undo a deactivation. Bookings stay paused; `needsInvite` when they never set a password. */
export const reactivateDoctor = (id: string) =>
  request<{ doctor: AdminDoctor; needsInvite: boolean }>(`/api/doctor/admin/${id}/reactivate`, { method: "POST" });

/** Delete a doctor for good (refused while their wallet holds money). */
export const deleteDoctorAccount = (id: string) =>
  request<{ _id: string }>(`/api/doctor/admin/${id}/account`, { method: "DELETE" });

/* ------------------------------- Helpers -------------------------------- */

export function patientName(patient?: Patient | string): string {
  if (!patient || typeof patient === "string") return "Patient";
  const full = [patient.firstName, patient.lastName].filter(Boolean).join(" ");
  return full || patient.email || "Patient";
}

/** Every amount on the platform is in Indian rupees. */
export function formatMoney(amount?: number): string {
  const value = amount ?? 0;
  const text = Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `${value < 0 ? "−" : ""}₹${text}`;
}

export const MIN_SESSION_FEE = 1;
export const MAX_SESSION_FEE = 100000;
export const SESSION_FEE_ERROR = "Session fee must be between ₹1 and ₹1,00,000";

/** Session fee check matching the backend rule (whole rupees not required). */
export const isValidSessionFee = (fee: number) =>
  Number.isFinite(fee) && fee >= MIN_SESSION_FEE && fee <= MAX_SESSION_FEE;

/**
 * A UTC instant shown in the viewer's own zone with a short zone name, e.g.
 * "Thu 5 Oct, 3:00 PM IST". Pass `timeOnly` for just "3:00 PM".
 */
export function formatInstant(iso?: string | null, opts: { timeOnly?: boolean; zone?: boolean } = {}): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const showZone = opts.zone ?? true;
  return new Intl.DateTimeFormat(undefined, {
    ...(opts.timeOnly ? {} : { weekday: "short", day: "numeric", month: "short" }),
    hour: "numeric",
    minute: "2-digit",
    ...(showZone ? { timeZoneName: "short" } : {})
  }).format(d);
}

/** "Thu 5 Oct, 3:00 – 3:45 PM IST" for a booked slot. */
export function formatSlot(start?: string | null, end?: string | null): string {
  if (!start) return "—";
  if (!end) return formatInstant(start);
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return formatInstant(start);
  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }) as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string };
  return typeof fmt.formatRange === "function" ? fmt.formatRange(s, e) : `${fmt.format(s)} – ${formatInstant(end, { timeOnly: true })}`;
}

/** The browser's IANA zone, falling back to India. */
export const browserTimeZone = (): string => {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
    // Some browsers still report India's old IANA name.
    return zone === "Asia/Calcutta" ? "Asia/Kolkata" : zone;
  } catch {
    return "Asia/Kolkata";
  }
};

/** A fresh key for one withdrawal attempt (see requestWithdrawal). */
export const newIdempotencyKey = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`).replace(/[^A-Za-z0-9_-]/g, "");
