import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Heart,
  HelpCircle,
  Image as ImageIcon,
  Info,
  Loader2,
  Lock,
  MessageCircle,
  MessagesSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Stethoscope,
  Trash2,
  Vote,
  X
} from "lucide-react";
import {
  CommunityPost,
  CommunityView,
  answerCommunityPost,
  deleteCommunityAnswer,
  getCommunityPost,
  getCommunityPosts,
  getMyProfile
} from "../../api/doctorApi";
import {
  Avatar,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  StatCard,
  Tabs,
  Toggle,
  timeAgo
} from "../../components/ui";
import { Pagination, PageInfo } from "../../components/Pagination";
import { useToast } from "../../components/Toast";

const VIEWS: { value: CommunityView; label: string }[] = [
  { value: "unanswered", label: "Needs an answer" },
  { value: "mine", label: "Answered by me" },
  { value: "all", label: "All questions" }
];

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "PCOS", label: "PCOS" },
  { value: "Fitness", label: "Fitness" },
  { value: "Skin", label: "Skin" },
  { value: "general", label: "General" }
];

const ANSWER_MAX = 2000;
const VERIFIED_LABEL = "Verified gynaecologist";
const SHOW_NAME_KEY = "nura.gynac.community.showName";
const CONSULTATION_DISCLAIMER =
  "\n\nNote: If symptoms persist, cause severe discomfort, or worsen, please schedule a formal 1-on-1 clinical consultation for a personalized medical evaluation.";

/** The last "Show my name" choice on this browser (on by default). */
const readShowName = () => {
  try {
    return window.localStorage.getItem(SHOW_NAME_KEY) !== "0";
  } catch {
    return true;
  }
};

const saveShowName = (value: boolean) => {
  try {
    window.localStorage.setItem(SHOW_NAME_KEY, value ? "1" : "0");
  } catch {
    // Private mode fallback
  }
};

/** "Priya Sharma" → "Dr. Priya Sharma", as the backend displays it. */
const withDr = (name?: string) => {
  const clean = (name ?? "").trim();
  if (!clean) return "";
  return /^dr\.?\s/i.test(clean) ? clean.replace(/^dr\.?\s+/i, "Dr. ") : `Dr. ${clean}`;
};

const categoryLabel = (category?: string) =>
  !category || category === "general"
    ? "General"
    : category.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const PostMedia: React.FC<{ post: CommunityPost }> = ({ post }) => {
  const totalVotes = useMemo(() => {
    if (!post.poll) return 0;
    return post.poll.options.reduce((sum, o) => sum + (o.votes || 0), 0);
  }, [post.poll]);

  return (
    <>
      {post.attachments.map((a) =>
        a.type === "image" ? (
          <img key={a.url} src={a.url} alt="" className="gx-community-image" loading="lazy" />
        ) : a.type === "video" ? (
          <video key={a.url} src={a.url} controls className="gx-community-image" />
        ) : (
          <audio key={a.url} src={a.url} controls style={{ width: "100%", marginTop: "10px" }} />
        )
      )}

      {post.poll && (
        <div className="gx-community-poll-box">
          {post.poll.question && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.9rem" }}>
              <Vote size={15} color="var(--ui-berry)" />
              <span>{post.poll.question}</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            {post.poll.options.map((o) => {
              const pct = totalVotes > 0 ? Math.round(((o.votes || 0) / totalVotes) * 100) : 0;
              return (
                <div key={o.topic} className="gx-community-poll-option">
                  <div className="gx-community-poll-labels">
                    <span style={{ fontWeight: 600 }}>{o.topic}</span>
                    <span className="gx-muted">
                      {o.votes || 0} votes ({pct}%)
                    </span>
                  </div>
                  <div className="gx-community-poll-bar-bg">
                    <div className="gx-community-poll-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
};

export const GynacCommunity: React.FC = () => {
  const toast = useToast();
  const [view, setView] = useState<CommunityView>("unanswered");
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [pagination, setPagination] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Quick overview counts for the stat cards
  const [unansweredTotal, setUnansweredTotal] = useState<number | null>(null);
  const [mineTotal, setMineTotal] = useState<number | null>(null);

  const [selected, setSelected] = useState<CommunityPost | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [showName, setShowName] = useState(readShowName);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [myName, setMyName] = useState("");
  const [myAvatar, setMyAvatar] = useState<string | undefined>(undefined);

  useEffect(() => {
    getMyProfile()
      .then((p) => {
        setMyName(withDr(p.name));
        setMyAvatar(p.avatarUrl ?? undefined);
      })
      .catch(() => undefined);
  }, []);

  // Debounced search
  useEffect(() => {
    const t = window.setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  // Load summary metrics for the stat cards
  const loadStats = useCallback(async () => {
    try {
      const [unansRes, mineRes] = await Promise.all([
        getCommunityPosts({ view: "unanswered", page: 1, limit: 1 }),
        getCommunityPosts({ view: "mine", page: 1, limit: 1 })
      ]);
      setUnansweredTotal(unansRes.pagination?.total ?? 0);
      setMineTotal(mineRes.pagination?.total ?? 0);
    } catch {
      // Best-effort stats
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Main feed query
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const res = await getCommunityPosts({
        view,
        page,
        category: category !== "all" ? category : undefined,
        search: query
      });
      if (seq !== loadSeq.current) return;
      setPosts(res.posts);
      setPagination(res.pagination);
      setError(null);
      if (view === "unanswered" && res.pagination) setUnansweredTotal(res.pagination.total ?? 0);
      if (view === "mine" && res.pagination) setMineTotal(res.pagination.total ?? 0);
    } catch (err) {
      if (seq === loadSeq.current) setError(err instanceof Error ? err.message : "Could not load community posts.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [view, page, category, query]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (post: CommunityPost) => {
    setSelected(post);
    setAnswer("");
    setDetailLoading(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      setSelected(await getCommunityPost(post.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open this post.");
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const back = () => {
    setSelected(null);
    load();
    loadStats();
  };

  const toggleShowName = () => {
    setShowName((v) => {
      saveShowName(!v);
      return !v;
    });
  };

  const insertConsultationDisclaimer = () => {
    setAnswer((prev) => {
      if (prev.includes("schedule a formal 1-on-1")) return prev;
      return (prev.trim() + CONSULTATION_DISCLAIMER).trim();
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || sending || !answer.trim()) return;
    setSending(true);
    try {
      const { post } = await answerCommunityPost(selected.id, answer.trim(), showName);
      setSelected(post);
      setAnswer("");
      toast.success("Medical answer posted. Member notified.");
      loadStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post your answer.");
    } finally {
      setSending(false);
    }
  };

  const remove = async (commentId: string) => {
    if (!selected || deleting || !window.confirm("Delete your answer? Members will no longer see it.")) return;
    setDeleting(commentId);
    try {
      const { post } = await deleteCommunityAnswer(selected.id, commentId);
      setSelected(post);
      toast.success("Answer removed.");
      loadStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete your answer.");
    } finally {
      setDeleting(null);
    }
  };

  // Keyboard shortcut: Cmd/Ctrl + Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!sending && answer.trim()) void submit(e);
    }
  };

  const shownAs = showName && myName ? myName : VERIFIED_LABEL;

  const tabItems = useMemo(() => {
    return [
      {
        value: "unanswered" as CommunityView,
        label: "Needs an answer",
        count: unansweredTotal ?? undefined
      },
      {
        value: "mine" as CommunityView,
        label: "Answered by me",
        count: mineTotal ?? undefined
      },
      {
        value: "all" as CommunityView,
        label: "All questions"
      }
    ];
  }, [unansweredTotal, mineTotal]);

  // Post detail view (2-column clinical workspace)
  if (selected) {
    const comments = selected.comments ?? [];
    return (
      <div className="gx-page">
        <PageHeader
          eyebrow="Community Forum"
          title="Clinical Question & Answer"
          actions={
            <button type="button" className="gx-btn gx-btn-ghost" onClick={back}>
              <ArrowLeft size={16} /> All Questions
            </button>
          }
        />

        <div className="gx-community-detail-layout">
          {/* Left Column: Member's Question & Media */}
          <div className="gx-community-left-col">
            <article className="gx-community-question-card">
              <div className="gx-community-card-head">
                <div className="gx-community-card-meta">
                  <span className="gx-badge status-paid">{categoryLabel(selected.category)}</span>
                  <span className="gx-author-tag">
                    <Lock size={12} /> Anonymous Member · {timeAgo(selected.createdAt)}
                  </span>
                </div>
                {selected.answeredByMe ? (
                  <span className="gx-badge status-completed">
                    <CheckCircle2 size={13} /> You Answered
                  </span>
                ) : selected.expertAnswerCount > 0 ? (
                  <span className="gx-badge gx-badge-verified">
                    <BadgeCheck size={13} /> Doctor Answered ({selected.expertAnswerCount})
                  </span>
                ) : (
                  <span className="gx-badge status-pending">
                    <Clock size={13} /> Needs Doctor Answer
                  </span>
                )}
              </div>

              {selected.title && <h2 className="gx-community-full-title">{selected.title}</h2>}

              <p className="gx-community-full-body">{selected.content}</p>

              <PostMedia post={selected} />

              {selected.tags.length > 0 && (
                <div className="gx-community-tags-wrap" style={{ marginTop: 6 }}>
                  {selected.tags.map((t) => (
                    <span key={t} className="gx-community-tag-pill">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </article>

            {/* Clinical Advisory Notice */}
            <div className="gx-community-advisory-box">
              <Stethoscope size={18} />
              <div>
                <strong>Clinical Guidance Reminder:</strong> Answers show to patients as medically verified.
                Provide clear, reassuring educational guidance. If red-flag symptoms are present, use the consultation
                button to suggest a formal video session.
              </div>
            </div>
          </div>

          {/* Right Column: Doctor Answer Composer & Discussion Thread */}
          <div className="gx-community-right-col">
            {/* Answer Form */}
            <section className="gx-community-answer-card">
              <div className="gx-community-answer-head">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={17} color="var(--ui-berry)" />
                  <h3>Your Medical Answer</h3>
                </div>
                <button
                  type="button"
                  className="gx-community-disclaimer-btn"
                  onClick={insertConsultationDisclaimer}
                  title="Append standard consultation guidance"
                >
                  <Plus size={13} /> Add consultation note
                </button>
              </div>

              <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <textarea
                  className="gx-textarea"
                  rows={6}
                  maxLength={ANSWER_MAX}
                  placeholder="Write clear medical advice, reassurance, and next steps for the member... (Press Cmd+Enter to post)"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="Your medical answer"
                  style={{ lineHeight: 1.55 }}
                />

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <Toggle checked={showName} onChange={toggleShowName} label="Show my doctor name" />
                  <span className="gx-muted" style={{ fontSize: "0.8rem" }}>
                    {answer.length}/{ANSWER_MAX}
                  </span>
                </div>

                {/* Patient App Live Preview */}
                <div className="gx-community-preview-box">
                  <span className="gx-community-preview-label">How members see your reply in the app</span>
                  <div className="gx-community-preview-bubble">
                    <div className="gx-community-preview-meta">
                      {showName && myAvatar ? (
                        <Avatar name={myName} src={myAvatar} size="sm" />
                      ) : (
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: "var(--ui-green-50)",
                            color: "var(--ui-green)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.7rem",
                            fontWeight: 700
                          }}
                        >
                          DR
                        </span>
                      )}
                      <strong style={{ fontSize: "0.85rem", color: "var(--ui-ink)" }}>{shownAs}</strong>
                      <span className="gx-community-preview-badge">
                        <BadgeCheck size={12} /> Medically verified
                      </span>
                    </div>
                    <span style={{ fontSize: "0.8rem", color: "var(--ui-ink-2)", fontStyle: answer ? "normal" : "italic" }}>
                      {answer.trim() || "Your verified answer preview will appear here..."}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                  <button
                    type="submit"
                    className="gx-btn gx-btn-primary"
                    disabled={sending || !answer.trim()}
                    style={{ minWidth: 140 }}
                  >
                    {sending ? <Loader2 className="spin-icon" size={16} /> : <Send size={16} />}{" "}
                    {sending ? "Posting…" : "Post Answer"}
                  </button>
                </div>
              </form>
            </section>

            {/* Replies Thread */}
            <Card title={`Thread Replies (${comments.length})`}>
              {detailLoading ? (
                <div className="gx-center-pad" style={{ padding: "30px 0" }}>
                  <Loader2 className="spin-icon" size={22} color="var(--ui-berry)" />
                </div>
              ) : comments.length === 0 ? (
                <p className="gx-muted" style={{ margin: 0, padding: "8px 0" }}>
                  No replies on this post yet. Your medical answer will be the first!
                </p>
              ) : (
                <ul className="gx-community-replies">
                  {comments.map((c) => (
                    <li key={c.id} className={`gx-community-reply-item ${c.expert ? "is-expert" : ""}`}>
                      <div className="gx-community-card-head">
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "0.88rem" }}>
                            {c.isMine ? `${c.expert?.showName ? c.expert.name : VERIFIED_LABEL} (You)` : c.author}
                          </strong>
                          {c.expert && (
                            <span className="gx-badge gx-badge-verified">
                              <BadgeCheck size={13} /> Medically verified
                            </span>
                          )}
                          <span className="gx-muted" style={{ fontSize: "0.8rem" }}>
                            {timeAgo(c.createdAt)}
                          </span>
                        </div>

                        {c.isMine && (
                          <button
                            type="button"
                            className="gx-icon-btn"
                            aria-label="Delete your answer"
                            onClick={() => remove(c.id)}
                            disabled={deleting === c.id}
                            title="Remove your answer"
                          >
                            {deleting === c.id ? <Loader2 className="spin-icon" size={14} /> : <Trash2 size={14} />}
                          </button>
                        )}
                      </div>

                      <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                        {c.content}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Main feed view
  return (
    <div className="gx-page">
      <PageHeader
        eyebrow="Community Medical Q&A"
        title="Patient Community Questions"
        subtitle="Browse questions asked by members in the Nura app. Your answers provide verified medical guidance."
        actions={
          <button type="button" className="gx-btn gx-btn-ghost gx-btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin-icon" : ""} /> Refresh
          </button>
        }
      />

      {/* Summary Stat Cards */}
      <div className="gx-community-stat-grid">
        <StatCard
          icon={<HelpCircle size={20} color="var(--ui-amber)" />}
          label="Awaiting Medical Answer"
          value={unansweredTotal !== null ? unansweredTotal : "—"}
          hint="Patients needing expert guidance"
          tone="amber"
        />
        <StatCard
          icon={<CheckCircle2 size={20} color="var(--ui-berry)" />}
          label="Answered by You"
          value={mineTotal !== null ? mineTotal : "—"}
          hint="Questions you helped clarify"
          tone="berry"
        />
        <StatCard
          icon={<BadgeCheck size={20} color="var(--ui-teal)" />}
          label="Verified Status"
          value={myName ? myName : "Active Expert"}
          hint={showName ? "Name & photo visible" : "Anonymous verified doctor"}
          tone="teal"
        />
      </div>

      {/* Modern Filter & Search Toolbar */}
      <div className="gx-community-toolbar">
        <div className="gx-community-tools-row">
          <Tabs
            label="Filter questions by response status"
            items={tabItems}
            value={view}
            onChange={(v) => {
              setView(v);
              setPage(1);
            }}
          />

          <div className="gx-community-search-wrap">
            <Search size={16} color="var(--ui-muted)" />
            <input
              type="search"
              placeholder="Search questions or keywords…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search questions"
            />
            {search && (
              <button
                type="button"
                className="gx-community-search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Category Pills */}
        <div className="gx-category-chips">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              className={`gx-category-chip ${category === cat.value ? "is-active" : ""}`}
              onClick={() => {
                setCategory(cat.value);
                setPage(1);
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Questions List */}
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading && posts.length === 0 ? (
        <div className="gx-center-pad" style={{ padding: "60px 0" }}>
          <Loader2 className="spin-icon" size={26} color="var(--ui-berry)" />
          <p className="gx-muted" style={{ marginTop: 10 }}>
            Loading community questions…
          </p>
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare size={24} />}
          title={view === "unanswered" ? "All questions answered!" : "No questions found"}
        >
          {view === "unanswered"
            ? "Great job! Every community question currently has at least one medical answer."
            : query || category !== "all"
              ? "No questions match the current filters. Try resetting your search or category."
              : "Questions posted by members in the Nura mobile app will appear here."}
        </EmptyState>
      ) : (
        <ul className="gx-community-list">
          {posts.map((post) => (
            <li key={post.id}>
              <button type="button" className="gx-community-card" onClick={() => open(post)}>
                <div className="gx-community-card-head">
                  <div className="gx-community-card-meta">
                    <span className="gx-badge status-paid">{categoryLabel(post.category)}</span>
                    <span className="gx-author-tag">
                      <Lock size={12} /> Anonymous Member · {timeAgo(post.createdAt)}
                    </span>
                  </div>

                  {post.answeredByMe ? (
                    <span className="gx-badge status-completed">
                      <CheckCircle2 size={13} /> You Answered
                    </span>
                  ) : post.expertAnswerCount > 0 ? (
                    <span className="gx-badge gx-badge-verified">
                      <BadgeCheck size={13} /> {post.expertAnswerCount} Doctor Answer
                      {post.expertAnswerCount > 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="gx-badge status-pending">
                      <Clock size={13} /> Needs Answer
                    </span>
                  )}
                </div>

                {post.title && <h3 className="gx-community-card-title">{post.title}</h3>}

                <p className="gx-community-card-snippet">{post.content}</p>

                {post.tags.length > 0 && (
                  <div className="gx-community-tags-wrap">
                    {post.tags.map((t) => (
                      <span key={t} className="gx-community-tag-pill">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                <div className="gx-community-card-foot">
                  <div className="gx-community-card-counts">
                    <span>
                      <MessageCircle size={14} /> {post.commentCount} {post.commentCount === 1 ? "reply" : "replies"}
                    </span>
                    <span>
                      <Heart size={14} /> {post.likeCount}
                    </span>
                    {post.attachments.length > 0 && (
                      <span className="gx-community-media-chip">
                        <ImageIcon size={13} /> {post.attachments.length} attachment
                        {post.attachments.length > 1 ? "s" : ""}
                      </span>
                    )}
                    {post.poll && (
                      <span className="gx-community-media-chip">
                        <Vote size={13} /> Poll
                      </span>
                    )}
                  </div>

                  <span className="gx-community-cta-btn">
                    {post.answeredByMe ? "View Thread" : "View & Answer"} <ArrowRight size={14} />
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Pagination pagination={pagination} onPageChange={setPage} disabled={loading} itemLabel="questions" />
    </div>
  );
};
