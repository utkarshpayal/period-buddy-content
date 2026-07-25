import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  FileText,
  FileQuestion,
  Film,
  BookOpen,
  Sparkles,
  Heart,
  Settings,
  LogOut,
  UserCheck
} from "lucide-react";
import { useAppContext } from "../context/AppContext";

export const Sidebar: React.FC = () => {
  const { authSession, logout } = useAppContext();
  
  const userFullName = [authSession?.user?.firstName, authSession?.user?.lastName].filter(Boolean).join(" ");
  const signedInLabel = authSession?.user?.email || userFullName || authSession?.user?.name;

  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark">PB</div>
        <div>
          <p className="eyebrow">Period Buddy</p>
          <h1>Content Studio</h1>
        </div>
      </div>

      <nav className="type-nav" aria-label="Content type filters">
        <NavLink
          to="/"
          className={({ isActive }) => (isActive ? "type-button active" : "type-button")}
        >
          <LayoutGrid size={18} />
          Dashboard
        </NavLink>
        
        <NavLink
          to="/blogs"
          className={({ isActive }) => (isActive ? "type-button active" : "type-button")}
        >
          <FileText size={18} />
          Blogs
        </NavLink>

        <NavLink
          to="/qa"
          className={({ isActive }) => (isActive ? "type-button active" : "type-button")}
        >
          <FileQuestion size={18} />
          Q&A Forum
        </NavLink>

        <NavLink
          to="/videos"
          className={({ isActive }) => (isActive ? "type-button active" : "type-button")}
        >
          <Film size={18} />
          Video Reels
        </NavLink>

        <NavLink
          to="/guides"
          className={({ isActive }) => (isActive ? "type-button active" : "type-button")}
        >
          <BookOpen size={18} />
          Wellbeing Guides
        </NavLink>

        <NavLink
          to="/conditions"
          className={({ isActive }) => (isActive ? "type-button active" : "type-button")}
        >
          <Heart size={18} />
          Health Issues
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) => (isActive ? "type-button active" : "type-button")}
        >
          <Settings size={18} />
          Studio Settings
        </NavLink>
      </nav>

      {authSession && (
        <div className="sidebar-user-card">
          <div className="user-info">
            <UserCheck size={16} className="user-icon" />
            <span className="user-name" title={signedInLabel}>
              {signedInLabel}
            </span>
          </div>
          <button onClick={logout} className="logout-btn" type="button">
            <LogOut size={14} />
            Logout
          </button>
        </div>
      )}

      <div className="sidebar-footer">
        <p>Ready for app CMS, companion Q&A, learning cards, and video scripts.</p>
      </div>
    </aside>
  );
};
