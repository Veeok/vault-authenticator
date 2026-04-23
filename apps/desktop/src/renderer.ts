import React from "react";
import ReactDOM from "react-dom/client";
import { App, desktopBridge } from "@authenticator/ui";
import appIconUrl from "../assets/icon.png";

type RendererWindowControls = {
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  close(): Promise<void>;
  getVersion(): Promise<string>;
  isMaximized(): Promise<boolean>;
  isBackgrounded(): Promise<boolean>;
  getAlwaysOnTop(): Promise<boolean>;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  onMaximizedChanged(cb: (maximized: boolean) => void): () => void;
  onAlwaysOnTopChanged(cb: (enabled: boolean) => void): () => void;
  onBackgroundedChanged(cb: (backgrounded: boolean) => void): () => void;
  onAppCommand?(cb: (command: string) => void): () => void;
};

type RootBoundaryState = {
  error: Error | null;
};

class RootErrorBoundary extends React.Component<React.PropsWithChildren, RootBoundaryState> {
  state: RootBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RootBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("Renderer crash", error, errorInfo.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return React.createElement(
      "main",
      {
        style: {
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          fontFamily: "Segoe UI, system-ui, sans-serif",
          background: "#0f172a",
          color: "#e2e8f0",
        },
      },
      React.createElement(
        "section",
        {
          style: {
            width: "min(100%, 560px)",
            border: "1px solid rgba(148, 163, 184, 0.35)",
            borderRadius: "12px",
            background: "rgba(15, 23, 42, 0.92)",
            padding: "18px",
            display: "grid",
            gap: "10px",
          },
        },
        React.createElement("h1", { style: { margin: 0, fontSize: "1.06rem" } }, "UI failed to load"),
        React.createElement(
          "p",
          { style: { margin: 0, color: "#cbd5e1", fontSize: "0.9rem" } },
          "A renderer error occurred. Restart the app. If this persists, check the terminal output for details."
        ),
        React.createElement(
          "pre",
          {
            style: {
              margin: 0,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              fontSize: "0.76rem",
              color: "#fecaca",
            },
          },
          this.state.error.message
        )
      )
    );
  }
}

const appElement = document.getElementById("app");
if (!appElement) {
  throw new Error("App root element '#app' was not found.");
}
const root = ReactDOM.createRoot(appElement);

const windowControls =
  typeof window !== "undefined"
    ? (window as Window & { windowAPI?: RendererWindowControls }).windowAPI
    : undefined;

root.render(
  React.createElement(
    RootErrorBoundary,
    null,
    React.createElement(App, { bridge: desktopBridge, windowControls, titleBarIconSrc: appIconUrl })
  )
);
