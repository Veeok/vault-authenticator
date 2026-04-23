import * as React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Check, Copy, KeyRound, ShieldAlert } from "lucide-react";
import { useDpiMode } from "../hooks/useDpiMode";
import { combineMotionPresets, resolveMotionState, useMotionVariants } from "../lib/motion";

type RecoverySecretDisplayProps = {
  secret: string;
  acknowledged: boolean;
  onAcknowledgedChange(next: boolean): void;
  onCopy(): Promise<boolean | void> | boolean | void;
  onDone?(): void;
  doneLabel?: string;
  themeClass?: string;
  presentation?: "modal" | "inline";
  copyLabel?: string;
  copiedLabel?: string;
  title?: string;
  acknowledgementLabel?: string;
  acknowledgementAriaLabel?: string;
};

export function RecoverySecretDisplay({
  secret,
  acknowledged,
  onAcknowledgedChange,
  onCopy,
  onDone,
  doneLabel = "Done",
  themeClass = "",
  presentation = "modal",
  copyLabel = "Copy secret",
  copiedLabel = "Copied",
  title = "Recovery secret",
  acknowledgementLabel = "I've saved my recovery secret",
  acknowledgementAriaLabel = "Confirm recovery secret saved",
}: RecoverySecretDisplayProps) {
  const motionVariants = useMotionVariants();
  const dpiMode = useDpiMode();
  const isCompact = dpiMode === "compact";
  const revealPresence = React.useMemo(() => combineMotionPresets(motionVariants.fadeSlideUp, motionVariants.fadeOut), [motionVariants]);
  const overlayPresence = React.useMemo(() => combineMotionPresets(motionVariants.fadeIn, motionVariants.fadeOut), [motionVariants]);
  const modalPresence = React.useMemo(() => combineMotionPresets(motionVariants.scaleIn, motionVariants.scaleOut), [motionVariants]);
  const actionTap = motionVariants.tapScale;
  const groups = secret.split("-").filter((part) => part.trim().length > 0);
  const normalizedSecret = groups.join("-");
  const rootClassName = typeof document !== "undefined" ? document.querySelector(".auth-root")?.className ?? "auth-root" : "auth-root";
  const [copied, setCopied] = React.useState(false);
  const copyResetTimerRef = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (copyResetTimerRef.current != null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    },
    []
  );

  const handleCopy = React.useCallback(async () => {
    const result = await onCopy();
    if (result === false) {
      return;
    }

    setCopied(true);
    if (copyResetTimerRef.current != null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copyResetTimerRef.current = null;
    }, 3000);
  }, [onCopy]);

  const content = (
    <>
      {presentation === "modal" ? (
        <div className="auth-recovery-secret-callout" role="note">
          <span className="auth-recovery-secret-callout-icon" aria-hidden="true">
            <ShieldAlert size={16} />
          </span>
          <div className="auth-recovery-secret-callout-copy">
            <p className="auth-recovery-secret-callout-title">Shown once. Save the full key.</p>
            <p className="auth-recovery-secret-callout-text">This recovery secret only appears now. Store the complete key before closing this window.</p>
          </div>
        </div>
      ) : null}

      <div className="auth-recovery-secret-hero">
        <div className="auth-recovery-secret-hero-copy">
          <p className="auth-recovery-secret-hero-eyebrow">One full recovery secret</p>
          <p className="auth-recovery-secret-hero-title">Use every group together as a single key.</p>
          <p className="auth-recovery-secret-hero-text">{isCompact ? "Save the complete key and use it exactly as one recovery secret later." : "Save the complete key below and use it later as one full recovery secret."}</p>
        </div>

        <div className="auth-recovery-secret-full-block">
          <p className="auth-recovery-secret-full-label">Full recovery secret</p>
          <code className="auth-recovery-secret-full-value">{normalizedSecret}</code>
        </div>
      </div>

      <div className="auth-recovery-secret-guidance" role="note" aria-label="Recovery secret guidance">
        <p className="auth-recovery-secret-guidance-item">Enter all groups together, not a single segment.</p>
        <p className="auth-recovery-secret-guidance-item">Hyphens are optional when entering the recovery secret.</p>
        {!isCompact ? <p className="auth-recovery-secret-guidance-item">Older recovery secrets may end with a shorter final group.</p> : null}
      </div>

      <div className="auth-inline-actions auth-recovery-secret-button-stack">
        <motion.button
          type="button"
          className="auth-btn auth-btn-subtle ui-focus auth-btn-modal"
          onClick={() => void handleCopy()}
          whileTap={actionTap.whileTap}
          transition={actionTap.transition}
        >
          {copied ? <Check size={15} className="auth-btn-icon" aria-hidden="true" /> : <Copy size={15} className="auth-btn-icon" aria-hidden="true" />}
          {copied ? copiedLabel : copyLabel}
        </motion.button>
      </div>

      <label className="auth-field auth-field-checkbox auth-recovery-secret-check">
        <span className="auth-recovery-secret-check-copy">{acknowledgementLabel}</span>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => onAcknowledgedChange(event.target.checked)}
          className="ui-focus auth-recovery-secret-check-input"
          aria-label={acknowledgementAriaLabel}
        />
        <span className="auth-recovery-secret-check-indicator" aria-hidden="true">
          <Check size={14} className="auth-recovery-secret-check-icon" />
        </span>
      </label>
    </>
  );

  if (presentation === "inline") {
    return (
      <motion.div
        className={`auth-recovery-secret-inline${isCompact ? " is-compact" : ""}`}
        initial={revealPresence.initial}
        animate={resolveMotionState(revealPresence)}
        exit={revealPresence.exit}
        variants={revealPresence.variants}
        transition={revealPresence.transition}
      >
        {content}
      </motion.div>
    );
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className={rootClassName} data-recovery-secret-portal="true">
      <motion.div
        className={`auth-overlay auth-recovery-secret-overlay ${themeClass}`.trim()}
        role="presentation"
        initial={overlayPresence.initial}
        animate={resolveMotionState(overlayPresence)}
        exit={overlayPresence.exit}
        variants={overlayPresence.variants}
        transition={overlayPresence.transition}
      >
        <motion.section
          className={`auth-confirm-modal auth-recovery-secret-modal${isCompact ? " is-compact" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Recovery secret"
          initial={modalPresence.initial}
          animate={resolveMotionState(modalPresence)}
          exit={modalPresence.exit}
          variants={modalPresence.variants}
          transition={modalPresence.transition}
        >
          <header className="auth-modal-header">
            <h2 className="auth-modal-title auth-confirm-title">
              <span className="auth-confirm-title-icon" aria-hidden="true">
                <KeyRound size={16} />
              </span>
              <span>{title}</span>
            </h2>
          </header>

          <div className="auth-confirm-body auth-recovery-secret-body">{content}</div>

          {onDone ? (
            <footer className="auth-confirm-actions auth-backup-codes-actions auth-recovery-secret-footer">
              <motion.button
                type="button"
                className="auth-btn auth-btn-primary ui-focus auth-btn-modal"
                onClick={onDone}
                disabled={!acknowledged}
                whileTap={actionTap.whileTap}
                transition={actionTap.transition}
              >
                {doneLabel}
              </motion.button>
            </footer>
          ) : null}
        </motion.section>
      </motion.div>
    </div>,
    document.body
  );
}
