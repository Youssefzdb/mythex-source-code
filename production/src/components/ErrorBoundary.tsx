import { Component, type ErrorInfo, type ReactNode } from "react";
import { MythexMark } from "./mythex-mark";
import { appT } from "../i18n/app";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  /** One silent re-render has already been spent on this mount. */
  retried: boolean;
}

/**
 * Top-level React error boundary. A render-time crash anywhere in the tree would
 * otherwise blank the whole app (white screen); this catches it, reports to
 * Sentry (no-op when no DSN is configured), and offers a reload.
 *
 * The first crash is answered by rendering again, once. Some of them are not
 * about the app's own state at all — a translator rewriting the page under
 * React is the one this was added for — and a second attempt against the DOM
 * as it now stands succeeds, so the person keeps the workspace they were in
 * rather than being sent to a dead end. A second crash is the app's, and gets
 * the page below. Still reported either way: the retry hides nothing.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, retried: false };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidMount(): void {
    import.meta.hot?.on("vite:afterUpdate", () => {
      if (this.state.hasError) this.setState({ hasError: false, retried: false });
    });
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void import("@sentry/react").then((Sentry) => {
      Sentry.captureException(error, {
        extra: { componentStack: info.componentStack, retried: this.state.retried },
      });
    });
    // Surface in the console too for local debugging.
    console.error("Uncaught render error:", error, info);
    // Spend the one retry. `hasError` is already true, so this is a fresh
    // attempt at the same tree rather than a loop: a crash during it lands
    // here again with `retried` set, and the page below is shown.
    if (!this.state.retried) this.setState({ hasError: false, retried: true });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    // A class component, and the tree under it has crashed: read the strings
    // directly rather than through a hook.
    const t = appT();
    return (
      <div className="grid h-full min-h-screen place-items-center bg-bg px-6 text-center">
        <div>
          <MythexMark size={40} className="mx-auto opacity-70" />
          <h1 className="mt-4 text-lg font-semibold text-fg">{t.shell.errorBoundary.title}</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            {t.shell.errorBoundary.body}
          </p>
          <button onClick={() => window.location.reload()} className="btn-primary mt-5">
            {t.shell.errorBoundary.reload}
          </button>
        </div>
      </div>
    );
  }
}
