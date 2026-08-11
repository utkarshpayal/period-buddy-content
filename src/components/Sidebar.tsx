import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  FileText,
  FileQuestion,
  Film,
  BookOpen,
  Heart,
  Settings,
  LogOut,
  LogIn,
  UserCheck,
  Stethoscope,
  ClipboardCheck,
  Landmark,
  Menu,
  X
} from "lucide-react";
import { useAppContext } from "../context/AppContext";

export const Sidebar: React.FC = () => {
  const { authSession, logout } = useAppContext();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const userFullName = [authSession?.user?.firstName, authSession?.user?.lastName].filter(Boolean).join(" ");
  const signedInLabel = userFullName || authSession?.user?.name;

  const link = ({ isActive }: { isActive: boolean }) =>
    isActive ? "type-button active" : "type-button";

  return (
    <>
      <div className="mobile-navbar">
        <div className="brand-lockup">
          <div className="brand-mark">PB</div>
          <div>
            <p className="eyebrow">Period Buddy</p>
            <h1>Content Studio</h1>
          </div>
        </div>
        <button
          className="mobile-menu-btn"
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && <div className="nav-backdrop" onClick={close} />}

      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">PB</div>
          <div>
            <p className="eyebrow">Period Buddy</p>
            <h1>Content Studio</h1>
          </div>
        </div>

        <nav className="type-nav" aria-label="Content type filters">
          <NavLink to="/" className={link} onClick={close}>
            <LayoutGrid size={18} />
            Dashboard
          </NavLink>

          <NavLink to="/blogs" className={link} onClick={close}>
            <FileText size={18} />
            Blogs
          </NavLink>

          <NavLink to="/qa" className={link} onClick={close}>
            <FileQuestion size={18} />
            Q&A Forum
          </NavLink>

          <NavLink to="/videos" className={link} onClick={close}>
            <Film size={18} />
            Video Reels
          </NavLink>

          <NavLink to="/guides" className={link} onClick={close}>
            <BookOpen size={18} />
            Wellbeing Guides
          </NavLink>

          <NavLink to="/conditions" className={link} onClick={close}>
            <Heart size={18} />
            Health Issues
          </NavLink>

          <NavLink to="/gynecologists" className={link} onClick={close}>
            <Stethoscope size={18} />
            Gynecologists
          </NavLink>

          <NavLink to="/schemes" className={link} onClick={close}>
            <Landmark size={18} />
            Govt. Schemes
          </NavLink>

          <NavLink to="/scheme-applications" className={link} onClick={close}>
            <ClipboardCheck size={18} />
            Scheme Applications
          </NavLink>

          <NavLink to="/settings" className={link} onClick={close}>
            <Settings size={18} />
            Studio Settings
          </NavLink>
        </nav>

        {authSession ? (
          <div className="sidebar-user-card">
            <div className="user-info">
              <UserCheck size={16} className="user-icon" />
              <span className="user-name" title={signedInLabel}>
                {signedInLabel}
              </span>
            </div>
            <button onClick={() => { close(); logout(); }} className="logout-btn" type="button">
              <LogOut size={14} />
              Logout
            </button>
          </div>
        ) : (
          <div className="sidebar-user-card sidebar-login-card">
            <p className="sidebar-login-hint">You&apos;re browsing as a guest.</p>
            <NavLink to="/login" className="login-cta-btn" onClick={close}>
              <LogIn size={14} />
              Sign in
            </NavLink>
          </div>
        )}

        <div className="sidebar-footer">
          <p>Ready for app CMS, companion Q&A, learning cards, and video scripts.</p>
        </div>
      </aside>
    </>
  );
};
