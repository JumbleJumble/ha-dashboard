import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/plus-jakarta-sans";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

installGlobalErrorLoggers();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

/**
 * React's ErrorBoundary only catches errors raised during render / lifecycle.
 * Promise rejections, timer callbacks, websocket handlers and other async
 * work escape it. These two listeners give us one consistent "[crash]"-
 * prefixed line in the console for *any* top-level error, which makes the
 * occasional hard-to-reproduce crash actually searchable after the fact.
 *
 * Intentionally side-effect only: we never prevent default behaviour, we
 * just make sure the failure is loud.
 */
function installGlobalErrorLoggers(): void {
  window.addEventListener("error", (ev) => {
    const err = ev.error;
    // eslint-disable-next-line no-console
    console.error("[crash] window.onerror", {
      message: ev.message,
      filename: ev.filename,
      lineno: ev.lineno,
      colno: ev.colno,
      name: err instanceof Error ? err.name : undefined,
      stack: err instanceof Error ? err.stack : undefined,
    });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason;
    const serialised =
      reason instanceof Error
        ? { name: reason.name, message: reason.message, stack: reason.stack }
        : { raw: safeStringify(reason) };
    // eslint-disable-next-line no-console
    console.error("[crash] unhandledrejection", serialised);
  });
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
