import type { PageInfo } from "../components/Pagination";
import { getApiToken, handleUnauthorized } from "./authApi";
import { fetchWithTimeout } from "./http";
import type { Earning, Payout, PayoutStatus, Wallet } from "./doctorApi";

/**
 * Clinical Admin: doctor commission, earnings ledger and payouts
 * (/api/admin/clinical-finance/*). Needs payouts.read / payouts.manage, which
 * only Super Admin and Clinical Admin hold; the API enforces it.
 */

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

/* ----------------------------- Types ----------------------------- */

export type PayoutProvider = "manual" | "cashfree";

export type PayoutSettings = {
  /** What the admin chose. */
  payoutProvider: PayoutProvider;
  /** What new withdrawals actually use ("cashfree" only when chosen and connected). */
  activeProvider: PayoutProvider;
  /** Paid but never-completed sessions become withdrawable this many days after payment (0 = off). */
  autoReleaseDays: number;
  defaultCommissionPercent: number;
  holdDays: number;
  payoutsEnabled: boolean;
  requireApproval: boolean;
  minWithdrawal: number;
  maxWithdrawal: number;
  newMethodCooldownHours: number;
  earningsStartAt?: string;
  /** False until the server has Cashfree Payouts credentials. */
  payoutsConfigured: boolean;
  updatedAt?: string;
};

export type PayoutSettingsInput = Partial<Omit<PayoutSettings, "activeProvider" | "earningsStartAt" | "payoutsConfigured" | "updatedAt">>;

/** Full payout details, only for paying a manual withdrawal (every view is audited). */
export type PayoutMethodDetails = {
  type: "bank" | "upi";
  accountHolderName: string;
  accountNumber?: string;
  ifsc?: string;
  vpa?: string;
  status: "active" | "removed";
};

export type FinanceOverview = {
  currency: string;
  gross: number;
  commission: number;
  doctorNet: number;
  onHold: number;
  owedAvailable: number;
  paidOut: number;
  inFlight: number;
  awaitingApproval: { count: number; amount: number };
  failedCount: number;
  sessions: number;
  settings: PayoutSettings;
};

export type DoctorWalletRow = {
  _id: string;
  name: string;
  email?: string;
  specialty?: string;
  pricePerSession?: number;
  currency?: string;
  isAvailable?: boolean;
  commissionPercent: number;
  commissionOverridePercent: number | null;
  commissionSource: "default" | "doctor";
  wallet: Wallet;
};

export type LedgerEarning = Earning & { doctor: { _id: string; name: string } | null };

export type AdminPayout = Payout & {
  doctor: { _id: string; name: string; email?: string } | null;
  provider: PayoutProvider;
  transferId?: string;
  cfStatus?: string;
  cfStatusCode?: string;
  dispatchAttempts?: number;
};

/* ----------------------------- Core fetch ----------------------------- */

type ApiEnvelope<T> = { success?: boolean; message?: string; data?: T };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error("This page requires the API. Add VITE_API_BASE_URL to a root .env file, then restart the dev server.");
  }
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  const token = getApiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetchWithTimeout(`${apiBaseUrl}/api/admin/clinical-finance${path}`, {
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
  if (response.status === 403) throw new Error(body?.message ?? "You don't have permission to do this.");
  if (!response.ok) throw new Error(body?.message ?? `Request failed with ${response.status} ${response.statusText}`);
  return (body?.data ?? (body as unknown as T)) as T;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  return q.toString();
};

/* ------------------------------ Calls ------------------------------ */

export const getFinanceOverview = () => request<FinanceOverview>("/overview");

export const getPayoutSettings = () => request<PayoutSettings>("/settings");

export const updatePayoutSettings = (updates: PayoutSettingsInput) =>
  request<PayoutSettings>("/settings", { method: "PUT", body: JSON.stringify(updates) });

export const listDoctorWallets = (params: { page: number; search?: string }) =>
  request<{ doctors: DoctorWalletRow[]; pagination: PageInfo }>(`/doctors?${qs({ page: params.page, limit: 20, search: params.search?.trim() })}`);

/** `null` clears the override (the doctor goes back to the default rate). */
export const setDoctorCommission = (doctorId: string, commissionPercent: number | null) =>
  request<{ _id: string; commissionOverridePercent: number | null }>(`/doctors/${doctorId}/commission`, {
    method: "PATCH",
    body: JSON.stringify({ commissionPercent })
  });

export const listEarnings = (params: { page: number; doctorId?: string; status?: string; type?: string }) =>
  request<{ earnings: LedgerEarning[]; pagination: PageInfo }>(`/earnings?${qs({ ...params, limit: 25 })}`);

export const reverseEarning = (id: string, reason: string) =>
  request<Earning>(`/earnings/${id}/reverse`, { method: "POST", body: JSON.stringify({ reason }) });

/** Positive amount = credit, negative = debit. */
export const addAdjustment = (payload: { doctorId: string; amount: number; note: string }) =>
  request<Earning>("/adjustments", { method: "POST", body: JSON.stringify(payload) });

export const listPayouts = (params: { page: number; status?: PayoutStatus[]; doctorId?: string }) =>
  request<{ payouts: AdminPayout[]; pagination: PageInfo }>(
    `/payouts?${qs({ page: params.page, limit: 25, status: params.status?.join(","), doctorId: params.doctorId })}`
  );

export const approvePayout = (id: string) => request<Payout>(`/payouts/${id}/approve`, { method: "POST" });

export const rejectPayout = (id: string, note: string) =>
  request<Payout>(`/payouts/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) });

export const syncPayout = (id: string) => request<Payout>(`/payouts/${id}/sync`, { method: "POST" });

export const getPayoutMethodDetails = (id: string) => request<PayoutMethodDetails>(`/payouts/${id}/method`);

/** Manual withdrawals: record the bank transfer you made. */
export const markPayoutPaid = (id: string, reference: string, note?: string) =>
  request<Payout>(`/payouts/${id}/mark-paid`, { method: "POST", body: JSON.stringify({ reference, note }) });
