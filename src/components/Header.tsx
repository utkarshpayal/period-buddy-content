import React from "react";
import { useLocation } from "react-router-dom";
import { findNavItem } from "../navigation";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** Defaults to the sidebar section the current page lives in. */
  eyebrow?: string;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actions, eyebrow }) => {
  const { pathname } = useLocation();
  const label = eyebrow ?? findNavItem(pathname)?.section.label ?? "Workspace";

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{label}</p>
        <h2>{title}</h2>
        {subtitle && <p className="subtitle-text">{subtitle}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
};
