import React from "react";
import { Database, Loader2, RefreshCw } from "lucide-react";
import { useAppContext } from "../context/AppContext";

export const ApiBanner: React.FC = () => {
  const { apiSource, apiMessage, isLoading, refreshContent } = useAppContext();

  return (
    <section className={`api-banner ${apiSource} `} aria-live="polite">
      <div>
        <Database size={18} />
        <strong>
          {apiSource === "api" 
            ? "Connected to Database" 
            : apiSource === "blocked" 
            ? "Permission needed" 
            : "Local Sandbox Mode"}
        </strong>
        <span>{apiMessage}</span>
      </div>
      <button disabled={isLoading} onClick={refreshContent} type="button">
        {isLoading ? <Loader2 className="spin-icon" size={16} /> : <RefreshCw size={16} />}
        Refresh Content
      </button>
    </section>
  );
};
