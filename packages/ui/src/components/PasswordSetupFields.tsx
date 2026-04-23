import * as React from "react";
import {
  VAULT_PASSWORD_MAX_LENGTH,
  VAULT_PASSWORD_MIN_LENGTH,
  getVaultPasswordPolicyIssue,
  getVaultPasswordPolicyMessage,
} from "@authenticator/core";

export type PasswordStrength = {
  score: number;
  label: string;
  met: boolean;
  requirement: string | null;
};

export function getPasswordStrength(password: string): PasswordStrength {
  const issue = getVaultPasswordPolicyIssue(password);
  if (password.length === 0) {
    return { score: 0, label: `Use at least ${VAULT_PASSWORD_MIN_LENGTH} characters.`, met: false, requirement: `Use at least ${VAULT_PASSWORD_MIN_LENGTH} characters.` };
  }

  if (issue) {
    const requirement = getVaultPasswordPolicyMessage(issue);
    return { score: 0, label: requirement, met: false, requirement };
  }

  let score = 0;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;

  if (password.length >= VAULT_PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length >= 20) score += 1;
  if (variety >= 2) score += 1;

  const clampedScore = Math.min(score, 4);
  const label =
    password.length > VAULT_PASSWORD_MAX_LENGTH
      ? `Use ${VAULT_PASSWORD_MAX_LENGTH} characters or fewer.`
      : (["Too short", "Weak", "Fair", "Strong", "Very strong"][clampedScore] ?? "Weak");

  return {
    score: clampedScore,
    label,
    met: true,
    requirement: null,
  };
}

type PasswordSetupFieldsProps = {
  passwordInput: string;
  passwordConfirm: string;
  busy: boolean;
  notice: string | null;
  autoFocus?: boolean;
  passwordLabel?: string;
  confirmLabel?: string;
  passwordPlaceholder?: string;
  confirmPlaceholder?: string;
  passwordAriaLabel?: string;
  confirmAriaLabel?: string;
  noticeClassName?: string;
  onPasswordInputChange(value: string): void;
  onPasswordConfirmChange(value: string): void;
  onNoticeClear?(): void;
};

export function PasswordSetupFields({
  passwordInput,
  passwordConfirm,
  busy,
  notice,
  autoFocus = false,
  passwordLabel,
  confirmLabel,
  passwordPlaceholder = "Password",
  confirmPlaceholder = "Confirm password",
  passwordAriaLabel = "Vault password",
  confirmAriaLabel = "Confirm vault password",
  noticeClassName = "auth-error",
  onPasswordInputChange,
  onPasswordConfirmChange,
  onNoticeClear,
}: PasswordSetupFieldsProps) {
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [passwordConfirmVisible, setPasswordConfirmVisible] = React.useState(false);
  const passwordStrength = React.useMemo(() => getPasswordStrength(passwordInput), [passwordInput]);
  const passwordTooShort = passwordInput.length > 0 && !passwordStrength.met;
  const passwordMismatch = passwordConfirm.length > 0 && passwordInput !== passwordConfirm;

  return (
    <div className="auth-safety-field-stack">
      {passwordLabel ? <label className="auth-lock-field-label">{passwordLabel}</label> : null}
      <div className="auth-safety-input-row">
        <input
          type={passwordVisible ? "text" : "password"}
          value={passwordInput}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            onPasswordInputChange(event.target.value);
            onNoticeClear?.();
          }}
          placeholder={passwordPlaceholder}
          className={`auth-input ui-focus${passwordTooShort ? " is-error" : ""}`}
          aria-label={passwordAriaLabel}
          disabled={busy}
          autoFocus={autoFocus}
        />
        <button type="button" className="auth-btn auth-btn-ghost ui-focus auth-safety-inline-btn" onClick={() => setPasswordVisible((previous) => !previous)} disabled={busy}>
          {passwordVisible ? "Hide" : "Show"}
        </button>
      </div>

      <div className="auth-safety-strength" data-score={passwordStrength.score}>
        <div className="auth-safety-strength-bars" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} className={`auth-safety-strength-bar${index < passwordStrength.score ? " is-active" : ""}`} />
          ))}
        </div>
        <p className="settings-note auth-safety-strength-copy">{passwordStrength.label}</p>
      </div>

      {confirmLabel ? <label className="auth-lock-field-label">{confirmLabel}</label> : null}
      <div className="auth-safety-input-row">
        <input
          type={passwordConfirmVisible ? "text" : "password"}
          value={passwordConfirm}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            onPasswordConfirmChange(event.target.value);
            onNoticeClear?.();
          }}
          placeholder={confirmPlaceholder}
          className={`auth-input ui-focus${passwordMismatch ? " is-error" : ""}`}
          aria-label={confirmAriaLabel}
          disabled={busy}
        />
        <button type="button" className="auth-btn auth-btn-ghost ui-focus auth-safety-inline-btn" onClick={() => setPasswordConfirmVisible((previous) => !previous)} disabled={busy}>
          {passwordConfirmVisible ? "Hide" : "Show"}
        </button>
      </div>

      {notice ? <p className={noticeClassName}>{notice}</p> : null}
    </div>
  );
}
