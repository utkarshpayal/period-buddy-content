import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  LayoutGrid,
  CalendarCheck,
  Wallet,
  Film,
  Clock,
  UserCog,
  LogOut,
  Menu,
  X
} from "lucide-react";
import { useAppContext } from "../context/AppContext";

export const GynacSidebar: React.FC = () => {
  const { authSession, logout } = useAppContext();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const userFullName = [authSession?.user?.firstName, authSession?.user?.lastName]
    .filter(Boolean)
    .join(" ");
  const signedInLabel = userFullName || authSession?.user?.name || authSession?.user?.email || "Doctor";
  const initials =
    (signedInLabel || "Dr")
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "DR";

  const link = ({ isActive }: { isActive: boolean }) =>
    isActive ? "type-button active" : "type-button";

  // The logo goes to the dashboard, like on the marketing site.
  const brand = (
    <Link to="/" className="brand-lockup" aria-label="Clinician Portal home" onClick={close}>
      <img className="sidebar-logo" src="/images/logo.png" alt="" />
      <div>
        <p className="eyebrow">The Nura Care</p>
        <h1>Clinician Portal</h1>
      </div>
    </Link>
  );

  return (
    <>
      <div className="mobile-navbar">
        {brand}
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
      {brand}

      <nav className="type-nav" aria-label="Clinician navigation">
        <p className="nav-section-label">Overview</p>
        <NavLink to="/" end className={link} onClick={close}>
          <LayoutGrid size={18} />
          Dashboard
        </NavLink>
        <NavLink to="/bookings" className={link} onClick={close}>
          <CalendarCheck size={18} />
          Bookings &amp; Chat
        </NavLink>

        <p className="nav-section-label">Practice</p>
        <NavLink to="/payments" className={link} onClick={close}>
          <Wallet size={18} />
          Earnings & Wallet
        </NavLink>
        <NavLink to="/availability" className={link} onClick={close}>
          <Clock size={18} />
          Availability
        </NavLink>

        <p className="nav-section-label">Content</p>
        <NavLink to="/reels" className={link} onClick={close}>
          <Film size={18} />
          Reels
        </NavLink>

        <p className="nav-section-label">Account</p>
        <NavLink to="/profile" className={link} onClick={close}>
          <UserCog size={18} />
          My Profile
        </NavLink>
      </nav>

      {authSession && (
        <div className="sidebar-user-card">
          <div className="user-info">
            <span className="user-avatar" aria-hidden>{initials}</span>
            <div className="user-meta">
              <span className="user-name" title={signedInLabel}>{signedInLabel}</span>
              <span className="user-role-badge dept-clinical">Gynecologist</span>
            </div>
          </div>
          <button onClick={() => { close(); logout(); }} className="logout-btn" type="button">
            <LogOut size={16} />
            Log out
          </button>
        </div>
      )}
      </aside>
    </>
  );
};
