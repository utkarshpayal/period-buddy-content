import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, CheckCircle2, Clock, Copy, Gift, Hourglass, Loader2, MessageCircle, Send, Sparkles, Undo2, UserPlus, Users } from "lucide-react";
import { MyReferrals, REFERRAL_STATUS, Referral, getMyReferrals, referColleague, withdrawReferral } from "../../api/referralApi";
import { formatMoney } from "../../api/doctorApi";
import { Card, EmptyState, ErrorState, PageHeader, PageSkeleton, StatCard, formatDate } from "../../components/ui";
import { useToast } from "../../components/Toast";
import { Pill } from "../../components/financeUi";
import { Initials, ReferralStepper, SessionMeter, relativeDay } from "../referrals/referralUi";

const emptyForm = { name: "", email: "", specialty: "", phone: "", note: "" };
type FormKey = keyof typeof emptyForm;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;

const validate = (f: typeof emptyForm): Partial<Record<FormKey, string>> => {
  const errors: Partial<Record<FormKey, string>> = {};
  if (f.name.trim().length < 2) errors.name = "Enter your colleague's full name.";
  if (!f.email.trim()) errors.email = "Enter their email: the invite goes there.";
  else if (!EMAIL_RE.test(f.email.trim())) errors.email = "That doesn't look like an email address.";
  if (f.phone.trim() && !PHONE_RE.test(f.phone.trim())) errors.phone = "Enter a valid phone number, or leave it empty.";
  return errors;
};

type ListFilter = "all" | "open" | "joined" | "closed";
const inFilter = (r: Referral, f: ListFilter) =>
  f === "all" ||
  (f === "open" && (r.status === "submitted" || r.status === "invited")) ||
  (f === "joined" && r.status === "onboarded") ||
  (f === "closed" && ["rejected", "withdrawn", "cancelled"].includes(r.status));

/** One line on where a referral stands, from the gynac's side. */
const nextStep = (r: Referral, rewardSessions: number) => {
  switch (r.status) {
    case "submitted":
      return "The Nura team is reviewing it.";
    case "invited":
      return `Invite emailed ${relativeDay(r.invitedAt)}. You get ${rewardSessions} free sessions when they join.`;
    case "onboarded":
      if (r.rewardStatus === "granted") return `Joined: you earned ${r.rewardSessions} free sessions.`;
      if (r.rewardStatus === "pending") return `Joined. Your ${r.rewardSessions ?? rewardSessions} free sessions arrive after their first completed consultation.`;
      return r.rewardSkipReason ?? "Joined.";
    case "rejected":
    case "cancelled":
      return r.closeReason ?? "Closed.";
    case "withdrawn":
      return "You withdrew this referral.";
    default:
      return "";
  }
};

const shareMessage = (colleague: string, email: string) =>
  `Hi ${colleague.replace(/^dr\.?\s+/i, "Dr. ")}, I consult with patients on Nura (thenura.care) and I've invited you to join as a clinician. ` +
  `Look out for an email from Nura at ${email} with a link to set up your account.`;

/**
 * Refer & Earn (clinician portal): refer a gynecologist colleague; the Nura
 * team reviews and invites them, and when they join this gynac gets
 * commission-free sessions, used automatically on their next paid sessions.
 */
export const GynacReferrals: React.FC = () => {
  const toast = useToast();
  const [data, setData] = useState<MyReferrals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [touched, setTouched] = useState<Partial<Record<FormKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<(Referral & { inviteEmailDelivered?: boolean }) | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>("all");
  const formRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Only the newest load may update the page (a slow focus reload must not
  // bring back a row that was just withdrawn).
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const next = await getMyReferrals();
      if (seq !== loadSeq.current) return;
      setData(next);
      setError(null);
    } catch (err) {
      if (seq === loadSeq.current) setError(err instanceof Error ? err.message : "Could not load your referrals.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Pick up the team's decisions when the gynac comes back to the tab.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const errors = validate(form);
  const showError = (key: FormKey) => (submitted || touched[key] ? errors[key] : undefined);

  const set = (key: FormKey) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value });
  const blur = (key: FormKey) => () => setTouched((t) => ({ ...t, [key]: true }));

  const goToForm = () => {
    setSent(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => nameRef.current?.focus(), 350);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSubmitted(true);
    const firstInvalid = (["name", "email", "phone"] as FormKey[]).find((k) => errors[k]);
    if (firstInvalid) {
      document.getElementById(`rf-${firstInvalid}`)?.focus();
      return;
    }
    setSending(true);
    try {
      const referral = await referColleague({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        note: form.note.trim() || undefined,
        specialty: form.specialty.trim() || undefined
      });
      setSent(referral);
      window.setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        // Focus would otherwise drop to the page as the form goes away.
        successRef.current?.focus();
      }, 50);
      setForm(emptyForm);
      setTouched({});
      setSubmitted(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your referral.");
    } finally {
      setSending(false);
    }
  };

  const withdraw = async (r: Referral) => {
    if (withdrawing || !window.confirm(`Withdraw your referral of ${r.referredName}?`)) return;
    setWithdrawing(r._id);
    try {
      await withdrawReferral(r._id);
      toast.success("Referral withdrawn.");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not withdraw it.");
    } finally {
      setWithdrawing(null);
    }
  };

  const counts = useMemo(() => {
    const rs = data?.referrals ?? [];
    return {
      all: rs.length,
      open: rs.filter((r) => inFilter(r, "open")).length,
      joined: rs.filter((r) => inFilter(r, "joined")).length,
      closed: rs.filter((r) => inFilter(r, "closed")).length
    };
  }, [data]);

  if (loading) return <PageSkeleton stats={3} rows={4} />;
  if (!data) {
    return (
      <div className="gx-page">
        <ErrorState message={error ?? "Nothing to show."} onRetry={() => { setLoading(true); load(); }} />
      </div>
    );
  }

  const { program, summary, referrals, credits } = data;
  const atCap = program.openCount >= program.maxOpen;
  const activeCredits = credits.filter((c) => c.state === "active" || c.state === "used_up");
  const activeGranted = activeCredits.reduce((n, c) => n + c.sessionsGranted, 0);
  const activeUsed = activeCredits.reduce((n, c) => n + c.sessionsUsed, 0);
  const usages = credits
    .flatMap((c) => c.usages.map((u) => ({ ...u, kind: c.kind })))
    .sort((a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime());
  const visible = referrals.filter((r) => inFilter(r, filter));
  const expiring = credits.filter((c) => c.state === "active" && c.expiresAt);

  return (
    <div className="gx-page rf-portal">
      <PageHeader
        eyebrow="Practice"
        title="Refer & Earn"
        subtitle="Invite gynecologist colleagues to Nura and earn commission-free sessions when they join."
      />

      {error && <ErrorState message={error} onRetry={load} />}

      <section className="rf-hero" aria-label="Your referral reward">
        <div className="rf-hero-main">
          <span className="rf-hero-eyebrow">
            <Gift size={14} /> Your reward
          </span>
          {summary.freeSessionsRemaining > 0 ? (
            <>
              <h2>
                <span className="rf-hero-number">{summary.freeSessionsRemaining}</span> commission-free session
                {summary.freeSessionsRemaining === 1 ? "" : "s"} ready
              </h2>
              <p>Nura takes 0% on your next paid sessions. They're applied automatically, so you don't need to do anything.</p>
            </>
          ) : (
            <>
              <h2>
                Earn <span className="rf-hero-number">{program.rewardSessions}</span> commission-free sessions
              </h2>
              <p>
                For every gynecologist you refer who joins Nura, you keep 100% of the fee on your next {program.rewardSessions} paid sessions
                {program.creditExpiryDays ? ` (used within ${program.creditExpiryDays} days)` : ""}.
              </p>
            </>
          )}
          {activeGranted > 0 && (
            <div className="rf-hero-meter">
              <SessionMeter used={activeUsed} total={activeGranted} tone="light" />
              <span>
                {activeUsed} of {activeGranted} used
              </span>
            </div>
          )}
          {program.enabled && (
            <button type="button" className="rf-hero-cta" onClick={goToForm}>
              <UserPlus size={16} /> Refer a colleague <ArrowDown size={14} />
            </button>
          )}
        </div>
        <ol className="rf-hero-steps" aria-label="How it works">
          <li>
            <span>1</span>
            <div>
              <strong>You refer</strong>
              <small>Their name and email</small>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>They get an invite</strong>
              <small>Emailed to them straight away</small>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>They join</strong>
              <small>And set up their account</small>
            </div>
          </li>
          <li>
            <span>4</span>
            <div>
              <strong>You earn</strong>
              <small>{program.rewardSessions} sessions at 0% commission</small>
            </div>
          </li>
        </ol>
      </section>

      <div className="gx-stat-grid is-3">
        <StatCard tone="berry" icon={<Users size={20} />} label="Colleagues referred" value={summary.referred} hint="All time" />
        <StatCard tone="green" icon={<CheckCircle2 size={20} />} label="Joined Nura" value={summary.joined} hint={summary.referred ? `${Math.round((summary.joined / summary.referred) * 100)}% of your referrals` : "None yet"} />
        <StatCard tone="teal" icon={<Sparkles size={20} />} label="Commission saved" value={formatMoney(summary.commissionSaved)} hint="Kept by you on free sessions" />
      </div>

      <div className="rf-grid">
        <div ref={formRef} className="rf-scroll-target">
          <Card title={sent ? undefined : "Refer a colleague"}>
            {sent ? (
              <div className="rf-success" role="status">
                <span className="rf-success-icon" aria-hidden>
                  <CheckCircle2 size={28} />
                </span>
                <h3 ref={successRef} tabIndex={-1}>Invite sent</h3>
                <p>
                  {sent.inviteEmailDelivered === false ? (
                    <>
                      We've invited {sent.referredName}, but the email couldn't be sent from here. The Nura team will make sure they get their link.
                    </>
                  ) : (
                    <>
                      We've emailed {sent.referredName} an invitation at <strong>{sent.referredEmail}</strong>. You'll get your free sessions as soon as they set up
                      their account.
                    </>
                  )}
                </p>
                <p className="rf-success-hint">Give them a heads-up:</p>
                <div className="rf-success-actions">
                  <a
                    className="cf-btn cf-btn-secondary"
                    href={`https://wa.me/?text=${encodeURIComponent(shareMessage(sent.referredName, sent.referredEmail))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={16} /> WhatsApp
                  </a>
                  <button
                    type="button"
                    className="cf-btn cf-btn-secondary"
                    onClick={() =>
                      navigator.clipboard?.writeText(shareMessage(sent.referredName, sent.referredEmail)).then(
                        () => toast.success("Message copied."),
                        () => toast.error("Could not copy.")
                      )
                    }
                  >
                    <Copy size={16} /> Copy message
                  </button>
                </div>
                <button type="button" className="cf-btn cf-btn-primary" onClick={goToForm}>
                  <UserPlus size={16} /> Refer another colleague
                </button>
              </div>
            ) : !program.enabled ? (
              <div className="rf-form-state">
                <span className="rf-form-state-icon" aria-hidden>
                  <Clock size={24} />
                </span>
                <h3>Referrals are paused</h3>
                <p>New referrals are paused right now. Your free sessions still work as usual.</p>
              </div>
            ) : atCap ? (
              <div className="rf-form-state">
                <span className="rf-form-state-icon" aria-hidden>
                  <Hourglass size={24} />
                </span>
                <h3>{program.openCount} invites waiting</h3>
                <p>You can refer more colleagues as the ones you've invited join Nura.</p>
                <button type="button" className="cf-btn cf-btn-secondary" onClick={() => setFilter("open")}>
                  See who hasn't joined yet
                </button>
              </div>
            ) : (
              <form className="rf-form" onSubmit={submit} noValidate>
                <FormField id="rf-name" label="Colleague's full name" error={showError("name")}>
                  <input
                    ref={nameRef}
                    id="rf-name"
                    value={form.name}
                    onChange={set("name")}
                    onBlur={blur("name")}
                    maxLength={120}
                    placeholder="Dr. Asha Rao"
                    autoComplete="off"
                    aria-invalid={Boolean(showError("name"))}
                    aria-describedby={`rf-name-msg`}
                  />
                </FormField>
                <FormField id="rf-email" label="Email" hint="Their invitation is emailed here as soon as you send." error={showError("email")}>
                  <input
                    id="rf-email"
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    onBlur={blur("email")}
                    maxLength={254}
                    placeholder="asha@example.com"
                    autoComplete="off"
                    aria-invalid={Boolean(showError("email"))}
                    aria-describedby={`rf-email-msg`}
                  />
                </FormField>
                <div className="rf-form-row">
                <FormField id="rf-specialty" label="Specialty" optional>
                  <input
                    id="rf-specialty"
                    value={form.specialty}
                    onChange={set("specialty")}
                    maxLength={80}
                    placeholder="Gynecologist"
                    autoComplete="off"
                  />
                </FormField>
                <FormField id="rf-phone" label="Phone" optional error={showError("phone")}>
                  <input
                    id="rf-phone"
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    onBlur={blur("phone")}
                    maxLength={20}
                    placeholder="+91 98765 43210"
                    autoComplete="off"
                    aria-invalid={Boolean(showError("phone"))}
                    aria-describedby={`rf-phone-msg`}
                  />
                </FormField>
                </div>
                <FormField id="rf-note" label="Anything we should know?" optional hint={`${form.note.length}/500`}>
                  <textarea
                    id="rf-note"
                    value={form.note}
                    onChange={set("note")}
                    maxLength={500}
                    placeholder="e.g. their specialty, hospital, how you know them"
                  />
                </FormField>
                <div className="rf-form-foot">
                  <button type="submit" className="cf-btn cf-btn-primary" disabled={sending}>
                    {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Send invite
                  </button>
                  <span className="cf-help">
                    {program.maxOpen - program.openCount} of {program.maxOpen} invites left (frees up as colleagues join)
                  </span>
                </div>
              </form>
            )}
          </Card>
        </div>

        <Card title="Your referrals" flush>
          {referrals.length > 0 && (
            <div className="rf-chips" role="group" aria-label="Filter referrals">
              {(
                [
                  ["all", "All"],
                  ["open", "In progress"],
                  ["joined", "Joined"],
                  ["closed", "Closed"]
                ] as [ListFilter, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  className={filter === key ? "is-active" : ""}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  <span>{counts[key]}</span>
                </button>
              ))}
            </div>
          )}
          {referrals.length === 0 ? (
            <EmptyState icon={<UserPlus size={22} />} title="No referrals yet">
              Colleagues you refer, and where each one stands, show up here.
            </EmptyState>
          ) : visible.length === 0 ? (
            <p className="rf-list-empty">Nothing here.</p>
          ) : (
            <div className="rf-scroll is-tall" tabIndex={0} aria-label="Your referrals">
              <ul className="rf-list">
                {visible.map((r) => {
                  const meta = REFERRAL_STATUS[r.status];
                  return (
                    <li key={r._id}>
                      <Initials name={r.referredName} />
                      <div className="rf-list-main">
                        <div className="rf-list-title">
                          <strong>{r.referredName}</strong>
                          <Pill tone={meta.tone}>{meta.portalLabel}</Pill>
                        </div>
                        <span className="cf-cell-sub">
                          {r.referredEmail} · referred {relativeDay(r.createdAt)}
                        </span>
                        <ReferralStepper referral={r} compact />
                        <span className="rf-list-step">{nextStep(r, program.rewardSessions)}</span>
                      </div>
                      {r.status === "submitted" && (
                        <button
                          type="button"
                          className="cf-icon-btn"
                          onClick={() => withdraw(r)}
                          disabled={withdrawing !== null}
                          title="Withdraw"
                          aria-label={`Withdraw referral of ${r.referredName}`}
                        >
                          {withdrawing === r._id ? <Loader2 size={16} className="spin" /> : <Undo2 size={16} />}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {credits.length > 0 && (
        <Card title="Free-session history" flush>
          {usages.length === 0 ? (
            <EmptyState icon={<CheckCircle2 size={22} />} title={`${summary.freeSessionsRemaining} free sessions ready`}>
              They're used automatically on your next paid sessions; each one shows up here and in Earnings &amp; Wallet.
            </EmptyState>
          ) : (
            <div className="rf-scroll is-short" tabIndex={0} aria-label="Free-session history">
              <ul className="rf-list">
                {usages.map((u) => (
                  <li key={u.consultationId}>
                    <span className="rf-ticket" aria-hidden>
                      <Gift size={16} />
                    </span>
                    <div className="rf-list-main">
                      <strong>Session on {formatDate(u.usedAt)}</strong>
                      <span className="cf-cell-sub">{u.kind === "referral" ? "Referral reward" : "Bonus from the Nura team"}</span>
                    </div>
                    <Pill tone="ok">{formatMoney(u.commissionSaved)} kept</Pill>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {expiring.length > 0 && (
            <p className="cf-help rf-expiry">
              {expiring.map((c) => `${c.sessionsRemaining} expire on ${formatDate(c.expiresAt!)}`).join(" · ")}
            </p>
          )}
        </Card>
      )}
    </div>
  );
};

const FormField: React.FC<{
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}> = ({ id, label, optional, hint, error, children }) => (
  <div className={`rf-field ${error ? "has-error" : ""}`}>
    <label htmlFor={id}>
      {label}
      {optional && <span className="rf-optional">Optional</span>}
    </label>
    {children}
    {/* Linked to the input (aria-describedby); the focused field reads its own error. */}
    {(error || hint) && (
      <small id={`${id}-msg`} className={error ? "rf-field-error" : undefined}>
        {error ?? hint}
      </small>
    )}
  </div>
);
