import React, { useEffect, useRef, useState } from "react";
import {
  AlarmClock,
  BookOpen,
  BriefcaseMedical,
  Calendar,
  Check,
  ChevronDown,
  CirclePlay,
  Coffee,
  Droplet,
  Dumbbell,
  Flame,
  Flower2,
  Gift,
  Heart,
  ImagePlus,
  Images,
  Leaf,
  Link2,
  Loader2,
  Megaphone,
  MessageCircleMore,
  Moon,
  RefreshCw,
  ShieldCheck,
  Smile,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Trophy,
  Users,
  type LucideIcon
} from "lucide-react";
import { uploadNotificationImage } from "../../api/adminApi";

/*
 * The "look" of a push for NotificationsPage: emoji for the text, its icon in
 * the app's notification list and an optional big-picture image (a "banner"
 * notification). Icon keys are the app's Ionicons names and must match
 * NOTIFICATION_ICONS in The-Nura-Backend/src/utils/notificationRoute.js and
 * The-Nura-App/lib/notificationIcons.ts; colours match the app's.
 */

/* --------------------------------- Popover -------------------------------- */

/** Closes on outside click or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/* ---------------------------------- Emoji --------------------------------- */

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: "Popular", emojis: ["✨", "💖", "🌸", "🎉", "🙌", "👉", "🔥", "💯", "⭐", "💫"] },
  { label: "Cycle & body", emojis: ["🩸", "💧", "🌙", "🌷", "🌱", "🥚", "🤰", "💊", "🩺", "🌡️"] },
  { label: "Care & mood", emojis: ["🫶", "🤗", "😌", "😴", "🥺", "💆‍♀️", "🛁", "🧘‍♀️", "☕", "🍫"] },
  { label: "Food & wellness", emojis: ["🥗", "🍓", "🥑", "🍌", "🥜", "🫖", "💪", "🚶‍♀️", "🏃‍♀️", "🌿"] },
  { label: "Celebrate & offers", emojis: ["🎁", "🏆", "🥳", "🎊", "🛍️", "💸", "🏷️", "⏰", "📣", "🆕"] }
];

/**
 * Small emoji button for a text field's label row. `onPick` gets the emoji;
 * use insertAtCursor() to put it where the caret is.
 */
export const EmojiButton: React.FC<{ onPick: (emoji: string) => void; label?: string }> = ({ onPick, label = "Add emoji" }) => {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="pn-pop-wrap" ref={ref}>
      <button
        type="button"
        className={`pn-emoji-btn ${open ? "is-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        title={label}
      >
        <Smile size={15} />
      </button>
      {open && (
        <div className="pn-pop pn-emoji-pop" role="dialog" aria-label="Emoji">
          {EMOJI_GROUPS.map((g) => (
            <div key={g.label} className="pn-emoji-group">
              <p>{g.label}</p>
              <div className="pn-emoji-grid">
                {g.emojis.map((e) => (
                  <button key={e} type="button" onClick={() => onPick(e)} aria-label={`Insert ${e}`}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** Insert `text` at the field's caret (or the end), respecting maxLength; keeps focus after it. */
export function insertAtCursor(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
  text: string,
  max: number,
  set: (v: string) => void
) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  const next = value.slice(0, start) + text + value.slice(end);
  if (next.length > max) return;
  set(next);
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
  });
}

/* ---------------------------------- Icons --------------------------------- */

type PushIcon = { key: string; label: string; Icon: LucideIcon; color: string; group: string };

export const PUSH_ICONS: PushIcon[] = [
  { key: "megaphone", label: "Announcement", Icon: Megaphone, color: "#E8618F", group: "General" },
  { key: "sparkles", label: "New", Icon: Sparkles, color: "#7C5CC4", group: "General" },
  { key: "gift", label: "Gift", Icon: Gift, color: "#E0703A", group: "General" },
  { key: "pricetag", label: "Offer", Icon: Tag, color: "#D98A1E", group: "General" },
  { key: "alarm", label: "Reminder", Icon: AlarmClock, color: "#E0703A", group: "General" },
  { key: "calendar", label: "Calendar", Icon: Calendar, color: "#2D7FB8", group: "General" },
  { key: "water", label: "Period", Icon: Droplet, color: "#D64545", group: "Cycle & health" },
  { key: "flower", label: "Ovulation", Icon: Flower2, color: "#7C5CC4", group: "Cycle & health" },
  { key: "moon", label: "Sleep", Icon: Moon, color: "#7C5CC4", group: "Cycle & health" },
  { key: "medkit", label: "Doctor", Icon: BriefcaseMedical, color: "#2D7FB8", group: "Cycle & health" },
  { key: "heart", label: "Care", Icon: Heart, color: "#E8618F", group: "Cycle & health" },
  { key: "shield-checkmark", label: "Privacy", Icon: ShieldCheck, color: "#3F9B5A", group: "Cycle & health" },
  { key: "fitness", label: "Fitness", Icon: Dumbbell, color: "#2E9C7E", group: "Wellness" },
  { key: "leaf", label: "Wellness", Icon: Leaf, color: "#3F9B5A", group: "Wellness" },
  { key: "cafe", label: "Food", Icon: Coffee, color: "#D98A1E", group: "Wellness" },
  { key: "book", label: "Read", Icon: BookOpen, color: "#2D7FB8", group: "Wellness" },
  { key: "play-circle", label: "Video", Icon: CirclePlay, color: "#D64545", group: "Wellness" },
  { key: "chatbubble-ellipses", label: "Chat", Icon: MessageCircleMore, color: "#7C5CC4", group: "Community & rewards" },
  { key: "people", label: "Community", Icon: Users, color: "#2E9C7E", group: "Community & rewards" },
  { key: "trophy", label: "Reward", Icon: Trophy, color: "#D98A1E", group: "Community & rewards" },
  { key: "star", label: "Star", Icon: Star, color: "#D98A1E", group: "Community & rewards" },
  { key: "flame", label: "Streak", Icon: Flame, color: "#E0703A", group: "Community & rewards" }
];

const ICON_GROUPS = [...new Set(PUSH_ICONS.map((i) => i.group))];

/** The picked icon, or the app's default for admin pushes (megaphone). */
export const pushIconFor = (key: string) => PUSH_ICONS.find((i) => i.key === key) ?? PUSH_ICONS[0];

const IconBadge: React.FC<{ icon: PushIcon; size?: number }> = ({ icon, size = 36 }) => (
  <span className="pn-icon-badge" style={{ width: size, height: size, background: `${icon.color}1F`, color: icon.color }}>
    <icon.Icon size={Math.round(size * 0.47)} />
  </span>
);

/** Selected icon + "Change", opening a labelled, grouped picker. */
export const IconPicker: React.FC<{ value: string; onChange: (key: string) => void }> = ({ value, onChange }) => {
  const { open, setOpen, ref } = usePopover();
  const current = pushIconFor(value);
  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
  };
  return (
    <div className="pn-pop-wrap" ref={ref}>
      <button type="button" className="pn-icon-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        <IconBadge icon={current} />
        <span className="pn-icon-trigger-text">
          <strong>{value ? current.label : "Automatic"}</strong>
          <small>{value ? "Shown next to the message in the app" : "Announcement icon (default)"}</small>
        </span>
        <span className="pn-icon-trigger-cta">
          Change <ChevronDown size={14} />
        </span>
      </button>
      {open && (
        <div className="pn-pop pn-icon-pop" role="dialog" aria-label="Choose an icon">
          <button type="button" className={`pn-icon-opt ${value === "" ? "is-active" : ""}`} onClick={() => pick("")}>
            <IconBadge icon={PUSH_ICONS[0]} size={30} />
            <span>Automatic</span>
            {value === "" && <Check size={14} className="pn-icon-check" />}
          </button>
          {ICON_GROUPS.map((group) => (
            <div key={group} className="pn-icon-group">
              <p>{group}</p>
              <div className="pn-icon-grid">
                {PUSH_ICONS.filter((i) => i.group === group).map((i) => (
                  <button
                    key={i.key}
                    type="button"
                    className={`pn-icon-opt ${value === i.key ? "is-active" : ""}`}
                    onClick={() => pick(i.key)}
                    aria-pressed={value === i.key}
                  >
                    <IconBadge icon={i} size={30} />
                    <span>{i.label}</span>
                    {value === i.key && <Check size={14} className="pn-icon-check" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ---------------------------------- Image --------------------------------- */

type LiveBanner = { id: string; title: string; subtitle: string | null; imageUrl: string | null; action: { type: string; value: string | null } };

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
// FCM's notification image limit; the backend enforces the same.
const MAX_BYTES = 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Live App CMS banners that have an image, from the public app config. */
function useLiveBanners() {
  const [banners, setBanners] = useState<LiveBanner[]>([]);
  useEffect(() => {
    if (!API_BASE) return;
    let alive = true;
    fetch(`${API_BASE}/api/app-config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const list: LiveBanner[] = body?.data?.banners ?? [];
        if (alive) setBanners(list.filter((b) => b.imageUrl?.startsWith("https://")));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return banners;
}

export type BannerPick = { title: string; body: string; image: string; route: string | null };

/**
 * Big-picture image: drag & drop / browse, paste a link, or reuse a live App
 * CMS banner (which can also fill an empty title / message / destination).
 */
export const ImageField: React.FC<{
  value: string;
  onChange: (url: string) => void;
  onUseBanner: (pick: BannerPick) => void;
  onError: (message: string) => void;
}> = ({ value, onChange, onUseBanner, onError }) => {
  const banners = useLiveBanners();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [panel, setPanel] = useState<"none" | "link" | "banners">("none");
  const [ratio, setRatio] = useState<number | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setRatio(null);
    setBroken(false);
  }, [value]);

  // A file dropped anywhere else on the page would make the browser open it
  // and throw the whole draft away, so block that while this field is shown.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return onError("Use a JPG, PNG or WebP image.");
    if (file.size > MAX_BYTES) return onError("Notification images must be 1 MB or smaller.");
    setUploading(true);
    try {
      onChange(await uploadNotificationImage(file));
      setPanel("none");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not upload the image.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const pickBanner = (b: LiveBanner) => {
    if (!b.imageUrl) return;
    onUseBanner({ title: b.title, body: b.subtitle ?? "", image: b.imageUrl, route: b.action.type === "route" ? b.action.value : null });
    setPanel("none");
  };

  const hasImage = value.startsWith("https://");
  const offShape = ratio !== null && (ratio < 1.6 || ratio > 2.6);

  return (
    <div className="pn-image">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />

      {hasImage ? (
        <div
          className="pn-image-preview"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!uploading) upload(e.dataTransfer.files?.[0]);
          }}
        >
          {broken ? (
            <div className="pn-image-broken">This link doesn&apos;t load as an image. Check it, or upload the file instead.</div>
          ) : (
            <img
              src={value}
              alt="Notification image"
              onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
              onError={() => setBroken(true)}
            />
          )}
          <div className="pn-image-actions">
            <button type="button" className="pn-chip-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="spin-icon" size={14} /> : <RefreshCw size={14} />} Replace
            </button>
            <button type="button" className="pn-chip-btn is-danger" onClick={() => onChange("")}>
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`pn-drop ${dragging ? "is-over" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files?.[0]);
          }}
          disabled={uploading}
        >
          <span className="pn-drop-icon">{uploading ? <Loader2 className="spin-icon" size={20} /> : <ImagePlus size={20} />}</span>
          <strong>{uploading ? "Uploading…" : "Drop an image here, or browse"}</strong>
          <small>JPG, PNG or WebP · up to 1 MB · 1200 × 600 (2:1) looks best</small>
        </button>
      )}

      {offShape && !broken && (
        <small className="pn-warn">This image isn&apos;t 2:1, so phones will crop its edges. 1200 × 600 fits best.</small>
      )}

      <div className="pn-image-links">
        <button type="button" className={`pn-text-btn ${panel === "link" ? "is-active" : ""}`} onClick={() => setPanel(panel === "link" ? "none" : "link")}>
          <Link2 size={14} /> Paste a link
        </button>
        {banners.length > 0 && (
          <button type="button" className={`pn-text-btn ${panel === "banners" ? "is-active" : ""}`} onClick={() => setPanel(panel === "banners" ? "none" : "banners")}>
            <Images size={14} /> Use an app banner
          </button>
        )}
      </div>

      {panel === "link" && (
        <input
          type="url"
          className="pn-image-url"
          value={value}
          autoFocus
          placeholder="https://…/image.jpg"
          onChange={(e) => onChange(e.target.value.trim())}
        />
      )}

      {panel === "banners" && (
        <div className="pn-banner-gallery">
          {banners.map((b) => (
            <button key={b.id} type="button" className={`pn-banner-opt ${value === b.imageUrl ? "is-active" : ""}`} onClick={() => pickBanner(b)} title={b.title}>
              <img src={b.imageUrl ?? ""} alt="" loading="lazy" />
              <span>{b.title}</span>
            </button>
          ))}
          <small className="pn-muted">Uses the banner&apos;s image, and fills an empty title, message or destination from it.</small>
        </div>
      )}
    </div>
  );
};
