import React from "react";
import { Database, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { PERMISSIONS } from "../auth/access";
import { isAdminApiConfigured } from "../api/adminApi";

export const ApiBanner: React.FC = () => {
  const { apiSource, apiMessage, isLoading, refreshContent, can } = useAppContext();
  const needsApproval = isAdminApiConfigured && !can(PERMISSIONS.CONTENT_PUBLISH);

  return (
    <>
      {needsApproval && (
        <section className="approval-banner" aria-live="polite">
          <ShieldCheck size={18} />
          <span>
            You can create and edit drafts freely. <strong>Publishing, removing, or editing live content</strong> is
            sent to a Content Super Admin for approval.
          </span>
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
