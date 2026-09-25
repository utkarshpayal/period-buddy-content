import React from "react";
import { Hourglass } from "lucide-react";
import { useAppContext } from "../context/AppContext";

const ACTION_TEXT: Record<string, string> = {
  update: "Edit pending review",
  publish: "Visibility change pending",
  delete: "Removal pending review"
};

/** Marks a content item that has an open change request. */
export const PendingBadge: React.FC<{ id: string }> = ({ id }) => {
  const { pendingContent } = useAppContext();
  const request = pendingContent.get(id);
  if (!request) return null;
  return (
    <span className="pending-chip" title={request.summary}>
      <Hourglass size={12} />
      {ACTION_TEXT[request.action] ?? "Pending review"}
    </span>
  );
};
