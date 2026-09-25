import { adminRequest, Pagination } from "./adminApi";
import type { AuthUser } from "./authApi";
import type { WorkspaceAccess } from "../auth/access";

/* ------------------------------- Access -------------------------------- */

export const getMyAccess = () =>
  adminRequest<{ user: AuthUser; access: WorkspaceAccess }>("/api/admin/me");

/* -------------------------------- Staff -------------------------------- */

export type StaffStatus = "active" | "invited" | "suspended";

export type StaffMember = {
  id: string;
  firstName?: string;
  lastName?: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  department: string | null;
  status: StaffStatus;
  lastLogin?: string;
  createdAt?: string;
  invitedBy: { id: string; name: string; email: string } | null;
  canManage: boolean;
};

export type AssignableRole = { value: string; label: string; department: string };

export function listStaff(params: { search?: string; role?: string; status?: string } = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v && q.set(k, v));
  const qs = q.toString();
  return adminRequest<{ staff: StaffMember[]; assignableRoles: AssignableRole[] }>(
    `/api/admin/staff${qs ? `?${qs}` : ""}`
  );
}

export const inviteStaff = (payload: { name: string; email: string; role: string }) =>
  adminRequest<{ staff: StaffMember; inviteUrl: string; inviteEmailDelivered: boolean }>(
    "/api/admin/staff/invite",
    { method: "POST", body: JSON.stringify(payload) }
  );

export const resendStaffInvite = (id: string) =>
  adminRequest<{ inviteUrl: string; inviteEmailDelivered: boolean }>(
    `/api/admin/staff/${id}/resend-invite`,
    { method: "POST" }
  );

export const changeStaffRole = (id: string, role: string) =>
  adminRequest<StaffMember>(`/api/admin/staff/${id}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role })
  });

export const setStaffStatus = (id: string, isActive: boolean) =>
  adminRequest<StaffMember>(`/api/admin/staff/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive })
  });

export const removeStaff = (id: string) =>
  adminRequest<void>(`/api/admin/staff/${id}`, { method: "DELETE" });

/* --------------------------- Change requests --------------------------- */

export type ChangeRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

type Person = { _id: string; firstName?: string; lastName?: string; email?: string; role?: string };

export type ChangeRequest = {
  _id: string;
  key: string;
  department: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  summary?: string;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  before?: Record<string, unknown>;
  status: ChangeRequestStatus;
  requestedBy?: Person;
  requesterRole?: string;
  requesterNote?: string;
  reviewedBy?: Person;
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
};

export const personName = (p?: Person) =>
  [p?.firstName, p?.lastName].filter(Boolean).join(" ") || p?.email || "Someone";

export function listChangeRequests(params: {
  scope?: "review" | "mine";
  status?: ChangeRequestStatus | "all";
  department?: string;
  resourceType?: string;
  page?: number;
  limit?: number;
}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && q.set(k, String(v)));
  return adminRequest<{ scope: "review" | "mine"; requests: ChangeRequest[]; pagination: Pagination }>(
    `/api/admin/change-requests?${q.toString()}`
  );
}

export const getChangeRequestSummary = () =>
  adminRequest<{ toReview: number; minePending: number }>("/api/admin/change-requests/summary");

export const approveChangeRequest = (id: string, note?: string) =>
  adminRequest<ChangeRequest>(`/api/admin/change-requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ note })
  });

export const rejectChangeRequest = (id: string, note: string) =>
  adminRequest<ChangeRequest>(`/api/admin/change-requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ note })
  });

export const cancelChangeRequest = (id: string) =>
  adminRequest<ChangeRequest>(`/api/admin/change-requests/${id}/cancel`, { method: "POST" });
