import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  LifeBuoy,
  Lock,
  MinusCircle,
  Shield,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import type { AppSettings, LockApi, VaultProtectionStatus } from "../bridge";
import { combineMotionPresets, resolveMotionState, useMotionVariants } from "../lib/motion";
import { PasswordSetupFields, getPasswordStrength } from "./PasswordSetupFields";
import { RecoverySecretDisplay } from "./RecoverySecretDisplay";
import { StaticDotStepper } from "./StaticDotStepper";

type SafetySetupMode = "auto" | "manual";
type SafetySetupStep = "overview" | "password" | "recovery" | "touch-id" | "accounts" | "done";

type CopyOptions = {
  silent?: boolean;
};

type SensitiveActionResult<T> = { status: "ok"; value: T } | { status: "cancelled" };
type SensitiveActionRunner = <T>(
  action: () => Promise<T>,
  options?: { requiresSecuritySession?: boolean; promptFirst?: boolean }
) => Promise<SensitiveActionResult<T>>;

type SafetySetupModalProps = {
  mode: SafetySetupMode;
  isClosing: boolean;
  themeClass: string;
  settings: AppSettings;
  lockApi: LockApi;
  passwordLockConfigured: boolean;
  vaultProtection: VaultProtectionStatus;
  accountCount: number;
  runSensitiveAction: SensitiveActionRunner;
  onMethodSaved(): Promise<void>;
  onGenerateRecoverySecret(): Promise<string | null>;
  onCopyRecoverySecret(secret: string, options?: CopyOptions): Promise<boolean> | boolean;
  onEnrollBiometric(): Promise<boolean>;
  onRemoveBiometric?(): Promise<boolean>;
  onOpenAddAccount(): Promise<void> | void;
  onSettingsChange(next: AppSettings): Promise<void>;
  onError(error: unknown): void;
  onSkip(): Promise<void>;
  onClose(): void;
  onComplete(): Promise<boolean>;
};

function isMacOSRuntime(): boolean {
  return typeof process !== "undefined" && process.platform === "darwin";
}

function stepList(): SafetySetupStep[] {
  return isMacOSRuntime()
    ? ["overview", "password", "recovery", "touch-id", "accounts", "done"]
    : ["overview", "password", "recovery", "accounts", "done"];
}

export function SafetySetupModal(props: SafetySetupModalProps) {
  const {
    mode,
    isClosing,
    themeClass,
    lockApi,
    passwordLockConfigured,
    vaultProtection,
    accountCount,
    runSensitiveAction,
    onMethodSaved,
    onGenerateRecoverySecret,
    onCopyRecoverySecret,
    onEnrollBiometric,
    onRemoveBiometric,
    onOpenAddAccount,
    onError,
    onSkip,
    onClose,
    onComplete,
  } = props;

  const steps = React.useMemo(() => stepList(), []);
  const isMacOS = React.useMemo(() => isMacOSRuntime(), []);
  const [step, setStep] = React.useState<SafetySetupStep>("overview");
  const [stepDirection, setStepDirection] = React.useState<1 | -1>(1);
  const [busy, setBusy] = React.useState(false);
  const [passwordInput, setPasswordInput] = React.useState("");
  const [passwordConfirm, setPasswordConfirm] = React.useState("");
  const [passwordNotice, setPasswordNotice] = React.useState<string | null>(null);
  const [passwordReady, setPasswordReady] = React.useState(passwordLockConfigured);
  const [passwordExpanded, setPasswordExpanded] = React.useState(!passwordLockConfigured);
  const [touchIdEnabled, setTouchIdEnabled] = React.useState(vaultProtection.biometricEnrolled === true);
  const [touchIdSkipped, setTouchIdSkipped] = React.useState(false);
  const [recoverySecret, setRecoverySecret] = React.useState<string | null>(null);
  const [recoverySaved, setRecoverySaved] = React.useState(false);
  const [recoverySkipped, setRecoverySkipped] = React.useState(false);
  const [recoveryConfigured, setRecoveryConfigured] = React.useState(vaultProtection.recoveryGenerated === true);
  const [showRecoveryReplaceConfirm, setShowRecoveryReplaceConfirm] = React.useState(false);
  const [accountsConfigured, setAccountsConfigured] = React.useState(accountCount > 0);
  const [accountsSkipped, setAccountsSkipped] = React.useState(false);

  const currentIndex = steps.indexOf(step);
  const currentStep = currentIndex >= 0 ? currentIndex + 1 : 1;
  const passwordStrength = React.useMemo(() => getPasswordStrength(passwordInput), [passwordInput]);
  const recoveryGenerated = Boolean(recoverySecret);
  const clearRecoverySecret = React.useCallback(() => {
    setRecoverySecret(null);
    setRecoverySaved(false);
  }, []);

  React.useEffect(() => {
    setTouchIdEnabled(vaultProtection.biometricEnrolled === true);
  }, [vaultProtection.biometricEnrolled]);

  React.useEffect(() => {
    setRecoveryConfigured(vaultProtection.recoveryGenerated === true);
  }, [vaultProtection.recoveryGenerated]);

  React.useEffect(() => {
    setAccountsConfigured(accountCount > 0);
    if (accountCount > 0) {
      setAccountsSkipped(false);
    }
  }, [accountCount]);

  const goToStep = React.useCallback(
    (next: SafetySetupStep) => {
      const nextIndex = steps.indexOf(next);
      if (nextIndex < 0) {
        return;
      }
      setStepDirection(nextIndex >= currentIndex ? 1 : -1);
      setStep(next);
    },
    [currentIndex, steps]
  );

  const goForward = React.useCallback(() => {
    const next = steps[currentIndex + 1] ?? "done";
    goToStep(next);
  }, [currentIndex, goToStep, steps]);

  const goBack = React.useCallback(() => {
    const previous = steps[Math.max(0, currentIndex - 1)] ?? "overview";
    goToStep(previous);
  }, [currentIndex, goToStep, steps]);

  const handleOverviewClose = React.useCallback(() => {
    clearRecoverySecret();
    if (mode === "auto") {
      void onSkip();
      return;
    }
    onClose();
  }, [clearRecoverySecret, mode, onClose, onSkip]);

  const handleSetPassword = React.useCallback(async () => {
    if (passwordReady && !passwordExpanded) {
      goForward();
      return;
    }

    if (!passwordStrength.met) {
      setPasswordNotice(passwordStrength.requirement ?? "Choose a password that meets the vault policy before continuing.");
      return;
    }

    if (passwordInput !== passwordConfirm) {
      setPasswordNotice("Password and confirmation must match.");
      return;
    }

    setBusy(true);
    setPasswordNotice(null);
    try {
      if (passwordReady) {
        const result = await runSensitiveAction(async () => await lockApi.setCredential("password", passwordInput), {
          requiresSecuritySession: true,
          promptFirst: true,
        });
        if (result.status === "cancelled") {
          return;
        }
      } else {
        await lockApi.setCredential("password", passwordInput);
      }
      await onMethodSaved();
      setPasswordReady(true);
      setPasswordExpanded(false);
      setPasswordInput("");
      setPasswordConfirm("");
      goForward();
    } catch (error) {
      onError(error);
      setPasswordNotice(error instanceof Error ? error.message : "Password setup failed.");
    } finally {
      setBusy(false);
    }
  }, [goForward, lockApi, onError, onMethodSaved, passwordConfirm, passwordExpanded, passwordInput, passwordReady, passwordStrength.met, runSensitiveAction]);

  const handleGenerateRecovery = React.useCallback(async () => {
    setBusy(true);
    try {
      const result = await runSensitiveAction(async () => await onGenerateRecoverySecret(), {
        requiresSecuritySession: true,
        promptFirst: recoveryConfigured,
      });
      if (result.status === "cancelled" || !result.value) {
        return;
      }
      const nextSecret = result.value;
      setRecoverySecret(nextSecret);
      setRecoverySaved(false);
      setRecoverySkipped(false);
      setShowRecoveryReplaceConfirm(false);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }, [onError, onGenerateRecoverySecret, recoveryConfigured, runSensitiveAction]);

  const handleContinueRecovery = React.useCallback(() => {
    if (recoverySecret) {
      if (!recoverySaved) {
        return;
      }
      clearRecoverySecret();
      setRecoveryConfigured(true);
    }
    goForward();
  }, [clearRecoverySecret, goForward, recoverySaved, recoverySecret]);

  const handleEnableTouchId = React.useCallback(async () => {
    setBusy(true);
    try {
      const result = await runSensitiveAction(async () => await onEnrollBiometric(), { requiresSecuritySession: true });
      if (result.status === "cancelled") {
        return;
      }
      if (result.value) {
        setTouchIdEnabled(true);
        setTouchIdSkipped(false);
      }
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }, [onEnrollBiometric, onError, runSensitiveAction]);

  const handleDisableTouchId = React.useCallback(async () => {
    if (!onRemoveBiometric) {
      setTouchIdEnabled(false);
      setTouchIdSkipped(true);
      return;
    }

    setBusy(true);
    try {
      const result = await runSensitiveAction(async () => await onRemoveBiometric(), { requiresSecuritySession: true });
      if (result.status === "cancelled") {
        return;
      }
      if (result.value) {
        setTouchIdEnabled(false);
        setTouchIdSkipped(true);
      }
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }, [onError, onRemoveBiometric, runSensitiveAction]);

  const handleOpenAddAccount = React.useCallback(async () => {
    setBusy(true);
    try {
      await onOpenAddAccount();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }, [onError, onOpenAddAccount]);

  const handleDone = React.useCallback(async () => {
    setBusy(true);
    try {
      const ok = await onComplete();
      if (!ok) {
        return;
      }
      clearRecoverySecret();
      onClose();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }, [clearRecoverySecret, onClose, onComplete, onError]);

  React.useEffect(() => clearRecoverySecret, [clearRecoverySecret]);

  const passwordContinueDisabled =
    busy || (!passwordReady || passwordExpanded ? !passwordStrength.met || passwordInput.length === 0 || passwordConfirm.length === 0 || passwordInput !== passwordConfirm : false);
  const recoveryContinueDisabled = busy || (!recoveryConfigured && !recoverySkipped && !recoveryGenerated) || (recoveryGenerated && !recoverySaved);
  const touchIdContinueDisabled = busy || (!touchIdEnabled && !touchIdSkipped);
  const accountsContinueDisabled = busy || (!accountsConfigured && !accountsSkipped);

  const overviewItems = React.useMemo(
    () => [
      {
        step: "password" as const,
        icon: Lock,
        title: "Password",
        description: "Keeps others out.",
        complete: passwordReady,
      },
      {
        step: "recovery" as const,
        icon: LifeBuoy,
        title: "Emergency backup",
        description: "Gets you back in if you forget your password.",
        complete: recoveryConfigured,
      },
      ...(isMacOS
        ? [
            {
              step: "touch-id" as const,
              icon: Fingerprint,
              title: "Fingerprint unlock",
              description: "Open without typing.",
              complete: touchIdEnabled,
            },
          ]
        : []),
      {
        step: "accounts" as const,
        icon: Smartphone,
        title: "Your first app",
        description: "Add an account.",
        complete: accountsConfigured,
      },
    ],
    [accountsConfigured, isMacOS, passwordReady, recoveryConfigured, touchIdEnabled]
  );

  const motionVariants = useMotionVariants();
  const overlayPresence = React.useMemo(() => combineMotionPresets(motionVariants.fadeIn, motionVariants.fadeOut), [motionVariants]);
  const modalPresence = React.useMemo(() => combineMotionPresets(motionVariants.scaleIn, motionVariants.scaleOut), [motionVariants]);
  const stepPresence = React.useMemo(
    () =>
      combineMotionPresets(
        stepDirection === 1 ? motionVariants.stepEnterForward : motionVariants.stepEnterBackward,
        stepDirection === 1 ? motionVariants.stepExitForward : motionVariants.stepExitBackward
      ),
    [motionVariants, stepDirection]
  );
  const expandPresence = React.useMemo(() => combineMotionPresets(motionVariants.expand, motionVariants.collapse), [motionVariants]);
  const checkmarkPresence = React.useMemo(() => combineMotionPresets(motionVariants.checkmark, motionVariants.fadeOut), [motionVariants]);

  return (
    <motion.div
      className={`auth-overlay auth-safety-setup-overlay ${themeClass}`}
      onClick={() => {
        if (step !== "overview") {
          return;
        }
        handleOverviewClose();
      }}
      role="presentation"
      initial={overlayPresence.initial}
      animate={resolveMotionState(overlayPresence, isClosing)}
      exit={overlayPresence.exit}
      variants={overlayPresence.variants}
      transition={overlayPresence.transition}
    >
      <motion.section
        className={`auth-settings-modal auth-safety-setup-modal ${themeClass}`}
        data-step={step}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Safety Setup"
        initial={modalPresence.initial}
        animate={resolveMotionState(modalPresence, isClosing)}
        exit={modalPresence.exit}
        variants={modalPresence.variants}
        transition={modalPresence.transition}
      >
        <header className="auth-modal-header auth-safety-setup-header">
          <div className="auth-safety-setup-header-copy">
            <h2 className="auth-modal-title">Safety Setup</h2>
          </div>
          <StaticDotStepper currentStep={currentStep} totalSteps={steps.length} className="auth-safety-setup-progress" />
        </header>

        <div className="auth-safety-setup-body auth-safety-setup-body-single">
          <div className="auth-settings-scroll auth-safety-setup-scroll">
            <div className="auth-safety-setup-stage-shell">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  className="auth-safety-stage"
                  initial={stepPresence.initial}
                  animate={stepPresence.animate}
                  exit={stepPresence.exit}
                  variants={stepPresence.variants}
                  transition={stepPresence.transition}
                >
              {step === "overview" ? (
                <section className="settings-section auth-safety-setup-hero auth-safety-overview-panel">
                  <div className="auth-safety-stage-head">
                    <span className="auth-safety-stage-icon auth-safety-stage-icon-primary" aria-hidden="true">
                      <Shield size={32} />
                    </span>
                    <div className="auth-safety-stage-copy">
                      <h3 className="settings-title auth-safety-setup-stage-title">Let&apos;s protect your accounts.</h3>
                      <p className="settings-note">Takes about a minute.</p>
                    </div>
                  </div>

                  <div className="auth-safety-overview-list">
                    {overviewItems.map((item) => {
                      const Icon = item.icon;

                      return (
                        <button
                          key={item.step}
                          type="button"
                          className="auth-safety-overview-card ui-focus"
                          onClick={() => goToStep(item.step)}
                        >
                          <span className="auth-safety-overview-icon-surface" aria-hidden="true">
                            <Icon size={18} />
                          </span>
                          <span className="auth-safety-overview-card-copy">
                            <span className="auth-safety-overview-card-title">{item.title}</span>
                            <span className="auth-safety-overview-card-note">{item.description}</span>
                          </span>
                          <AnimatePresence initial={false}>
                            {item.complete ? (
                              <motion.span
                                initial={checkmarkPresence.initial}
                                animate={checkmarkPresence.animate}
                                exit={checkmarkPresence.exit}
                                variants={checkmarkPresence.variants}
                                transition={checkmarkPresence.transition}
                              >
                                <CheckCircle size={18} className="auth-safety-overview-complete" aria-hidden="true" />
                              </motion.span>
                            ) : null}
                          </AnimatePresence>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {step === "password" ? (
                <section className="settings-section auth-safety-setup-hero">
                  <div className="auth-safety-stage-head">
                    <span className="auth-safety-stage-icon auth-safety-stage-icon-primary" aria-hidden="true">
                      <Lock size={32} />
                    </span>
                    <div className="auth-safety-stage-copy">
                      <h3 className="settings-title auth-safety-setup-stage-title">Create a password</h3>
                      <p className="settings-note">The only way to open the app. Choose something you&apos;ll remember.</p>
                    </div>
                  </div>

                  {passwordReady ? (
                    <div className="auth-safety-status-card auth-safety-status-card-success">
                      <div className="auth-safety-status-card-main">
                        <Lock size={18} className="auth-safety-status-icon-success" aria-hidden="true" />
                        <div>
                          <p className="auth-safety-status-title">Your password is set.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="auth-safety-link-btn ui-focus"
                        onClick={() => {
                          setPasswordExpanded((previous) => !previous);
                          setPasswordNotice(null);
                          if (passwordExpanded) {
                            setPasswordInput("");
                            setPasswordConfirm("");
                          }
                        }}
                      >
                        {passwordExpanded ? "Keep current password" : "Change it"}
                      </button>
                    </div>
                  ) : null}

                  <AnimatePresence initial={false}>
                    {!passwordReady || passwordExpanded ? (
                      <motion.div
                        className={`auth-safety-expandable is-open`}
                        initial={expandPresence.initial}
                        animate={expandPresence.animate}
                        exit={expandPresence.exit}
                        variants={expandPresence.variants}
                        transition={expandPresence.transition}
                      >
                    <div className="auth-safety-expandable-inner">
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
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </section>
              ) : null}

              {step === "recovery" ? (
                <section className="settings-section auth-safety-setup-hero">
                  <div className="auth-safety-stage-head">
                    <span className="auth-safety-stage-icon auth-safety-stage-icon-primary" aria-hidden="true">
                      <LifeBuoy size={32} />
                    </span>
                    <div className="auth-safety-stage-copy">
                      <h3 className="settings-title auth-safety-setup-stage-title">
                        {recoveryGenerated ? "Here is your backup code." : "Save an emergency backup"}
                      </h3>
                      <p className="settings-note">
                        {recoveryGenerated
                          ? "Write it down. You won't see it again."
                          : "If you forget your password, this code gets you back in. Most people never need it."}
                      </p>
                    </div>
                  </div>

                  {!recoveryConfigured && !recoveryGenerated ? (
                    <div className="auth-safety-actions-stack">
                      <button type="button" className="auth-btn auth-btn-primary ui-focus" onClick={() => void handleGenerateRecovery()} disabled={busy}>
                        Generate backup code
                      </button>
                      <button
                        type="button"
                        className="auth-safety-link-btn ui-focus"
                        onClick={() => setRecoverySkipped(true)}
                        disabled={busy}
                      >
                        Skip
                      </button>
                    </div>
                  ) : null}

                  {recoverySkipped && !recoveryConfigured && !recoveryGenerated ? (
                    <div className="auth-safety-status-card auth-safety-status-card-warning">
                      <div className="auth-safety-status-card-main">
                        <AlertTriangle size={18} className="auth-safety-status-icon-warning" aria-hidden="true" />
                        <div>
                          <p className="auth-safety-status-title">You won&apos;t be able to recover your accounts if you forget your password.</p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {recoveryGenerated ? (
                    <RecoverySecretDisplay
                      presentation="inline"
                      secret={recoverySecret ?? ""}
                      acknowledged={recoverySaved}
                      acknowledgementLabel="I've saved my backup code somewhere safe."
                      acknowledgementAriaLabel="Confirm backup code saved"
                      copyLabel="Copy"
                      copiedLabel="Copied"
                      onAcknowledgedChange={setRecoverySaved}
                      onCopy={() => onCopyRecoverySecret(recoverySecret ?? "", { silent: true })}
                    />
                  ) : null}

                  {recoveryConfigured && !recoveryGenerated ? (
                    <div className="auth-safety-status-card auth-safety-status-card-success">
                      <div className="auth-safety-status-card-main">
                        <LifeBuoy size={18} className="auth-safety-status-icon-success" aria-hidden="true" />
                        <div>
                          <p className="auth-safety-status-title">Your backup code is saved.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="auth-safety-link-btn ui-focus"
                        onClick={() => setShowRecoveryReplaceConfirm(true)}
                        disabled={busy}
                      >
                        Replace it
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {step === "touch-id" ? (
                <section className="settings-section auth-safety-setup-hero">
                  <div className="auth-safety-stage-head">
                    <span className="auth-safety-stage-icon auth-safety-stage-icon-primary" aria-hidden="true">
                      <Fingerprint size={32} />
                    </span>
                    <div className="auth-safety-stage-copy">
                      <h3 className="settings-title auth-safety-setup-stage-title">Open with your fingerprint</h3>
                      <p className="settings-note">Use Touch ID instead of typing your password.</p>
                    </div>
                  </div>

                  {touchIdEnabled ? (
                    <div className="auth-safety-status-card auth-safety-status-card-success">
                      <div className="auth-safety-status-card-main">
                        <Fingerprint size={18} className="auth-safety-status-icon-success" aria-hidden="true" />
                        <div>
                          <p className="auth-safety-status-title">Touch ID is on.</p>
                        </div>
                      </div>
                      <button type="button" className="auth-safety-link-btn ui-focus" onClick={() => void handleDisableTouchId()} disabled={busy}>
                        Turn off
                      </button>
                    </div>
                  ) : (
                    <div className="auth-safety-actions-stack">
                      <button type="button" className="auth-btn auth-btn-primary ui-focus" onClick={() => void handleEnableTouchId()} disabled={busy}>
                        Enable Touch ID
                      </button>
                      <button
                        type="button"
                        className="auth-safety-link-btn ui-focus"
                        onClick={() => setTouchIdSkipped(true)}
                        disabled={busy}
                      >
                        Skip
                      </button>
                    </div>
                  )}
                </section>
              ) : null}

              {step === "accounts" ? (
                <section className="settings-section auth-safety-setup-hero">
                  <div className="auth-safety-stage-head">
                    <span className="auth-safety-stage-icon auth-safety-stage-icon-primary" aria-hidden="true">
                      <Smartphone size={32} />
                    </span>
                    <div className="auth-safety-stage-copy">
                      <h3 className="settings-title auth-safety-setup-stage-title">Add your first app</h3>
                      <p className="settings-note">Scan the QR code from any site that uses two-factor login.</p>
                    </div>
                  </div>

                  {accountsConfigured ? (
                    <div className="auth-safety-status-card auth-safety-status-card-success">
                      <div className="auth-safety-status-card-main">
                        <CheckCircle size={18} className="auth-safety-status-icon-success" aria-hidden="true" />
                        <div>
                          <p className="auth-safety-status-title">App added.</p>
                        </div>
                      </div>
                      <button type="button" className="auth-safety-link-btn ui-focus" onClick={() => void handleOpenAddAccount()} disabled={busy}>
                        Add another
                      </button>
                    </div>
                  ) : (
                    <div className="auth-safety-actions-stack">
                      <button type="button" className="auth-btn auth-btn-primary ui-focus" onClick={() => void handleOpenAddAccount()} disabled={busy}>
                        Add an app
                      </button>
                      <button
                        type="button"
                        className="auth-safety-link-btn ui-focus"
                        onClick={() => setAccountsSkipped(true)}
                        disabled={busy}
                      >
                        Skip
                      </button>
                      {accountsSkipped ? <p className="settings-note">You can add apps from the main screen anytime.</p> : null}
                    </div>
                  )}
                </section>
              ) : null}

              {step === "done" ? (
                <section className="settings-section auth-safety-setup-done auth-safety-setup-hero">
                  <div className="auth-safety-stage-head auth-safety-stage-head-centered">
                    <span className="auth-safety-stage-icon auth-safety-stage-icon-success auth-safety-stage-icon-large" aria-hidden="true">
                      <ShieldCheck size={48} />
                    </span>
                    <div className="auth-safety-stage-copy auth-safety-stage-copy-centered">
                      <h3 className="settings-title auth-safety-setup-stage-title">You&apos;re all set.</h3>
                      <p className="settings-note">Your accounts are protected.</p>
                    </div>
                  </div>

                  <div className="auth-safety-summary-list">
                    <div className="auth-safety-summary-row">
                      <div className="auth-safety-summary-row-main">
                        <CheckCircle size={18} className="auth-safety-status-icon-success" aria-hidden="true" />
                        <span className="auth-safety-summary-label">Password</span>
                      </div>
                      <span className="auth-safety-summary-value">Set</span>
                    </div>

                    <div className="auth-safety-summary-row">
                      <div className="auth-safety-summary-row-main">
                        {recoveryConfigured ? (
                          <CheckCircle size={18} className="auth-safety-status-icon-success" aria-hidden="true" />
                        ) : (
                          <AlertTriangle size={18} className="auth-safety-status-icon-warning" aria-hidden="true" />
                        )}
                        <span className="auth-safety-summary-label">Backup</span>
                      </div>
                      <div className="auth-safety-summary-value-group">
                        <span className={`auth-safety-summary-value${recoveryConfigured ? "" : " is-warning"}`}>{recoveryConfigured ? "Saved" : "Not saved"}</span>
                        {!recoveryConfigured ? (
                          <button
                            type="button"
                            className="auth-safety-link-btn ui-focus"
                            onClick={() => {
                              setRecoverySkipped(false);
                              goToStep("recovery");
                            }}
                          >
                            Generate backup code
                            <ChevronRight size={15} className="auth-btn-icon" aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {isMacOS && touchIdEnabled ? (
                      <div className="auth-safety-summary-row">
                        <div className="auth-safety-summary-row-main">
                          <CheckCircle size={18} className="auth-safety-status-icon-success" aria-hidden="true" />
                          <span className="auth-safety-summary-label">Touch ID</span>
                        </div>
                        <span className="auth-safety-summary-value">On</span>
                      </div>
                    ) : null}

                    <div className="auth-safety-summary-row">
                      <div className="auth-safety-summary-row-main">
                        {accountsConfigured ? (
                          <CheckCircle size={18} className="auth-safety-status-icon-success" aria-hidden="true" />
                        ) : (
                          <MinusCircle size={18} className="auth-safety-status-icon-muted" aria-hidden="true" />
                        )}
                        <span className="auth-safety-summary-label">App</span>
                      </div>
                      <span className="auth-safety-summary-value">{accountsConfigured ? "Added" : "Skipped"}</span>
                    </div>
                  </div>
                </section>
              ) : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

        <footer className="auth-modal-footer auth-safety-setup-footer">
          {step === "overview" ? (
            <>
              <button type="button" className="auth-btn auth-btn-ghost ui-focus" onClick={handleOverviewClose}>
                Close
              </button>
              <button type="button" className="auth-btn auth-btn-primary auth-safety-next-btn ui-focus" onClick={goForward}>
                Get started
                <ChevronRight size={15} className="auth-btn-icon" aria-hidden="true" />
              </button>
            </>
          ) : null}

          {step === "password" ? (
            <>
              <button type="button" className="auth-btn auth-btn-subtle ui-focus" onClick={goBack} disabled={busy}>
                <ChevronLeft size={15} className="auth-btn-icon" aria-hidden="true" />
                Back
              </button>
              <button
                type="button"
                className="auth-btn auth-btn-primary auth-safety-next-btn ui-focus"
                onClick={() => void handleSetPassword()}
                disabled={passwordContinueDisabled}
              >
                Continue
                <ChevronRight size={15} className="auth-btn-icon" aria-hidden="true" />
              </button>
            </>
          ) : null}

          {step === "recovery" ? (
            <>
              {!recoveryGenerated ? (
                <button type="button" className="auth-btn auth-btn-subtle ui-focus" onClick={goBack} disabled={busy}>
                  <ChevronLeft size={15} className="auth-btn-icon" aria-hidden="true" />
                  Back
                </button>
              ) : (
                <span className="auth-safety-footer-spacer" aria-hidden="true" />
              )}
              <button
                type="button"
                className="auth-btn auth-btn-primary auth-safety-next-btn ui-focus"
                onClick={handleContinueRecovery}
                disabled={recoveryContinueDisabled}
              >
                Continue
                <ChevronRight size={15} className="auth-btn-icon" aria-hidden="true" />
              </button>
            </>
          ) : null}

          {step === "touch-id" ? (
            <>
              <button type="button" className="auth-btn auth-btn-subtle ui-focus" onClick={goBack} disabled={busy}>
                <ChevronLeft size={15} className="auth-btn-icon" aria-hidden="true" />
                Back
              </button>
              <button type="button" className="auth-btn auth-btn-primary auth-safety-next-btn ui-focus" onClick={goForward} disabled={touchIdContinueDisabled}>
                Continue
                <ChevronRight size={15} className="auth-btn-icon" aria-hidden="true" />
              </button>
            </>
          ) : null}

          {step === "accounts" ? (
            <>
              <button type="button" className="auth-btn auth-btn-subtle ui-focus" onClick={goBack} disabled={busy}>
                <ChevronLeft size={15} className="auth-btn-icon" aria-hidden="true" />
                Back
              </button>
              <button type="button" className="auth-btn auth-btn-primary auth-safety-next-btn ui-focus" onClick={goForward} disabled={accountsContinueDisabled}>
                Continue
                <ChevronRight size={15} className="auth-btn-icon" aria-hidden="true" />
              </button>
            </>
          ) : null}

          {step === "done" ? (
            <button type="button" className="auth-btn auth-btn-primary ui-focus" onClick={() => void handleDone()} disabled={busy}>
              Done
            </button>
          ) : null}
        </footer>
      </motion.section>

      {showRecoveryReplaceConfirm ? (
        <motion.div
          className={`auth-overlay ${themeClass}`}
          onClick={() => {
            if (busy) {
              return;
            }
            setShowRecoveryReplaceConfirm(false);
          }}
          role="presentation"
          initial={overlayPresence.initial}
          animate={overlayPresence.animate}
          exit={overlayPresence.exit}
          variants={overlayPresence.variants}
          transition={overlayPresence.transition}
        >
          <motion.section
            className={`auth-confirm-modal ${themeClass}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Replace backup code"
            initial={modalPresence.initial}
            animate={modalPresence.animate}
            exit={modalPresence.exit}
            variants={modalPresence.variants}
            transition={modalPresence.transition}
          >
            <header className="auth-modal-header">
              <h2 className="auth-modal-title auth-confirm-title">
                <span className="auth-confirm-title-icon" aria-hidden="true">
                  <AlertTriangle size={16} />
                </span>
                <span>Replace backup code?</span>
              </h2>
            </header>

            <div className="auth-confirm-body">
              <p className="auth-confirm-copy">Your old code stops working immediately.</p>
            </div>

            <footer className="auth-confirm-actions">
              <button type="button" className="auth-btn auth-btn-subtle ui-focus auth-btn-modal" onClick={() => setShowRecoveryReplaceConfirm(false)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="auth-btn auth-btn-warning ui-focus auth-btn-modal" onClick={() => void handleGenerateRecovery()} disabled={busy}>
                Replace
              </button>
            </footer>
          </motion.section>
        </motion.div>
      ) : null}
    </motion.div>
  );
}
