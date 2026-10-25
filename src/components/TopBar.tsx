import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Bell, CornerDownLeft, Search } from "lucide-react";

export type TopBarItem = { path: string; label: string; icon: LucideIcon };
export type TopBarSection = { label: string; items: TopBarItem[] };

type Props = {
  /** The pages this person can open; drives the title and the ⌘K palette. */
  sections: TopBarSection[];
  /** Bell link with a count of things waiting (omitted = no bell). */
  bell?: { to: string; count: number; label: string };
};

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * The 68px workspace header (design system v1): eyebrow + page title on the
 * left, ⌘K search and the bell on the right. Shared by both portals.
 */
export const TopBar: React.FC<Props> = ({ sections, bell }) => {
  const { pathname } = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Exact match first, then the longest nav path that prefixes this one.
  const current = useMemo(() => {
    const all = sections.flatMap((s) => s.items.map((item) => ({ item, section: s.label })));
    return (
      all.find(({ item }) => item.path === pathname) ??
      all
        .filter(({ item }) => item.path !== "/" && pathname.startsWith(`${item.path}/`))
        .sort((a, b) => b.item.path.length - a.item.path.length)[0]
    );
  }, [sections, pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="ds-top">
      <div className="ds-top-title">
        {current && <p className="eyebrow">{current.section}</p>}
        <h1>{current?.item.label ?? "Workspace"}</h1>
      </div>
      <div className="ds-top-actions">
        <button type="button" className="ds-top-search" onClick={() => setPaletteOpen(true)} aria-label="Search or jump to a page">
          <Search size={16} aria-hidden />
          <span className="ds-top-search-text">Search or jump to…</span>
          <kbd className="ds-kbd">{isMac ? "⌘K" : "Ctrl K"}</kbd>
        </button>
        {bell && (
          <Link
            to={bell.to}
            className="ds-top-bell"
            aria-label={bell.count ? `${bell.label}, ${bell.count} waiting` : bell.label}
            title={bell.label}
          >
            <Bell size={18} aria-hidden />
            {bell.count > 0 && <span className="ds-top-bell-dot" aria-hidden />}
          </Link>
        )}
      </div>
      {paletteOpen && <CommandPalette sections={sections} onClose={() => setPaletteOpen(false)} />}
    </header>
  );
};

const CommandPalette: React.FC<{ sections: TopBarSection[]; onClose: () => void }> = ({ sections, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<Element | null>(document.activeElement);

  useEffect(() => {
    inputRef.current?.focus();
    const back = returnFocus.current;
    return () => {
      if (back instanceof HTMLElement) back.focus();
    };
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sections.flatMap((s) =>
      s.items
        .filter((item) => !q || item.label.toLowerCase().includes(q) || s.label.toLowerCase().includes(q))
        .map((item) => ({ item, section: s.label }))
    );
  }, [sections, query]);

  useEffect(() => setActive(0), [query]);

  const open = (path: string) => {
    onClose();
    navigate(path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      open(results[active].item.path);
    }
  };

  // Rendered at the top of #root so the scrim covers the sidebar too.
  return createPortal(
    <div className="ds-palette-scrim" onMouseDown={onClose}>
      <div
        className="ds-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search or jump to"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="ds-palette-search">
          <Search size={18} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or jump to"
            aria-label="Search or jump to"
            aria-controls="ds-palette-list"
            aria-activedescendant={results[active] ? `ds-pal-${active}` : undefined}
            role="combobox"
            aria-expanded="true"
          />
          <kbd className="ds-kbd">Esc</kbd>
        </div>
        <ul className="ds-palette-list" id="ds-palette-list" role="listbox" aria-label="Pages">
          {results.length === 0 && <li className="ds-palette-empty">No pages match “{query}”.</li>}
          {results.map(({ item, section }, i) => {
            const Icon = item.icon;
            return (
              <li
                key={item.path}
                id={`ds-pal-${i}`}
                role="option"
                aria-selected={i === active}
                className={`ds-palette-row ${i === active ? "on" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => open(item.path)}
              >
                <Icon size={18} aria-hidden />
                <span className="ds-palette-label">{item.label}</span>
                <span className="ds-palette-section">{section}</span>
                {i === active && <CornerDownLeft size={14} aria-hidden />}
              </li>
            );
          })}
        </ul>
        <div className="ds-palette-foot">
          <span><kbd className="ds-kbd">↑↓</kbd> move</span>
          <span><kbd className="ds-kbd">↵</kbd> open</span>
          <span><kbd className="ds-kbd">{isMac ? "⌘K" : "Ctrl K"}</kbd> toggle</span>
        </div>
      </div>
    </div>,
    document.getElementById("root") ?? document.body
  );
};
