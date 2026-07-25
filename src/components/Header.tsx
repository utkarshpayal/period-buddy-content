import React from "react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actions }) => {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Content Studio</p>
        <h2>{title}</h2>
        {subtitle && <p className="subtitle-text">{subtitle}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
};
