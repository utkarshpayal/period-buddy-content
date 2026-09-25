import { throwIfPendingApproval } from "./approval";
import { getApiToken, handleUnauthorized } from "./authApi";
import { fetchWithTimeout } from "./http";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";

export const isSubscriptionApiConfigured = Boolean(apiBaseUrl);

/* ----------------------------- Types ----------------------------- */

export type BillingCycle = "monthly" | "yearly" | "one_time";

export type SubscriptionFeature = {
  _id: string;
  key: string;
  name: string;
  description?: string;
  category: string;
  icon?: string;
  isPremium: boolean;
  price: number;
  billingCycle: BillingCycle;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type SubscriptionFeatureInput = {
  key: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  isPremium?: boolean;
  price?: number;
  billingCycle?: BillingCycle;
  isActive?: boolean;
  sortOrder?: number;
};

export type SubscriptionPlan = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  billingCycle: BillingCycle;
  features: string[];
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  badge?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SubscriptionPlanInput = {
  name: string;
  slug?: string;
  description?: string;
  price: number;
  billingCycle?: BillingCycle;
  features?: string[];
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  badge?: string;
};

export type DiscountType = "percentage" | "flat";

export type Coupon = {
  _id: string;
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  isActive: boolean;
  expiresAt?: string | null;
  maxRedemptions?: number | null;
  redeemedCount: number;
  perUserLimit: number;
  createdAt?: string;
  updatedAt?: string;
};

export type CouponInput = {
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  isActive?: boolean;
  expiresAt?: string | null;
  maxRedemptions?: number | null;
  perUserLimit?: number;
};

export type SubscriptionSettings = {
  _id: string;
  subscriptionEnabled: boolean;
  currency: string;
  allowFeatureWisePurchase: boolean;
  graceDays: number;
};

export type SubscriptionSettingsInput = Partial<
  Pick<SubscriptionSettings, "subscriptionEnabled" | "currency" | "allowFeatureWisePurchase" | "graceDays">
>;

export type EntitlementUser = { _id: string; firstName?: string; lastName?: string; email?: string };

export type Entitlement = {
  _id: string;
  /** null when the buyer's account has since been deleted. */
  user: EntitlementUser | string | null;
  source: "plan" | "feature";
  plan?: { _id: string; name: string } | string | null;
  featureKey?: string;
  status: "pending" | "active" | "expired" | "cancelled" | "failed";
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  startedAt?: string;
  expiresAt?: string | null;
  createdAt: string;
};

export type SubscriptionOverview = {
  activeSubscribers: number;
  totalRevenue: number;
  totalPaidTransactions: number;
  revenueByPlan: { _id: string | null; name?: string; total: number; count: number }[];
  revenueByFeature: { _id: string; total: number; count: number }[];
  recentTransactions: Entitlement[];
  pagination: { page: number; limit: number; total: number; pages: number };
};

export const BILLING_CYCLES: BillingCycle[] = ["monthly", "yearly", "one_time"];

export const billingCycleLabel = (cycle: BillingCycle) =>
  cycle === "monthly" ? "Monthly" : cycle === "yearly" ? "Yearly" : "One-time";

/* --------------------------- Request helper --------------------------- */

type ApiEnvelope<T> = {
  success?: boolean;
  statusCode?: number;
  message?: string;
  data?: T;
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error(
      "This page requires the API. Add VITE_API_BASE_URL to a root .env file, then restart the dev server."
    );
  }

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
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
    throw new Error(body?.message ?? "You don't have permission to do this.");
  }

  if (!response.ok) {
    throw new Error(body?.message ?? `Request failed with ${response.status} ${response.statusText}`);
  }

  throwIfPendingApproval(response.status, body);

  return (body?.data ?? (body as unknown as T)) as T;
}

/* ------------------------------ Settings ------------------------------- */

export const getSubscriptionSettings = () =>
  request<SubscriptionSettings>("/api/admin/subscriptions/settings");

export const updateSubscriptionSettings = (updates: SubscriptionSettingsInput) =>
  request<SubscriptionSettings>("/api/admin/subscriptions/settings", {
    method: "PUT",
    body: JSON.stringify(updates)
  });

/* ------------------------------ Features -------------------------------- */

export const adminListFeatures = () =>
  request<SubscriptionFeature[]>("/api/admin/subscriptions/features");

export const createFeature = (input: SubscriptionFeatureInput) =>
  request<SubscriptionFeature>("/api/admin/subscriptions/features", {
    method: "POST",
    body: JSON.stringify(input)
  });

export const updateFeature = (id: string, updates: Partial<SubscriptionFeatureInput>) =>
  request<SubscriptionFeature>(`/api/admin/subscriptions/features/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });

export const deleteFeature = (id: string) =>
  request<{ success?: boolean }>(`/api/admin/subscriptions/features/${id}`, { method: "DELETE" });

/* -------------------------------- Plans --------------------------------- */

export const adminListPlans = () => request<SubscriptionPlan[]>("/api/admin/subscriptions/plans");

export const createPlan = (input: SubscriptionPlanInput) =>
  request<SubscriptionPlan>("/api/admin/subscriptions/plans", {
    method: "POST",
    body: JSON.stringify(input)
  });

export const updatePlan = (id: string, updates: Partial<SubscriptionPlanInput>) =>
  request<SubscriptionPlan>(`/api/admin/subscriptions/plans/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });

export const deletePlan = (id: string) =>
  request<{ success?: boolean }>(`/api/admin/subscriptions/plans/${id}`, { method: "DELETE" });

/* ------------------------------- Coupons --------------------------------- */

export const adminListCoupons = () => request<Coupon[]>("/api/admin/subscriptions/coupons");

export const createCoupon = (input: CouponInput) =>
  request<Coupon>("/api/admin/subscriptions/coupons", {
    method: "POST",
    body: JSON.stringify(input)
  });

export const updateCoupon = (id: string, updates: Partial<CouponInput>) =>
  request<Coupon>(`/api/admin/subscriptions/coupons/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });

export const deleteCoupon = (id: string) =>
  request<{ success?: boolean }>(`/api/admin/subscriptions/coupons/${id}`, { method: "DELETE" });

/* ------------------------------- Overview -------------------------------- */

export const getSubscriptionOverview = (params?: { page?: number; limit?: number }) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return request<SubscriptionOverview>(`/api/admin/subscriptions/overview${qs ? `?${qs}` : ""}`);
};
