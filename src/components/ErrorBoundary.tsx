import React from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

type Props = { children: React.ReactNode; label?: string };
type State = { error: Error | null };

/**
 * Contains a render crash to one section instead of unmounting the whole app
 * (React leaves a blank page when an error escapes every component).
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="gy-alert gy-alert-error" role="alert">
        <AlertCircle size={16} />
        <span>
          Something went wrong showing {this.props.label ?? "this section"}: {this.state.error.message}
        </span>
        <button
          type="button"
          className="gy-btn gy-btn-ghost"
          style={{ marginLeft: "auto" }}
          onClick={() => this.setState({ error: null })}
        >
          <RotateCcw size={14} /> Try again
        </button>
      </div>
    );
  }
}
