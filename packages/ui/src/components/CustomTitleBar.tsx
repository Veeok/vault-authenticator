import * as React from "react";

export interface CustomTitleBarControls {
  minimize(): Promise<void> | void;
  maximize(): Promise<void> | void;
  unmaximize(): Promise<void> | void;
  close(): Promise<void> | void;
  isMaximized(): Promise<boolean>;
  getVersion?(): Promise<string>;
  isBackgrounded?(): Promise<boolean>;
  getAlwaysOnTop?(): Promise<boolean>;
  setAlwaysOnTop?(enabled: boolean): Promise<void> | void;
  onMaximizedChanged?(cb: (maximized: boolean) => void): (() => void) | void;
  onAlwaysOnTopChanged?(cb: (enabled: boolean) => void): (() => void) | void;
  onBackgroundedChanged?(cb: (backgrounded: boolean) => void): (() => void) | void;
  onAppCommand?(cb: (command: string) => void): (() => void) | void;
}

interface CustomTitleBarProps {
  controls: CustomTitleBarControls;
  appName?: string;
  contextLabel?: string;
  iconSrc?: string;
  alwaysOnTop?: boolean;
  onToggleAlwaysOnTop?: () => void;
}

export function CustomTitleBar({
  controls,
  appName = "Vault Authenticator",
  contextLabel,
  iconSrc,
  alwaysOnTop = false,
  onToggleAlwaysOnTop,
}: CustomTitleBarProps) {
  const [maximized, setMaximized] = React.useState(false);
  const hasIconImage = typeof iconSrc === "string" && iconSrc.trim().length > 0;

  const refreshMaximized = React.useCallback(async () => {
    try {
      const next = await controls.isMaximized();
      setMaximized(!!next);
    } catch {
      setMaximized(false);
    }
  }, [controls]);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next = await controls.isMaximized();
        if (active) {
          setMaximized(!!next);
        }
      } catch {
        if (active) {
          setMaximized(false);
        }
      }
    })();

    const unsubscribe = controls.onMaximizedChanged?.((next) => {
      if (!active) return;
      setMaximized(!!next);
    });

    const onFocus = () => {
      void refreshMaximized();
    };

    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [controls, refreshMaximized]);

  const handleMinimize = React.useCallback(() => {
    void controls.minimize();
  }, [controls]);

  const handleToggleMaximize = React.useCallback(() => {
    if (maximized) {
      void controls.unmaximize();
      return;
    }
    void controls.maximize();
  }, [controls, maximized]);

  const handleClose = React.useCallback(() => {
    void controls.close();
  }, [controls]);

  const handleToggleAlwaysOnTop = React.useCallback(() => {
    onToggleAlwaysOnTop?.();
  }, [onToggleAlwaysOnTop]);

  return (
    <header className="auth-titlebar" role="banner">
      <div className="auth-titlebar-drag" onDoubleClick={handleToggleMaximize}>
        <div className="auth-titlebar-brand">
          <span className={`auth-titlebar-icon${hasIconImage ? " auth-titlebar-icon-image" : ""}`} aria-hidden="true">
            {hasIconImage ? (
              <img src={iconSrc} alt="" draggable={false} />
            ) : (
              <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
                <path d="M8 1.5l4.5 1.8v3.9c0 3.1-1.8 5.8-4.5 7.1C5.3 13 3.5 10.3 3.5 7.2V3.3L8 1.5z" fill="currentColor" />
                <path d="M8 5.2a1.5 1.5 0 00-1.5 1.5v.8h3v-.8A1.5 1.5 0 008 5.2zm2.2 3H5.8a.3.3 0 00-.3.3v2.3c0 .2.1.3.3.3h4.4c.2 0 .3-.1.3-.3V8.5a.3.3 0 00-.3-.3z" fill="#ffffff" />
              </svg>
            )}
          </span>
          <span className="auth-titlebar-name">{appName}</span>
          {contextLabel ? <span className="auth-titlebar-context">{contextLabel}</span> : null}
        </div>
      </div>

      <div className="auth-titlebar-controls" aria-label="Window controls">
        <button
          type="button"
          className={`auth-titlebar-btn auth-titlebar-btn-pin ui-focus${alwaysOnTop ? " is-active" : ""}`}
          onClick={handleToggleAlwaysOnTop}
          aria-label={alwaysOnTop ? "Disable always on top" : "Enable always on top"}
          title={alwaysOnTop ? "Disable always on top" : "Enable always on top"}
          aria-pressed={alwaysOnTop}
        >
          <span className="auth-titlebar-pin-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
              <path
                d="M5.5 2.5h5l-1.5 3v2.2l1.8 1.3v.8H5.2v-.8L7 7.7V5.5l-1.5-3z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M8 9.8v3.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        </button>

        <button
          type="button"
          className="auth-titlebar-btn ui-focus"
          onClick={handleMinimize}
          aria-label="Minimize"
          title="Minimize"
        >
          <span className="auth-titlebar-glyph auth-titlebar-glyph-minimize" aria-hidden="true" />
        </button>

        <button
          type="button"
          className="auth-titlebar-btn ui-focus"
          onClick={handleToggleMaximize}
          aria-label={maximized ? "Restore" : "Maximize"}
          title={maximized ? "Restore" : "Maximize"}
        >
          <span
            className={`auth-titlebar-glyph ${maximized ? "auth-titlebar-glyph-restore" : "auth-titlebar-glyph-maximize"}`}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          className="auth-titlebar-btn auth-titlebar-btn-close ui-focus"
          onClick={handleClose}
          aria-label="Close"
          title="Close"
        >
          <span className="auth-titlebar-glyph auth-titlebar-glyph-close" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
