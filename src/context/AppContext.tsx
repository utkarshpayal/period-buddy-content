import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  getStoredAuthSession,
  loginWithEmail,
  clearAuthSession,
  onUnauthorized,
  saveStoredUser,
  AuthSession
} from "../api/authApi";
import {
  loadContent,
  createContent,
  updateContent,
  deleteContent,
  ApiSource
} from "../api/contentApi";
import { isAdminApiConfigured } from "../api/adminApi";
import { isPendingApprovalError, PENDING_APPROVAL_EVENT } from "../api/approval";
import {
  ChangeRequest,
  getChangeRequestSummary,
  getMyAccess,
  listChangeRequests
} from "../api/workspaceApi";
import { deriveAccess, isStaffRole, PERMISSIONS, Permission, WorkspaceAccess } from "../auth/access";
import { useToast } from "../components/Toast";
import { ContentItem, ContentType } from "../types/content";

type ApprovalSummary = { toReview: number; minePending: number };

interface AppContextType {
  authSession: AuthSession | null;
  isAuthenticated: boolean;
  role: string | null;
  /** Staff access (null for doctors / signed-out). */
  access: WorkspaceAccess | null;
  /** True when the signed-in staff member holds any of `permissions`. */
  can: (...permissions: Permission[]) => boolean;
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  items: ContentItem[];
  apiSource: ApiSource;
  apiMessage: string;
  isLoading: boolean;
  isSaving: boolean;
  setApiMessage: (msg: string) => void;
  refreshContent: () => Promise<void>;
  createItem: (item: ContentItem) => Promise<boolean>;
  updateItem: (id: string, item: ContentItem) => Promise<boolean>;
  deleteItem: (id: string, type: ContentType) => Promise<boolean>;
  /** Pending content change requests, keyed by content id. */
  pendingContent: Map<string, ChangeRequest>;
  approvalSummary: ApprovalSummary;
  refreshApprovals: () => Promise<void>;
  /** Resolves to null on success, or the error message to show. */
  login: (credentials: { email: string; password: string }) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const toast = useToast();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [apiSource, setApiSource] = useState<ApiSource>("local");
  const [apiMessage, setApiMessage] = useState("Connecting to content source...");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getStoredAuthSession());
  const [sessionExpired, setSessionExpired] = useState(false);
  const [pendingContent, setPendingContent] = useState<Map<string, ChangeRequest>>(new Map());
  const [approvalSummary, setApprovalSummary] = useState<ApprovalSummary>({ toReview: 0, minePending: 0 });

  const role = authSession?.user?.role ?? null;
  const isAuthenticated = Boolean(authSession?.token);
  const clearSessionExpired = () => setSessionExpired(false);

  const access = useMemo<WorkspaceAccess | null>(
    () => (isStaffRole(role) ? authSession?.user?.access ?? deriveAccess(role) : null),
    [role, authSession?.user?.access]
  );

  const can = useCallback(
    (...permissions: Permission[]) =>
      Boolean(access) && permissions.some((p) => access!.permissions.includes(p)),
    [access]
  );

  const canReadContent = !isAdminApiConfigured || can(PERMISSIONS.CONTENT_READ);
  const usesApprovals = isAdminApiConfigured && isAuthenticated && Boolean(access);

  // Auto sign-out when a token expires or the API returns 401. The API layer
  // has already cleared storage; here we sync React state + flag it so the
  // login screen can explain why the user landed there.
  useEffect(() => {
    return onUnauthorized(() => {
      setAuthSession((prev) => {
        if (prev) setSessionExpired(true);
        return null;
      });
    });
  }, []);

  // Refresh role/permissions from the server once per session so a role
  // change made by a manager applies without signing out and back in.
  useEffect(() => {
    if (!isAdminApiConfigured || !isAuthenticated || !isStaffRole(role)) return;
    let cancelled = false;
    getMyAccess()
      .then(({ user, access: fresh }) => {
        if (cancelled) return;
        const nextUser = { ...authSession?.user, ...user, access: fresh };
        saveStoredUser(nextUser);
        setAuthSession((prev) => (prev ? { ...prev, user: nextUser } : prev));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, role]);

  const fetchContent = useCallback(async () => {
    if (!canReadContent) {
      setItems([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await loadContent();
      setItems(result.items);
      setApiMessage(result.message);
      setApiSource(result.source);
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Unable to load content.");
      setApiSource("local");
    } finally {
      setIsLoading(false);
    }
  }, [canReadContent]);

  const refreshApprovals = useCallback(async () => {
    if (!usesApprovals) {
      setPendingContent(new Map());
      setApprovalSummary({ toReview: 0, minePending: 0 });
      return;
    }
    try {
      const [summary, contentRequests] = await Promise.all([
        getChangeRequestSummary(),
        can(PERMISSIONS.CONTENT_READ)
          ? listChangeRequests({ status: "pending", department: "content", limit: 50 })
          : Promise.resolve(null)
      ]);
      setApprovalSummary(summary);
      const map = new Map<string, ChangeRequest>();
      contentRequests?.requests.forEach((r) => {
        if (r.resourceId && !map.has(r.resourceId)) map.set(r.resourceId, r);
      });
      setPendingContent(map);
    } catch {
      /* badges are best-effort */
    }
  }, [usesApprovals, can]);

  useEffect(() => {
    if (isAuthenticated || !isAdminApiConfigured) fetchContent();
  }, [fetchContent, isAuthenticated]);

  useEffect(() => {
    refreshApprovals();
    if (!usesApprovals) return;
    const onSubmitted = () => refreshApprovals();
    window.addEventListener(PENDING_APPROVAL_EVENT, onSubmitted);
    const timer = window.setInterval(refreshApprovals, 60_000);
    return () => {
      window.removeEventListener(PENDING_APPROVAL_EVENT, onSubmitted);
      window.clearInterval(timer);
    };
  }, [refreshApprovals, usesApprovals]);

  const refreshContent = async () => {
    await Promise.all([fetchContent(), refreshApprovals()]);
  };

  /** Shared outcome handling for content writes. Returns true when the
   * editor can close (saved, or queued for approval). */
  const reportMutationError = (error: unknown, fallback: string) => {
    if (isPendingApprovalError(error)) {
      toast.show(error.message, "info");
      return true;
    }
    const message = error instanceof Error ? error.message : fallback;
    setApiMessage(message);
    toast.error(message);
    return false;
  };

  const createItem = async (item: ContentItem): Promise<boolean> => {
    setIsSaving(true);
    try {
      const result = await createContent(item);
      const savedItem = result.item ?? item;
      setItems((prev) => [savedItem, ...prev]);
      setApiMessage(result.message);
      setApiSource(result.source);
      toast.success(
        savedItem.status === "draft" && !can(PERMISSIONS.CONTENT_PUBLISH) && isAdminApiConfigured
          ? "Saved as a draft. Publish it when it's ready for review."
          : "Saved."
      );
      return true;
    } catch (error) {
      return reportMutationError(error, "Unable to create content.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateItem = async (id: string, item: ContentItem): Promise<boolean> => {
    setIsSaving(true);
    try {
      const result = await updateContent(id, item);
      const savedItem = result.item ?? item;
      setItems((prev) => prev.map((i) => (i.id === id ? savedItem : i)));
      setApiMessage(result.message);
      setApiSource(result.source);
      toast.success("Changes saved.");
      return true;
    } catch (error) {
      return reportMutationError(error, "Unable to update content.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteItem = async (id: string, type: ContentType): Promise<boolean> => {
    try {
      const result = await deleteContent(id, type);
      setItems((prev) => prev.filter((i) => i.id !== id));
      setApiMessage(result.message);
      setApiSource(result.source);
      toast.success("Removed.");
      return true;
    } catch (error) {
      return reportMutationError(error, "Unable to delete content.");
    }
  };

  const login = async (credentials: { email: string; password: string }): Promise<string | null> => {
    try {
      const result = await loginWithEmail(credentials);
      setAuthSession(result.session);
      setSessionExpired(false);
      setApiMessage(result.message);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to authenticate.";
      setApiMessage(message);
      return message;
    }
  };

  const logout = async () => {
    clearAuthSession();
    setAuthSession(null);
    setItems([]);
    setPendingContent(new Map());
    setApiMessage("Logged out.");
  };

  return (
    <AppContext.Provider
      value={{
        authSession,
        isAuthenticated,
        role,
        access,
        can,
        sessionExpired,
        clearSessionExpired,
        items,
        apiSource,
        apiMessage,
        isLoading,
        isSaving,
        setApiMessage,
        refreshContent,
        createItem,
        updateItem,
        deleteItem,
        pendingContent,
        approvalSummary,
        refreshApprovals,
        login,
        logout
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppProvider");
  }
  return context;
};
