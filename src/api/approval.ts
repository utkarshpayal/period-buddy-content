/**
 * Approval-gated writes. When a staff member lacks the direct permission for
 * an action (e.g. a Content Admin publishing a blog), the API answers
 * `202 { data: { pendingApproval: true, request } }` instead of applying it.
 *
 * API helpers turn that into a PendingApprovalError so every existing
 * `try { await save() } catch (err) { toast.error(err.message) }` call site
 * stops (nothing was saved yet) and shows the message; the toast layer
 * recognises the prefix and renders it as information, not a failure.
 */
export const PENDING_APPROVAL_PREFIX = "Submitted for approval";

export const PENDING_APPROVAL_EVENT = "nura:approval-submitted";

export class PendingApprovalError extends Error {
  readonly pendingApproval = true;
  constructor(message = `${PENDING_APPROVAL_PREFIX}. You'll see it in My Requests once reviewed.`) {
    super(message);
    this.name = "PendingApprovalError";
  }
}

export const isPendingApprovalMessage = (message: string) =>
  message.startsWith(PENDING_APPROVAL_PREFIX);

export const isPendingApprovalError = (error: unknown): error is PendingApprovalError =>
  error instanceof PendingApprovalError;

type MaybePending = { data?: { pendingApproval?: boolean } } | undefined | null;

/** Throw a PendingApprovalError when the response is a queued approval. */
export function throwIfPendingApproval(status: number, body: unknown) {
  if (status === 202 && (body as MaybePending)?.data?.pendingApproval) {
    // Lets the sidebar refresh its "My requests" badge.
    window.dispatchEvent(new Event(PENDING_APPROVAL_EVENT));
    throw new PendingApprovalError();
  }
}
