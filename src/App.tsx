import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useAppContext } from "./context/AppContext";
import { ToastProvider } from "./components/Toast";
import { Sidebar } from "./components/Sidebar";
import { GynacSidebar } from "./components/GynacSidebar";
import { RequireAccess } from "./components/RequireAccess";
import { ALL_NAV_ITEMS } from "./navigation";
import { LoginPage } from "./pages/LoginPage";
import { SetPasswordPage } from "./pages/SetPasswordPage";
import { NoAccessPage } from "./pages/NoAccessPage";
import { GynacDashboard } from "./pages/gynac/GynacDashboard";
import { GynacBookings } from "./pages/gynac/GynacBookings";
import { GynacPayments } from "./pages/gynac/GynacPayments";
import { GynacReels } from "./pages/gynac/GynacReels";
import { GynacAvailability } from "./pages/gynac/GynacAvailability";
import { GynacProfile } from "./pages/gynac/GynacProfile";
import { isAdminApiConfigured } from "./api/adminApi";

function AdminApp() {
  return (
    <div className="app-shell admin-shell">
      <Sidebar />
      <main className="workspace-main-content">
        <Routes>
          {ALL_NAV_ITEMS.map((item) => (
            <Route
              key={item.path}
              path={item.path}
              element={<RequireAccess permissions={item.permissions}>{item.element}</RequireAccess>}
            />
          ))}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function GynacApp() {
  return (
    <div className="app-shell gynac-shell">
      <GynacSidebar />
      <main className="workspace-main-content">
        <Routes>
          <Route path="/" element={<GynacDashboard />} />
          <Route path="/bookings" element={<GynacBookings />} />
          <Route path="/payments" element={<GynacPayments />} />
          <Route path="/reels" element={<GynacReels />} />
          <Route path="/availability" element={<GynacAvailability />} />
          <Route path="/profile" element={<GynacProfile />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, role, access } = useAppContext();

  // Signed out: the only reachable screens are the login page and the public
  // invite (set-password) flow. Every other path bounces to /login.
  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Signed in: clinicians get the Gynac portal, staff get the Admin
  // Workspace scoped to their permissions. Any other account (a regular app
  // user, a partner) has no business here. Local sandbox mode (no API) is
  // treated as a Super Admin so the UI can be explored offline.
  const portal =
    role === "doctor" ? <GynacApp /> : access || !isAdminApiConfigured ? <AdminApp /> : <NoAccessPage signOut />;

  return (
    <Routes>
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="*" element={portal} />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AppProvider>
    </ToastProvider>
  );
}
