import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Fingerprint, KeyRound, Loader2, Lock, LockKeyhole, RefreshCw, Shield, X } from "lucide-react";
import { PasswordSetupFields, getPasswordStrength } from "./PasswordSetupFields";
import { RecoverySecretDisplay } from "./RecoverySecretDisplay";
import type { LockApi, LockMethod } from "../bridge";
import { combineMotionPresets, resolveMotionState, useMotionVariants } from "../lib/motion";
import { isStepUpRequiredError } from "../utils/errors";

interface SecurityPickerProps {
  lockApi: LockApi;
  themeClass?: string;
  currentMethod: LockMethod;
  methodConfigured: boolean;
  locked: boolean;
  biometricAvailable: boolean;
  isMacOS?: boolean;
  biometricEnrolled?: boolean;
  recoveryGenerated?: boolean;
  recoveryRotationPending?: boolean;
  recoveryFocusRequest?: number;
  onMethodSaved(): Promise<void> | void;
  requestStepUpAuth(): Promise<boolean>;
  requestSecuritySession?(): Promise<boolean>;
  onGenerateRecoverySecret(): Promise<string | null>;
  onEnrollBiometricUnlock(): Promise<boolean>;
  onRemoveBiometricUnlock(): Promise<boolean>;
  onCopyRecoverySecret(secret: string): Promise<void>;
  onLockNow(): Promise<void> | void;
  onError(error: unknown): void;
}

export function SecurityPicker({
  lockApi,
  themeClass = "",
  currentMethod,
  methodConfigured,
  locked,
  biometricAvailable,
  isMacOS = false,
  biometricEnrolled = false,
  recoveryGenerated = false,
  recoveryRotationPending = false,
  recoveryFocusRequest = 0,
  onMethodSaved,
  requestStepUpAuth,
  requestSecuritySession,
  onGenerateRecoverySecret,
  onEnrollBiometricUnlock,
  onRemoveBiometricUnlock,
  onCopyRecoverySecret,
  onLockNow,
  onError,
}: SecurityPickerProps) {
  const motionVariants = useMotionVariants();
  const overlayPresence = React.useMemo(() => combineMotionPresets(motionVariants.fadeIn, motionVariants.fadeOut), [motionVariants]);
  const modalPresence = React.useMemo(() => combineMotionPresets(motionVariants.scaleIn, motionVariants.scaleOut), [motionVariants]);
  const tapScale = motionVariants.tapScale;
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = React.useState<string | null>(null);
  const [passwordInput, setPasswordInput] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [showPasswordChange, setShowPasswordChange] = React.useState(false);
  const [visibleRecoverySecret, setVisibleRecoverySecret] = React.useState<string | null>(null);
  const [recoverySaved, setRecoverySaved] = React.useState(false);
  const passwordStrength = React.useMemo(() => getPasswordStrength(passwordInput), [passwordInput]);
  const [pulseRecoveryAction, setPulseRecoveryAction] = React.useState(false);
  const recoverySectionRef = React.useRef<HTMLElement | null>(null);
  const recoveryPulseTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (recoveryPulseTimerRef.current != null) {
        window.clearTimeout(recoveryPulseTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (recoveryFocusRequest <= 0) {
      return;
    }
    const section = recoverySectionRef.current;
    if (!section) {
      return;
    }
    window.requestAnimationFrame(() => {
      if (typeof section.scrollIntoView === "function") {
        section.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      }
      setPulseRecoveryAction(true);
      if (recoveryPulseTimerRef.current != null) {
        window.clearTimeout(recoveryPulseTimerRef.current);
      }
      recoveryPulseTimerRef.current = window.setTimeout(() => {
        setPulseRecoveryAction(false);
        recoveryPulseTimerRef.current = null;
      }, 1500);
    });
  }, [recoveryFocusRequest]);

  const runSensitiveAction = React.useCallback(
    async <T,>(action: () => Promise<T>, options?: { requiresSecuritySession?: boolean }): Promise<{ status: "ok"; value: T } | { status: "cancelled" }> => {
      try {
        return { status: "ok", value: await action() };
      } catch (error) {
        if (!isStepUpRequiredError(error)) {
          throw error;
        }
        const verified = await requestStepUpAuth();
        if (!verified) {
          return { status: "cancelled" };
        }
        try {
          return { status: "ok", value: await action() };
        } catch (retryError) {
          if (!options?.requiresSecuritySession || !isStepUpRequiredError(retryError)) {
            throw retryError;
          }
          const opened = lockApi.openSecuritySession ? await lockApi.openSecuritySession() : false;
          if (opened === false) {
            return { status: "cancelled" };
          }
          return { status: "ok", value: await action() };
        }
      }
    },
    [lockApi, requestStepUpAuth]
  );

  const handleChangePassword = React.useCallback(async () => {
    if (!passwordStrength.met) {
      setPasswordNotice(passwordStrength.requirement ?? "Choose a password that meets the vault policy before saving.");
      return;
    }
    if (passwordInput !== passwordConfirm) {
      setPasswordNotice("Password and confirmation must match.");
      return;
    }
    setBusy(true);
    setNotice(null);
    setPasswordNotice(null);
    try {
      const result = await runSensitiveAction(async () => await lockApi.setCredential("password", passwordInput), { requiresSecuritySession: true });
      if (result.status === "cancelled") {
        return;
      }
      setShowPasswordChange(false);
      setPasswordInput("");
      setPasswordConfirm("");
      await onMethodSaved();
      setNotice("Password updated.");
    } catch (error) {
      onError(error);
      setPasswordNotice(error instanceof Error ? error.message : "Password update failed.");
    } finally {
      setBusy(false);
    }
  }, [lockApi, onError, onMethodSaved, passwordConfirm, passwordInput, passwordStrength.met, runSensitiveAction]);

  const closePasswordChange = React.useCallback(() => {
    if (busy) {
      return;
    }
    setShowPasswordChange(false);
    setPasswordInput("");
    setPasswordConfirm("");
    setPasswordNotice(null);
  }, [busy]);

  const openPasswordChange = React.useCallback(async () => {
    if (busy) {
      return;
    }
    setNotice(null);
    setPasswordNotice(null);
    const verified = await requestStepUpAuth();
    if (!verified) {
      return;
    }
    setShowPasswordChange(true);
  }, [busy, requestStepUpAuth]);

  const handleGenerateRecoverySecret = React.useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await runSensitiveAction(async () => await onGenerateRecoverySecret(), { requiresSecuritySession: true });
      if (result.status === "cancelled") return;
      if (!result.value) {
        setNotice("Could not generate a recovery secret.");
        return;
      }
      setVisibleRecoverySecret(result.value);
      setRecoverySaved(false);
      await onMethodSaved();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }, [onError, onGenerateRecoverySecret, onMethodSaved, runSensitiveAction]);

  const handleEnableTouchId = React.useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await runSensitiveAction(async () => await onEnrollBiometricUnlock(), { requiresSecuritySession: true });
      if (result.status === "cancelled") return;
      if (!result.value) {
        setNotice("Touch ID is unavailable on this device.");
        return;
      }
      await onMethodSaved();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }, [onEnrollBiometricUnlock, onError, onMethodSaved, runSensitiveAction]);

  const handleDisableTouchId = React.useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await runSensitiveAction(async () => await onRemoveBiometricUnlock(), { requiresSecuritySession: true });
      if (result.status === "cancelled") return;
      if (!result.value) {
        setNotice("Touch ID could not be disabled.");
        return;
      }
      await onMethodSaved();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }, [onError, onMethodSaved, onRemoveBiometricUnlock, runSensitiveAction]);

  return (
    <section className="settings-section">
      <h3 className="settings-title settings-title-with-icon">
        <LockKeyhole size={15} aria-hidden="true" />
        <span>Vault unlock</span>
      </h3>
      <p className="settings-note">Your vault is unlocked with your password, Touch ID, or a recovery secret.</p>

      <section className="settings-section" ref={recoverySectionRef} data-recovery-section="true">
        <h4 className="settings-title settings-title-with-icon">
          <KeyRound size={15} aria-hidden="true" />
          <span>Password</span>
        </h4>
        <p className="settings-note">Vault password is always available and is required while accounts exist.</p>
        <div className="auth-inline-actions">
          <button
            type="button"
            className="auth-btn auth-btn-primary ui-focus"
            onClick={() => void openPasswordChange()}
            disabled={busy}
          >
            <KeyRound size={15} className="auth-btn-icon" aria-hidden="true" />
            Change password
          </button>
        </div>
      </section>

      {isMacOS ? (
        <section className="settings-section">
          <h4 className="settings-title settings-title-with-icon">
            <Fingerprint size={15} aria-hidden="true" />
            <span>Touch ID</span>
          </h4>
          <p className="settings-note">Touch ID {biometricEnrolled ? "is enabled" : "is not enrolled"}.</p>
          <div className="auth-inline-actions">
            {biometricEnrolled ? (
              <button type="button" className="auth-btn auth-btn-subtle ui-focus" onClick={() => void handleDisableTouchId()} disabled={busy}>
                Disable
              </button>
            ) : (
              <button type="button" className="auth-btn auth-btn-primary ui-focus" onClick={() => void handleEnableTouchId()} disabled={busy || !biometricAvailable}>
                Enable Touch ID
              </button>
            )}
          </div>
        </section>
      ) : null}

      <section className="settings-section">
        <h4 className="settings-title settings-title-with-icon">
          <Shield size={15} aria-hidden="true" />
          <span>Recovery secret</span>
        </h4>
        {recoveryRotationPending ? <p className="settings-warning">Your previous recovery secret has been used. Generate a new one to stay protected.</p> : null}
        <p className="settings-note">Recovery secret: {recoveryGenerated ? "Active" : "Not set up"}</p>
        {!recoveryGenerated ? <p className="settings-warning">Without this, a forgotten password means permanent vault loss.</p> : null}
        {!visibleRecoverySecret ? (
          <div className="auth-inline-actions">
            <button
              type="button"
              className={`auth-btn auth-btn-primary ui-focus${pulseRecoveryAction ? " is-pulsing" : ""}`}
              onClick={() => void handleGenerateRecoverySecret()}
              disabled={busy}
              data-recovery-action="true"
            >
              <RefreshCw size={15} className="auth-btn-icon" aria-hidden="true" />
              {recoveryGenerated ? "Regenerate" : "Generate recovery secret"}
            </button>
          </div>
        ) : null}
      </section>

      <div className="security-status-row">
        <span>
          Current lock status: <strong>{locked ? "locked" : "unlocked"}</strong>
        </span>
        <button type="button" onClick={() => void onLockNow()} className="auth-btn auth-btn-subtle ui-focus" disabled={busy || !methodConfigured || currentMethod !== "password"}>
          <Lock size={15} className="auth-btn-icon" aria-hidden="true" />
          Lock vault now
        </button>
      </div>

      {notice ? <p className="settings-note">{notice}</p> : null}

      <AnimatePresence initial={false} mode="wait">
        {visibleRecoverySecret ? (
          <RecoverySecretDisplay
            secret={visibleRecoverySecret}
            acknowledged={recoverySaved}
            onAcknowledgedChange={setRecoverySaved}
            onCopy={() => onCopyRecoverySecret(visibleRecoverySecret)}
            themeClass={themeClass}
            onDone={() => {
              if (!recoverySaved) return;
              setVisibleRecoverySecret(null);
              setRecoverySaved(false);
              setNotice("Recovery secret saved.");
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false} mode="wait">
        {showPasswordChange ? (
          <motion.div
            className={`auth-overlay ${themeClass}`.trim()}
            onClick={closePasswordChange}
            role="presentation"
            initial={overlayPresence.initial}
            animate={resolveMotionState(overlayPresence)}
            exit={overlayPresence.exit}
            variants={overlayPresence.variants}
            transition={overlayPresence.transition}
          >
            <motion.section
              className={`auth-confirm-modal auth-recovery-secret-modal ${themeClass}`.trim()}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Change vault password"
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
                  <span>Change password</span>
                </h2>
              </header>

              <div className="auth-confirm-body auth-recovery-secret-body">
                <div className="auth-recovery-secret-hero">
                  <div className="auth-recovery-secret-hero-copy">
                    <p className="auth-recovery-secret-hero-eyebrow">Update vault password</p>
                    <p className="auth-recovery-secret-hero-title">Set a new password for this vault.</p>
                    <p className="auth-recovery-secret-hero-text">Choose a new password you will remember. It replaces your current vault password immediately.</p>
                  </div>

                  <PasswordSetupFields
                    passwordInput={passwordInput}
                    passwordConfirm={passwordConfirm}
                    busy={busy}
                    notice={passwordNotice}
                    autoFocus={true}
                    passwordPlaceholder="Password"
                    confirmPlaceholder="Confirm password"
                    noticeClassName="auth-error"
                    onPasswordInputChange={setPasswordInput}
                    onPasswordConfirmChange={setPasswordConfirm}
                    onNoticeClear={() => {
                      if (passwordNotice) {
                        setPasswordNotice(null);
                      }
                    }}
                  />
                </div>
              </div>

              <footer className="auth-confirm-actions auth-backup-codes-actions auth-recovery-secret-footer">
                <motion.button
                  type="button"
                  className="auth-btn auth-btn-subtle ui-focus auth-btn-modal"
                  onClick={closePasswordChange}
                  disabled={busy}
                  whileTap={tapScale.whileTap}
                  transition={tapScale.transition}
                >
                  <X size={15} className="auth-btn-icon" aria-hidden="true" />
                  Cancel
                </motion.button>
                <motion.button
                  type="button"
                  className="auth-btn auth-btn-primary ui-focus auth-btn-modal"
                  onClick={() => void handleChangePassword()}
                  disabled={busy || passwordInput.length === 0 || passwordConfirm.length === 0 || passwordInput !== passwordConfirm || !passwordStrength.met}
                  whileTap={tapScale.whileTap}
                  transition={tapScale.transition}
                >
                  {busy ? <Loader2 size={15} className="auth-loading-icon" aria-hidden="true" /> : <KeyRound size={15} className="auth-btn-icon" aria-hidden="true" />}
                  Save password
                </motion.button>
              </footer>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
