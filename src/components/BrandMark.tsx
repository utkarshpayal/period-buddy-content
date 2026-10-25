import React from "react";

/** The Nura droplet on a rose tile (design system v1). Decorative. */
export const BrandMark: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg className="brand-mark-svg" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="9" fill="#C2416F" />
    <path d="M16 6.5c-4.6 4.1-6.8 8-6.8 11.3a6.8 6.8 0 0 0 13.6 0c0-3.3-2.2-7.2-6.8-11.3z" fill="#FFFFFF" />
    <path d="M16 13.2c-1.9 1.9-2.8 3.6-2.8 5.1a2.8 2.8 0 0 0 5.6 0c0-1.5-.9-3.2-2.8-5.1z" fill="#C2416F" />
  </svg>
);
