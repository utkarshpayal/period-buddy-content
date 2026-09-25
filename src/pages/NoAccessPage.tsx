import React from "react";
import { Link } from "react-router-dom";
import { LogOut, ShieldOff } from "lucide-react";
import { useAppContext } from "../context/AppContext";

/**
 * Shown for a page outside the user's role, or (with `signOut`) for an
 * account that isn't workspace staff at all, e.g. a regular app user.
 */
export const NoAccessPage: React.FC<{ signOut?: boolean }> = ({ signOut }) => {
  const { logout, authSession } = useAppContext();

  return (
    <div className={signOut ? "no-access-screen" : "workspace-page"}>
      <div className="no-access-card">
        <span className="no-access-icon" aria-hidden>
          <ShieldOff size={26} />
        </span>
        <h2>{signOut ? "This account can't use the workspace" : "You don't have access to this page"}</h2>
        <p>
          {signOut
            ? `${authSession?.user?.email ?? "This account"} isn't a staff or clinician account. Ask a Super Admin to invite you from Team & Access.`
            : "Your role doesn't include this area. If you need it, ask your team's super admin to change your role."}
        </p>
        {signOut ? (
          <button type="button" className="primary-action" onClick={() => logout()}>
            <LogOut size={16} />
            Sign out
          </button>
        ) : (
          <Link to="/" className="primary-action">
            Back to Home
          </Link>
        )}
      </div>
    </div>
  );
};
