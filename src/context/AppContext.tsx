import React, { createContext, useContext, useState, useEffect } from "react";
import {
  getStoredAuthSession,
  loginWithEmail,
  clearAuthSession,
  onUnauthorized,
  AuthSession
} from "../api/authApi";
import { 
  loadContent, 
  createContent, 
  updateContent, 
  deleteContent, 
  ApiSource 
} from "../api/contentApi";
import { ContentItem, ContentType } from "../types/content";

interface AppContextType {
  authSession: AuthSession | null;
  isAuthenticated: boolean;
  role: string | null;
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
  login: (credentials: { email: string; password: string }) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [apiSource, setApiSource] = useState<ApiSource>("local");
  const [apiMessage, setApiMessage] = useState("Connecting to content source...");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getStoredAuthSession());
  const [sessionExpired, setSessionExpired] = useState(false);
  const role = authSession?.user?.role ?? null;
  const isAuthenticated = Boolean(authSession?.token);
  const clearSessionExpired = () => setSessionExpired(false);

  // Auto sign-out when a token expires or the API returns 401/403. The API
  // layer has already cleared storage; here we sync React state + flag it so
  // the login screen can explain why the user landed there.
  useEffect(() => {
    return onUnauthorized(() => {
      setAuthSession((prev) => {
        if (prev) setSessionExpired(true);
        return null;
      });
    });
  }, []);

  const fetchContent = async () => {
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
  };

  useEffect(() => {
    fetchContent();
  }, []);

  const refreshContent = async () => {
    await fetchContent();
  };

  const createItem = async (item: ContentItem): Promise<boolean> => {
    setIsSaving(true);
    try {
      const result = await createContent(item);
      const savedItem = result.item ?? item;
      setItems((prev) => [savedItem, ...prev]);
      setApiMessage(result.message);
      setApiSource(result.source);
      return true;
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Unable to create content.");
      return false;
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
      return true;
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Unable to update content.");
      return false;
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
      return true;
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Unable to delete content.");
      return false;
    }
  };

  const login = async (credentials: { email: string; password: string }): Promise<boolean> => {
    try {
      const result = await loginWithEmail(credentials);
      setAuthSession(result.session);
      setSessionExpired(false);
      setApiMessage(`${result.message} Refreshing API content...`);
      await fetchContent();
      return true;
    } catch (error) {
      setApiMessage(error instanceof Error ? error.message : "Unable to authenticate.");
      return false;
    }
  };

  const logout = async () => {
    clearAuthSession();
    setAuthSession(null);
    setApiMessage("Logged out. API requests will not include your saved session.");
    await fetchContent();
  };

  return (
    <AppContext.Provider
      value={{
        authSession,
        isAuthenticated,
        role,
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
        login,
        logout,
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
