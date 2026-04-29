import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

type Props = {
  children: ReactNode;
};

type State = {
  /** `null` = healthy, otherwise the error that took the tree down. */
  error: Error | null;
};

/**
 * Catches synchronous render / lifecycle errors anywhere beneath us and
 * shows a humane fallback instead of the default blank screen.
 *
 * "Reload" clears the error state and forces a hard refresh — we do a full
 * refresh rather than just re-render because the tree below us may have been
 * left in an inconsistent state (zustand stores, HA websocket, etc.) that's
 * easier to rebuild from scratch than to reason about.
 *
 * Anything that escapes React's reconciler (async rejections, raw
 * `window.onerror`) is picked up by `installGlobalErrorLoggers` in main.tsx.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the console output verbose: stack + React component stack, clearly
    // labelled so it's searchable in the browser devtools.
    // eslint-disable-next-line no-console
    console.error(
      "[crash] React ErrorBoundary caught",
      { message: error.message, name: error.name, stack: error.stack },
      { componentStack: info.componentStack },
    );
  }

  private readonly reload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5 pt-10 text-ink-text">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-ink-muted">
          The dashboard hit an unexpected error. Reloading usually fixes it.
        </p>
        <pre className="max-h-60 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-red-200">
          {error.name}: {error.message}
          {error.stack ? `\n\n${error.stack}` : ""}
        </pre>
        <button
          type="button"
          onClick={this.reload}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-ink-text transition hover:bg-white/15 active:bg-white/20"
        >
          <RefreshCw size={16} strokeWidth={2} />
          Reload
        </button>
      </div>
    );
  }
}
