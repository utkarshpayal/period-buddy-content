import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { Check, ExternalLink, Link2Off } from "lucide-react";
import { HIGHLIGHT_COLORS, HIGHLIGHT_HEX, TEXT_COLORS, TEXT_COLOR_HEX } from "../../lib/richText";

/* Small building blocks shared by the toolbar, the selection bubble and the
   slash menu: a tooltip'd icon button, a popover anchored to a trigger, and
   the color and link panels. */

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const shortcutText = (s: string) =>
  isMac ? s.replace("Mod", "⌘").replace(/Shift\+/g, "⇧").replace(/Alt\+/g, "⌥").replace(/\+/g, "") : s.replace("Mod", "Ctrl");

export const IconButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  /** Tooltip below the button instead of above (the bubble sits above the text). */
  tipBelow?: boolean;
  children?: React.ReactNode;
  className?: string;
}> = ({ label, icon, onClick, shortcut, active, disabled, expanded, tipBelow, children, className }) => (
  <button
    aria-expanded={expanded}
    aria-haspopup={expanded === undefined ? undefined : "true"}
    aria-keyshortcuts={shortcut?.replace("Mod", isMac ? "Meta" : "Control")}
    aria-label={label}
    aria-pressed={expanded === undefined && active !== undefined ? active : undefined}
    className={["rte-btn", active ? "is-active" : "", className ?? ""].filter(Boolean).join(" ")}
    data-tip={expanded ? undefined : shortcut ? `${label}  ${shortcutText(shortcut)}` : label}
    data-tip-pos={tipBelow ? "below" : undefined}
    disabled={disabled}
    // Keep the editor's selection: a mousedown on the button would blur it.
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    type="button"
  >
    {icon}
    {children}
  </button>
);

/**
 * A trigger plus its panel. Closes on Escape or a click outside, returns focus
 * to the trigger, and flips to the right edge when it would overflow.
 */
export const Popover: React.FC<{
  open: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** The element the panel must stay inside; defaults to the editor. */
  boundary?: string;
}> = ({ open, onClose, trigger, children, className, boundary = ".rte" }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [alignEnd, setAlignEnd] = useState(false);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const panel = ref.current.querySelector<HTMLElement>(":scope > .rte-pop");
    const bound = ref.current.closest(boundary)?.getBoundingClientRect() ?? document.body.getBoundingClientRect();
    if (panel) setAlignEnd(ref.current.getBoundingClientRect().left + panel.offsetWidth > bound.right - 8);
  }, [open, boundary]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape closes this panel only, not the dialog the editor sits in.
      e.preventDefault();
      e.stopPropagation();
      onClose();
      ref.current?.querySelector<HTMLElement>(":scope > button")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  return (
    <div className={["rte-pop-anchor", alignEnd ? "align-end" : "", className ?? ""].filter(Boolean).join(" ")} ref={ref}>
      {trigger}
      {open && <div className="rte-pop">{children}</div>}
    </div>
  );
};

/** A row in a menu: icon, title, optional hint, check when current. */
export const MenuItem: React.FC<{
  icon: React.ReactNode;
  title: string;
  hint?: string;
  onSelect: () => void;
  checked?: boolean;
  highlighted?: boolean;
  shortcut?: string;
}> = ({ icon, title, hint, onSelect, checked, highlighted, shortcut }) => (
  <button
    aria-checked={checked}
    className={highlighted ? "rte-menu-item is-highlighted" : "rte-menu-item"}
    onClick={onSelect}
    onMouseDown={(e) => e.preventDefault()}
    role={checked === undefined ? "menuitem" : "menuitemradio"}
    type="button"
  >
    <span className="rte-menu-icon">{icon}</span>
    <span className="rte-menu-text">
      <span className="rte-menu-title">{title}</span>
      {hint && <span className="rte-menu-hint">{hint}</span>}
    </span>
    {shortcut && <kbd className="rte-menu-kbd">{shortcutText(shortcut)}</kbd>}
    {checked && <Check className="rte-menu-check" size={15} />}
  </button>
);

const titleCase = (name: string) => name[0].toUpperCase() + name.slice(1);

/** Text color and highlight in one panel, like Notion's "Color" menu. */
export const ColorPanel: React.FC<{ editor: Editor; onDone: () => void }> = ({ editor, onDone }) => {
  const current = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      color: (e.getAttributes("textColor").color as string | undefined) ?? null,
      highlight: e.isActive("highlight") ? ((e.getAttributes("highlight").color as string | undefined) ?? "yellow") : null
    })
  });
  const run = (fn: () => void) => {
    fn();
    onDone();
  };

  return (
    <div className="rte-color-panel" role="menu" aria-label="Color">
      <span className="rte-pop-label">Text color</span>
      <div className="rte-swatches">
        <button
          aria-label="Default text color"
          aria-checked={!current.color}
          className="rte-swatch is-text"
          data-tip="Default"
          onClick={() => run(() => editor.chain().focus().unsetTextColor().run())}
          onMouseDown={(e) => e.preventDefault()}
          role="menuitemradio"
          type="button"
        >
          A
        </button>
        {TEXT_COLORS.map((c) => (
          <button
            aria-label={`${titleCase(c)} text`}
            aria-checked={current.color === c}
            className="rte-swatch is-text"
            data-tip={titleCase(c)}
            key={c}
            onClick={() => run(() => editor.chain().focus().setTextColor(c).run())}
            onMouseDown={(e) => e.preventDefault()}
            role="menuitemradio"
            style={{ color: TEXT_COLOR_HEX[c] }}
            type="button"
          >
            A
          </button>
        ))}
      </div>
      <span className="rte-pop-label">Highlight</span>
      <div className="rte-swatches">
        <button
          aria-label="No highlight"
          aria-checked={!current.highlight}
          className="rte-swatch is-none"
          data-tip="None"
          onClick={() => run(() => editor.chain().focus().unsetHighlight().run())}
          onMouseDown={(e) => e.preventDefault()}
          role="menuitemradio"
          type="button"
        />
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            aria-label={`${titleCase(c)} highlight`}
            aria-checked={current.highlight === c}
            className="rte-swatch is-fill"
            data-tip={titleCase(c)}
            key={c}
            onClick={() => run(() => editor.chain().focus().setHighlight(c).run())}
            onMouseDown={(e) => e.preventDefault()}
            role="menuitemradio"
            style={{ background: HIGHLIGHT_HEX[c] }}
            type="button"
          >
            A
          </button>
        ))}
      </div>
    </div>
  );
};

/** Add, change, open or remove the link on the selection. */
export const LinkPanel: React.FC<{ editor: Editor; onDone: () => void }> = ({ editor, onDone }) => {
  const existing = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [url, setUrl] = useState(existing);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const normalized = (raw: string) => (/^(https?:|mailto:|tel:|\/)/i.test(raw) ? raw : `https://${raw}`);
  const apply = () => {
    const value = url.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    (value ? chain.setLink({ href: normalized(value) }) : chain.unsetLink()).run();
    onDone();
  };

  return (
    <div className="rte-link-panel">
      {/* Not a <form>: the editor already sits inside the content form. */}
      <div className="rte-link-row">
        <input
          aria-label="Link address"
          className="rte-input"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            // The panel lives inside the content form: Enter must not submit that.
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          placeholder="Paste a link, or /blog/…"
          ref={input}
          type="text"
          value={url}
        />
        <button className="rte-primary-sm" disabled={!url.trim() && !existing} onClick={apply} type="button">
          {existing && !url.trim() ? "Remove" : "Apply"}
        </button>
      </div>
      {existing && (
        <div className="rte-link-actions">
          {/^https?:/i.test(existing) && (
            <a href={existing} rel="noopener noreferrer" target="_blank">
              <ExternalLink size={13} /> Open
            </a>
          )}
          <button
            onClick={() => {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              onDone();
            }}
            onMouseDown={(e) => e.preventDefault()}
            type="button"
          >
            <Link2Off size={13} /> Remove link
          </button>
        </div>
      )}
    </div>
  );
};
