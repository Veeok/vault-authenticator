import * as React from "react";
import { motion } from "framer-motion";
import { Loader2, LockKeyhole, X } from "lucide-react";
import type { LockApi } from "../bridge";
import { combineMotionPresets, useMotionVariants } from "../lib/motion";

type StepUpAuthModalProps = {
  themeClass: string;
  lockApi: LockApi;
  onCancel(): void;
  onVerified(): void;
};

export function StepUpAuthModal({ themeClass, lockApi, onCancel, onVerified }: StepUpAuthModalProps) {
  const motionVariants = useMotionVariants();
  const overlayPresence = React.useMemo(() => combineMotionPresets(motionVariants.fadeIn, motionVariants.fadeOut), [motionVariants]);
  const modalPresence = React.useMemo(() => combineMotionPresets(motionVariants.scaleIn, motionVariants.scaleOut), [motionVariants]);
  const tapScale = motionVariants.tapScale;
  const [passwordInput, setPasswordInput] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [biometricAvailable, setBiometricAvailable] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    void lockApi
      .biometricAvailable()
      .then((available) => {
        if (active) {
          setBiometricAvailable(available);
        }
      })
      .catch(() => {
        if (active) {
          setBiometricAvailable(false);
        }
      });
    return () => {
      active = false;
    };
  }, [lockApi]);

  const submitPassword = React.useCallback(async () => {
    if (busy || !lockApi.stepUpVerify) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await lockApi.stepUpVerify({ method: "password", input: passwordInput });
      if (result.result === "OK") {
        setPasswordInput("");
        onVerified();
        return;
      }
      if (result.result === "LOCKED") {
        setStatus(result.disabled ? "This verification method is disabled. Use a different method." : "Too many attempts. Try again later.");
        return;
      }
      setStatus("That credential didn't match. Try again.");
    } catch {
      setStatus("Authentication required.");
    } finally {
      setBusy(false);
      setPasswordInput("");
    }
  }, [busy, lockApi, onVerified, passwordInput]);

  const submitBiometric = React.useCallback(async () => {
    if (busy || !lockApi.stepUpVerify) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await lockApi.stepUpVerify({ method: "biometric" });
      if (result.result === "OK") {
        onVerified();
        return;
      }
      if (result.result === "LOCKED") {
        setStatus(result.disabled ? "This verification method is disabled. Use a different method." : "Too many attempts. Try again later.");
        return;
      }
      setStatus("Biometric verification was not accepted.");
    } catch (error) {
      setStatus(error instanceof Error && error.message ? error.message : "Biometric verification is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }, [busy, lockApi, onVerified]);

  return (
    <motion.div className={`auth-overlay auth-step-up-overlay ${themeClass}`} onClick={onCancel} role="presentation" initial={overlayPresence.initial} animate={overlayPresence.animate} exit={overlayPresence.exit} variants={overlayPresence.variants} transition={overlayPresence.transition}>
      <motion.section className={`auth-confirm-modal ${themeClass}`} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Confirm your identity" initial={modalPresence.initial} animate={modalPresence.animate} exit={modalPresence.exit} variants={modalPresence.variants} transition={modalPresence.transition}>
        <header className="auth-modal-header">
          <h2 className="auth-modal-title auth-confirm-title">
            <span className="auth-confirm-title-icon" aria-hidden="true">
              <LockKeyhole size={16} />
            </span>
            <span>Confirm your identity</span>
          </h2>
        </header>

        <div className="auth-confirm-body">
          <p className="auth-confirm-copy">Confirm your password or PIN to continue.</p>
          <input
            type="password"
            className="auth-input ui-focus"
            value={passwordInput}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPasswordInput(event.target.value)}
            placeholder="Password or PIN"
            aria-label="Password or PIN"
            autoFocus
            disabled={busy}
          />
          {status ? <p className="settings-warning">{status}</p> : null}
        </div>

        <footer className="auth-confirm-actions">
          <motion.button type="button" onClick={onCancel} className="auth-btn auth-btn-subtle ui-focus auth-btn-modal" whileTap={tapScale.whileTap} transition={tapScale.transition}>
            <X size={15} className="auth-btn-icon" aria-hidden="true" />
            Cancel
          </motion.button>
          {biometricAvailable ? (
            <motion.button type="button" onClick={() => void submitBiometric()} className="auth-btn auth-btn-subtle ui-focus auth-btn-modal" disabled={busy} whileTap={tapScale.whileTap} transition={tapScale.transition}>
              <LockKeyhole size={15} className="auth-btn-icon" aria-hidden="true" />
              Use biometric
            </motion.button>
          ) : null}
          <motion.button type="button" onClick={() => void submitPassword()} className="auth-btn auth-btn-primary ui-focus auth-btn-modal" disabled={busy || passwordInput.trim().length < 4} whileTap={tapScale.whileTap} transition={tapScale.transition}>
            {busy ? <Loader2 size={15} className="auth-loading-icon" aria-hidden="true" /> : <LockKeyhole size={15} className="auth-btn-icon" aria-hidden="true" />}
            {busy ? "Checking..." : "Verify"}
          </motion.button>
        </footer>
      </motion.section>
    </motion.div>
  );
}
