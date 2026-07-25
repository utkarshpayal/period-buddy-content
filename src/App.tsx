import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useAppContext } from "./context/AppContext";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./pages/Dashboard";
import { BlogsPage } from "./pages/BlogsPage";
import { QAsPage } from "./pages/QAsPage";
import { VideosPage } from "./pages/VideosPage";
import { GuidesPage } from "./pages/GuidesPage";
import { ConditionsPage } from "./pages/ConditionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LoginPage } from "./pages/LoginPage";

function AppContent() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="workspace-main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/blogs" element={<BlogsPage />} />
          <Route path="/qa" element={<QAsPage />} />
          <Route path="/videos" element={<VideosPage />} />
          <Route path="/guides" element={<GuidesPage />} />
          <Route path="/conditions" element={<ConditionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
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
