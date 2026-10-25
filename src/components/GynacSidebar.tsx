import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  LayoutGrid,
  CalendarCheck,
  Wallet,
  Film,
  Clock,
  Gift,
  UserCog,
  LogOut,
  Menu,
  X
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { BrandMark } from "./BrandMark";
import type { TopBarSection } from "./TopBar";

/** The Clinician Portal's pages: the sidebar, the top bar and ⌘K use this. */
export const GYNAC_NAV_SECTIONS: TopBarSection[] = [
  {
    label: "Overview",
    items: [
      { path: "/", label: "Dashboard", icon: LayoutGrid },
      { path: "/bookings", label: "Bookings & Chat", icon: CalendarCheck }
    ]
  },
  {
    label: "Practice",
    items: [
      { path: "/payments", label: "Earnings & Wallet", icon: Wallet },
      { path: "/availability", label: "Availability", icon: Clock },
      { path: "/referrals", label: "Refer & Earn", icon: Gift }
    ]
  },
  { label: "Content", items: [{ path: "/reels", label: "Reels", icon: Film }] },
  { label: "Account", items: [{ path: "/profile", label: "My Profile", icon: UserCog }] }
];

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
      <BrandMark />
      <span className="brand-text">
        <strong>The Nura Care</strong>
        <span>Clinician Portal</span>
      </span>
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
        {GYNAC_NAV_SECTIONS.map((section) => (
          <React.Fragment key={section.label}>
            <p className="nav-section-label">{section.label}</p>
            {section.items.map(({ path, label, icon: Icon }) => (
              <NavLink key={path} to={path} end={path === "/"} className={link} onClick={close}>
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </React.Fragment>
        ))}
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
