import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clipboard, Keyboard, QrCode, X } from "lucide-react";
import type { BaseThemeId, Bridge, ManualPayload } from "../bridge";
import { combineMotionPresets, duration, ease, resolveMotionState, useMotionVariants, useResolvedMotionMode } from "../lib/motion";
import { ThemedSelect } from "./ThemedSelect";
import { toUiError, type UiError } from "../utils/errors";

interface Props {
  bridge?: Bridge;
  theme: BaseThemeId;
  defaultDigits: 6 | 8;
  defaultPeriod: number;
  onAddUri(uri: string): Promise<void>;
  onAddManual(payload: ManualPayload): Promise<void>;
  onClose(): void;
  onScanFeedback?(error: UiError): void;
  isClosing?: boolean;
  initialMethod?: Method;
  openScanOverlayOnOpen?: boolean;
}

type Method = "uri" | "manual" | "scan";
type ScanStep = "intro" | "scanning" | "failure" | "confirm";

type ScanPreview = {
  uri: string;
  issuer: string;
  label: string;
  secretMasked: string;
};

type MethodOption = {
  id: Method;
  title: string;
  description: string;
  icon: React.ReactNode;
};

const MODAL_EXIT_MS = 220;

const ALL_METHODS: MethodOption[] = [
  {
    id: "uri",
    title: "Paste setup link",
    description: "Paste the full 2FA setup link from your service",
    icon: <Clipboard size={18} aria-hidden="true" />,
  },
  {
    id: "manual",
    title: "Manual",
    description: "Enter account details directly",
    icon: <Keyboard size={18} aria-hidden="true" />,
  },
  {
    id: "scan",
    title: "Scan QR",
    description: "Capture QR from your screen",
    icon: <QrCode size={18} aria-hidden="true" />,
  },
];

function normalizeSecretForInput(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "");
}

function normalizeSecretForSave(value: string): string {
  return normalizeSecretForInput(value).replace(/=/g, "");
}

function parseScannedOtpauth(uriText: string): { issuer: string; label: string; secret: string } {
  let uri: URL;
  try {
    uri = new URL(uriText);
  } catch {
    throw { code: "E_URI_INVALID", message: "This QR code does not contain a supported 2FA setup link." };
  }

  if (uri.protocol !== "otpauth:" || uri.hostname !== "totp") {
    throw { code: "E_URI_INVALID", message: "This QR code does not contain a supported 2FA setup link." };
  }

  const scannedSecret = uri.searchParams.get("secret") ?? "";
  const secret = normalizeSecretForSave(scannedSecret);
  if (!secret || !/^[A-Z2-7]+$/.test(secret)) {
    throw { code: "E_URI_INVALID", message: "This QR code does not contain a supported 2FA setup link." };
  }

  const rawPath = decodeURIComponent(uri.pathname.replace(/^\//, ""));
  const colonIdx = rawPath.indexOf(":");
  const issuerFromPath = colonIdx > 0 ? rawPath.slice(0, colonIdx).trim() : "";
  const labelFromPath = colonIdx > 0 ? rawPath.slice(colonIdx + 1).trim() : rawPath.trim();
  const issuer = (uri.searchParams.get("issuer") ?? issuerFromPath).trim() || "Unknown";
  const label = labelFromPath || issuer || "Account";

  return { issuer, label, secret };
}

function maskSecret(secret: string): string {
  const value = normalizeSecretForSave(secret);
  if (!value) return "-";
  if (value.length <= 8) {
    return `${value.slice(0, 2)}${"*".repeat(Math.max(1, value.length - 4))}${value.slice(-2)}`;
  }
  return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

function resolveScanError(error: unknown): UiError {
  const resolved = toUiError(error);
  if (resolved.code === "E_URI_INVALID") {
    return {
      code: "E_URI_INVALID",
      title: "Unsupported QR content",
      instruction: "This QR code does not contain a supported 2FA setup link.",
    };
  }
  return resolved;
}

function getFocusableNodes(root: HTMLElement): HTMLElement[] {
  const selector = [
    "button:not([disabled])",
    "[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((node) => !node.hasAttribute("aria-hidden"));
}

export function AddModal({
  bridge,
  theme,
  defaultDigits,
  defaultPeriod,
  onAddUri,
  onAddManual,
  onClose,
  onScanFeedback,
  isClosing = false,
  initialMethod = "uri",
  openScanOverlayOnOpen = false,
}: Props) {
  const motionVariants = useMotionVariants();
  const resolvedMotionMode = useResolvedMotionMode();
  const overlayPresence = React.useMemo(() => {
    const preset = combineMotionPresets(motionVariants.fadeIn, motionVariants.fadeOut);
    if (resolvedMotionMode !== "full") {
      return preset;
    }

    return {
      ...preset,
      transition: { duration: 0.18, ease: ease.standard },
    };
  }, [motionVariants, resolvedMotionMode]);
  const modalPresence = React.useMemo(() => {
    if (resolvedMotionMode !== "full") {
      return combineMotionPresets(motionVariants.scaleIn, motionVariants.scaleOut);
    }

    return {
      initial: "initial",
      animate: "animate",
      exit: "exit",
      variants: {
        initial: { opacity: 0, scale: 0.989, y: 12 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.994, y: 4 },
      },
      transition: { duration: 0.24, ease: ease.standard },
    };
  }, [motionVariants, resolvedMotionMode]);
  const [method, setMethod] = React.useState<Method>(initialMethod);
  const [methodDirection, setMethodDirection] = React.useState<1 | -1>(1);
  const [uri, setUri] = React.useState("");
  const [issuer, setIssuer] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [digits, setDigits] = React.useState<6 | 8>(defaultDigits);
  const [period, setPeriod] = React.useState(defaultPeriod);
  const [algorithm, setAlgorithm] = React.useState<"SHA1" | "SHA256" | "SHA512">("SHA1");
  const [error, setError] = React.useState<UiError | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [scanOverlayOpen, setScanOverlayOpen] = React.useState(false);
  const [scanOverlayExiting, setScanOverlayExiting] = React.useState(false);
  const [scanStep, setScanStep] = React.useState<ScanStep>("intro");
  const [scanError, setScanError] = React.useState<UiError | null>(null);
  const [scanBusy, setScanBusy] = React.useState(false);
  const [scanPreview, setScanPreview] = React.useState<ScanPreview | null>(null);
  const [scanInlineError, setScanInlineError] = React.useState<UiError | null>(null);

  const uriRef = React.useRef<HTMLTextAreaElement | null>(null);
  const secretRef = React.useRef<HTMLInputElement | null>(null);
  const scanStartRef = React.useRef<HTMLButtonElement | null>(null);
  const scanDialogRef = React.useRef<HTMLElement | null>(null);
  const scanRequestRef = React.useRef(0);
  const scanCloseTimerRef = React.useRef<number | null>(null);
  const autoOpenedScanRef = React.useRef(false);

  const canCameraScan = Boolean(bridge?.scanQr);
  const canScreenScan = Boolean(bridge?.scanFromScreen);

  const methodOptions = React.useMemo<MethodOption[]>(() => {
    if (!canCameraScan && !canScreenScan) {
      return ALL_METHODS.filter((item) => item.id !== "scan");
    }
    return ALL_METHODS;
  }, [canCameraScan, canScreenScan]);

  const methodPresence = React.useMemo(
    () => {
      if (resolvedMotionMode !== "full") {
        return combineMotionPresets(
          methodDirection === 1 ? motionVariants.stepEnterForward : motionVariants.stepEnterBackward,
          methodDirection === 1 ? motionVariants.stepExitForward : motionVariants.stepExitBackward
        );
      }

      const distance = 14;
      const enterX = methodDirection === 1 ? distance : -distance;
      const exitX = methodDirection === 1 ? -distance : distance;

      return {
        initial: "initial",
        animate: "animate",
        exit: "exit",
        variants: {
          initial: { opacity: 0, x: enterX, y: 2 },
          animate: { opacity: 1, x: 0, y: 0 },
          exit: { opacity: 0, x: exitX, y: -1 },
        },
        transition: { duration: 0.18, ease: ease.standard },
      };
    },
    [methodDirection, motionVariants, resolvedMotionMode]
  );
  const tapScale = motionVariants.tapScale;

  const changeMethod = React.useCallback(
    (next: Method) => {
      if (next === method) {
        return;
      }

      const currentIndex = methodOptions.findIndex((option) => option.id === method);
      const nextIndex = methodOptions.findIndex((option) => option.id === next);
      setMethodDirection(nextIndex >= currentIndex ? 1 : -1);
      setMethod(next);
    },
    [method, methodOptions]
  );

  const finalizeCloseScanOverlay = React.useCallback(() => {
    setScanOverlayOpen(false);
    setScanOverlayExiting(false);
    setScanStep("intro");
    setScanError(null);
    setScanBusy(false);
    setScanPreview(null);
    setScanInlineError(null);
  }, []);

  const closeScanOverlay = React.useCallback(() => {
    scanRequestRef.current += 1;
    if (!scanOverlayOpen) {
      finalizeCloseScanOverlay();
      return;
    }
    if (scanCloseTimerRef.current != null) {
      window.clearTimeout(scanCloseTimerRef.current);
      scanCloseTimerRef.current = null;
    }
    setScanOverlayExiting(true);
    scanCloseTimerRef.current = window.setTimeout(() => {
      finalizeCloseScanOverlay();
      scanCloseTimerRef.current = null;
    }, MODAL_EXIT_MS);
  }, [finalizeCloseScanOverlay, scanOverlayOpen]);

  React.useEffect(
    () => () => {
      if (scanCloseTimerRef.current != null) {
        window.clearTimeout(scanCloseTimerRef.current);
      }
    },
    []
  );

  React.useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (scanOverlayOpen) {
        closeScanOverlay();
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [closeScanOverlay, onClose, scanOverlayOpen]);

  React.useEffect(() => {
    if (method === "uri") uriRef.current?.focus();
    if (method === "manual") secretRef.current?.focus();
    setError(null);
  }, [method]);

  React.useEffect(() => {
    setMethodDirection(1);
    setMethod(initialMethod);
  }, [initialMethod]);

  React.useEffect(() => {
    if (!openScanOverlayOnOpen) return;
    if (autoOpenedScanRef.current) return;
    if (method !== "scan") return;

    autoOpenedScanRef.current = true;
    setScanOverlayOpen(true);
    setScanOverlayExiting(false);
    setScanStep("intro");
    setScanError(null);
    setScanPreview(null);
    setScanInlineError(null);
    window.setTimeout(() => scanStartRef.current?.focus(), 0);
  }, [method, openScanOverlayOnOpen]);

  React.useEffect(() => {
    if (!scanOverlayOpen) return;
    const root = scanDialogRef.current;
    if (!root) return;

    const focusables = getFocusableNodes(root);
    const first = focusables[0] ?? root;
    window.setTimeout(() => first.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const nodes = getFocusableNodes(root);
      if (nodes.length === 0) {
        event.preventDefault();
        return;
      }

      const current = document.activeElement as HTMLElement | null;
      const currentIndex = current ? nodes.indexOf(current) : -1;
      const nextIndex = event.shiftKey
        ? currentIndex <= 0
          ? nodes.length - 1
          : currentIndex - 1
        : currentIndex >= nodes.length - 1
          ? 0
          : currentIndex + 1;
      event.preventDefault();
      nodes[nextIndex]?.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [scanOverlayOpen, scanStep]);

  const clearForm = () => {
    setUri("");
    setIssuer("");
    setLabel("");
    setSecret("");
    setDigits(defaultDigits);
    setPeriod(defaultPeriod);
    setAlgorithm("SHA1");
    setError(null);
    setScanInlineError(null);
  };

  const handleUri = async () => {
    if (!uri.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onAddUri(uri.trim());
      clearForm();
      onClose();
    } catch (nextError) {
      setError(toUiError(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleManual = async () => {
    if (!secret.trim()) {
      setError({
        code: "E_SECRET_INVALID",
        title: "Secret is required",
        instruction: "Paste the Base32 secret from your service.",
      });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await onAddManual({
        issuer: issuer.trim(),
        label: label.trim() || "Account",
        secret: normalizeSecretForSave(secret),
        digits,
        period,
        algorithm,
      });
      clearForm();
      onClose();
    } catch (nextError) {
      setError(toUiError(nextError));
    } finally {
      setBusy(false);
    }
  };

  const handleScanCamera = async () => {
    if (!bridge?.scanQr) return;
    setBusy(true);
    setError(null);
    setScanInlineError(null);
    try {
      const value = await bridge.scanQr();
      if (!value) return;
      await onAddUri(value);
      clearForm();
      onClose();
    } catch (nextError) {
      const resolved = resolveScanError(nextError);
      setError(resolved);
      onScanFeedback?.(resolved);
    } finally {
      setBusy(false);
    }
  };

  const startScreenScan = React.useCallback(async () => {
    if (!bridge?.scanFromScreen || scanBusy) return;
    const requestId = scanRequestRef.current + 1;
    scanRequestRef.current = requestId;

    setScanStep("scanning");
    setScanBusy(true);
    setScanError(null);
    setScanPreview(null);
    setScanInlineError(null);

    try {
      const value = await bridge.scanFromScreen();
      if (scanRequestRef.current !== requestId) return;
      if (!value) {
        setScanStep("intro");
        return;
      }

      const parsed = parseScannedOtpauth(value.trim());
      setScanPreview({
        uri: value.trim(),
        issuer: parsed.issuer || "Unknown",
        label: parsed.label || "Account",
        secretMasked: maskSecret(parsed.secret),
      });
      setScanStep("confirm");
    } catch (nextError) {
      if (scanRequestRef.current !== requestId) return;
      const resolved = resolveScanError(nextError);
      setScanError(resolved);
      setScanInlineError(resolved);
      onScanFeedback?.(resolved);
      setScanStep("failure");
    } finally {
      if (scanRequestRef.current === requestId) {
        setScanBusy(false);
      }
    }
  }, [bridge?.scanFromScreen, onScanFeedback, scanBusy]);

  const confirmScannedAccount = React.useCallback(async () => {
    if (!scanPreview || busy) return;
    setBusy(true);
    setScanError(null);
    try {
      await onAddUri(scanPreview.uri);
      clearForm();
      closeScanOverlay();
      onClose();
    } catch (nextError) {
      const resolved = resolveScanError(nextError);
      setScanError(resolved);
      setScanInlineError(resolved);
      onScanFeedback?.(resolved);
      setScanStep("failure");
    } finally {
      setBusy(false);
    }
  }, [busy, closeScanOverlay, onAddUri, onClose, onScanFeedback, scanPreview]);

  const primaryActionLabel = React.useMemo(() => {
    if (method === "uri") return busy ? "Adding..." : "Add from URI";
    if (method === "manual") return busy ? "Adding..." : "Add account";
    if (!canScreenScan && canCameraScan) return busy ? "Scanning..." : "Open Camera";
    return "Scan QR from Screen";
  }, [busy, canCameraScan, canScreenScan, method]);

  const primaryActionIcon = React.useMemo(() => {
    if (method === "uri") return <Clipboard size={18} aria-hidden="true" />;
    if (method === "manual") return <Keyboard size={18} aria-hidden="true" />;
    return <QrCode size={18} aria-hidden="true" />;
  }, [method]);

  const canRunPrimaryAction =
    method === "uri"
      ? !busy && !!uri.trim()
      : method === "manual"
        ? !busy && !!secret.trim()
        : !busy && !scanBusy && (canScreenScan || canCameraScan);

  const handlePrimaryAction = async () => {
    if (method === "uri") {
      await handleUri();
      return;
    }
    if (method === "manual") {
      await handleManual();
      return;
    }
    if (!canScreenScan && canCameraScan) {
      await handleScanCamera();
      return;
    }
    setScanOverlayOpen(true);
    setScanOverlayExiting(false);
    setScanStep("intro");
    setScanError(null);
    setScanPreview(null);
    window.setTimeout(() => scanStartRef.current?.focus(), 0);
  };

  return (
    <motion.div
      className={`auth-overlay auth-add-overlay theme-${theme}`}
      onClick={onClose}
      role="presentation"
      initial={overlayPresence.initial}
      animate={resolveMotionState(overlayPresence, isClosing)}
      exit={overlayPresence.exit}
      variants={overlayPresence.variants}
      transition={overlayPresence.transition}
    >
      <motion.section
        className={`auth-modal auth-add-modal theme-${theme}`}
        onClick={(event: React.MouseEvent<HTMLElement>) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-account-title"
        initial={modalPresence.initial}
        animate={resolveMotionState(modalPresence, isClosing)}
        exit={modalPresence.exit}
        variants={modalPresence.variants}
        transition={modalPresence.transition}
      >
        <header className="auth-modal-header">
          <h2 id="add-account-title" className="auth-modal-title">
            Add Account
          </h2>
          <motion.button
            type="button"
            className="auth-icon-btn ui-focus"
            onClick={onClose}
            aria-label="Close add account dialog"
            title="Close"
            whileTap={tapScale.whileTap}
            transition={tapScale.transition}
          >
            <X size={18} aria-hidden="true" />
          </motion.button>
        </header>

        <div className="auth-method-chooser" role="tablist" aria-label="Add account method">
          {methodOptions.map((option) => (
            <motion.button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={method === option.id}
              className={`auth-method-card ui-focus ${method === option.id ? "is-active" : ""}`}
              onClick={() => changeMethod(option.id)}
              whileTap={tapScale.whileTap}
              transition={tapScale.transition}
            >
              <span className="auth-method-card-icon" aria-hidden="true">
                {option.icon}
              </span>
              <span className="auth-method-card-title">{option.title}</span>
              <span className="auth-method-card-note">{option.description}</span>
            </motion.button>
          ))}
        </div>

        <div className="auth-modal-panel auth-modal-panel-tight">
          <div className="auth-modal-method-shell">
          <AnimatePresence mode="sync" initial={false}>
            <motion.div
              key={method}
              className={`auth-modal-method-content${method === "scan" ? " auth-scan-method-content" : ""}`}
              initial={methodPresence.initial}
              animate={methodPresence.animate}
              exit={methodPresence.exit}
              variants={methodPresence.variants}
              transition={methodPresence.transition}
            >
          {method === "uri" ? (
            <>
              <p className="auth-modal-lead">Paste the full 2FA setup link from the site or app you are signing in to.</p>
              <textarea
                ref={uriRef}
                rows={5}
                value={uri}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setUri(event.target.value)}
                placeholder="otpauth://totp/Issuer:user@example.com?secret=..."
                className="auth-textarea ui-focus"
                aria-label="Paste 2FA setup link"
                autoComplete="off"
                spellCheck={false}
              />
            </>
          ) : null}

          {method === "manual" ? (
            <>
              <p className="auth-modal-lead">Enter account details manually.</p>

              <label className="auth-field">
                <span>Issuer</span>
                <input
                  value={issuer}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setIssuer(event.target.value)}
                  placeholder="GitHub"
                  className="auth-input ui-focus"
                  aria-label="Issuer"
                />
              </label>

              <label className="auth-field">
                <span>Label</span>
                <input
                  value={label}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setLabel(event.target.value)}
                  placeholder="user@example.com"
                  className="auth-input ui-focus"
                  aria-label="Label"
                />
              </label>

              <label className="auth-field">
                <span>Secret (Base32)</span>
                <input
                  ref={secretRef}
                  value={secret}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSecret(normalizeSecretForInput(event.target.value))}
                  placeholder="JBSWY3DPEHPK3PXP"
                  className="auth-input ui-focus"
                  aria-label="Secret"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>

              <p className="auth-muted auth-secret-note">Spaces are removed automatically when you paste a Base32 secret.</p>

              <div className="auth-field-row">
                <div className="auth-field compact">
                  <span>Digits</span>
                  <ThemedSelect
                    value={String(digits)}
                    onChange={(next) => setDigits(next === "8" ? 8 : 6)}
                    options={[
                      { value: "6", label: "6" },
                      { value: "8", label: "8" },
                    ]}
                    ariaLabel="Code digits"
                    disabled={busy}
                  />
                </div>

                <div className="auth-field compact">
                  <span>Period</span>
                  <ThemedSelect
                    value={String(period)}
                    onChange={(next) => setPeriod(Number(next) || 30)}
                    options={[
                      { value: "30", label: "30s" },
                      { value: "60", label: "60s" },
                    ]}
                    ariaLabel="Code period"
                    disabled={busy}
                  />
                </div>

                <div className="auth-field compact">
                  <span>Algorithm</span>
                  <ThemedSelect
                    value={algorithm}
                    onChange={(next) => setAlgorithm(next as "SHA1" | "SHA256" | "SHA512")}
                    options={[
                      { value: "SHA1", label: "SHA1" },
                      { value: "SHA256", label: "SHA256" },
                      { value: "SHA512", label: "SHA512" },
                    ]}
                    ariaLabel="Algorithm"
                    disabled={busy}
                  />
                </div>
              </div>
            </>
          ) : null}

          {method === "scan" ? (
            <>
              <p className="auth-modal-lead">{canScreenScan ? "Scan a QR code from your screen." : "Scan a QR code using your camera."}</p>
              <p className="auth-muted">{canScreenScan ? "You will select an area to scan." : "Use your camera to capture a 2FA QR code."}</p>
              {scanInlineError ? (
                <p className="auth-error" aria-live="polite">
                  {scanInlineError.title}. {scanInlineError.instruction} <span className="auth-error-code">Code: {scanInlineError.code}</span>
                </p>
              ) : null}
              {canCameraScan && canScreenScan ? (
                <motion.button
                  type="button"
                  onClick={() => void handleScanCamera()}
                  disabled={busy}
                  className="auth-btn auth-btn-subtle ui-focus"
                  aria-label="Open camera to scan QR"
                  whileTap={tapScale.whileTap}
                  transition={tapScale.transition}
                >
                  {busy ? "Scanning..." : "Open Camera Instead"}
                </motion.button>
              ) : null}
            </>
          ) : null}
            </motion.div>
          </AnimatePresence>
          </div>

          {error ? (
            <p className="auth-error" aria-live="polite">
              {error.title}. {error.instruction} <span className="auth-error-code">Code: {error.code}</span>
            </p>
          ) : null}
        </div>

        <footer className="auth-modal-footer auth-modal-footer-split">
          <motion.button
            type="button"
            onClick={onClose}
            className="auth-btn auth-btn-ghost ui-focus"
            aria-label="Cancel add account"
            whileTap={tapScale.whileTap}
            transition={tapScale.transition}
          >
            Cancel
          </motion.button>
          <motion.button
            type="button"
            onClick={() => void handlePrimaryAction()}
            disabled={!canRunPrimaryAction || scanOverlayOpen}
            className="auth-btn auth-btn-primary ui-focus"
            aria-label={primaryActionLabel}
            whileTap={tapScale.whileTap}
            transition={tapScale.transition}
          >
            <span aria-hidden="true">{primaryActionIcon}</span>
            {primaryActionLabel}
          </motion.button>
        </footer>

        {scanOverlayOpen ? (
          <motion.div
            className={`auth-scan-overlay theme-${theme}`}
            role="presentation"
            onClick={closeScanOverlay}
            initial={overlayPresence.initial}
            animate={resolveMotionState(overlayPresence, scanOverlayExiting)}
            exit={overlayPresence.exit}
            variants={overlayPresence.variants}
            transition={overlayPresence.transition}
          >
            <motion.section
              ref={scanDialogRef}
              className={`auth-scan-dialog theme-${theme}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="screen-scan-title"
              onClick={(event) => event.stopPropagation()}
              tabIndex={-1}
              initial={modalPresence.initial}
              animate={resolveMotionState(modalPresence, scanOverlayExiting)}
              exit={modalPresence.exit}
              variants={modalPresence.variants}
              transition={modalPresence.transition}
            >
              <header className="auth-modal-header auth-scan-dialog-header">
                <h3 id="screen-scan-title" className="auth-modal-title">
                  Scan QR from Screen
                </h3>
              </header>

              <div className="auth-modal-panel auth-scan-dialog-panel">
                <p className="auth-muted">Drag to select the area containing the QR code.</p>
                <p className="auth-muted">Tip: include a little margin around the QR code.</p>

                <p className="auth-scan-status" aria-live="polite">
                  {scanStep === "scanning" ? (
                    <>
                      <span className="auth-inline-spinner" aria-hidden="true" />
                      <span>Scanning selected area...</span>
                    </>
                  ) : scanStep === "confirm" ? (
                    "Review scanned account details before adding."
                  ) : scanStep === "failure" ? (
                    "No QR code found in the selected area."
                  ) : (
                    "Ready to scan."
                  )}
                </p>

                {scanStep === "failure" && scanError ? (
                  <div className="auth-scan-failure-box">
                    <p className="auth-error" aria-live="polite">
                      {scanError.title}. {scanError.instruction} <span className="auth-error-code">Code: {scanError.code}</span>
                    </p>
                    <details className="auth-scan-tips">
                      <summary>Tips</summary>
                      <ul>
                        <li>Select a larger area.</li>
                        <li>Make sure the QR code is not blurred.</li>
                        <li>Increase zoom in the source window.</li>
                      </ul>
                    </details>
                  </div>
                ) : null}

                {scanStep === "confirm" && scanPreview ? (
                  <div className="auth-scan-preview">
                    <div>
                      <p className="auth-scan-preview-label">Issuer</p>
                      <p className="auth-scan-preview-value">{scanPreview.issuer}</p>
                    </div>
                    <div>
                      <p className="auth-scan-preview-label">Account</p>
                      <p className="auth-scan-preview-value">{scanPreview.label}</p>
                    </div>
                    <div>
                      <p className="auth-scan-preview-label">Secret</p>
                      <p className="auth-scan-preview-value auth-scan-secret">{scanPreview.secretMasked}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <footer className="auth-modal-footer auth-modal-footer-split">
                {scanStep === "failure" ? (
                  <>
                    <motion.button type="button" onClick={closeScanOverlay} className="auth-btn auth-btn-ghost ui-focus" whileTap={tapScale.whileTap} transition={tapScale.transition}>
                      Cancel
                    </motion.button>
                    <motion.button type="button" onClick={() => void startScreenScan()} className="auth-btn auth-btn-primary ui-focus" disabled={scanBusy} whileTap={tapScale.whileTap} transition={tapScale.transition}>
                      Try again
                    </motion.button>
                  </>
                ) : null}

                {scanStep === "confirm" ? (
                  <>
                    <motion.button type="button" onClick={() => setScanStep("intro")} className="auth-btn auth-btn-ghost ui-focus" disabled={busy} whileTap={tapScale.whileTap} transition={tapScale.transition}>
                      Back
                    </motion.button>
                    <motion.button type="button" onClick={() => void confirmScannedAccount()} className="auth-btn auth-btn-primary ui-focus" disabled={busy} whileTap={tapScale.whileTap} transition={tapScale.transition}>
                      {busy ? "Adding..." : "Add account"}
                    </motion.button>
                  </>
                ) : null}

                {scanStep === "intro" || scanStep === "scanning" ? (
                  <>
                    <motion.button type="button" onClick={closeScanOverlay} className="auth-btn auth-btn-ghost ui-focus" whileTap={tapScale.whileTap} transition={tapScale.transition}>
                      Cancel
                    </motion.button>
                    <motion.button
                      ref={scanStartRef}
                      type="button"
                      onClick={() => void startScreenScan()}
                      className="auth-btn auth-btn-primary ui-focus"
                      disabled={scanBusy}
                      whileTap={tapScale.whileTap}
                      transition={tapScale.transition}
                    >
                      {scanStep === "scanning" ? "Scanning..." : "Start selection"}
                    </motion.button>
                  </>
                ) : null}
              </footer>
            </motion.section>
          </motion.div>
        ) : null}
      </motion.section>
    </motion.div>
  );
}
