import React, { useState } from "react";
import { Archive, ArchiveRestore, BadgeCheck, Eye, EyeOff, Hourglass, Loader2, Send, ShieldCheck, Undo2 } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { statusesFor } from "../api/contentApi";
import { isAdminApiConfigured } from "../api/adminApi";
import { PERMISSIONS } from "../auth/access";
import { ContentItem, ContentStatus, ContentType, ReviewAction } from "../types/content";

const STATUS_LABEL: Record<ContentStatus, string> = {
  published: "Published",
  draft: "Drafts",
  archived: "Archived",
  review: "In review"
};

const CHIP_LABEL: Record<ContentStatus, string> = {
  published: "published",
  draft: "draft",
  archived: "archived",
  review: "In review"
};

/** Text for a `.status-chip` (the raw status, except "In review"). */
export const statusLabel = (status: ContentStatus) => CHIP_LABEL[status] ?? status;

const SEND_BACK_NOTE_MAX = 500;

/**
 * Whether the signed-in person may publish directly. Writers without
 * content.publish go through "Submit for medical review" instead, so the
 * editors hide the "Published" status option from them.
 */
export const useCanPublish = () => {
  const { can } = useAppContext();
  return !isAdminApiConfigured || can(PERMISSIONS.CONTENT_PUBLISH);
};

/** Note dialog for "Send back": what the writer needs to change (required). */
const SendBackDialog: React.FC<{ title: string; onCancel: () => void; onSend: (note: string) => void }> = ({
  title,
  onCancel,
  onSend
}) => {
  const [note, setNote] = useState("");
  const trimmed = note.trim();
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="send-back-title" onClick={onCancel}>
      <div className="editor-panel modal-panel send-back-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 id="send-back-title">Send back to drafts</h3>
        <p className="muted">
          “{title}” goes back to the writer as a draft. Tell them what needs to change before it can be approved.
        </p>
        <label>
          What needs to change?
          <textarea
            autoFocus
            maxLength={SEND_BACK_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && trimmed) onSend(trimmed);
            }}
            placeholder="e.g. Please cite a source for the dosage advice in paragraph 3."
            rows={4}
            value={note}
          />
        </label>
        <div className="send-back-count muted">
          {note.length}/{SEND_BACK_NOTE_MAX}
        </div>
        <div className="modal-footer">
          <button className="modal-cancel" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="save-button" disabled={!trimmed} onClick={() => onSend(trimmed)} type="button">
            <Undo2 size={16} /> Send back
          </button>
        </div>
      </div>
    </div>
  );
};

const formatReviewDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

/**
 * Read-only medical review state, set only by the server: "✓ Medically
 * reviewed by <name> · <date>", or that the item waits for review / was sent
 * back with a note.
 */
export const ReviewChip: React.FC<{ item: ContentItem }> = ({ item }) => {
  const review = item.review;
  if (item.medicallyReviewed || review?.medicallyReviewed) {
    const by = review?.by || item.reviewedBy;
    const date = formatReviewDate(review?.at);
    return (
      <span className="badge-verified" title={review?.note ? `Reviewer's note: ${review.note}` : undefined}>
        <BadgeCheck size={14} aria-hidden="true" /> Medically reviewed{by ? ` by ${by}` : ""}
        {date ? ` · ${date}` : ""}
      </span>
    );
  }
  if (item.status === "review") {
    return (
      <span className="badge-review">
        Awaiting medical review{review?.submittedBy ? ` · sent by ${review.submittedBy}` : ""}
      </span>
    );
  }
  if (item.status === "draft" && review?.sentBackNote) {
    return (
      <span className="badge-review" title={review.sentBackNote}>
        Sent back{review.sentBackBy ? ` by ${review.sentBackBy}` : ""}: {review.sentBackNote}
      </span>
    );
  }
  return null;
};

/** "All / Published / In review / Drafts (/ Archived)" filter chips with counts. */
export const StatusTabs: React.FC<{
  type: ContentType;
  items: ContentItem[];
  value: ContentStatus | "all";
  onChange: (value: ContentStatus | "all") => void;
}> = ({ type, items, value, onChange }) => {
  const tabs: (ContentStatus | "all")[] = ["all", ...statusesFor(type)];
  return (
    <div className="admin-filter-row" role="tablist" aria-label="Filter by status">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          className={`admin-chip ${value === tab ? "is-active" : ""}`}
          onClick={() => onChange(tab)}
        >
          {tab === "all" ? "All" : STATUS_LABEL[tab]} ({tab === "all" ? items.length : items.filter((i) => i.status === tab).length})
        </button>
      ))}
    </div>
  );
};

/**
 * Row buttons. Visibility: publish, unpublish and (blogs only) archive /
 * restore through PATCH /api/content/:type/:id/publish. Medical review
 * (POST /api/content/:type/:id/review): writers submit a draft for review;
 * content.approve holders approve & publish, mark reviewed, or send it back
 * with a note. Buttons a person can't use are hidden (the API enforces it
 * too). The row updates from the server's response.
 */
export const StatusActions: React.FC<{ item: ContentItem }> = ({ item }) => {
  const { setItemStatus, reviewItem, can } = useAppContext();
  const [busy, setBusy] = useState(false);
  const canArchive = statusesFor(item.type).includes("archived");
  // Local mode (no API) has no signed-in permissions: show everything.
  const open = !isAdminApiConfigured;
  const canWrite = open || can(PERMISSIONS.CONTENT_WRITE);
  const canPublish = open || can(PERMISSIONS.CONTENT_PUBLISH);
  const canApprove = open || can(PERMISSIONS.CONTENT_APPROVE);
  const reviewed = item.medicallyReviewed || Boolean(item.review?.medicallyReviewed);

  const run = async (status: ContentStatus) => {
    setBusy(true);
    await setItemStatus(item, status);
    setBusy(false);
  };

  const review = async (action: ReviewAction, note?: string) => {
    setBusy(true);
    await reviewItem(item, action, note);
    setBusy(false);
  };

  const [sendBackOpen, setSendBackOpen] = useState(false);
  const sendBack = () => setSendBackOpen(true);

  if (busy) {
    return (
      <button aria-label="Updating status" disabled type="button">
        <Loader2 className="spin-icon" size={17} />
      </button>
    );
  }

  const markReviewed = canApprove && !reviewed && (
    <button
      aria-label="Mark reviewed"
      title="Mark medically reviewed (stamps your name; doesn't change visibility)"
      onClick={() => review("mark_reviewed")}
      type="button"
    >
      <BadgeCheck size={17} />
    </button>
  );

  if (item.status === "review") {
    if (!canApprove) {
      return (
        <button aria-label="Awaiting medical review" disabled title="Waiting for a Content Super Admin's medical review" type="button">
          <Hourglass size={17} />
        </button>
      );
    }
    return (
      <>
        <button
          aria-label="Approve & publish"
          title="Approve & publish (stamps your medical review)"
          onClick={() => review("approve")}
          type="button"
        >
          <ShieldCheck size={17} />
        </button>
        <button
          aria-label="Mark reviewed"
          title="Mark reviewed and keep it as a draft"
          onClick={() => review("mark_reviewed")}
          type="button"
        >
          <BadgeCheck size={17} />
        </button>
        <button aria-label="Send back" title="Send back to drafts with a note" onClick={sendBack} type="button">
          <Undo2 size={17} />
        </button>
        {sendBackOpen && (
          <SendBackDialog
            title={item.title}
            onCancel={() => setSendBackOpen(false)}
            onSend={(note) => {
              setSendBackOpen(false);
              void review("send_back", note.slice(0, SEND_BACK_NOTE_MAX));
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      {item.status === "published" ? (
        <button aria-label="Unpublish" title="Unpublish (move to drafts)" onClick={() => run("draft")} type="button">
          <EyeOff size={17} />
        </button>
      ) : (
        <>
          {canPublish && (
            <button
              aria-label="Publish"
              title={canApprove ? "Publish (stamps your medical review)" : "Publish"}
              onClick={() => run("published")}
              type="button"
            >
              <Eye size={17} />
            </button>
          )}
          {item.status === "draft" && canWrite && !canApprove && (
            <button
              aria-label="Submit for review"
              title="Submit for medical review"
              onClick={() => review("submit")}
              type="button"
            >
              <Send size={17} />
            </button>
          )}
        </>
      )}
      {item.status !== "archived" && markReviewed}
      {canArchive &&
        (item.status === "archived" ? (
          <button aria-label="Restore as draft" title="Restore as draft" onClick={() => run("draft")} type="button">
            <ArchiveRestore size={17} />
          </button>
        ) : (
          <button
            aria-label="Archive"
            title="Archive (hidden from the app, kept out of drafts)"
            onClick={() => run("archived")}
            type="button"
          >
            <Archive size={17} />
          </button>
        ))}
    </>
  );
};
