/**
 * Workspace access model. The backend (config/permissions.js) is the source
 * of truth and sends `access` on login and GET /api/admin/me; this mirror is
 * only a fallback for sessions stored before that field existed, and for
 * rendering labels. Hiding UI is a convenience — the API enforces everything.
 */

export const PERMISSIONS = {
  CONTENT_READ: "content.read",
  CONTENT_WRITE: "content.write",
  CONTENT_PUBLISH: "content.publish",
  CONTENT_APPROVE: "content.approve",
  USERS_READ: "users.read",
  USERS_MANAGE: "users.manage",
  PUSH_READ: "push.read",
  PUSH_SEND: "push.send",
  PUSH_BROADCAST: "push.broadcast",
  ANALYTICS_READ: "analytics.read",
  SUBSCRIPTIONS_READ: "subscriptions.read",
  SUBSCRIPTIONS_WRITE: "subscriptions.write",
  SUBSCRIPTIONS_MANAGE: "subscriptions.manage",
  SCHEME_APPLICATIONS_READ: "scheme_applications.read",
  SCHEME_APPLICATIONS_REVIEW: "scheme_applications.review",
  MARKETING_READ: "marketing.read",
  APP_APPROVE: "app.approve",
  DOCTORS_READ: "doctors.read",
  DOCTORS_MANAGE: "doctors.manage",
  // Doctor commission, earnings and withdrawals: Clinical Admin + Super Admin only.
  PAYOUTS_READ: "payouts.read",
  PAYOUTS_MANAGE: "payouts.manage",
  STAFF_MANAGE: "staff.manage",
  AUDIT_READ: "audit.read",
  COMPANY_FILES_MANAGE: "company_files.manage",
  HR_MANAGE: "hr.manage"
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type Department = "organisation" | "content" | "app" | "clinical";

export type StaffRole =
  | "admin"
  | "content_super_admin"
  | "content_admin"
  | "app_super_admin"
  | "app_admin"
  | "clinical_admin";

export type WorkspaceAccess = {
  role: string;
  roleLabel: string | null;
  department: Department | null;
  level: number | null;
  permissions: string[];
  assignableRoles: string[];
};

const P = PERMISSIONS;

export const ROLE_META: Record<StaffRole, { label: string; department: Department; level: number; permissions: Permission[] }> = {
  admin: { label: "Super Admin", department: "organisation", level: 1, permissions: Object.values(P) },
  content_super_admin: {
    label: "Content Super Admin",
    department: "content",
    level: 2,
    permissions: [P.CONTENT_READ, P.CONTENT_WRITE, P.CONTENT_PUBLISH, P.CONTENT_APPROVE, P.STAFF_MANAGE]
  },
  content_admin: {
    label: "Content Admin",
    department: "content",
    level: 3,
    permissions: [P.CONTENT_READ, P.CONTENT_WRITE]
  },
  app_super_admin: {
    label: "App Super Admin",
    department: "app",
    level: 2,
    permissions: [
      P.USERS_READ, P.USERS_MANAGE, P.PUSH_READ, P.PUSH_SEND, P.PUSH_BROADCAST, P.ANALYTICS_READ,
      P.SUBSCRIPTIONS_READ, P.SUBSCRIPTIONS_WRITE, P.SUBSCRIPTIONS_MANAGE,
      P.SCHEME_APPLICATIONS_READ, P.SCHEME_APPLICATIONS_REVIEW, P.MARKETING_READ, P.APP_APPROVE, P.STAFF_MANAGE
    ]
  },
  app_admin: {
    label: "App Admin",
    department: "app",
    level: 3,
    permissions: [
      P.USERS_READ, P.PUSH_READ, P.PUSH_SEND, P.ANALYTICS_READ, P.SUBSCRIPTIONS_READ, P.SUBSCRIPTIONS_WRITE,
      P.SCHEME_APPLICATIONS_READ, P.SCHEME_APPLICATIONS_REVIEW, P.MARKETING_READ
    ]
  },
  clinical_admin: {
    label: "Clinical Admin",
    department: "clinical",
    level: 2,
    permissions: [P.DOCTORS_READ, P.DOCTORS_MANAGE, P.PAYOUTS_READ, P.PAYOUTS_MANAGE]
  }
};

export const DEPARTMENT_LABEL: Record<Department, string> = {
  organisation: "Organisation",
  content: "Content",
  app: "App & Growth",
  clinical: "Clinical"
};

/** What each role's workspace is called in the sidebar / login screen. */
export const WORKSPACE_TITLE: Record<Department, string> = {
  organisation: "Admin Console",
  content: "Content Studio",
  app: "App Console",
  clinical: "Clinical Console"
};

export const isStaffRole = (role: string | null | undefined): role is StaffRole =>
  Boolean(role && Object.prototype.hasOwnProperty.call(ROLE_META, role));

export const roleLabel = (role: string | null | undefined) =>
  (isStaffRole(role) ? ROLE_META[role].label : role) || "Member";

/** Local fallback when the backend didn't send `access`. */
export function deriveAccess(role: string | null | undefined): WorkspaceAccess | null {
  if (!isStaffRole(role)) return null;
  const meta = ROLE_META[role];
  const assignableRoles = (Object.keys(ROLE_META) as StaffRole[]).filter((target) => {
    if (role === "admin") return true;
    const t = ROLE_META[target];
    return meta.permissions.includes(P.STAFF_MANAGE) && t.department === meta.department && t.level > meta.level;
  });
  return {
    role,
    roleLabel: meta.label,
    department: meta.department,
    level: meta.level,
    permissions: meta.permissions,
    assignableRoles
  };
}

/** Plain-language names for permissions, grouped by the area they unlock.
 * Used to show a staff member what they can do (Account & Settings). */
const PERMISSION_INFO: Record<Permission, { area: string; label: string }> = {
  [P.CONTENT_READ]: { area: "Content", label: "View" },
  [P.CONTENT_WRITE]: { area: "Content", label: "Write drafts" },
  [P.CONTENT_PUBLISH]: { area: "Content", label: "Publish" },
  [P.CONTENT_APPROVE]: { area: "Content", label: "Approve changes" },
  [P.USERS_READ]: { area: "App users", label: "View" },
  [P.USERS_MANAGE]: { area: "App users", label: "Suspend & restore" },
  [P.PUSH_READ]: { area: "Push notifications", label: "View" },
  [P.PUSH_SEND]: { area: "Push notifications", label: "Send" },
  [P.PUSH_BROADCAST]: { area: "Push notifications", label: "Broadcast to everyone" },
  [P.ANALYTICS_READ]: { area: "Analytics", label: "View" },
  [P.SUBSCRIPTIONS_READ]: { area: "Subscriptions", label: "View" },
  [P.SUBSCRIPTIONS_WRITE]: { area: "Subscriptions", label: "Edit drafts" },
  [P.SUBSCRIPTIONS_MANAGE]: { area: "Subscriptions", label: "Manage pricing" },
  [P.SCHEME_APPLICATIONS_READ]: { area: "Scheme applications", label: "View" },
  [P.SCHEME_APPLICATIONS_REVIEW]: { area: "Scheme applications", label: "Review" },
  [P.MARKETING_READ]: { area: "Marketing", label: "View" },
  [P.APP_APPROVE]: { area: "Approvals", label: "Approve app changes" },
  [P.DOCTORS_READ]: { area: "Gynecologists", label: "View" },
  [P.DOCTORS_MANAGE]: { area: "Gynecologists", label: "Invite & manage" },
  [P.PAYOUTS_READ]: { area: "Commission & payouts", label: "View" },
  [P.PAYOUTS_MANAGE]: { area: "Commission & payouts", label: "Set commission, approve withdrawals" },
  [P.STAFF_MANAGE]: { area: "Team", label: "Invite & manage roles" },
  [P.AUDIT_READ]: { area: "Audit logs", label: "View" },
  [P.COMPANY_FILES_MANAGE]: { area: "Company files", label: "Manage" },
  [P.HR_MANAGE]: { area: "People & letters", label: "Manage team records, letters & certificates" }
};

/** Group permission keys by area, in a stable order. Unknown keys (a newer
 * backend) are kept under "Other" with their raw name. */
export function groupPermissions(permissions: string[]): { area: string; actions: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const perm of permissions) {
    const info = PERMISSION_INFO[perm as Permission] ?? { area: "Other", label: perm };
    groups.set(info.area, [...(groups.get(info.area) ?? []), info.label]);
  }
  return [...groups].map(([area, actions]) => ({ area, actions }));
}
