import React from "react";

export const GynacHead: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <header className="topbar">
    <div>
      <p className="eyebrow">Clinician Portal</p>
      <h2>{title}</h2>
      {subtitle && <p className="subtitle-text">{subtitle}</p>}
    </div>
    {actions && <div className="header-actions">{actions}</div>}
  </header>
);
