import React, { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { LogOut, Menu, X } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { visibleSections } from "../navigation";
import { WORKSPACE_TITLE, roleLabel } from "../auth/access";

const initialsOf = (label: string) =>
  label
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "NA";

export const Sidebar: React.FC = () => {
  const { authSession, access, can, logout, approvalSummary } = useAppContext();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const sections = useMemo(() => visibleSections(can), [can]);
  const title = WORKSPACE_TITLE[access?.department ?? "organisation"];

  const user = authSession?.user;
  const signedInLabel =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name || user?.email || "Signed in";
  const badgeCount = approvalSummary.toReview || approvalSummary.minePending;

  const link = ({ isActive }: { isActive: boolean }) => (isActive ? "type-button active" : "type-button");

  const brand = (
    <div className="brand-lockup">
      <img className="sidebar-logo" src="/images/logo.png" alt="The Nura Care" />
      <div>
        <p className="eyebrow">The Nura Care</p>
        <h1>{title}</h1>
      </div>
    </div>
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

      <aside className={`sidebar workspace-sidebar ${open ? "open" : ""}`}>
        {brand}

        <nav className="type-nav" aria-label="Workspace navigation">
          {sections.map((section) => (
            <div className="nav-group" key={section.id}>
              <p className="nav-section-label">{section.label}</p>
              {section.items.map((item) => {
                const Icon = item.icon;
                const count = item.badge === "approvals" ? badgeCount : 0;
                return (
                  <NavLink key={item.path} to={item.path} end={item.path === "/"} className={link} onClick={close}>
                    <Icon size={18} />
                    <span className="nav-label">{item.label}</span>
                    {count > 0 && (
                      <span
                        className={`nav-badge ${approvalSummary.toReview ? "is-alert" : ""}`}
                        title={approvalSummary.toReview ? `${count} waiting for your review` : `${count} of your requests pending`}
                      >
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {authSession && (
          <div className="sidebar-user-card">
            <div className="user-info">
              <span className="user-avatar" aria-hidden>
                {initialsOf(signedInLabel)}
              </span>
              <div className="user-meta">
                <span className="user-name" title={signedInLabel}>
                  {signedInLabel}
                </span>
                <span className={`user-role-badge dept-${access?.department ?? "organisation"}`}>
                  {access?.roleLabel ?? roleLabel(user?.role)}
                </span>
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
