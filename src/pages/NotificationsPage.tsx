import { isPendingApprovalError } from "../api/approval";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Copy,
  Inbox,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Smartphone,
  Sparkles,
  Store,
  UserPlus,
  Users,
  UsersRound,
  X,
  XCircle
} from "lucide-react";
import {
  AudienceCount,
  BroadcastAudience,
  BroadcastStatus,
  Pagination,
  PushBroadcast,
  PushData,
  PushSchedule,
  Recipient,
  ScheduleStatus,
  cancelBroadcast,
  cancelSchedule,
  createBroadcast,
  createSchedule,
  getAudienceCount,
  getSchedule,
  listBroadcasts,
  listSchedules,
  pauseSchedule,
  resumeSchedule,
  retryBroadcast,
  searchRecipients,
  sendTestNotification,
  updateSchedule
} from "../api/adminApi";
import { useNoticeToast } from "../components/Toast";
import {
  ScheduledList,
  WhenState,
  WhenStep,
  defaultWhen,
  describeWhen,
  toTiming,
  whenBlocker,
  whenFromSchedule
} from "./notifications/schedule";
import { EmojiButton, IconPicker, ImageField, insertAtCursor, pushIconFor, type BannerPick } from "./notifications/look";
import {
  StoreLinkFields,
  TapChip,
  iosStoreUrlError,
  storeLinkLabel,
  storeUrlError,
  tapFromData,
  tapPayload,
  type TapMode
} from "./notifications/storeLink";

/* ------------------------------ Constants ------------------------------ */

const TITLE_MAX = 100;
const BODY_MAX = 500;
// Roughly where phones start truncating on the lock screen.
const TITLE_SOFT = 45;
const BODY_SOFT = 140;
const MAX_PICKED = 5000;
const POLL_MS = 3000;
const DRAFT_KEY = "nura.pushDraft";

type Mode = "everyone" | "role" | "people";
type RoleAudience = "user" | "partner" | "doctor";

const ROLES: { value: RoleAudience; label: string }[] = [
  { value: "user", label: "App users" },
  { value: "partner", label: "Partners" },
  { value: "doctor", label: "Gynecologists" }
];

// Where a tap on the notification lands in the app. Values are plain in-app
// paths (The-Nura-App expo-router routes); the backend and the app both
// re-validate them as in-app paths. "" = the app's notifications list.
// Partner accounts are sent to their equivalent screen (Home/Tracker → shared
// overview, Community → forum), or to their notifications list when the
// screen has no partner equivalent.
const DESTINATIONS: { value: string; label: string }[] = [
  { value: "", label: "Notifications list (default)" },
  { value: "/home", label: "Home" },
  { value: "/tracker", label: "Cycle tracker / log today" },
  { value: "/insights", label: "Daily insights" },
  { value: "/predictions", label: "Predictions" },
  { value: "/community", label: "Community" },
  { value: "/blogs", label: "Blogs" },
  { value: "/reels", label: "Videos" },
  { value: "/habits", label: "Habits" },
  { value: "/forest", label: "Wellness forest" },
  { value: "/qa", label: "Ask Nura AI" },
  { value: "/consultation", label: "Book a consultation" },
  { value: "/government-schemes", label: "Government schemes" },
  { value: "/subscription", label: "My subscription / plans" }
];

const routeLabel = (route: string) => DESTINATIONS.find((d) => d.value === route)?.label ?? route;

// Quick fill for an "Update the app" push: text, icon and "Tap opens: App store".
const UPDATE_TEMPLATE = {
  title: "A new version of The Nura is here",
  body: "Update now for the latest features and fixes. Tap to open the store.",
  icon: "sparkles"
};

const MODES: { value: Mode; label: string; hint: string; icon: React.ReactNode }[] = [
  { value: "everyone", label: "Everyone", hint: "All active accounts", icon: <UsersRound size={18} /> },
  { value: "role", label: "By role", hint: "Users, partners or gynecs", icon: <Users size={18} /> },
  { value: "people", label: "Specific people", hint: "One or a few accounts", icon: <UserPlus size={18} /> }
];

const STATUS_PILL: Record<BroadcastStatus, string> = {
  queued: "gy-pill-muted",
  running: "gy-pill-info",
  completed: "gy-pill-ok",
  failed: "gy-pill-danger",
  cancelled: "gy-pill-warn"
};

const STATUS_LABEL: Record<BroadcastStatus, string> = {
  queued: "Queued",
  running: "Sending",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled"
};

/* ------------------------------- Helpers ------------------------------- */

const isActive = (b: PushBroadcast) => b.status === "queued" || b.status === "running";
const isBulk = (b: PushBroadcast) => b.audience !== "selected";

const fullName = (u: { firstName?: string; lastName?: string; email?: string }) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Unnamed user";

const initials = (u: Recipient) =>
  (fullName(u)
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2) || "?").toUpperCase();

const relativeTime = (iso?: string | null) => {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  if (diff < 7 * 86400) return `${Math.round(diff / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const progressPct = (b: PushBroadcast) => {
  if (b.status === "completed") return 100;
  if (!b.totalUsers) return 0;
  return Math.min(100, Math.round((b.processedUsers / b.totalUsers) * 100));
};

const audienceText = (b: PushBroadcast) => {
  if (b.audience === "all") return "Everyone";
  if (b.audience === "selected") {
    const names = b.recipientPreview ?? [];
    const extra = b.totalUsers - names.length;
    if (names.length === 0) return `${b.totalUsers} selected`;
    return extra > 0 ? `${names.join(", ")} +${extra} more` : names.join(", ");
  }
  return ROLES.find((r) => r.value === b.audience)?.label ?? b.audience;
};

const scheduleAudienceText = (s: PushSchedule) => {
  if (s.audience === "all") return "Everyone";
  if (s.audience === "selected") return s.recipientPreview?.join(", ") || "Selected people";
  return ROLES.find((r) => r.value === s.audience)?.label ?? s.audience;
};

const UPCOMING: ScheduleStatus[] = ["active", "paused"];
const ENDED: ScheduleStatus[] = ["completed", "cancelled"];

const fmt = (n: number) => n.toLocaleString();

type Draft = {
  title: string;
  body: string;
  route: string;
  icon: string;
  image: string;
  tap: TapMode;
  storeUrl: string;
  iosStoreUrl: string;
};

const EMPTY_DRAFT: Draft = {
  title: "",
  body: "",
  route: "",
  icon: "",
  image: "",
  tap: "route",
  storeUrl: "",
  iosStoreUrl: ""
};

const loadDraft = (): Draft => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<Draft>;
      return {
        title: d.title ?? "",
        body: d.body ?? "",
        route: d.route ?? "",
        icon: d.icon ?? "",
        image: d.image ?? "",
        tap: d.tap === "store" ? "store" : "route",
        storeUrl: d.storeUrl ?? "",
        iosStoreUrl: d.iosStoreUrl ?? ""
      };
    }
  } catch {
    /* storage unavailable */
  }
  return EMPTY_DRAFT;
};

const saveDraft = (d: Draft) => {
  try {
    if (d.title || d.body || d.route || d.icon || d.image || d.tap === "store" || d.storeUrl || d.iosStoreUrl)
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
};

/* --------------------------- Recipient picker --------------------------- */

const RecipientPicker: React.FC<{
  picked: Recipient[];
  onAdd: (u: Recipient) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}> = ({ picked, onAdd, onRemove, onClear }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Recipient[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const pickedIds = useMemo(() => new Set(picked.map((p) => p._id)), [picked]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      searchRecipients(q)
        .then((res) => {
          if (cancelled) return;
          setResults(res.users);
          setHighlight(0);
        })
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (u: Recipient) => {
    if (!pickedIds.has(u._id)) onAdd(u);
    setQuery("");
    setResults([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(results.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const noDevice = picked.filter((p) => p.hasDevice === false).length;
  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="pn-picker" ref={boxRef}>
      <div className="pn-search">
        <Search size={16} />
        <input
          value={query}
          placeholder="Search by name, email or phone…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Search recipients"
          disabled={picked.length >= MAX_PICKED}
        />
        {searching && <Loader2 size={16} className="spin-icon" />}
      </div>

      {showDropdown && (
        <div className="pn-results" role="listbox">
          {!searching && results.length === 0 && (
            <div className="pn-results-empty">No active accounts match “{query.trim()}”.</div>
          )}
          {results.map((u, i) => {
            const already = pickedIds.has(u._id);
            return (
              <button
                key={u._id}
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={`pn-result ${i === highlight ? "is-hl" : ""}`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(u)}
                disabled={already}
              >
                <span className="pn-avatar">{initials(u)}</span>
                <span className="pn-result-main">
                  <span className="pn-result-name">{fullName(u)}</span>
                  <span className="pn-result-sub">
                    {u.email || u.phone || "—"} · <span className="pn-role">{u.role}</span>
                  </span>
                </span>
                {already ? (
                  <span className="pn-badge pn-badge-ok">Added</span>
                ) : u.hasDevice ? (
                  <span className="pn-badge pn-badge-ok">
                    <Smartphone size={12} /> Device
                  </span>
                ) : (
                  <span className="pn-badge" title="Hasn't logged into the app — inbox only">
                    Inbox only
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {picked.length > 0 ? (
        <>
          <div className="pn-chips">
            {picked.map((p) => (
              <span
                key={p._id}
                className={`pn-chip ${p.hasDevice === false ? "pn-chip-muted" : ""}`}
                title={p.hasDevice === false ? "No registered device — inbox only" : p.email}
              >
                <span className="pn-avatar pn-avatar-sm">{initials(p)}</span>
                {fullName(p)}
                <button type="button" aria-label={`Remove ${fullName(p)}`} onClick={() => onRemove(p._id)}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div className="pn-picker-foot">
            <span>
              {fmt(picked.length)} selected
              {noDevice > 0 && ` · ${noDevice} without the app (inbox only)`}
            </span>
            <button type="button" className="gy-link" onClick={onClear}>
              Clear all
            </button>
          </div>
        </>
      ) : (
        <p className="pn-hint">Add one person for a direct message, or several for a small group.</p>
      )}
    </div>
  );
};

/* ---------------------------- Phone preview ---------------------------- */

const PhonePreview: React.FC<{ title: string; body: string; icon: string; image: string }> = ({
  title,
  body,
  icon,
  image
}) => {
  const { Icon, color } = pushIconFor(icon);
  return (
  <div className="pn-phone" aria-label="Notification preview">
    <div className="pn-phone-notch" />
    <div className="pn-phone-time">
      {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </div>
    <div className="pn-notif">
      <div className="pn-notif-head">
        <img src="/images/logo.png" alt="" className="pn-notif-icon" />
        <span>THE NURA CARE</span>
        <span className="pn-notif-now">now</span>
      </div>
      <div className="pn-notif-title">{title || "Your notification title"}</div>
      <div className="pn-notif-body">{body || "Your message will appear here."}</div>
      {image.startsWith("https://") && <img className="pn-notif-image" src={image} alt="" />}
    </div>
    <p className="pn-phone-label">In the app&apos;s notification list</p>
    <div className="pn-inapp">
      <span className="pn-inapp-icon" style={{ background: `${color}1F`, color }}>
        <Icon size={16} />
      </span>
      <div className="pn-inapp-text">
        <div className="pn-inapp-head">
          <strong>{title || "Your notification title"}</strong>
          <span>now</span>
        </div>
        <span className="pn-inapp-body">{body || "Your message will appear here."}</span>
        {image.startsWith("https://") && <img src={image} alt="" />}
      </div>
    </div>
  </div>
  );
};

/* --------------------------------- Page -------------------------------- */

export const NotificationsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const initialDraft = useMemo(loadDraft, []);

  const [title, setTitle] = useState(initialDraft.title);
  const [body, setBody] = useState(initialDraft.body);
  const [mode, setMode] = useState<Mode>("everyone");
  const [role, setRole] = useState<RoleAudience>("user");
  const [picked, setPicked] = useState<Recipient[]>([]);
  const [saveToInbox, setSaveToInbox] = useState(true);
  const [route, setRoute] = useState(initialDraft.route);
  const [icon, setIcon] = useState(initialDraft.icon);
  const [image, setImage] = useState(initialDraft.image);
  // What a tap opens: a screen in the app (route) or an app store (update push).
  const [tap, setTap] = useState<TapMode>(initialDraft.tap);
  const [storeUrl, setStoreUrl] = useState(initialDraft.storeUrl);
  const [iosStoreUrl, setIosStoreUrl] = useState(initialDraft.iosStoreUrl);
  const [showTest, setShowTest] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [when, setWhen] = useState<WhenState>(defaultWhen);
  // The saved schedule being edited in the composer, if any.
  const [editing, setEditing] = useState<PushSchedule | null>(null);

  const [schedules, setSchedules] = useState<PushSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [showEnded, setShowEnded] = useState(false);

  const [counts, setCounts] = useState<AudienceCount | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [broadcasts, setBroadcasts] = useState<PushBroadcast[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useNoticeToast(notice, () => setNotice(null));

  const composeRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(
    () => saveDraft({ title, body, route, icon, image, tap, storeUrl, iosStoreUrl }),
    [title, body, route, icon, image, tap, storeUrl, iosStoreUrl]
  );

  // A user handed over from the Users page ("Send push notification").
  useEffect(() => {
    const recipient = (location.state as { recipient?: Recipient } | null)?.recipient;
    if (!recipient) return;
    setMode("people");
    setPicked((prev) => (prev.some((p) => p._id === recipient._id) ? prev : [...prev, recipient]));
    navigate(location.pathname, { replace: true, state: null });
    // Look up whether they have a device (the Users list doesn't include it).
    if (recipient.email) {
      searchRecipients(recipient.email)
        .then((res) => {
          const match = res.users.find((u) => u._id === recipient._id);
          if (match) setPicked((prev) => prev.map((p) => (p._id === match._id ? match : p)));
        })
        .catch(() => undefined);
    }
  }, [location.state, location.pathname, navigate]);

  const loadHistory = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await listBroadcasts(page);
        setBroadcasts(res.broadcasts);
        setPagination(res.pagination);
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : "Failed to load history.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [page]
  );

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const loadSchedules = useCallback(
    async (silent = false) => {
      if (!silent) setSchedulesLoading(true);
      try {
        const res = await listSchedules(showEnded ? ENDED : UPCOMING, 1, 50);
        setSchedules(res.schedules);
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : "Failed to load scheduled pushes.");
      } finally {
        if (!silent) setSchedulesLoading(false);
      }
    },
    [showEnded]
  );

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // Pick up sends a schedule fires while this page is open.
  useEffect(() => {
    if (!schedules.some((x) => x.status === "active")) return;
    const handle = setInterval(() => {
      loadSchedules(true);
      loadHistory(true);
    }, 60_000);
    return () => clearInterval(handle);
  }, [schedules, loadSchedules, loadHistory]);

  const countAudience: Exclude<BroadcastAudience, "selected"> = mode === "role" ? role : "all";
  useEffect(() => {
    if (mode === "people") return;
    let cancelled = false;
    setCountLoading(true);
    getAudienceCount(countAudience)
      .then((c) => !cancelled && setCounts(c))
      .catch(() => !cancelled && setCounts(null))
      .finally(() => !cancelled && setCountLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mode, countAudience]);

  const hasActive = broadcasts.some(isActive);
  const bulkActive = broadcasts.find((b) => isActive(b) && isBulk(b));
  useEffect(() => {
    if (!hasActive) return;
    const handle = setInterval(() => loadHistory(true), POLL_MS);
    return () => clearInterval(handle);
  }, [hasActive, loadHistory]);

  /* ----- derived ----- */
  const t = title.trim();
  const b = body.trim();
  const reach =
    mode === "people"
      ? { users: picked.length, devices: picked.filter((p) => p.hasDevice !== false).length }
      : counts
        ? { users: counts.totalUsers, devices: counts.totalWithToken }
        : null;

  const blockers: string[] = [];
  if (!t) blockers.push("Add a title");
  if (!b) blockers.push("Write a message");
  if (image && !image.startsWith("https://")) blockers.push("Image link must start with https://");
  const storeError = tap === "store" ? storeUrlError(storeUrl) ?? iosStoreUrlError(iosStoreUrl) : null;
  if (storeError) blockers.push(storeError);
  if (mode === "people" && picked.length === 0) blockers.push("Pick at least one recipient");
  if (mode !== "people" && bulkActive && when.mode === "now")
    blockers.push("Wait for the current broadcast to finish");
  const timingBlocker = whenBlocker(when, editing?.startAt);
  if (timingBlocker) blockers.push(timingBlocker);
  if (mode !== "people" && reach?.users === 0) blockers.push("No one matches this audience");
  if (counts && !counts.fcmConfigured) blockers.push("Push isn't configured on the server");
  const canReview = blockers.length === 0 && !sending;
  const scheduling = when.mode === "later";

  const audienceLabel =
    mode === "everyone"
      ? "Everyone"
      : mode === "role"
        ? ROLES.find((r) => r.value === role)?.label ?? role
        : picked.length === 1
          ? fullName(picked[0])
          : `${picked.length} selected people`;

  /* ----- actions ----- */
  const handleTest = async () => {
    setError(null);
    if (!t || !b) return setError("Add a title and message before sending a test.");
    if (!testEmail.trim()) return setError("Enter the email of the account to test on.");
    if (storeError) return setError(storeError);
    setTesting(true);
    try {
      const { detailsHidden } = await sendTestNotification({
        title: t,
        body: b,
        email: testEmail.trim(),
        ...tapPayload(tap, route, storeUrl, iosStoreUrl),
        icon: icon || undefined,
        image: image || undefined
      });
      setNotice(
        detailsHidden
          ? `Test sent to ${testEmail.trim()}. That account hides notification details, so the phone shows "You have a new update" instead of your text.`
          : `Test sent to ${testEmail.trim()} — check that phone.`
      );
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not send the test.");
    } finally {
      setTesting(false);
    }
  };

  const resetComposer = () => {
    setTitle("");
    setBody("");
    setPicked([]);
    setRoute("");
    setIcon("");
    setImage("");
    setTap("route");
    setStoreUrl("");
    setIosStoreUrl("");
    setWhen(defaultWhen());
    setEditing(null);
  };

  const handleSend = async () => {
    setSending(true);
    setError(null);
    const input = {
      title: t,
      body: b,
      audience: mode === "people" ? ("selected" as const) : countAudience,
      userIds: mode === "people" ? picked.map((p) => p._id) : undefined,
      saveToInbox,
      ...tapPayload(tap, route, storeUrl, iosStoreUrl),
      icon: icon || undefined,
      image: image || undefined
    };
    try {
      if (scheduling) {
        if (editing) await updateSchedule(editing._id, { ...input, ...toTiming(when) });
        else await createSchedule({ ...input, ...toTiming(when) });
        setConfirming(false);
        setNotice(editing ? "Schedule updated." : `Scheduled: ${describeWhen(when)}.`);
        resetComposer();
        if (showEnded) setShowEnded(false);
        else await loadSchedules(true);
        return;
      }
      await createBroadcast(input);
      setConfirming(false);
      setNotice(
        mode === "people"
          ? `Sending to ${audienceLabel}. Track delivery in the history below.`
          : "Broadcast started — it's sending in the background. You can leave this page."
      );
      resetComposer();
      if (page === 1) await loadHistory(true);
      else setPage(1);
    } catch (err) {
      setConfirming(false);
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not start the send.");
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async (item: PushBroadcast) => {
    if (!window.confirm(`Stop sending “${item.title}”? People already notified won't be affected.`))
      return;
    setBusyId(item._id);
    setError(null);
    try {
      await cancelBroadcast(item._id);
      await loadHistory(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRetry = async (item: PushBroadcast) => {
    setBusyId(item._id);
    setError(null);
    try {
      await retryBroadcast(item._id);
      setNotice("Resumed from where it stopped — people already notified are skipped.");
      await loadHistory(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resume.");
    } finally {
      setBusyId(null);
    }
  };

  const applyTap = (data?: PushData | null) => {
    const next = tapFromData(data);
    setTap(next.mode);
    setRoute(next.route);
    setStoreUrl(next.storeUrl);
    setIosStoreUrl(next.iosStoreUrl);
  };

  const handleReuse = (item: PushBroadcast | PushSchedule) => {
    setTitle(item.title);
    setBody(item.body);
    applyTap(item.data);
    setIcon(item.data?.icon ?? "");
    setImage(item.data?.image ?? "");
    setSaveToInbox(item.saveToInbox);
    composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Fill from a live App CMS banner: always its image, plus title / message /
  // destination where the composer doesn't have one yet.
  const handleUseBanner = (pick: BannerPick) => {
    setImage(pick.image);
    if (!title.trim()) setTitle(pick.title.slice(0, TITLE_MAX));
    if (!body.trim() && pick.body) setBody(pick.body.slice(0, BODY_MAX));
    if (tap === "route" && !route && pick.route) {
      // Banners use expo-router group paths ("/(app)/(dashboard)/tracker").
      const path = pick.route.replace(/\/\([^)]*\)/g, "") || "/";
      if (DESTINATIONS.some((d) => d.value === path)) setRoute(path);
    }
  };

  // Load a saved schedule into the composer; "Review & save" then updates it.
  const handleEdit = async (item: PushSchedule) => {
    setBusyId(item._id);
    setError(null);
    try {
      const { schedule, recipients } = await getSchedule(item._id);
      setTitle(schedule.title);
      setBody(schedule.body);
      applyTap(schedule.data);
      setIcon(schedule.data?.icon ?? "");
      setImage(schedule.data?.image ?? "");
      setSaveToInbox(schedule.saveToInbox);
      if (schedule.audience === "selected") {
        setMode("people");
        setPicked(recipients);
      } else if (schedule.audience === "all") {
        setMode("everyone");
      } else {
        setMode("role");
        setRole(schedule.audience as RoleAudience);
      }
      setWhen(whenFromSchedule(schedule));
      setEditing(schedule);
      composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that schedule.");
    } finally {
      setBusyId(null);
    }
  };

  const runScheduleAction = async (
    item: PushSchedule,
    action: (id: string) => Promise<unknown>,
    done: string
  ) => {
    setBusyId(item._id);
    setError(null);
    try {
      await action(item._id);
      setNotice(done);
      if (editing?._id === item._id && action === cancelSchedule) resetComposer();
      await loadSchedules(true);
    } catch (err) {
      if (isPendingApprovalError(err)) {
        setNotice(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not update the schedule.");
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdateTemplate = () => {
    const hasText = title.trim() || body.trim();
    if (hasText && !window.confirm("Replace the title and message with the “New version available” template?")) return;
    setTitle(UPDATE_TEMPLATE.title);
    setBody(UPDATE_TEMPLATE.body);
    setIcon(UPDATE_TEMPLATE.icon);
    setTap("store");
  };

  const handleCancelSchedule = (item: PushSchedule) => {
    if (!window.confirm(`Cancel “${item.title}”? No further sends will go out.`)) return;
    runScheduleAction(item, cancelSchedule, "Schedule cancelled.");
  };

  /* ----- render ----- */
  return (
    <div className="workspace-page pn-page">
      <div className="admin-page-head">
        <div>
          <p className="eyebrow">Engagement</p>
          <h2>Push Notifications</h2>
          <p className="subtitle-text">
            Message everyone, a group, or a single person — now, later, or on repeat. Large sends
            go out in batches in the background — you can leave this page while they deliver.
          </p>
        </div>
      </div>

      {error && (
        <div className="gy-alert gy-alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" className="pn-alert-close" onClick={() => setError(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
      {counts && !counts.fcmConfigured && (
        <div className="gy-alert gy-alert-warn">
          <AlertTriangle size={16} />
          <span>Firebase isn't configured on the server, so notifications can't be sent.</span>
        </div>
      )}

      {bulkActive && (
        <div className="pn-live">
          <div className="pn-live-top">
            <span className="pn-live-dot" />
            <strong>Sending “{bulkActive.title}”</strong>
            <span className="pn-muted">to {audienceText(bulkActive)}</span>
            <span className="pn-live-pct">{progressPct(bulkActive)}%</span>
          </div>
          <div className="pn-progress">
            <div className="pn-progress-fill" style={{ width: `${progressPct(bulkActive)}%` }} />
          </div>
          <div className="pn-live-foot">
            <span>
              {fmt(bulkActive.processedUsers)} of {fmt(bulkActive.totalUsers)} people ·{" "}
              {fmt(bulkActive.sentCount)} delivered
            </span>
            {!bulkActive.cancelRequested ? (
              <button
                type="button"
                className="gy-link"
                disabled={busyId === bulkActive._id}
                onClick={() => handleCancel(bulkActive)}
              >
                Stop sending
              </button>
            ) : (
              <span>Stopping after this batch…</span>
            )}
          </div>
        </div>
      )}

      <div className="pn-layout">
        <section className="pn-card" ref={composeRef}>
          {editing && (
            <div className="pn-editing">
              <Pencil size={14} />
              <span>
                Editing scheduled push <strong>“{editing.title}”</strong>
              </span>
              <button type="button" className="gy-link" onClick={resetComposer}>
                Stop editing
              </button>
            </div>
          )}
          {/* Step 1 — recipients */}
          <div className="pn-step">
            <div className="pn-step-head">
              <span className="pn-step-num">1</span>
              <h3>Who should get it?</h3>
            </div>

            <div className="pn-modes" role="radiogroup" aria-label="Recipients">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.value}
                  className={`pn-mode ${mode === m.value ? "is-active" : ""}`}
                  onClick={() => setMode(m.value)}
                >
                  <span className="pn-mode-icon">{m.icon}</span>
                  <span className="pn-mode-label">{m.label}</span>
                  <span className="pn-mode-hint">{m.hint}</span>
                </button>
              ))}
            </div>

            {mode === "role" && (
              <div className="admin-filter-row pn-roles">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={`admin-chip ${role === r.value ? "is-active" : ""}`}
                    onClick={() => setRole(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            {mode === "people" && (
              <RecipientPicker
                picked={picked}
                onAdd={(u) => setPicked((prev) => [...prev, u])}
                onRemove={(id) => setPicked((prev) => prev.filter((p) => p._id !== id))}
                onClear={() => setPicked([])}
              />
            )}

            {mode !== "people" && (
              <div className="pn-reach">
                {countLoading || !reach ? (
                  <>
                    <Loader2 size={14} className="spin-icon" /> Counting recipients…
                  </>
                ) : (
                  <>
                    <Users size={14} />
                    <span>
                      <strong>{fmt(reach.users)}</strong> active accounts ·{" "}
                      <strong>{fmt(reach.devices)}</strong> with the app installed
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Step 2 — message */}
          <div className="pn-step">
            <div className="pn-step-head">
              <span className="pn-step-num">2</span>
              <h3>Write the message</h3>
            </div>

            <div className="pn-templates">
              <span>Quick template:</span>
              <button type="button" className="admin-chip" onClick={handleUpdateTemplate}>
                <Sparkles size={13} /> New version available
              </button>
            </div>

            <div className="pn-field">
              <span className="pn-label-row">
                <label htmlFor="pn-title">Title</label>
                <span className="pn-label-tools">
                  <EmojiButton
                    label="Add emoji to the title"
                    onPick={(e) => insertAtCursor(titleRef.current, title, e, TITLE_MAX, setTitle)}
                  />
                  <span className={`pn-count ${title.length > TITLE_SOFT ? "is-warn" : ""}`}>
                    {title.length}/{TITLE_MAX}
                  </span>
                </span>
              </span>
              <input
                id="pn-title"
                ref={titleRef}
                value={title}
                maxLength={TITLE_MAX}
                placeholder="e.g. Welcome to The Nura Care"
                onChange={(e) => setTitle(e.target.value)}
              />
              {title.length > TITLE_SOFT && (
                <small className="pn-warn">Titles over ~{TITLE_SOFT} characters get cut off on most phones.</small>
              )}
            </div>

            <div className="pn-field">
              <span className="pn-label-row">
                <label htmlFor="pn-body">Message</label>
                <span className="pn-label-tools">
                  <EmojiButton
                    label="Add emoji to the message"
                    onPick={(e) => insertAtCursor(bodyRef.current, body, e, BODY_MAX, setBody)}
                  />
                  <span className={`pn-count ${body.length > BODY_SOFT ? "is-warn" : ""}`}>
                    {body.length}/{BODY_MAX}
                  </span>
                </span>
              </span>
              <textarea
                id="pn-body"
                ref={bodyRef}
                value={body}
                rows={4}
                maxLength={BODY_MAX}
                placeholder="e.g. Your period is expected in 2 days — log how you're feeling today."
                onChange={(e) => setBody(e.target.value)}
              />
              {body.length > BODY_SOFT && (
                <small className="pn-warn">Only the first ~{BODY_SOFT} characters show before the user expands it.</small>
              )}
            </div>

            <div className="pn-field">
              <span className="pn-label-row">
                <span>Tap opens</span>
              </span>
              <div className="pn-modes pn-modes-2" role="radiogroup" aria-label="Tap opens">
                <button
                  type="button"
                  role="radio"
                  aria-checked={tap === "route"}
                  className={`pn-mode ${tap === "route" ? "is-active" : ""}`}
                  onClick={() => setTap("route")}
                >
                  <span className="pn-mode-icon">
                    <Smartphone size={18} />
                  </span>
                  <span className="pn-mode-label">Screen in the app</span>
                  <span className="pn-mode-hint">Home, tracker, blogs…</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={tap === "store"}
                  className={`pn-mode ${tap === "store" ? "is-active" : ""}`}
                  onClick={() => setTap("store")}
                >
                  <span className="pn-mode-icon">
                    <Store size={18} />
                  </span>
                  <span className="pn-mode-label">App store (update)</span>
                  <span className="pn-mode-hint">Play Store / App Store page</span>
                </button>
              </div>
            </div>

            {tap === "route" ? (
              <label className="pn-field">
                <span className="pn-label-row">
                  <span>Opens in the app</span>
                </span>
                <select value={route} onChange={(e) => setRoute(e.target.value)}>
                  {DESTINATIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <small className="pn-muted">The screen people land on when they tap the notification.</small>
              </label>
            ) : (
              <StoreLinkFields
                storeUrl={storeUrl}
                iosStoreUrl={iosStoreUrl}
                onStoreUrl={setStoreUrl}
                onIosStoreUrl={setIosStoreUrl}
              />
            )}

            <div className="pn-field">
              <span className="pn-label-row">
                <span>Icon</span>
              </span>
              <IconPicker value={icon} onChange={setIcon} />
            </div>

            <div className="pn-field">
              <span className="pn-label-row">
                <span>Banner image</span>
                <span className="pn-muted">Optional</span>
              </span>
              <ImageField value={image} onChange={setImage} onUseBanner={handleUseBanner} onError={setError} />
            </div>

            <label className="gy-switch pn-inbox">
              <input type="checkbox" checked={saveToInbox} onChange={(e) => setSaveToInbox(e.target.checked)} />
              <span className="gy-switch-track" aria-hidden />
              <span>
                <Inbox size={14} /> Also save to the in-app notification list
                <small className="pn-muted"> — reaches people who have push turned off</small>
              </span>
            </label>
          </div>

          {/* Step 3 — when */}
          <div className="pn-step">
            <div className="pn-step-head">
              <span className="pn-step-num">3</span>
              <h3>When should it go out?</h3>
            </div>
            <WhenStep value={when} onChange={setWhen} lockLater={!!editing} />
          </div>

          {/* Step 4 — test & send */}
          <div className="pn-step pn-step-last">
            <div className="pn-step-head">
              <span className="pn-step-num">4</span>
              <h3>Test & {scheduling ? "schedule" : "send"}</h3>
            </div>

            {showTest ? (
              <div className="pn-test">
                <input
                  type="email"
                  value={testEmail}
                  placeholder="Your account email"
                  onChange={(e) => setTestEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleTest())}
                />
                <button type="button" className="gy-btn gy-btn-ghost" onClick={handleTest} disabled={testing}>
                  {testing ? <Loader2 className="spin-icon" size={16} /> : <Smartphone size={16} />} Send test
                </button>
              </div>
            ) : (
              <button type="button" className="gy-link pn-test-toggle" onClick={() => setShowTest(true)}>
                <Smartphone size={14} /> Send a test to my phone first
              </button>
            )}

            <div className="pn-send-row">
              <span className="pn-muted">
                {blockers.length > 0
                  ? blockers[0]
                  : `Ready to ${scheduling ? "schedule for" : "send to"} ${audienceLabel}`}
              </span>
              <button
                type="button"
                className="gy-btn gy-btn-primary"
                disabled={!canReview}
                onClick={() => setConfirming(true)}
              >
                {scheduling ? <CalendarClock size={16} /> : <Send size={16} />}{" "}
                {editing ? "Review & save" : scheduling ? "Review & schedule" : "Review & send"}
              </button>
            </div>
          </div>
        </section>

        <aside className="pn-aside">
          <p className="pn-aside-label">Lock-screen preview</p>
          <PhonePreview title={t} body={b} icon={icon} image={image} />
          <p className="pn-aside-note">
            Appearance varies by device. Send a test to see it exactly as users will.
          </p>
        </aside>
      </div>

      {/* Scheduled */}
      <div className="pn-history-head">
        <h3 className="admin-section-title">Scheduled & repeating</h3>
        <div className="admin-filter-row pn-roles">
          <button
            type="button"
            className={`admin-chip ${!showEnded ? "is-active" : ""}`}
            onClick={() => setShowEnded(false)}
          >
            Upcoming
          </button>
          <button
            type="button"
            className={`admin-chip ${showEnded ? "is-active" : ""}`}
            onClick={() => setShowEnded(true)}
          >
            Ended
          </button>
        </div>
      </div>
      <ScheduledList
        schedules={schedules}
        loading={schedulesLoading}
        busyId={busyId}
        audienceText={scheduleAudienceText}
        routeLabel={routeLabel}
        onEdit={handleEdit}
        onReuse={handleReuse}
        onPause={(item) => runScheduleAction(item, pauseSchedule, "Schedule paused.")}
        onResume={(item) => runScheduleAction(item, resumeSchedule, "Schedule resumed.")}
        onCancel={handleCancelSchedule}
      />

      {/* History */}
      <div className="pn-history-head">
        <h3 className="admin-section-title">History</h3>
        <button type="button" className="gy-btn gy-btn-ghost" onClick={() => loadHistory()} disabled={loading}>
          {loading ? <Loader2 className="spin-icon" size={14} /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>

      {loading ? (
        <div className="gy-empty">
          <Loader2 className="spin-icon" size={22} />
          <p>Loading history…</p>
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="gy-empty pn-empty">
          <Bell size={28} />
          <p>Nothing sent yet. Your notifications will appear here with live delivery stats.</p>
        </div>
      ) : (
        <div className="pn-history">
          {broadcasts.map((item) => {
            const pct = progressPct(item);
            return (
              <article key={item._id} className="pn-item">
                <div className="pn-item-top">
                  <span className={`gy-pill ${STATUS_PILL[item.status]}`}>
                    {item.status === "running" && item.cancelRequested ? "Stopping" : STATUS_LABEL[item.status]}
                  </span>
                  <span className="pn-item-aud">
                    {item.audience === "selected" ? <UserPlus size={13} /> : <Users size={13} />}
                    {audienceText(item)}
                  </span>
                  <TapChip data={item.data} routeLabel={routeLabel} />
                  {item.scheduleId && (
                    <span className="pn-item-aud" title="Sent by a scheduled push">
                      <CalendarClock size={13} /> Scheduled
                    </span>
                  )}
                  <span className="pn-item-when" title={new Date(item.createdAt).toLocaleString()}>
                    {relativeTime(item.createdAt)}
                    {item.createdBy && ` · ${fullName(item.createdBy)}`}
                  </span>
                </div>

                <div className="pn-item-title">{item.title}</div>
                <div className="pn-item-body">{item.body}</div>

                {(isActive(item) || item.status === "failed" || item.status === "cancelled") && (
                  <div className="pn-progress pn-progress-sm">
                    <div
                      className={`pn-progress-fill ${item.status === "failed" ? "is-danger" : ""}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}

                <div className="pn-stats">
                  <span>
                    <strong>{fmt(item.sentCount)}</strong> delivered
                  </span>
                  <span>
                    <strong>{fmt(item.processedUsers)}</strong> of {fmt(item.totalUsers)} people
                  </span>
                  {item.failedCount > 0 && (
                    <span title="Devices that couldn't be reached (app uninstalled or notifications off)">
                      <strong>{fmt(item.failedCount)}</strong> unreachable
                    </span>
                  )}
                  {item.saveToInbox && (
                    <span>
                      <Inbox size={12} /> {fmt(item.inboxCount)} in inbox
                    </span>
                  )}
                </div>

                {item.lastError && <div className="pn-item-error">{item.lastError}</div>}

                <div className="pn-item-actions">
                  <button type="button" className="gy-link" onClick={() => handleReuse(item)}>
                    <Copy size={13} /> Reuse message
                  </button>
                  {isActive(item) && !item.cancelRequested && (
                    <button
                      type="button"
                      className="gy-link pn-danger"
                      disabled={busyId === item._id}
                      onClick={() => handleCancel(item)}
                    >
                      <XCircle size={13} /> Stop
                    </button>
                  )}
                  {item.status === "failed" && (
                    <button
                      type="button"
                      className="gy-link"
                      disabled={busyId === item._id || (isBulk(item) && !!bulkActive)}
                      onClick={() => handleRetry(item)}
                    >
                      <RotateCcw size={13} /> Resume
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="admin-pagination">
          <button
            type="button"
            className="gy-btn gy-btn-ghost"
            disabled={!pagination.hasPrevPage}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <span className="admin-page-indicator">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            type="button"
            className="gy-btn gy-btn-ghost"
            disabled={!pagination.hasNextPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Review modal */}
      {confirming && (
        <div className="modal-overlay" onClick={() => !sending && setConfirming(false)}>
          <section
            className="pn-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pn-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pn-modal-head">
              <h3 id="pn-confirm-title">
                {editing ? "Review changes" : scheduling ? "Review before scheduling" : "Review before sending"}
              </h3>
              <button type="button" className="gy-icon-btn" onClick={() => setConfirming(false)} disabled={sending}>
                <X size={18} />
              </button>
            </div>

            <PhonePreview title={t} body={b} icon={icon} image={image} />

            <dl className="pn-summary">
              <div>
                <dt>Recipients</dt>
                <dd>{audienceLabel}</dd>
              </div>
              <div>
                <dt>Accounts</dt>
                <dd>{reach ? fmt(reach.users) : "—"}</dd>
              </div>
              <div>
                <dt>Push to devices</dt>
                <dd>{reach ? `${mode === "people" ? "" : "≈ "}${fmt(reach.devices)}` : "—"}</dd>
              </div>
              <div>
                <dt>Opens</dt>
                <dd>
                  {tap === "store"
                    ? storeUrl.trim() || iosStoreUrl.trim()
                      ? storeLinkLabel({ storeUrl: storeUrl.trim(), iosStoreUrl: iosStoreUrl.trim() })
                      : "App store (links from App settings)"
                    : routeLabel(route)}
                </dd>
              </div>
              <div>
                <dt>Icon</dt>
                <dd>{icon ? pushIconFor(icon).label : "Default"}</dd>
              </div>
              <div>
                <dt>Banner image</dt>
                <dd>{image ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>In-app inbox</dt>
                <dd>{saveToInbox ? "Yes" : "No"}</dd>
              </div>
              <div className="pn-summary-wide">
                <dt>When</dt>
                <dd title={describeWhen(when)}>{describeWhen(when)}</dd>
              </div>
            </dl>

            {mode !== "people" && reach && reach.users > 1 && (
              <div className="gy-alert gy-alert-warn">
                <AlertTriangle size={16} />
                <span>
                  {scheduling
                    ? `Each send goes to about ${fmt(reach.users)} people. You can pause or cancel the schedule any time before it fires.`
                    : `This goes to ${fmt(reach.users)} people and can't be unsent. You can stop it midway, but anyone already notified keeps the message.`}
                </span>
              </div>
            )}

            <div className="pn-modal-actions">
              <button type="button" className="gy-btn gy-btn-ghost" onClick={() => setConfirming(false)} disabled={sending}>
                Keep editing
              </button>
              <button type="button" className="gy-btn gy-btn-primary" onClick={handleSend} disabled={sending} autoFocus>
                {sending ? (
                  <Loader2 className="spin-icon" size={16} />
                ) : scheduling ? (
                  <CalendarClock size={16} />
                ) : (
                  <Send size={16} />
                )}
                {editing
                  ? " Save changes"
                  : scheduling
                    ? " Schedule"
                    : reach
                      ? ` Send to ${fmt(reach.users)} ${reach.users === 1 ? "person" : "people"}`
                      : " Send"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
