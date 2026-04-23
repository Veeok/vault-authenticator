import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Fingerprint, Info, KeyRound, Loader2, Lock } from "lucide-react";
import { getVaultPasswordPolicyIssue, getVaultPasswordPolicyMessage } from "@authenticator/core";
import type { LockApi, VaultProtectionStatus } from "../bridge";
import { combineMotionPresets, duration, ease, useMotionVariants, useResolvedMotionMode } from "../lib/motion";
import { PasswordSetupFields } from "./PasswordSetupFields";

type StatusTone = "info" | "error";
type StatusMessage = { text: string; tone: StatusTone } | null;
type LockGlyphState = "locked" | "unlocked";
type UnlockMode = "password" | "recovery" | "recoveryReset" | "recoveryNotice";
const RECOVERY_SECRET_SEGMENT_COUNT = 8;
const RECOVERY_SECRET_SEGMENT_LENGTH = 6;

type LockScreenProps = {
  lockApi: LockApi;
  vaultProtection: VaultProtectionStatus;
  biometricPromptEnabled?: boolean;
  onUnlocked(): void;
  paused?: boolean;
};

function isMacOSRuntime(): boolean {
  return typeof process !== "undefined" && process.platform === "darwin";
}

function secondsUntil(timestampMs: number): number {
  return Math.max(0, Math.ceil((timestampMs - Date.now()) / 1000));
}

function lockMessageForSeconds(seconds: number): string {
  return `Too many attempts. Try again in ${Math.max(1, seconds)} seconds.`;
}

function normalizeRecoverySecretInput(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function splitRecoverySecretSegments(value: string): string[] {
  const normalized = normalizeRecoverySecretInput(value).slice(0, RECOVERY_SECRET_SEGMENT_COUNT * RECOVERY_SECRET_SEGMENT_LENGTH);
  return Array.from({ length: RECOVERY_SECRET_SEGMENT_COUNT }, (_, index) =>
    normalized.slice(index * RECOVERY_SECRET_SEGMENT_LENGTH, (index + 1) * RECOVERY_SECRET_SEGMENT_LENGTH)
  );
}

function joinRecoverySecretSegments(segments: string[]): string {
  return segments.map((segment) => normalizeRecoverySecretInput(segment).slice(0, RECOVERY_SECRET_SEGMENT_LENGTH)).join("");
}

function formatRecoverySecretForSubmit(value: string): string {
  return splitRecoverySecretSegments(value).filter(Boolean).join("-");
}

function AnimatedVaultLockIcon({ state, motionMode, paused }: { state: LockGlyphState; motionMode: "full" | "reduced" | "off"; paused: boolean }) {
  const motionDisabled = motionMode === "off" || paused;
  const initialState = motionDisabled ? state : state === "locked" ? "unlocked" : "locked";
  const shackleTransition = motionDisabled
    ? { duration: 0 }
    : motionMode === "full"
      ? { ...ease.snappy, stiffness: 520, damping: 30, mass: 0.92 }
      : { duration: duration.fast, ease: ease.standard };
  const bodyTransition = motionDisabled
    ? { duration: 0 }
    : motionMode === "full"
      ? { duration: duration.base, ease: ease.decelerate }
      : { duration: duration.fast, ease: ease.standard };
  const pulseAnimate =
    state === "unlocked"
      ? motionDisabled
        ? { opacity: 0.18, scale: 1.04 }
        : motionMode === "full"
          ? { opacity: [0.24, 0.08, 0.16], scale: [1, 1.24, 1.08] }
          : { opacity: [0.2, 0.12, 0.18], scale: [1, 1.08, 1.03] }
      : motionDisabled
        ? { opacity: 0.16, scale: 1 }
        : motionMode === "full"
          ? { opacity: [0.14, 0.34, 0.14], scale: [1, 1.12, 1] }
          : { opacity: [0.16, 0.24, 0.16], scale: [1, 1.04, 1] };
  const pulseTransition =
    state === "unlocked"
      ? motionDisabled
        ? { duration: 0 }
        : motionMode === "full"
          ? { duration: 0.56, ease: ease.decelerate }
          : { duration: 0.28, ease: ease.standard }
      : motionDisabled
        ? { duration: 0 }
        : motionMode === "full"
          ? { duration: 2.6, repeat: Infinity, ease: ease.standard }
          : { duration: 3.4, repeat: Infinity, ease: ease.standard };

  return (
    <span className="auth-lock-icon-shell" data-lock-icon-state={state}>
      <motion.span className="auth-lock-icon-pulse" aria-hidden="true" animate={pulseAnimate} transition={pulseTransition} />
      <motion.svg
        className="auth-lock-icon-glyph"
        viewBox="0 0 28 28"
        fill="none"
        aria-hidden="true"
        data-lock-glyph-state={state}
        initial={initialState}
        animate={state}
        variants={{
          locked: { scale: 1, rotate: 0 },
          unlocked: motionMode === "full" ? { scale: 1.035, rotate: 2 } : { scale: 1.018, rotate: 0 },
        }}
        transition={bodyTransition}
      >
        <motion.g
          variants={{
            locked: { y: 0, scale: 1 },
            unlocked: motionMode === "full" ? { y: 0.34, scale: 1.018 } : { y: 0.18, scale: 1.01 },
          }}
          transition={bodyTransition}
        >
          <motion.rect className="auth-lock-vector auth-lock-vector-body" x="8" y="13" width="12" height="8.5" rx="2.5" />
          <motion.circle
            className="auth-lock-vector auth-lock-vector-keyhole"
            cx="14"
            cy="16.1"
            r="1.15"
            variants={{ locked: { opacity: 1, scale: 1, y: 0 }, unlocked: { opacity: 0.78, scale: 0.92, y: 0.2 } }}
            transition={bodyTransition}
          />
          <motion.path
            className="auth-lock-vector auth-lock-vector-keyhole"
            d="M14 17.2V18.7"
            strokeLinecap="round"
            variants={{ locked: { opacity: 1, pathLength: 1 }, unlocked: { opacity: 0.78, pathLength: 0.7 } }}
            transition={bodyTransition}
          />
        </motion.g>
        <motion.g
          className="auth-lock-vector-shackle-wrap"
          style={{ originX: 0.72, originY: 0.84 }}
          variants={{
            locked: { rotate: 0, x: 0, y: 0 },
            unlocked: motionMode === "full" ? { rotate: -30, x: -1.9, y: -1.3 } : { rotate: -20, x: -1.1, y: -0.6 },
          }}
          transition={shackleTransition}
        >
          <motion.path className="auth-lock-vector auth-lock-vector-shackle" d="M10.25 13V9.45C10.25 7.38 11.93 5.7 14 5.7C16.07 5.7 17.75 7.38 17.75 9.45V13" strokeLinecap="round" strokeLinejoin="round" />
        </motion.g>
      </motion.svg>
    </span>
  );
}

export function LockScreen({ lockApi, vaultProtection, biometricPromptEnabled = true, onUnlocked, paused = false }: LockScreenProps) {
  const motionVariants = useMotionVariants();
  const resolvedMotionMode = useResolvedMotionMode();
  const cardReveal = React.useMemo(() => {
    if (resolvedMotionMode !== "full") {
      return {
        initial: motionVariants.fadeSlideUp.initial,
        animate: motionVariants.fadeSlideUp.animate,
        exit: motionVariants.fadeOut.exit,
        variants: {
          ...(motionVariants.fadeSlideUp.variants ?? {}),
          ...(motionVariants.fadeOut.variants ?? {}),
        },
        transition: motionVariants.fadeSlideUp.transition ?? motionVariants.fadeOut.transition,
      };
    }

    return {
      initial: "initial",
      animate: "animate",
      exit: "exit",
      variants: {
        initial: { opacity: 0, scale: 0.988, y: 12 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.994, y: 4 },
      },
      transition: { duration: 0.24, ease: ease.decelerate },
    };
  }, [motionVariants, resolvedMotionMode]);
  const formStagger = motionVariants.staggerChildren;
  const fieldReveal = motionVariants.fadeSlideUp;
  const tapScale = motionVariants.tapScale;
  const [passwordInput, setPasswordInput] = React.useState("");
  const [recoverySecretInput, setRecoverySecretInput] = React.useState("");
  const [recoveryResetPassword, setRecoveryResetPassword] = React.useState("");
  const [recoveryResetConfirm, setRecoveryResetConfirm] = React.useState("");
  const [unlockMode, setUnlockMode] = React.useState<UnlockMode>("password");
  const [recoveryAvailable, setRecoveryAvailable] = React.useState(vaultProtection.recoveryGenerated === true);
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [isUnlocking, setIsUnlocking] = React.useState(false);
  const [isShaking, setIsShaking] = React.useState(false);
  const [status, setStatus] = React.useState<StatusMessage>(null);
  const [lockedUntil, setLockedUntil] = React.useState(0);
  const recoverySegmentRefs = React.useRef<Array<HTMLInputElement | null>>([]);
  const showingRecovery = unlockMode === "recovery";
  const showingRecoveryReset = unlockMode === "recoveryReset";
  const showingRecoveryNotice = unlockMode === "recoveryNotice";
  const ambientReveal = React.useMemo(() => combineMotionPresets(motionVariants.fadeIn, motionVariants.fadeOut), [motionVariants]);
  const paneTransition = React.useMemo(
    () => combineMotionPresets(unlockMode === "password" ? motionVariants.stepEnterBackward : motionVariants.stepEnterForward, unlockMode === "password" ? motionVariants.stepExitBackward : motionVariants.stepExitForward),
    [motionVariants, unlockMode]
  );
  const ambientMotionEnabled = resolvedMotionMode === "full" && !paused;
  const lockGlyphState: LockGlyphState = isUnlocking ? "unlocked" : "locked";
  const ambientPrimaryAnimation = React.useMemo(
    () =>
      ambientMotionEnabled
        ? { x: [-10, 16, -8], y: [-14, 10, -6], scale: [1, 1.08, 0.96], opacity: [0.3, 0.48, 0.34] }
        : { x: 0, y: 0, scale: 1, opacity: 0.34 },
    [ambientMotionEnabled]
  );
  const ambientSecondaryAnimation = React.useMemo(
    () =>
      ambientMotionEnabled
        ? { x: [12, -14, 8], y: [10, -12, 6], scale: [1, 0.96, 1.05], opacity: [0.24, 0.4, 0.28] }
        : { x: 0, y: 0, scale: 1, opacity: 0.28 },
    [ambientMotionEnabled]
  );
  const ambientSheenAnimation = React.useMemo(
    () =>
      ambientMotionEnabled
        ? { opacity: [0.24, 0.38, 0.24], x: [0, 12, -10] }
        : { opacity: 0.26, x: 0 },
    [ambientMotionEnabled]
  );
  const recoverySecretSegments = React.useMemo(() => splitRecoverySecretSegments(recoverySecretInput), [recoverySecretInput]);
  const triggerShake = React.useCallback(() => {
    setIsShaking(true);
  }, []);

  React.useEffect(() => {
    if (lockedUntil <= Date.now()) {
      return;
    }

    const timer = window.setInterval(() => {
      if (lockedUntil <= Date.now()) {
        setLockedUntil(0);
        setStatus(null);
      } else {
        setStatus({ text: lockMessageForSeconds(secondsUntil(lockedUntil)), tone: "error" });
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  React.useEffect(() => {
    if (!isShaking) {
      return undefined;
    }
    const timer = window.setTimeout(() => setIsShaking(false), 420);
    return () => window.clearTimeout(timer);
  }, [isShaking]);

  React.useEffect(() => {
    if (vaultProtection.recoveryGenerated === true) {
      setRecoveryAvailable(true);
    }
  }, [vaultProtection.recoveryGenerated]);

  const unlockSuccess = React.useCallback(() => {
    setStatus({ text: "Unlocked. Opening your vault", tone: "info" });
    setIsUnlocking(true);
    setPasswordInput("");
    setRecoverySecretInput("");
    setRecoveryResetPassword("");
    setRecoveryResetConfirm("");
    window.setTimeout(() => {
      setIsUnlocking(false);
      onUnlocked();
    }, 1000);
  }, [onUnlocked]);

  const submitPassword = React.useCallback(async () => {
    if (busy || isUnlocking) return;
    setBusy(true);
    setStatus({ text: "Checking password", tone: "info" });
    try {
      const result = await lockApi.verify("password", passwordInput);
      if (result.result === "OK") {
        unlockSuccess();
        return;
      }
      if (result.result === "LOCKED") {
        if (result.disabled) {
          setLockedUntil(0);
          setStatus({ text: "This unlock method is disabled. Use a different method.", tone: "error" });
        } else {
          setLockedUntil(result.lockedUntil);
          setStatus({ text: lockMessageForSeconds(secondsUntil(result.lockedUntil)), tone: "error" });
        }
        triggerShake();
        return;
      }
      setStatus({ text: "That password didn't match. Try again.", tone: "error" });
      triggerShake();
    } finally {
      setBusy(false);
      setPasswordInput("");
    }
  }, [busy, isUnlocking, lockApi, passwordInput, triggerShake, unlockSuccess]);

  const submitBiometric = React.useCallback(async () => {
    if (busy || isUnlocking) return;
    setBusy(true);
    setStatus({ text: "Checking Touch ID", tone: "info" });
    try {
      const ok = await lockApi.promptBiometric();
      if (!ok) {
        setStatus({ text: "Touch ID was not accepted. Use your vault password instead.", tone: "error" });
        triggerShake();
        return;
      }
      unlockSuccess();
    } catch (error) {
      setStatus({ text: error instanceof Error && error.message ? error.message : "Touch ID was not accepted. Use your vault password instead.", tone: "error" });
      triggerShake();
    } finally {
      setBusy(false);
    }
  }, [busy, isUnlocking, lockApi, triggerShake, unlockSuccess]);

  const submitRecoverySecret = React.useCallback(async () => {
    if (busy || isUnlocking) return;
    if (!lockApi.validateAndBurnRecoverySecret) {
      setStatus({ text: "Recovery secret unlock is unavailable.", tone: "error" });
      triggerShake();
      return;
    }
    if (normalizeRecoverySecretInput(recoverySecretInput).length < 32) {
      setStatus({ text: "Enter the full recovery secret, not one segment.", tone: "error" });
      triggerShake();
      return;
    }
    setBusy(true);
    setStatus({ text: "Checking recovery secret", tone: "info" });
    try {
      const result = await lockApi.validateAndBurnRecoverySecret(formatRecoverySecretForSubmit(recoverySecretInput));
      if (!result.valid) {
        setStatus({ text: "That recovery secret wasn't accepted.", tone: "error" });
        triggerShake();
        return;
      }
      setRecoveryAvailable(false);
      setRecoverySecretInput("");
      setStatus(null);
      setUnlockMode("recoveryReset");
    } catch {
      setStatus({ text: "That recovery secret wasn't accepted.", tone: "error" });
      triggerShake();
    } finally {
      setBusy(false);
    }
  }, [busy, isUnlocking, lockApi, recoverySecretInput, triggerShake]);

  const submitRecoveryPasswordReset = React.useCallback(async () => {
    if (busy || isUnlocking) return;
    if (!lockApi.setPasswordAfterRecovery) {
      setStatus({ text: "Recovery password reset is unavailable. Use your password.", tone: "error" });
      triggerShake();
      setUnlockMode("password");
      return;
    }
    const password = recoveryResetPassword.trim();
    const confirm = recoveryResetConfirm.trim();
    const passwordIssue = getVaultPasswordPolicyIssue(password);
    if (passwordIssue) {
      setStatus({ text: getVaultPasswordPolicyMessage(passwordIssue), tone: "error" });
      triggerShake();
      return;
    }
    if (password !== confirm) {
      setStatus({ text: "Passwords must match.", tone: "error" });
      triggerShake();
      return;
    }

    setBusy(true);
    setStatus({ text: "Setting new password", tone: "info" });
    try {
      const result = await lockApi.setPasswordAfterRecovery(password);
      if (!result.success) {
        setUnlockMode("password");
        setStatus({ text: "Recovery password reset expired. Use your password.", tone: "error" });
        triggerShake();
        return;
      }
      setRecoveryResetPassword("");
      setRecoveryResetConfirm("");
      setStatus(null);
      setUnlockMode("recoveryNotice");
    } catch {
      setUnlockMode("password");
      setStatus({ text: "Recovery password reset expired. Use your password.", tone: "error" });
      triggerShake();
    } finally {
      setBusy(false);
    }
  }, [busy, isUnlocking, lockApi, recoveryResetConfirm, recoveryResetPassword, triggerShake]);

  const lockChipIcon = showingRecovery ? <KeyRound size={13} className="auth-btn-icon" aria-hidden="true" /> : showingRecoveryReset || showingRecoveryNotice ? <CheckCircle2 size={13} className="auth-btn-icon" aria-hidden="true" /> : <Lock size={13} className="auth-btn-icon" aria-hidden="true" />;
  const lockChipLabel = showingRecovery
    ? "Recovery secret"
    : showingRecoveryReset
        ? "New password"
        : showingRecoveryNotice
          ? "Recovery complete"
          : "Password";
  const helperText = showingRecovery
    ? "Enter your full recovery secret to start a one-time password reset."
    : showingRecoveryReset
        ? "Create a new vault password. The vault stays locked until you use it on the next screen."
        : showingRecoveryNotice
          ? "Your recovery secret has been used. It can only be used once."
          : "Enter your vault password to continue.";

  const resetModeState = React.useCallback((nextMode: UnlockMode) => {
    setUnlockMode(nextMode);
    setPasswordInput("");
    setRecoverySecretInput("");
    setRecoveryResetPassword("");
    setRecoveryResetConfirm("");
    setStatus(null);
    setLockedUntil(0);
    setIsShaking(false);
  }, []);

  const focusRecoverySegment = React.useCallback((index: number) => {
    recoverySegmentRefs.current[index]?.focus();
    recoverySegmentRefs.current[index]?.select();
  }, []);

  const updateRecoverySegments = React.useCallback((updater: (segments: string[]) => string[]) => {
    setRecoverySecretInput((currentValue) => {
      const nextSegments = updater(splitRecoverySecretSegments(currentValue));
      return joinRecoverySecretSegments(nextSegments);
    });
  }, []);

  const handleRecoverySegmentChange = React.useCallback((index: number, rawValue: string) => {
    const normalized = normalizeRecoverySecretInput(rawValue);
    updateRecoverySegments((segments) => {
      const nextSegments = [...segments];
      if (normalized.length <= RECOVERY_SECRET_SEGMENT_LENGTH) {
        nextSegments[index] = normalized;
        return nextSegments;
      }
      let cursor = 0;
      for (let segmentIndex = index; segmentIndex < RECOVERY_SECRET_SEGMENT_COUNT && cursor < normalized.length; segmentIndex += 1) {
        nextSegments[segmentIndex] = normalized.slice(cursor, cursor + RECOVERY_SECRET_SEGMENT_LENGTH);
        cursor += RECOVERY_SECRET_SEGMENT_LENGTH;
      }
      return nextSegments;
    });

    if (normalized.length > RECOVERY_SECRET_SEGMENT_LENGTH) {
      const focusIndex = Math.min(index + Math.floor((normalized.length - 1) / RECOVERY_SECRET_SEGMENT_LENGTH), RECOVERY_SECRET_SEGMENT_COUNT - 1);
      window.setTimeout(() => focusRecoverySegment(focusIndex), 0);
      return;
    }
    if (normalized.length === RECOVERY_SECRET_SEGMENT_LENGTH && index < RECOVERY_SECRET_SEGMENT_COUNT - 1) {
      window.setTimeout(() => focusRecoverySegment(index + 1), 0);
    }
  }, [focusRecoverySegment, updateRecoverySegments]);

  const handleRecoverySegmentKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "Backspace" && recoverySecretSegments[index].length === 0 && index > 0) {
      event.preventDefault();
      focusRecoverySegment(index - 1);
      return;
    }
    if (event.key === "ArrowLeft" && index > 0 && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0) {
      event.preventDefault();
      focusRecoverySegment(index - 1);
      return;
    }
    if (
      event.key === "ArrowRight" &&
      index < RECOVERY_SECRET_SEGMENT_COUNT - 1 &&
      event.currentTarget.selectionStart === event.currentTarget.value.length &&
      event.currentTarget.selectionEnd === event.currentTarget.value.length
    ) {
      event.preventDefault();
      focusRecoverySegment(index + 1);
    }
  }, [focusRecoverySegment, recoverySecretSegments]);

  const handleRecoverySegmentPaste = React.useCallback((event: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    const pasted = normalizeRecoverySecretInput(event.clipboardData.getData("text"));
    if (!pasted) return;
    event.preventDefault();
    handleRecoverySegmentChange(index, pasted);
  }, [handleRecoverySegmentChange]);

  return (
    <motion.section
      className={`auth-lock-card${status?.tone === "error" ? " is-error" : ""}${isUnlocking ? " is-unlocking" : ""}${isShaking ? " is-shaking" : ""}${showingRecovery ? " is-recovery-mode" : ""}`}
      initial={cardReveal.initial}
      animate={cardReveal.animate}
      exit={cardReveal.exit}
      variants={cardReveal.variants}
      transition={cardReveal.transition}
    >
      <motion.div
        className="auth-lock-ambience"
        aria-hidden="true"
        initial={ambientReveal.initial}
        animate={ambientReveal.animate}
        exit={ambientReveal.exit}
        variants={ambientReveal.variants}
        transition={ambientReveal.transition}
      >
        <motion.span
          className="auth-lock-ambient auth-lock-ambient-primary"
          animate={ambientPrimaryAnimation}
          transition={ambientMotionEnabled ? { duration: 16, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } : { duration: 0.18 }}
        />
        <motion.span
          className="auth-lock-ambient auth-lock-ambient-secondary"
          animate={ambientSecondaryAnimation}
          transition={ambientMotionEnabled ? { duration: 18, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } : { duration: 0.18 }}
        />
        <motion.span
          className="auth-lock-sheen"
          animate={ambientSheenAnimation}
          transition={ambientMotionEnabled ? { duration: 12, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" } : { duration: 0.18 }}
        />
      </motion.div>

      <div className="auth-lock-surface">
        <motion.div className="auth-lock-hero" initial={formStagger.initial} animate={formStagger.animate} exit={formStagger.exit} variants={formStagger.variants}>
          <motion.p className="auth-lock-eyebrow" initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants} transition={fieldReveal.transition}>
            Vault Authenticator
          </motion.p>
          <motion.span className="auth-lock-icon" initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants} transition={fieldReveal.transition}>
            <AnimatedVaultLockIcon state={lockGlyphState} motionMode={resolvedMotionMode} paused={paused} />
          </motion.span>
          <motion.h1 className="auth-lock-title" initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants} transition={fieldReveal.transition}>
            Unlock your vault
          </motion.h1>
          <motion.p className="auth-lock-subtitle" initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants} transition={fieldReveal.transition}>
            Sign in to open your encrypted codes and settings.
          </motion.p>
        </motion.div>

        <div className="auth-lock-inner">
        {status ? (
          <p className={`auth-status auth-status-${status.tone} auth-lock-status-message`} role="status" aria-live={status.tone === "error" ? "assertive" : "polite"}>
            {status.text}
          </p>
        ) : null}

        <div className="auth-lock-meta-row">
          <span className="auth-lock-status-chip">{lockChipIcon}{lockChipLabel}</span>
          <div className="auth-lock-mode-actions">
            {unlockMode !== "password" && !showingRecoveryReset && !showingRecoveryNotice ? (
              <motion.button
                type="button"
                className="auth-btn auth-btn-ghost ui-focus auth-lock-mode-toggle"
                onClick={() => resetModeState("password")}
                disabled={busy || isUnlocking}
                whileTap={tapScale.whileTap}
                transition={tapScale.transition}
              >
                <ArrowLeft size={14} className="auth-btn-icon" aria-hidden="true" />
                Back to password
              </motion.button>
            ) : null}
            {recoveryAvailable && unlockMode !== "recovery" && !showingRecoveryReset && !showingRecoveryNotice ? (
              <motion.button
                type="button"
                className="auth-btn auth-btn-ghost ui-focus auth-lock-mode-toggle"
                onClick={() => resetModeState("recovery")}
                disabled={busy || isUnlocking}
                whileTap={tapScale.whileTap}
                transition={tapScale.transition}
              >
                <KeyRound size={14} className="auth-btn-icon" aria-hidden="true" />
                Use recovery secret
              </motion.button>
            ) : null}
          </div>
        </div>
        <p className="auth-lock-helper">{helperText}</p>
        {unlockMode === "password" && !recoveryAvailable ? <p className="auth-lock-helper-note"><Info size={14} className="auth-lock-helper-note-icon" aria-hidden="true" />Recovery unlock is not set up for this vault.</p> : null}
        {showingRecovery ? <p className="auth-lock-helper-note"><Info size={14} className="auth-lock-helper-note-icon" aria-hidden="true" />Paste the full code or enter each group. Hyphens are added for you.</p> : null}
        {showingRecoveryNotice ? <p className="auth-lock-helper-note"><Info size={14} className="auth-lock-helper-note-icon" aria-hidden="true" />Save your new password before you lock the app again.</p> : null}

        <motion.form
          className="auth-lock-form auth-lock-mode-pane auth-lock-mode-pane-password"
          onSubmit={(event) => {
            event.preventDefault();
            if (showingRecovery) {
              void submitRecoverySecret();
              return;
            }
            if (showingRecoveryReset) {
              void submitRecoveryPasswordReset();
              return;
            }
            void submitPassword();
          }}
          initial={formStagger.initial}
          animate={formStagger.animate}
          exit={formStagger.exit}
          variants={formStagger.variants}
        >
          <AnimatePresence mode="wait" initial={false}>
          {unlockMode === "password" ? (
            <motion.div
              key="password"
              className="auth-lock-pane-stack"
              initial={paneTransition.initial}
              animate={paneTransition.animate}
              exit={paneTransition.exit}
              variants={paneTransition.variants}
              transition={paneTransition.transition}
            >
              <motion.label className="auth-lock-field-label auth-sr-only" htmlFor="vault-password-input" initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants} transition={fieldReveal.transition}>
                Vault password
              </motion.label>
              <motion.div className="auth-lock-input-wrap" initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants} transition={fieldReveal.transition}>
                <input
                  id="vault-password-input"
                  type={passwordVisible ? "text" : "password"}
                  value={passwordInput}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPasswordInput(event.target.value)}
                  placeholder="Enter password"
                  className="auth-input ui-focus auth-lock-input-with-toggle"
                  aria-label="Vault password"
                  disabled={busy || isUnlocking}
                  autoFocus
                />
                <motion.button type="button" className="auth-btn auth-btn-ghost ui-focus auth-lock-field-toggle" onClick={() => setPasswordVisible((prev) => !prev)} disabled={busy || isUnlocking} whileTap={tapScale.whileTap} transition={tapScale.transition}>
                  {passwordVisible ? <EyeOff size={15} className="auth-btn-icon" aria-hidden="true" /> : <Eye size={15} className="auth-btn-icon" aria-hidden="true" />}
                  {passwordVisible ? "Hide" : "Show"}
                </motion.button>
              </motion.div>
              <motion.button type="submit" className="auth-btn auth-btn-primary ui-focus auth-lock-primary-action" disabled={busy || isUnlocking} whileTap={tapScale.whileTap} transition={tapScale.transition} initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants}>
                {busy ? <Loader2 size={15} className="auth-loading-icon" aria-hidden="true" /> : <Lock size={15} className="auth-btn-icon" aria-hidden="true" />}
                {busy ? "Checking..." : isUnlocking ? "Opening..." : "Unlock vault"}
              </motion.button>
            </motion.div>
          ) : showingRecovery ? (
            <motion.div
              key="recovery"
              className="auth-lock-pane-stack"
              initial={paneTransition.initial}
              animate={paneTransition.animate}
              exit={paneTransition.exit}
              variants={paneTransition.variants}
              transition={paneTransition.transition}
            >
              <motion.label className="auth-lock-field-label" initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants} transition={fieldReveal.transition}>
                Full recovery secret
              </motion.label>
              <motion.div
                className="auth-lock-recovery-panel"
                role="group"
                aria-label="Full recovery secret"
                initial={fieldReveal.initial}
                animate={fieldReveal.animate}
                exit={fieldReveal.exit}
                variants={fieldReveal.variants}
                transition={fieldReveal.transition}
              >
                <div className="auth-lock-recovery-panel-head">
                  <span className="auth-lock-recovery-panel-title">
                    <KeyRound size={14} className="auth-btn-icon" aria-hidden="true" />
                    Recovery key
                  </span>
                  <span className="auth-lock-recovery-panel-meta">8 groups x 6 characters</span>
                </div>
                <div className="auth-lock-recovery-grid">
                  {[0, 1].map((rowIndex) => (
                    <div key={rowIndex} className="auth-lock-recovery-row">
                      {Array.from({ length: 4 }, (_, columnIndex) => {
                        const segmentIndex = rowIndex * 4 + columnIndex;
                        return (
                          <React.Fragment key={segmentIndex}>
                            <input
                              ref={(node) => {
                                recoverySegmentRefs.current[segmentIndex] = node;
                              }}
                              value={recoverySecretSegments[segmentIndex]}
                              onChange={(event: React.ChangeEvent<HTMLInputElement>) => handleRecoverySegmentChange(segmentIndex, event.target.value)}
                              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => handleRecoverySegmentKeyDown(event, segmentIndex)}
                              onPaste={(event: React.ClipboardEvent<HTMLInputElement>) => handleRecoverySegmentPaste(event, segmentIndex)}
                              placeholder="XXXXXX"
                              className="auth-input ui-focus auth-lock-recovery-pill"
                              aria-label={`Recovery secret part ${segmentIndex + 1} of ${RECOVERY_SECRET_SEGMENT_COUNT}`}
                              inputMode="text"
                              autoCapitalize="characters"
                              autoCorrect="off"
                              spellCheck={false}
                              maxLength={RECOVERY_SECRET_SEGMENT_LENGTH}
                              disabled={busy || isUnlocking}
                              autoFocus={segmentIndex === 0}
                            />
                            {columnIndex < 3 ? <span className="auth-lock-recovery-separator" aria-hidden="true">-</span> : null}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </motion.div>
              <motion.div className="auth-inline-actions" initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants} transition={fieldReveal.transition}>
                <motion.button type="submit" className="auth-btn auth-btn-primary ui-focus auth-lock-primary-action" disabled={busy || isUnlocking} whileTap={tapScale.whileTap} transition={tapScale.transition}>
                  <KeyRound size={15} className="auth-btn-icon" aria-hidden="true" />
                  Verify recovery secret
                </motion.button>
              </motion.div>
            </motion.div>
          ) : showingRecoveryReset ? (
            <motion.div
              key="recovery-reset"
              className="auth-lock-pane-stack"
              initial={paneTransition.initial}
              animate={paneTransition.animate}
              exit={paneTransition.exit}
              variants={paneTransition.variants}
              transition={paneTransition.transition}
            >
              <motion.div initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants} transition={fieldReveal.transition}>
                <PasswordSetupFields
                  passwordInput={recoveryResetPassword}
                  passwordConfirm={recoveryResetConfirm}
                  busy={busy || isUnlocking}
                  notice={null}
                  autoFocus={true}
                  passwordLabel="Create a new password"
                  confirmLabel="Confirm new password"
                  passwordPlaceholder="New password"
                  confirmPlaceholder="Confirm new password"
                  passwordAriaLabel="Create a new password"
                  confirmAriaLabel="Confirm new password"
                  noticeClassName="auth-error"
                  onPasswordInputChange={setRecoveryResetPassword}
                  onPasswordConfirmChange={setRecoveryResetConfirm}
                  onNoticeClear={() => {
                    if (status?.tone === "error") {
                      setStatus(null);
                    }
                  }}
                />
              </motion.div>
              <motion.div className="auth-inline-actions" initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants} transition={fieldReveal.transition}>
                <motion.button type="submit" className="auth-btn auth-btn-primary ui-focus auth-lock-primary-action" disabled={busy || isUnlocking} whileTap={tapScale.whileTap} transition={tapScale.transition}>
                  <CheckCircle2 size={15} className="auth-btn-icon" aria-hidden="true" />
                  Save new password
                </motion.button>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="recovery-notice"
              className="auth-lock-pane-stack"
              initial={paneTransition.initial}
              animate={paneTransition.animate}
              exit={paneTransition.exit}
              variants={paneTransition.variants}
              transition={paneTransition.transition}
            >
              <motion.p className="auth-lock-helper" initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants} transition={fieldReveal.transition}>
                Your recovery secret has been used. It can only be used once - don't forget your new password before you lock the app.
              </motion.p>
              <motion.div className="auth-inline-actions" initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants} transition={fieldReveal.transition}>
                <motion.button
                  type="button"
                  className="auth-btn auth-btn-primary ui-focus auth-lock-primary-action"
                  disabled={busy || isUnlocking}
                  whileTap={tapScale.whileTap}
                  transition={tapScale.transition}
                  onClick={() => {
                    resetModeState("password");
                    setStatus({ text: "Use your new password to unlock your vault.", tone: "info" });
                  }}
                >
                  <CheckCircle2 size={15} className="auth-btn-icon" aria-hidden="true" />
                  Got it
                </motion.button>
              </motion.div>
            </motion.div>
          )}
          </AnimatePresence>

          {isMacOSRuntime() && biometricPromptEnabled && vaultProtection.biometricEnrolled && !showingRecoveryReset && !showingRecoveryNotice ? (
            <motion.button type="button" className="auth-btn auth-btn-subtle ui-focus" onClick={() => void submitBiometric()} disabled={busy || isUnlocking} whileTap={tapScale.whileTap} transition={tapScale.transition} initial={fieldReveal.initial} animate={fieldReveal.animate} exit={fieldReveal.exit} variants={fieldReveal.variants}>
              <Fingerprint size={15} className="auth-btn-icon" aria-hidden="true" />
              Unlock with Touch ID
            </motion.button>
          ) : null}
        </motion.form>
        </div>
      </div>
    </motion.section>
  );
}
