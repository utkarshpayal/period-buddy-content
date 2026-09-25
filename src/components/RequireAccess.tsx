import React from "react";
import { useAppContext } from "../context/AppContext";
import type { Permission } from "../auth/access";
import { isAdminApiConfigured } from "../api/adminApi";
import { NoAccessPage } from "../pages/NoAccessPage";

/**
 * Route guard: renders the page when the user holds ANY of `permissions`
 * (an empty list means "any staff member"), otherwise a friendly No Access
 * screen. The API enforces the same rules — this only avoids dead ends.
 */
export const RequireAccess: React.FC<{ permissions: Permission[]; children: React.ReactNode }> = ({
  permissions,
  children
}) => {
  const { can } = useAppContext();
  const allowed = !isAdminApiConfigured || permissions.length === 0 || can(...permissions);
  return <>{allowed ? children : <NoAccessPage />}</>;
};
