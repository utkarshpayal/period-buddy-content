import { ChevronLeft, ChevronRight } from "lucide-react";

/** The `pagination` block the backend's buildPagination() returns. */
export type PageInfo = {
  page: number;
  pages: number;
  total?: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
};

/**
 * Shared Prev / "Page X of Y" / Next control (the `.admin-pagination` block
 * UsersPage, AuditLogsPage, ApprovalsPage and NotificationsPage render
 * inline). Hidden when everything fits on one page. Use this for new lists
 * instead of copying that markup again.
 */
export function Pagination({
  pagination,
  onPageChange,
  disabled,
  itemLabel,
}: {
  pagination: PageInfo | null | undefined;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  /** Plural noun for the total, e.g. "coupons" → "· 42 coupons". */
  itemLabel?: string;
}) {
  if (!pagination || pagination.pages <= 1) return null;
  const { page, pages, total } = pagination;
  const hasPrev = pagination.hasPrevPage ?? page > 1;
  const hasNext = pagination.hasNextPage ?? page < pages;

  return (
    <div className="admin-pagination">
      <button
        type="button"
        className="gy-btn gy-btn-ghost"
        disabled={disabled || !hasPrev}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        <ChevronLeft size={16} /> Prev
      </button>
      <span className="admin-page-indicator">
        Page {page} of {pages}
        {itemLabel && total !== undefined ? ` · ${total} ${itemLabel}` : ""}
      </span>
      <button
        type="button"
        className="gy-btn gy-btn-ghost"
        disabled={disabled || !hasNext}
        onClick={() => onPageChange(page + 1)}
      >
        Next <ChevronRight size={16} />
      </button>
    </div>
  );
}
