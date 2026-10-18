import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, EyeOff, Flag, Loader2, MessageCircle, Trash2, X } from "lucide-react";
import { deleteReelComment, listReelComments, ModeratedReelComment } from "../api/reelCommentsApi";
import "../styles/reelComments.css";

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

/**
 * Comment moderation for one reel: every comment newest first, including the
 * ones hidden after 5 reports, with Delete (audited server-side).
 * `onCountChange` reports the app-visible count so the row's stats update.
 */
export const ReelCommentsPanel: React.FC<{
  reel: { id: string; title: string };
  canDelete: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}> = ({ reel, canDelete, onClose, onCountChange }) => {
  const [comments, setComments] = useState<ModeratedReelComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listReelComments(reel.id);
      setComments(page.comments);
      setCursor(page.nextCursor);
      setVisibleCount(page.commentCount);
      onCountChangeRef.current?.(page.commentCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load comments.");
    } finally {
      setLoading(false);
    }
  }, [reel.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listReelComments(reel.id, cursor);
      setComments((current) => {
        const seen = new Set(current.map((c) => c.id));
        return [...current, ...page.comments.filter((c) => !seen.has(c.id))];
      });
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load more comments.");
    } finally {
      setLoadingMore(false);
    }
  };

  const remove = async (comment: ModeratedReelComment) => {
    const preview = comment.text.length > 80 ? `${comment.text.slice(0, 80)}…` : comment.text;
    if (!window.confirm(`Delete this comment by ${comment.author.name}?\n\n"${preview}"\n\nThis can't be undone.`)) return;
    setDeletingId(comment.id);
    setError(null);
    try {
      const result = await deleteReelComment(reel.id, comment.id);
      setComments((current) => current.filter((c) => c.id !== comment.id));
      setVisibleCount(result.commentCount);
      onCountChangeRef.current?.(result.commentCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete the comment.");
    } finally {
      setDeletingId(null);
    }
  };

  const hiddenCount = comments.filter((c) => c.isHidden).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section
        aria-label={`Comments on ${reel.title}`}
        className="reel-comments-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button aria-label="Close" className="modal-close" onClick={onClose} type="button">
          <X size={18} />
        </button>
        <header>
          <h3>Comments</h3>
          <p>
            {reel.title}
            {visibleCount !== null ? ` · ${visibleCount} shown in the app` : ""}
            {hiddenCount > 0 ? ` · ${hiddenCount} hidden after reports` : ""}
          </p>
        </header>

        {error && (
          <div className="form-error-alert" style={{ margin: "12px 20px 0" }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="reel-comments-list">
          {loading ? (
            <div className="empty-state">
              <Loader2 className="spin-icon" size={24} />
              <h4>Loading comments…</h4>
            </div>
          ) : comments.length === 0 && !error ? (
            <div className="empty-state">
              <MessageCircle size={26} />
              <h4>No comments yet</h4>
            </div>
          ) : (
            comments.map((comment) => (
              <article className={comment.isHidden ? "reel-comment hidden" : "reel-comment"} key={comment.id}>
                {comment.author.avatar ? (
                  <img alt="" className="reel-comment-avatar" src={comment.author.avatar} />
                ) : (
                  <span aria-hidden className="reel-comment-avatar">
                    {comment.author.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="reel-comment-body">
                  <div className="reel-comment-meta">
                    <strong>{comment.author.name}</strong>
                    <span>{formatWhen(comment.createdAt)}</span>
                    {comment.isHidden && (
                      <span className="reel-comment-flag">
                        <EyeOff size={11} /> Hidden
                      </span>
                    )}
                    {(comment.reportCount ?? 0) > 0 && (
                      <span className="reel-comment-flag">
                        <Flag size={11} /> {comment.reportCount} report{comment.reportCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <p className="reel-comment-text">{comment.text}</p>
                </div>
                {canDelete && (
                  <button
                    aria-label={`Delete comment by ${comment.author.name}`}
                    className="modal-cancel"
                    disabled={deletingId === comment.id}
                    onClick={() => remove(comment)}
                    type="button"
                  >
                    {deletingId === comment.id ? <Loader2 className="spin-icon" size={15} /> : <Trash2 size={15} />}
                    Delete
                  </button>
                )}
              </article>
            ))
          )}
          {cursor && !loading && (
            <div className="reel-comments-more">
              <button className="modal-cancel" disabled={loadingMore} onClick={loadMore} type="button">
                {loadingMore ? <Loader2 className="spin-icon" size={15} /> : null}
                Load more
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
