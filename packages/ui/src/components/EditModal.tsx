import * as React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { BaseThemeId, EditableAccount, UpdateAccountPayload } from "../bridge";
import { combineMotionPresets, useMotionVariants } from "../lib/motion";
import { ThemedSelect } from "./ThemedSelect";
import { toUiError, type UiError } from "../utils/errors";

interface Props {
  theme: BaseThemeId;
  account: EditableAccount;
  onSave(payload: UpdateAccountPayload): Promise<void>;
  onClose(): void;
}

export function EditModal({ theme, account, onSave, onClose }: Props) {
  const motionVariants = useMotionVariants();
  const overlayPresence = React.useMemo(() => combineMotionPresets(motionVariants.fadeIn, motionVariants.fadeOut), [motionVariants]);
  const modalPresence = React.useMemo(() => combineMotionPresets(motionVariants.scaleIn, motionVariants.scaleOut), [motionVariants]);
  const tapScale = motionVariants.tapScale;
  const [issuer, setIssuer] = React.useState(account.issuer);
  const [label, setLabel] = React.useState(account.label);
  const [digits, setDigits] = React.useState<6 | 8>(account.digits);
  const [period, setPeriod] = React.useState(account.period);
  const [algorithm, setAlgorithm] = React.useState<"SHA1" | "SHA256" | "SHA512">(account.algorithm);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<UiError | null>(null);

  React.useEffect(() => {
    setIssuer(account.issuer);
    setLabel(account.label);
    setDigits(account.digits);
    setPeriod(account.period);
    setAlgorithm(account.algorithm);
    setError(null);
    setBusy(false);
  }, [account]);

  React.useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [busy, onClose]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const payload: UpdateAccountPayload = {
      issuer: issuer.trim(),
      label: label.trim() || account.label || "Account",
      digits,
      period,
      algorithm,
    };

    try {
      await onSave(payload);
    } catch (nextError) {
      setError(toUiError(nextError));
      setBusy(false);
    }
  };

  return (
    <motion.div className={`auth-overlay theme-${theme}`} onClick={() => (busy ? undefined : onClose())} role="presentation" initial={overlayPresence.initial} animate={overlayPresence.animate} exit={overlayPresence.exit} variants={overlayPresence.variants} transition={overlayPresence.transition}>
      <motion.section
        className={`auth-modal theme-${theme}`}
        onClick={(e: React.MouseEvent<HTMLElement>) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit account"
        initial={modalPresence.initial}
        animate={modalPresence.animate}
        exit={modalPresence.exit}
        variants={modalPresence.variants}
        transition={modalPresence.transition}
      >
        <header className="auth-modal-header">
          <h2 className="auth-modal-title">Edit Account</h2>
          <motion.button type="button" className="auth-icon-btn ui-focus" onClick={onClose} aria-label="Close edit account dialog" disabled={busy} whileTap={tapScale.whileTap} transition={tapScale.transition}>
            <X size={18} aria-hidden="true" />
          </motion.button>
        </header>

        <form className="auth-modal-panel" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Issuer</span>
            <input
              value={issuer}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIssuer(e.target.value)}
              placeholder="GitHub"
              className="auth-input ui-focus"
              aria-label="Issuer"
              disabled={busy}
            />
          </label>

          <label className="auth-field">
            <span>Label</span>
            <input
              value={label}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
              placeholder="user@example.com"
              className="auth-input ui-focus"
              aria-label="Label"
              disabled={busy}
            />
          </label>

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

            <label className="auth-field compact">
              <span>Period</span>
              <input
                type="number"
                min={1}
                max={300}
                value={period}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPeriod(Number(e.target.value) || 30)}
                className="auth-input ui-focus"
                aria-label="Code period"
                disabled={busy}
              />
            </label>

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

          {error ? (
            <p className="auth-error" aria-live="polite">
              {error.title}. {error.instruction} <span className="auth-error-code">Code: {error.code}</span>
            </p>
          ) : null}

          <footer className="auth-modal-footer auth-modal-actions">
            <motion.button type="button" onClick={onClose} className="auth-btn auth-btn-ghost ui-focus" aria-label="Cancel edit" disabled={busy} whileTap={tapScale.whileTap} transition={tapScale.transition}>
              Cancel
            </motion.button>
            <motion.button type="submit" className="auth-btn auth-btn-primary ui-focus" aria-label="Save account changes" disabled={busy} whileTap={tapScale.whileTap} transition={tapScale.transition}>
              {busy ? "Saving..." : "Save Changes"}
            </motion.button>
          </footer>
        </form>
      </motion.section>
    </motion.div>
  );
}
