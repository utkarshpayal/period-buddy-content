import type { PageInfo } from "../components/Pagination";
import { getApiToken, handleUnauthorized } from "./authApi";
import { fetchWithTimeout } from "./http";

/**
 * Gynac referral program (docs/gynac-referrals-plan.md):
 * - the clinician's own referrals and free sessions (/api/doctor/referrals);
 * - Clinical Admin review, credits and rules (/api/admin/referrals/*, needs
 *   referrals.read / referrals.manage; the API enforces it).
 */

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

/* ----------------------------- Types ----------------------------- */

export type ReferralStatus = "submitted" | "invited" | "onboarded" | "rejected" | "withdrawn" | "cancelled";

export type DoctorRef = { _id: string; name?: string; email?: string; avatarUrl?: string };

export type Referral = {
  _id: string;
  referrer?: DoctorRef;
  referredName: string;
  referredEmail: string;
  referredPhone?: string;
  note?: string;
  source: "portal" | "admin";
  status: ReferralStatus;
  referredDoctor?: DoctorRef | null;
  /** Why it was rejected or cancelled. */
  closeReason?: string;
  reviewedAt?: string;
  invitedAt?: string;
  onboardedAt?: string;
  rewardStatus: "pending" | "granted" | "skipped";
  rewardSkipReason?: string;
  rewardSessions?: number;
  creditId?: string;
  createdAt: string;
  /** Portal view: the colleague has joined. */
  joined?: boolean;
};

export type CreditState = "active" | "used_up" | "revoked" | "expired";

export type ReferralCredit = {
  _id: string;
  doctor?: DoctorRef;
  kind: "referral" | "manual";
  referralId?: string;
  referredName?: string;
  sessionsGranted: number;
  sessionsUsed: number;
  sessionsRemaining: number;
  sessionsRevoked: number;
  state: CreditState;
  grantedAt: string;
  expiresAt?: string | null;
  reason?: string;
  revokedAt?: string;
  revokeReason?: string;
  commissionSaved: number;
  usages: { consultationId: string; commissionSaved: number; usedAt: string }[];
  createdAt: string;
};

export type ReferralSettings = {
  enabled: boolean;
  /** When the reward is given: on joining, or after their first completed paid session. */
  rewardTrigger: "onboarded" | "first_session";
  rewardSessions: number;
  /** null = credits never expire. */
  creditExpiryDays: number | null;
  maxOpenPerDoctor: number;
  updatedAt?: string;
};

export type MyReferrals = {
  program: { enabled: boolean; rewardSessions: number; creditExpiryDays: number | null; maxOpen: number; openCount: number };
  summary: {
    freeSessionsRemaining: number;
    freeSessionsUsed: number;
    freeSessionsGranted: number;
    commissionSaved: number;
    referred: number;
    joined: number;
  };
  referrals: Referral[];
  credits: ReferralCredit[];
};

export type ReferralSummary = {
  referrals: Record<ReferralStatus, number>;
  sessions: { granted: number; used: number; remaining: number; revoked?: number; freeSessionsDelivered: number };
  commissionForgone: number;
  settings: ReferralSettings;
};

export type ReferralInput = { name: string; email: string; phone?: string; note?: string; specialty?: string };

export type ApproveReferralInput = {
  name?: string;
  specialty: string;
  pricePerSession: number;
  experience?: string;
  hospital?: string;
  languages?: string[];
  bio?: string;
};

/* ----------------------------- Core fetch ----------------------------- */

type ApiEnvelope<T> = { success?: boolean; message?: string; code?: string; data?: T };

/** A failed request with the server's message and status (409 = someone got there first, etc.). */
export class ReferralApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ReferralApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error("This page requires the API. Add VITE_API_BASE_URL to a root .env file, then restart the dev server.");
  }
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  const token = getApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetchWithTimeout(`${apiBaseUrl}${path}`, { ...options, credentials: "include", headers });
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
  if (!response.ok) {
    const fallback = response.status === 403 ? "You don't have permission to do this." : `Request failed with ${response.status} ${response.statusText}`;
    throw new ReferralApiError(body?.message ?? fallback, response.status, body?.code);
  }
  return (body?.data ?? (body as unknown as T)) as T;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return q.toString();
};

const post = (body?: unknown): RequestInit => ({ method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

/* ------------------------- Clinician portal ------------------------- */

export const getMyReferrals = () => request<MyReferrals>("/api/doctor/referrals");

/** Refers and invites the colleague straight away (no admin review). */
export const referColleague = (input: ReferralInput) =>
  request<Referral & { inviteEmailDelivered?: boolean }>("/api/doctor/referrals", post(input));

export const withdrawReferral = (id: string) => request<Referral>(`/api/doctor/referrals/${id}`, { method: "DELETE" });

/* ------------------------------ Admin ------------------------------ */

const ADMIN = "/api/admin/referrals";

export const listReferrals = (params: { page: number; status?: ReferralStatus | ""; search?: string; referrerId?: string }) =>
  request<{ referrals: Referral[]; pagination: PageInfo }>(
    `${ADMIN}?${qs({ page: params.page, limit: 20, status: params.status, search: params.search?.trim(), referrerId: params.referrerId })}`
  );

export const getReferralSummary = () => request<ReferralSummary>(`${ADMIN}/summary`);

/** Credit an invited (not yet joined) gynac to a referrer, or log an offline lead. */
export const createReferral = (
  input: { referrerDoctorId: string; doctorId: string; note?: string } | ({ referrerDoctorId: string } & ReferralInput)
) => request<Referral>(ADMIN, post(input));

export const approveReferral = (id: string, input: ApproveReferralInput) =>
  request<{ referral: Referral; inviteUrl?: string; inviteEmailDelivered: boolean }>(`${ADMIN}/${id}/approve`, post(input));

export const rejectReferral = (id: string, reason: string) => request<Referral>(`${ADMIN}/${id}/reject`, post({ reason }));

export const cancelReferral = (id: string, reason: string) => request<Referral>(`${ADMIN}/${id}/cancel`, post({ reason }));

export const reassignReferrer = (id: string, referrerDoctorId: string, reason?: string) =>
  request<Referral>(`${ADMIN}/${id}/referrer`, { method: "PATCH", body: JSON.stringify({ referrerDoctorId, reason }) });

export const listCredits = (params: { page: number; doctorId?: string; status?: "active" | "revoked" | "expired" | "" }) =>
  request<{ credits: ReferralCredit[]; pagination: PageInfo }>(
    `${ADMIN}/credits?${qs({ page: params.page, limit: 20, doctorId: params.doctorId, status: params.status })}`
  );

export const grantBonusSessions = (input: { doctorId: string; sessions: number; reason: string; expiryDays?: number | null }) =>
  request<ReferralCredit>(`${ADMIN}/credits`, post(input));

export const revokeCredit = (id: string, reason: string) => request<ReferralCredit>(`${ADMIN}/credits/${id}/revoke`, post({ reason }));

export const getReferralSettings = () => request<ReferralSettings>(`${ADMIN}/settings`);

export const updateReferralSettings = (updates: Partial<Omit<ReferralSettings, "updatedAt">>) =>
  request<ReferralSettings>(`${ADMIN}/settings`, { method: "PUT", body: JSON.stringify(updates) });

/* ------------------------------ Labels ------------------------------ */

export const REFERRAL_STATUS: Record<ReferralStatus, { label: string; portalLabel: string; tone: "ok" | "warn" | "info" | "danger" | "muted" }> = {
  submitted: { label: "To review", portalLabel: "In review", tone: "warn" },
  invited: { label: "Invited", portalLabel: "Invite sent", tone: "info" },
  onboarded: { label: "Joined", portalLabel: "Joined", tone: "ok" },
  rejected: { label: "Rejected", portalLabel: "Not taken forward", tone: "danger" },
  withdrawn: { label: "Withdrawn", portalLabel: "Withdrawn", tone: "muted" },
  cancelled: { label: "Cancelled", portalLabel: "Closed", tone: "muted" }
};

export const CREDIT_STATE: Record<CreditState, { label: string; tone: "ok" | "warn" | "info" | "danger" | "muted" }> = {
  active: { label: "Active", tone: "ok" },
  used_up: { label: "Used up", tone: "muted" },
  revoked: { label: "Revoked", tone: "danger" },
  expired: { label: "Expired", tone: "muted" }
};
