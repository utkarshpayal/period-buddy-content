import React from "react";
import { Database, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { PERMISSIONS } from "../auth/access";
import { isAdminApiConfigured } from "../api/adminApi";

export const ApiBanner: React.FC = () => {
  const { apiSource, apiMessage, isLoading, refreshContent, can } = useAppContext();
  // Who reviews this person's changes, if anyone. Content Admins draft
  // content for a Content Super Admin; App Admins' wide pushes, suspensions
  // and pricing go to an App Super Admin. Other roles need no approval.
  const approvalNote = !isAdminApiConfigured
    ? null
    : can(PERMISSIONS.CONTENT_WRITE) && !can(PERMISSIONS.CONTENT_PUBLISH)
      ? (
          <>
            You can create and edit drafts freely. <strong>Publishing, removing, or editing live content</strong> is
            sent to a Content Super Admin for approval.
          </>
        )
      : can(PERMISSIONS.PUSH_SEND) && !can(PERMISSIONS.APP_APPROVE)
        ? (
            <>
              <strong>Wide pushes, user suspensions and pricing changes</strong> are sent to an App Super Admin for
              approval.
            </>
          )
        : null;

  return (
    <>
      {approvalNote && (
        <section className="approval-banner" aria-live="polite">
          <ShieldCheck size={18} />
          <span>{approvalNote}</span>
          <Link to="/approvals">My requests</Link>
        </section>
      )}
      {apiSource !== "api" && (
        <section className={`api-banner ${apiSource} `} aria-live="polite">
          <div>
            <Database size={18} />
            <strong>{apiSource === "blocked" ? "Permission needed" : "Local Sandbox Mode"}</strong>
            <span>{apiMessage}</span>
          </div>
          <button disabled={isLoading} onClick={refreshContent} type="button">
            {isLoading ? <Loader2 className="spin-icon" size={16} /> : <RefreshCw size={16} />}
            Refresh Content
          </button>
        </section>
      )}
    </>
  );
};
