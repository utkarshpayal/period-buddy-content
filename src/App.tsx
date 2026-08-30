import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useAppContext } from "./context/AppContext";
import { Sidebar } from "./components/Sidebar";
import { GynacSidebar } from "./components/GynacSidebar";
import { Dashboard } from "./pages/Dashboard";
import { BlogsPage } from "./pages/BlogsPage";
import { QAsPage } from "./pages/QAsPage";
import { VideosPage } from "./pages/VideosPage";
import { GuidesPage } from "./pages/GuidesPage";
import { ConditionsPage } from "./pages/ConditionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LoginPage } from "./pages/LoginPage";
import { DoctorsPage } from "./pages/DoctorsPage";
import { UsersPage } from "./pages/UsersPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { SchemesPage } from "./pages/SchemesPage";
import { CompanyFilesPage } from "./pages/CompanyFilesPage";
import { SchemeApplicationsPage } from "./pages/SchemeApplicationsPage";
import { SubscriptionsPage } from "./pages/subscriptions/SubscriptionsPage";
import { SetPasswordPage } from "./pages/SetPasswordPage";
import { GynacDashboard } from "./pages/gynac/GynacDashboard";
import { GynacBookings } from "./pages/gynac/GynacBookings";
import { GynacPayments } from "./pages/gynac/GynacPayments";
import { GynacReels } from "./pages/gynac/GynacReels";
import { GynacAvailability } from "./pages/gynac/GynacAvailability";
import { GynacProfile } from "./pages/gynac/GynacProfile";

function AdminApp() {
  return (
    <div className="app-shell admin-shell">
      <Sidebar />
      <main className="workspace-main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
          <Route path="/blogs" element={<BlogsPage />} />
          <Route path="/qa" element={<QAsPage />} />
          <Route path="/videos" element={<VideosPage />} />
          <Route path="/guides" element={<GuidesPage />} />
          <Route path="/conditions" element={<ConditionsPage />} />
          <Route path="/gynecologists" element={<DoctorsPage />} />
          <Route path="/schemes" element={<SchemesPage />} />
          <Route path="/company-files" element={<CompanyFilesPage />} />
          <Route path="/scheme-applications" element={<SchemeApplicationsPage />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<LoginPage />} />
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
  const { isAuthenticated, role } = useAppContext();

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

  // Signed in: full role-based access to the studio / clinician portal.
  return (
    <Routes>
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route
        path="*"
        element={role === "doctor" ? <GynacApp /> : <AdminApp />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AppProvider>
  );
}
