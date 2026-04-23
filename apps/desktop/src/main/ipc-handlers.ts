import { app, BrowserWindow, clipboard, dialog, ipcMain, systemPreferences, type IpcMainInvokeEvent } from "electron";
import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID, timingSafeEqual, webcrypto } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getVaultPasswordPolicyIssue,
  getVaultPasswordPolicyMessage,
  VAULT_PASSWORD_MAX_LENGTH,
  parseOtpauthUri,
  totpCodeSync,
  type StoredTotpAccount,
  type AccountMeta,
  type CodeResult,
  type Algorithm,
} from "@authenticator/core";
import { decryptBackup, encryptBackup, type EncryptedBackup } from "@authenticator/backup";
import {
  clearDecryptedCache,
  clearHardenedSession,
  ensureOuterVaultMetadata,
  enrollBiometricUnlock,
  generateRecoverySecret,
  getVaultProtectionStatus,
  hasPendingRecoveryReset,
  initializeVaultWithPassword,
  isHardenedVaultUnlocked,
  loadAccounts,
  loadSettings,
  removeBiometricUnlock,
  rotateHardenedVaultPassword,
  saveAccounts,
  saveSettings,
  setPasswordAfterRecovery,
  unlockHardenedVaultWithPassword,
  unlockVaultWithBiometric,
  validateAndBurnRecoverySecret,
  requiresVaultPasswordSetup,
  hasProvisionedVault,
  type LockMethod,
  type AppSettings,
  type VaultProtectionStatus,
} from "./secure-store";
import {
  normalizeAccentOverride,
  normalizeBaseMode,
  normalizeThemeColor,
  normalizeThemeSettings,
  type AccentOverrideId,
  type BaseModeId,
  type ThemeColorId,
} from "./theme-settings";
import { normalizeMotionMode, normalizePauseWhenBackground, type MotionMode } from "./motion-settings";
import { suppressFocusLossLock } from "./focus-loss-lock";
import {
  clearCredential,
  clearCredentialLockState,
  getCredentialLockState,
  getLockMethodsConfig,
  getQuickUnlock,
  getLockMethod,
  getPinDigits,
  hasCredential,
  lockMethodCredentialType,
  lockMethodSupportsQuickUnlock,
  setLockMethodsConfig,
  setQuickUnlock,
  setCredential,
  setLockMethod,
  shouldRequireLockOnStartup,
  verifyCredentialWithLimit,
  type MultiLockMethod,
  type MultiLockMethodsConfig,
  type MultiSecureLockMethod,
  type CredentialType,
  type VerifyCredentialResult,
} from "./lock-store";
import {
  clearPasskeyCredential,
  getPasskeyCredential,
  hasPasskeyCredential,
  listPasskeyCredentials,
  listPasskeySummaries,
  removePasskeyCredential,
  renamePasskeyCredential,
  savePasskeyCredential,
  updatePasskeyCredentialSignCount,
} from "./passkey-store";
import { isOtpauthUri, scanQrFromScreen } from "./screen-qr";
import { logDesktopDebug } from "./diagnostics";

const PASSKEY_CHALLENGE_SIZE = 32;
const MAX_PASSKEY_CHALLENGES = 64;
const AUTHENTICATOR_USER_PRESENT_FLAG = 0x01;
const AUTHENTICATOR_USER_VERIFIED_FLAG = 0x04;
const ATTESTED_CREDENTIAL_DATA_FLAG = 0x40;
const SECURITY_SESSION_TTL_MS = 60_000;
const STEP_UP_GRANT_TTL_MS = 10_000;
const TRUSTED_APP_PROTOCOL_HOST = "vault-authenticator";
const TRUSTED_APP_PROTOCOL_ORIGIN = `app://${TRUSTED_APP_PROTOCOL_HOST}`;
const passkeyChallenges = new Map<string, Uint8Array>();

type PasskeyAssertionPayload = {
  challengeId: string;
  credentialId: string;
  clientDataJSON: number[];
  authenticatorData: number[];
  signature: number[];
};

type ParsedPasskeyClientData = {
  challenge: string;
  type: string;
  origin: string;
  crossOrigin: boolean;
};

type ParsedAuthenticatorData = {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
};

type ParsedAttestedCredentialData = ParsedAuthenticatorData & {
  credentialId: string;
  credentialPublicKey: Uint8Array;
};

type ParsedAttestationObject = {
  fmt: string;
  authData: Uint8Array;
};

type SecuritySession = {
  openedAt: number;
  expiresAt: number;
  webContentsId: number;
};

type RendererVaultProtectionStatus = Omit<VaultProtectionStatus, "mode"> & {
  vaultFormat: "vault-v4";
  appLockRequired: boolean;
  migrationRequired: boolean;
  justUnlockedViaRecovery: boolean;
  mode?: "vault-v4";
};

type StepUpMethod = CredentialType | "passkey" | "biometric";

type StepUpVerifyPayload =
  | {
      method: CredentialType;
      input: string;
    }
  | {
      method: "biometric";
    }
  | ({
      method: "passkey";
    } & PasskeyAssertionPayload);

type PasskeySavePayload = {
  challengeId: string;
  credentialId: string;
  clientDataJSON: string;
  attestationObject: string;
  name?: string;
};

type ErrorCode =
  | "E_LOCKED"
  | "E_STEP_UP_REQUIRED"
  | "E_VAULT_MODE_INVALID"
  | "E_VAULT_MASTER_PASSWORD_INVALID"
  | "E_SCAN_NO_QR"
  | "E_PAYLOAD_INVALID"
  | "E_URI_INVALID"
  | "E_SECRET_INVALID"
  | "E_DIGITS_INVALID"
  | "E_PERIOD_INVALID"
  | "E_ALGORITHM_INVALID"
  | "E_PIN_INVALID"
  | "E_PIN_REQUIRED"
  | "E_RECOVERY_CODE_INVALID"
  | "E_RECOVERY_CODES_UNAVAILABLE"
  | "E_PASSPHRASE_INVALID"
  | "E_BACKUP_FILE_INVALID"
  | "E_BACKUP_DECRYPT_FAILED"
  | "E_SETTINGS_INVALID"
  | "E_POLICY_DENIED"
  | "E_INTERNAL";

type ErrorPayload = {
  code: ErrorCode;
  message: string;
};

type IpcResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: ErrorPayload;
    };

class AppError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AppError";
  }
}

function fail(code: ErrorCode, message: string): never {
  throw new AppError(code, message);
}

function toMeta(a: StoredTotpAccount): AccountMeta {
  return { id: a.id, issuer: a.issuer, label: a.label, digits: a.digits, period: a.period };
}

const WINDOWS_CLIPBOARD_CLEAR_HISTORY_COMMAND =
  "[Windows.ApplicationModel.DataTransfer.Clipboard, Windows.ApplicationModel.DataTransfer, ContentType=WindowsRuntime]::ClearHistory()";

async function clearWindowsClipboardHistory(): Promise<void> {
  if (process.platform !== "win32") {
    return;
  }

  await new Promise<void>((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", WINDOWS_CLIPBOARD_CLEAR_HISTORY_COMMAND],
      { windowsHide: true, timeout: 1500 },
      (error, stdout) => {
        if (error) {
          logDesktopDebug("clipboard history clear failed", { message: error.message });
          resolve();
          return;
        }

        const output = String(stdout || "").trim().toLowerCase();
        if (output && output !== "true") {
          logDesktopDebug("clipboard history clear returned non-true", { output });
        }
        resolve();
      }
    );
  });
}

function toEditable(a: StoredTotpAccount): {
  id: string;
  issuer: string;
  label: string;
  digits: 6 | 8;
  period: number;
  algorithm: Algorithm;
} {
  return {
    id: a.id,
    issuer: a.issuer,
    label: a.label,
    digits: a.digits,
    period: a.period,
    algorithm: a.algorithm,
  };
}

function normalizeRuntimeAccount(input: unknown): StoredTotpAccount | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Partial<StoredTotpAccount>;
  if (typeof candidate.id !== "string") {
    return null;
  }

  const id = candidate.id.trim();
  if (!id || id.length > 128) {
    return null;
  }

  const normalizedSecret =
    typeof candidate.secretBase32 === "string" ? candidate.secretBase32.replace(/\s/g, "").replace(/=/g, "").toUpperCase() : "";
  if (!normalizedSecret || !/^[A-Z2-7]+$/.test(normalizedSecret)) {
    return null;
  }

  const algorithm: Algorithm =
    candidate.algorithm === "SHA1" || candidate.algorithm === "SHA256" || candidate.algorithm === "SHA512"
      ? candidate.algorithm
      : "SHA1";
  const digits: 6 | 8 = candidate.digits === 8 ? 8 : 6;
  const period =
    typeof candidate.period === "number" && Number.isInteger(candidate.period) && candidate.period >= 1 && candidate.period <= 300
      ? candidate.period
      : 30;

  return {
    id,
    issuer: typeof candidate.issuer === "string" ? candidate.issuer : "",
    label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label : "Account",
    secretBase32: normalizedSecret,
    digits,
    period,
    algorithm,
  };
}

function loadRuntimeAccounts(channel: "totp:list" | "totp:codes"): StoredTotpAccount[] {
  const accounts = loadAccounts();
  const normalized: StoredTotpAccount[] = [];
  let skipped = 0;

  for (const account of accounts) {
    const next = normalizeRuntimeAccount(account);
    if (!next) {
      skipped += 1;
      continue;
    }
    normalized.push(next);
  }

  if (skipped > 0) {
    logDesktopDebug("ipc skipped invalid stored accounts", {
      channel,
      skipped,
      total: accounts.length,
    });
  }

  return normalized;
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Error) {
    const message = error.message || "";

    if (/decryption failed|could not decrypt|auth tag|gcm/i.test(message)) {
      return new AppError(
        "E_BACKUP_DECRYPT_FAILED",
        "We could not decrypt that backup. Check your passphrase and try again."
      );
    }

    if (/unsupported backup format|unexpected token|json|enoent|eisdir/i.test(message)) {
      return new AppError("E_BACKUP_FILE_INVALID", "The backup file looks invalid. Select a valid encrypted backup file.");
    }

    if (/otpauth|uri|scheme|totp|label|issuer/i.test(message)) {
      return new AppError("E_URI_INVALID", "That URI is not valid. Paste a full TOTP URI that starts with otpauth://totp/.");
    }
  }

  return new AppError("E_INTERNAL", "Something unexpected happened. Please try again.");
}

function resultOk<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function resultError(error: unknown): IpcResult<never> {
  const normalized = normalizeError(error);
  return {
    ok: false,
    error: {
      code: normalized.code,
      message: normalized.message,
    },
  };
}

function logIpcFailure(channel: string, error: unknown): void {
  const details =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: (error as { code?: unknown }).code,
        }
      : { message: String(error) };
  logDesktopDebug("ipc handler failed", {
    channel,
    ...details,
  });
}

function safeHandle<TArgs extends unknown[], TReturn>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => TReturn | Promise<TReturn>
): void {
  ipcMain.handle(channel, async (event, ...rawArgs) => {
    try {
      const data = await handler(event, ...(rawArgs as TArgs));
      return resultOk(data);
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.code === "E_SCAN_NO_QR" || normalized.code === "E_STEP_UP_REQUIRED") {
        return resultError(normalized);
      }
      logIpcFailure(channel, error);
      return resultError(normalized);
    }
  });
}

function directHandle<TArgs extends unknown[], TReturn>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => TReturn | Promise<TReturn>
): void {
  ipcMain.handle(channel, (event, ...rawArgs) => {
    try {
      const result = handler(event, ...(rawArgs as TArgs));
      if (result && typeof (result as PromiseLike<TReturn>).then === "function") {
        return (result as Promise<TReturn>).catch((error) => {
          logIpcFailure(channel, error);
          throw error;
        });
      }
      return result;
    } catch (error) {
      logIpcFailure(channel, error);
      throw error;
    }
  });
}

function validateString(val: unknown, code: ErrorCode, message: string, maxLen = 2048): string {
  if (typeof val !== "string") fail(code, message);
  const trimmed = val.trim();
  if (!trimmed || trimmed.length > maxLen) fail(code, message);
  return trimmed;
}

function validateOptionalString(val: unknown, code: ErrorCode, message: string, maxLen = 256): string {
  if (val == null) return "";
  if (typeof val !== "string") fail(code, message);
  if (val.length > maxLen) fail(code, message);
  return val;
}

function validateStringPayload(val: unknown, code: ErrorCode, message: string, maxLen = 2048): string {
  if (typeof val !== "string" || val.length > maxLen) {
    fail(code, message);
  }
  return val;
}

function validatePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    fail("E_PAYLOAD_INVALID", "We could not process this request. Please retry that action.");
  }
  return payload as Record<string, unknown>;
}

function validateBackupPassphrase(value: unknown): string {
  if (typeof value !== "string") {
    fail("E_PASSPHRASE_INVALID", "Use a passphrase with at least 8 characters.");
  }
  const passphrase = value;
  if (passphrase.length < 8 || passphrase.length > 256) {
    fail("E_PASSPHRASE_INVALID", "Use a passphrase with 8 to 256 characters.");
  }
  return passphrase;
}

function validateExportPassphrase(value: unknown): string {
  const passphrase = validateBackupPassphrase(value);
  if (passphrase.trim() !== passphrase) {
    fail("E_PASSPHRASE_INVALID", "Passphrase must not have leading or trailing spaces.");
  }
  return passphrase;
}

function validateExistingMasterPassword(value: unknown): string {
  if (typeof value !== "string") {
    fail("E_VAULT_MASTER_PASSWORD_INVALID", "Enter your current vault password.");
  }
  const password = value.trim();
  if (password.length === 0 || password.length > VAULT_PASSWORD_MAX_LENGTH) {
    fail("E_VAULT_MASTER_PASSWORD_INVALID", `Use your current password with 1 to ${VAULT_PASSWORD_MAX_LENGTH} characters.`);
  }
  return password;
}

function validateNewMasterPassword(value: unknown): string {
  const password = validateExistingMasterPassword(value);
  const issue = getVaultPasswordPolicyIssue(password);
  if (issue) {
    fail("E_VAULT_MASTER_PASSWORD_INVALID", getVaultPasswordPolicyMessage(issue));
  }
  return password;
}

function validateImportMode(value: unknown): "merge" | "replace" {
  if (value === "replace") return "replace";
  return "merge";
}

function normalizePathForComparison(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/").toLowerCase();
}

function knownSyncRoots(): string[] {
  const home = app.getPath("home");
  return [
    path.join(home, "OneDrive"),
    path.join(home, "Dropbox"),
    path.join(home, "Google Drive"),
    path.join(home, "My Drive"),
    path.join(home, "iCloud Drive"),
    path.join(home, "Library", "Mobile Documents"),
    path.join(home, "CloudStorage", "OneDrive"),
    path.join(home, "CloudStorage", "Dropbox"),
    path.join(home, "CloudStorage", "Google Drive"),
  ];
}

function isLikelySyncedFolder(targetPath: string): boolean {
  const normalizedTarget = normalizePathForComparison(targetPath);
  return knownSyncRoots().some((rootPath) => {
    const normalizedRoot = normalizePathForComparison(rootPath);
    return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
  });
}

async function confirmSyncedFolderExport(win: BrowserWindow, targetPath: string): Promise<boolean> {
  if (!isLikelySyncedFolder(targetPath)) {
    return true;
  }
  const choice = await dialog.showMessageBox(win, {
    type: "warning",
    buttons: ["Export here", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "Cloud sync warning",
    message: "This folder may sync to the cloud.",
    detail: "Only export here if your cloud account is secure.",
  });
  return choice.response === 0;
}

function validateEncryptedBackupEnvelope(value: unknown): EncryptedBackup {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("E_BACKUP_FILE_INVALID", "That file is not a valid encrypted backup.");
  }

  const candidate = value as Partial<EncryptedBackup> & {
    argon2Params?: { m?: unknown; t?: unknown; p?: unknown };
  };
  if (candidate.version === 1) {
    if (candidate.kdf !== "PBKDF2-SHA256" || candidate.algorithm !== "AES-GCM" || candidate.iterations !== 210000) {
      fail("E_BACKUP_FILE_INVALID", "That backup format is not supported.");
    }
  } else if (candidate.version === 2 || candidate.version === 3) {
    if (candidate.kdf !== "argon2id" || candidate.algorithm !== "aes-256-gcm") {
      fail("E_BACKUP_FILE_INVALID", "That backup format is not supported.");
    }
    if (
      !candidate.argon2Params ||
      typeof candidate.argon2Params.m !== "number" ||
      typeof candidate.argon2Params.t !== "number" ||
      typeof candidate.argon2Params.p !== "number"
    ) {
      fail("E_BACKUP_FILE_INVALID", "That backup is missing required encrypted fields.");
    }
  } else {
    fail("E_BACKUP_FILE_INVALID", "That backup format is not supported.");
  }

  const fields: Array<keyof EncryptedBackup> = ["salt", "iv", "ciphertext"];
  for (const field of fields) {
    const raw = candidate[field];
    if (typeof raw !== "string" || raw.length === 0) {
      fail("E_BACKUP_FILE_INVALID", "That backup is missing required encrypted fields.");
    }
  }

  if (candidate.authTag != null && (typeof candidate.authTag !== "string" || candidate.authTag.length === 0)) {
    fail("E_BACKUP_FILE_INVALID", "That backup has an invalid authentication tag.");
  }

  return candidate as EncryptedBackup;
}

function validateSecretBase32(val: unknown): string {
  const secret = validateString(
    val,
    "E_SECRET_INVALID",
    "Use a Base32 secret containing only letters A-Z and numbers 2-7.",
    4096
  )
    .replace(/\s/g, "")
    .replace(/=/g, "")
    .toUpperCase();

  if (!/^[A-Z2-7]+$/.test(secret)) {
    fail("E_SECRET_INVALID", "Use a Base32 secret containing only letters A-Z and numbers 2-7.");
  }
  return secret;
}

function readSecretInput(payload: Record<string, unknown>): unknown {
  if (payload.secret !== undefined) {
    return payload.secret;
  }
  return payload.secretBase32;
}

function validateDigits(val: unknown): 6 | 8 {
  if (val === undefined) return 6;
  if (val !== 6 && val !== 8) {
    fail("E_DIGITS_INVALID", "Choose either 6 or 8 digits.");
  }
  return val;
}

function validatePeriod(val: unknown): number {
  if (val === undefined) return 30;
  if (typeof val !== "number" || !Number.isInteger(val) || val < 1 || val > 300) {
    fail("E_PERIOD_INVALID", "Use a period between 1 and 300 seconds.");
  }
  return val;
}

function validateAutoLockSeconds(val: unknown): number {
  if (val === undefined) return 300;
  if (val === 0) return 0;
  if (typeof val !== "number" || !Number.isInteger(val) || val < 15 || val > 86400) {
    fail("E_SETTINGS_INVALID", "Use a valid auto-lock timeout.");
  }
  return val;
}

function validateLockOnFocusLoss(val: unknown): boolean {
  return !!val;
}

function validateHasCompletedSafetySetup(val: unknown): boolean {
  return val === true;
}

function validateHasSkippedSafetySetup(val: unknown): boolean {
  return val === true;
}

function validateLastSafetySetupReminderAt(val: unknown): number | undefined {
  if (typeof val !== "number" || !Number.isFinite(val) || val <= 0) {
    return undefined;
  }
  return Math.floor(val);
}

function validateAccountsLayoutMode(value: unknown): "auto" | "list" | "grid" {
  if (value === "list") return "list";
  if (value === "grid") return "grid";
  return "auto";
}

function validateAccountsGridColumns(value: unknown): "auto" | 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === 3) return value;
  return "auto";
}

function validateAccountsDensity(value: unknown): "comfortable" | "compact" {
  if (value === "compact") return "compact";
  return "comfortable";
}

function validateBaseMode(value: unknown): BaseModeId {
  return normalizeBaseMode(value);
}

function validateThemeColor(value: unknown): ThemeColorId {
  return normalizeThemeColor(value);
}

function validateAccentOverride(value: unknown): AccentOverrideId {
  return normalizeAccentOverride(value);
}

function validateMotionMode(value: unknown): MotionMode {
  return normalizeMotionMode(value);
}

function validatePauseWhenBackground(value: unknown): boolean {
  return normalizePauseWhenBackground(value);
}

function validateClipboardSafetyEnabled(value: unknown): boolean {
  return value !== false;
}

function validateRunInBackground(value: unknown): boolean {
  return value !== false;
}

function validateStartWithSystem(value: unknown): boolean {
  return value === true;
}

function validateTrayMenuStyle(value: unknown): "native" | "themed" {
  return value === "themed" ? "themed" : "native";
}

function validateTrayMenuAnimations(value: unknown): "off" | "reduced" {
  return value === "reduced" ? "reduced" : "off";
}

function validateTrayMenuThemeSync(value: unknown): boolean {
  return value !== false;
}

function validateTrayIconStyle(value: unknown): "auto" | "light" | "dark" {
  if (value === "light") return "light";
  if (value === "dark") return "dark";
  return "auto";
}

function validateAlgorithm(val: unknown): Algorithm {
  if (val === undefined) return "SHA1";
  if (val === "SHA1" || val === "SHA256" || val === "SHA512") return val;
  fail("E_ALGORITHM_INVALID", "Choose SHA1, SHA256, or SHA512.");
}

function validateSettings(value: unknown): AppSettings {
  try {
    const payload = validatePayload(value);
    const theme = normalizeThemeSettings({
      baseMode: payload.baseMode,
      themeColor: payload.themeColor,
      accentOverride: payload.accentOverride,
      baseTheme: payload.baseTheme,
      accent: payload.accent,
      theme: payload.theme,
    });
    const motionMode = validateMotionMode(payload.motionMode);
    const pauseWhenBackground = validatePauseWhenBackground(payload.pauseWhenBackground);
    const clipboardSafetyEnabled = validateClipboardSafetyEnabled(payload.clipboardSafetyEnabled);
    const runInBackground = validateRunInBackground(payload.runInBackground);
    const startWithSystem = validateStartWithSystem(payload.startWithSystem);
    const trayMenuStyle = validateTrayMenuStyle(payload.trayMenuStyle);
    const trayMenuAnimations = validateTrayMenuAnimations(payload.trayMenuAnimations);
    const trayMenuThemeSync = validateTrayMenuThemeSync(payload.trayMenuThemeSync);
    const trayIconStyle = validateTrayIconStyle(payload.trayIconStyle);
    const baseMode = validateBaseMode(theme.baseMode);
    const themeColor = baseMode === "amoled" ? "neutral" : validateThemeColor(theme.themeColor);
    const accentOverride = baseMode === "amoled" ? "none" : validateAccentOverride(theme.accentOverride);
    const hasCompletedSafetySetup = validateHasCompletedSafetySetup(payload.hasCompletedSafetySetup);
    const hasSkippedSafetySetup = hasCompletedSafetySetup ? false : validateHasSkippedSafetySetup(payload.hasSkippedSafetySetup);
    return {
      defaultDigits: validateDigits(payload.defaultDigits),
      defaultPeriod: validatePeriod(payload.defaultPeriod),
      hideLabelsOnSmall: !!payload.hideLabelsOnSmall,
      privacyScreen: payload.privacyScreen !== false,
      clipboardSafetyEnabled,
      runInBackground,
      startWithSystem,
      trayMenuStyle,
      trayMenuAnimations,
      trayMenuThemeSync,
      trayIconStyle,
      alwaysOnTop: !!payload.alwaysOnTop,
      baseMode,
      themeColor,
      accentOverride,
      motionMode,
      pauseWhenBackground,
      accountsLayoutMode: validateAccountsLayoutMode(payload.accountsLayoutMode),
      accountsGridColumns: validateAccountsGridColumns(payload.accountsGridColumns),
      accountsDensity: validateAccountsDensity(payload.accountsDensity),
      biometricEnabled: payload.biometricEnabled !== false,
      autoLockSeconds: validateAutoLockSeconds(payload.autoLockSeconds),
      lockOnFocusLoss: validateLockOnFocusLoss(payload.lockOnFocusLoss),
      hasCompletedSafetySetup,
      hasSkippedSafetySetup,
      lastSafetySetupReminderAt: validateLastSafetySetupReminderAt(payload.lastSafetySetupReminderAt),
    };
  } catch {
    fail("E_SETTINGS_INVALID", "Some settings were not valid. Review options and try again.");
  }
}

function validateLockMethod(value: unknown): LockMethod {
  if (value === "none") return "none";
  if (value === "swipe") return "swipe";
  if (value === "pin4") return "pin4";
  if (value === "pin6") return "pin6";
  if (value === "passkey") return "passkey";
  if (value === "password") return "password";
  if (value === "pattern") return "pattern";
  fail("E_PAYLOAD_INVALID", "Unsupported lock method.");
}

function normalizeMultiLockMethod(value: unknown): MultiLockMethod | null {
  if (value === "none") return "none";
  if (value === "swipe") return "swipe";
  if (value === "pin" || value === "pin4" || value === "pin6") return "pin";
  if (value === "password") return "password";
  if (value === "pattern") return "pattern";
  if (value === "passkey") return "passkey";
  return null;
}

function isSecureMultiLockMethod(value: MultiLockMethod | null): value is MultiSecureLockMethod {
  return value === "pin" || value === "password" || value === "pattern" || value === "passkey";
}

function validateLockMethodsConfig(value: unknown): MultiLockMethodsConfig {
  const payload = validatePayload(value);
  const primary = normalizeMultiLockMethod(payload.primaryLockMethod);
  if (!primary) {
    fail("E_PAYLOAD_INVALID", "Unsupported primary lock method.");
  }

  const rawSecondary = normalizeMultiLockMethod(payload.secondaryLockMethod);
  const secondary = isSecureMultiLockMethod(rawSecondary) ? rawSecondary : null;

  if ((primary === "none" || primary === "swipe") && secondary) {
    fail("E_PAYLOAD_INVALID", "No-security methods cannot be combined with secure methods.");
  }

  if (secondary && secondary === primary) {
    fail("E_PAYLOAD_INVALID", "Duplicate lock methods are not allowed.");
  }

  return {
    primaryLockMethod: primary,
    secondaryLockMethod: secondary,
  };
}

function lockMethodFromMulti(method: MultiLockMethod): LockMethod {
  if (method === "pin") {
    return getPinDigits() === 6 ? "pin6" : "pin4";
  }
  if (method === "password") return "password";
  if (method === "pattern") return "pattern";
  if (method === "passkey") return "passkey";
  if (method === "swipe") return "swipe";
  return "none";
}

function secureMethodConfigured(method: MultiSecureLockMethod): boolean {
  if (method === "pin") {
    return hasCredential("pin");
  }
  if (method === "password") {
    return hasCredential("password");
  }
  if (method === "pattern") {
    return hasCredential("pattern");
  }
  return hasPasskeyCredential();
}

function validateQuickUnlockConfig(value: unknown): { windowsHello: boolean; passkey: boolean } {
  const payload = validatePayload(value);
  return {
    windowsHello: !!payload.windowsHello,
    passkey: !!payload.passkey,
  };
}

function validateCredentialType(value: unknown): CredentialType {
  if (value === "pin") return "pin";
  if (value === "password") return "password";
  if (value === "pattern") return "pattern";
  fail("E_PAYLOAD_INVALID", "Unsupported credential type.");
}

function validateCredentialValue(value: unknown): string {
  if (typeof value !== "string") {
    fail("E_PAYLOAD_INVALID", "Credential value is missing.");
  }
  return value;
}

function currentAppLockRequired(): boolean {
  try {
    return shouldRequireLockOnStartup();
  } catch {
    return false;
  }
}

function currentLockStatus(): boolean {
  return locked;
}

function hardenedVaultNeedsPasswordUnlock(): boolean {
  return getVaultProtectionStatus().requiresMasterPassword && !isHardenedVaultUnlocked();
}

function migrationRequired(): boolean {
  const outerMetadata = ensureOuterVaultMetadata();
  return !outerMetadata.hasVaultEnvelope && (outerMetadata.hasLegacyBlob || outerMetadata.hasLegacyHardenedEnvelope);
}

function validateChallengeId(value: unknown): string {
  if (typeof value !== "string") {
    fail("E_PAYLOAD_INVALID", "Challenge id is missing.");
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > 64) {
    fail("E_PAYLOAD_INVALID", "Challenge id is invalid.");
  }
  return normalized;
}

function validateBase64urlString(value: unknown, field: string, maxLen: number): string {
  if (typeof value !== "string") {
    fail("E_PAYLOAD_INVALID", `${field} is invalid.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLen || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    fail("E_PAYLOAD_INVALID", `${field} is invalid.`);
  }
  return normalized;
}

function validateBase64String(value: unknown, field: string, maxLen: number): string {
  if (typeof value !== "string") {
    fail("E_PAYLOAD_INVALID", `${field} is invalid.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLen || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    fail("E_PAYLOAD_INVALID", `${field} is invalid.`);
  }
  return normalized;
}

function validateByteArray(value: unknown, field: string): Uint8Array {
  if (!Array.isArray(value)) {
    fail("E_PAYLOAD_INVALID", `${field} is invalid.`);
  }
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0 || item > 255) {
      fail("E_PAYLOAD_INVALID", `${field} is invalid.`);
    }
    bytes[index] = item;
  }
  return bytes;
}

function validatePasskeyAssertionPayload(value: unknown): PasskeyAssertionPayload {
  const payload = validatePayload(value);
  if (!Array.isArray(payload.clientDataJSON) || !Array.isArray(payload.authenticatorData) || !Array.isArray(payload.signature)) {
    fail("E_PAYLOAD_INVALID", "Passkey assertion payload is invalid.");
  }
  return {
    challengeId: validateChallengeId(payload.challengeId),
    credentialId: validateBase64urlString(payload.credentialId, "credentialId", 1024),
    clientDataJSON: payload.clientDataJSON as number[],
    authenticatorData: payload.authenticatorData as number[],
    signature: payload.signature as number[],
  };
}

function validateStepUpMethod(value: unknown): StepUpMethod {
  if (value === "biometric") return "biometric";
  if (value === "pin") return "pin";
  if (value === "password") return "password";
  if (value === "pattern") return "pattern";
  if (value === "passkey") return "passkey";
  fail("E_PAYLOAD_INVALID", "Unsupported verification method.");
}

function validateStepUpVerifyPayload(value: unknown): StepUpVerifyPayload {
  const payload = validatePayload(value);
  const method = validateStepUpMethod(payload.method);
  if (method === "passkey") {
    return {
      method,
      ...validatePasskeyAssertionPayload(payload),
    };
  }

  if (method === "biometric") {
    return { method };
  }

  return {
    method,
    input: validateCredentialValue(payload.input),
  };
}

function validatePasskeyDisplayName(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    fail("E_PAYLOAD_INVALID", "Passkey name is invalid.");
  }
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > 80) return normalized.slice(0, 80);
  return normalized;
}

function validatePasskeyRecordId(value: unknown): string {
  if (typeof value !== "string") {
    fail("E_PAYLOAD_INVALID", "Passkey id is invalid.");
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > 64 || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    fail("E_PAYLOAD_INVALID", "Passkey id is invalid.");
  }
  return normalized;
}

function validatePasskeySavePayload(value: unknown): PasskeySavePayload {
  const payload = validatePayload(value);
  return {
    challengeId: validateChallengeId(payload.challengeId),
    credentialId: validateBase64urlString(payload.credentialId, "credentialId", 1024),
    clientDataJSON: validateBase64String(payload.clientDataJSON, "clientDataJSON", 16384),
    attestationObject: validateBase64String(payload.attestationObject, "attestationObject", 32768),
    name: validatePasskeyDisplayName(payload.name),
  };
}

function base64ToBuf(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function base64urlToBuf(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(paddingLength);
  return new Uint8Array(Buffer.from(padded, "base64"));
}

function toBase64url(value: Uint8Array): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function resolvePasskeyRelyingPartyId(senderUrl: string): string {
  try {
    const parsed = new URL(senderUrl);
    if (parsed.protocol === "app:") {
      return TRUSTED_APP_PROTOCOL_HOST;
    }
    const hostname = parsed.hostname.trim().toLowerCase();
    if (hostname && /^[a-z0-9.-]+$/.test(hostname)) {
      return hostname;
    }
  } catch {
    // fall through to localhost
  }
  return "localhost";
}

function resolvePasskeyExpectedOrigins(senderUrl: string): string[] {
  try {
    const parsed = new URL(senderUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return [parsed.origin];
    }
    if (parsed.protocol === "app:" && senderUrlIsTrusted(senderUrl)) {
      return [TRUSTED_APP_PROTOCOL_ORIGIN];
    }
  } catch {
    return [];
  }
  return [];
}

function passkeyOriginMatchesTrustedSender(origin: string, senderUrl: string): boolean {
  const expectedOrigins = resolvePasskeyExpectedOrigins(senderUrl);
  return expectedOrigins.includes(origin);
}

function parsePasskeyClientData(clientDataBytes: Uint8Array): ParsedPasskeyClientData | null {
  try {
    const clientDataRaw = Buffer.from(clientDataBytes).toString("utf8");
    const clientData = JSON.parse(clientDataRaw) as {
      challenge?: unknown;
      type?: unknown;
      origin?: unknown;
      crossOrigin?: unknown;
    };

    if (
      typeof clientData.challenge !== "string" ||
      typeof clientData.type !== "string" ||
      typeof clientData.origin !== "string" ||
      (clientData.crossOrigin !== undefined && typeof clientData.crossOrigin !== "boolean")
    ) {
      return null;
    }

    const challenge = clientData.challenge.trim();
    const type = clientData.type.trim();
    const origin = clientData.origin.trim();
    if (!challenge || !type || !origin || origin.length > 512) {
      return null;
    }

    return {
      challenge,
      type,
      origin,
      crossOrigin: clientData.crossOrigin === true,
    };
  } catch {
    return null;
  }
}

function parseAuthenticatorData(bytes: Uint8Array): ParsedAuthenticatorData | null {
  if (bytes.length < 37) return null;
  return {
    rpIdHash: bytes.slice(0, 32),
    flags: bytes[32],
    signCount:
      ((bytes[33] ?? 0) << 24) |
      ((bytes[34] ?? 0) << 16) |
      ((bytes[35] ?? 0) << 8) |
      (bytes[36] ?? 0),
  };
}

function createPasskeyChallenge(): { challengeId: string; challenge: number[] } {
  const challenge = randomBytes(PASSKEY_CHALLENGE_SIZE);
  const challengeId = randomUUID().replace(/-/g, "").slice(0, 20);
  passkeyChallenges.set(challengeId, new Uint8Array(challenge));

  if (passkeyChallenges.size > MAX_PASSKEY_CHALLENGES) {
    const oldestKey = passkeyChallenges.keys().next().value;
    if (typeof oldestKey === "string") {
      passkeyChallenges.delete(oldestKey);
    }
  }

  return {
    challengeId,
    challenge: Array.from(challenge),
  };
}

function consumePasskeyChallenge(challengeId: string): Uint8Array | null {
  const challenge = passkeyChallenges.get(challengeId);
  if (!challenge) return null;
  passkeyChallenges.delete(challengeId);
  return challenge;
}

function expectedPasskeyRpIdHash(senderUrl: string): Buffer {
  return createHash("sha256").update(resolvePasskeyRelyingPartyId(senderUrl)).digest();
}

function rpIdHashMatchesExpected(actualRpIdHash: Uint8Array, senderUrl: string): boolean {
  const expectedHash = expectedPasskeyRpIdHash(senderUrl);
  if (actualRpIdHash.length !== expectedHash.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(actualRpIdHash), expectedHash);
}

function readCborText(bytes: Uint8Array, offset: number): { value: string; next: number } | null {
  if (offset >= bytes.length) return null;
  const head = bytes[offset];
  const major = head >> 5;
  const additional = head & 0x1f;
  if (major !== 3) return null;

  const parsed = readCborLength(bytes, offset + 1, additional);
  if (!parsed) return null;
  if (parsed.next + parsed.value > bytes.length) return null;

  return {
    value: Buffer.from(bytes.slice(parsed.next, parsed.next + parsed.value)).toString("utf8"),
    next: parsed.next + parsed.value,
  };
}

function skipCborValue(bytes: Uint8Array, offset: number): number | null {
  if (offset >= bytes.length) return null;
  const head = bytes[offset];
  const major = head >> 5;
  const additional = head & 0x1f;

  if (major === 0 || major === 1) {
    const parsed = readCborLength(bytes, offset + 1, additional);
    return parsed?.next ?? null;
  }

  if (major === 2 || major === 3) {
    const parsed = readCborLength(bytes, offset + 1, additional);
    if (!parsed || parsed.next + parsed.value > bytes.length) return null;
    return parsed.next + parsed.value;
  }

  if (major === 4) {
    const parsed = readCborLength(bytes, offset + 1, additional);
    if (!parsed) return null;
    let cursor = parsed.next;
    for (let index = 0; index < parsed.value; index += 1) {
      const next = skipCborValue(bytes, cursor);
      if (next == null) return null;
      cursor = next;
    }
    return cursor;
  }

  if (major === 5) {
    const parsed = readCborLength(bytes, offset + 1, additional);
    if (!parsed) return null;
    let cursor = parsed.next;
    for (let index = 0; index < parsed.value; index += 1) {
      const nextKey = skipCborValue(bytes, cursor);
      if (nextKey == null) return null;
      const nextValue = skipCborValue(bytes, nextKey);
      if (nextValue == null) return null;
      cursor = nextValue;
    }
    return cursor;
  }

  if (major === 6) {
    const parsed = readCborLength(bytes, offset + 1, additional);
    if (!parsed) return null;
    return skipCborValue(bytes, parsed.next);
  }

  if (major === 7) {
    if (additional < 20) return offset + 1;
    if (additional === 24) return offset + 2 <= bytes.length ? offset + 2 : null;
    if (additional === 25) return offset + 3 <= bytes.length ? offset + 3 : null;
    if (additional === 26) return offset + 5 <= bytes.length ? offset + 5 : null;
    if (additional === 27) return offset + 9 <= bytes.length ? offset + 9 : null;
    return null;
  }

  return null;
}

function parseAttestationObject(bytes: Uint8Array): ParsedAttestationObject | null {
  if (bytes.length < 8) return null;
  const head = bytes[0];
  const major = head >> 5;
  const additional = head & 0x1f;
  if (major !== 5) return null;

  const parsed = readCborLength(bytes, 1, additional);
  if (!parsed) return null;

  let cursor = parsed.next;
  let fmt = "";
  let authData: Uint8Array | null = null;

  for (let index = 0; index < parsed.value; index += 1) {
    const key = readCborText(bytes, cursor);
    if (!key) return null;
    cursor = key.next;

    if (key.value === "fmt") {
      const value = readCborText(bytes, cursor);
      if (!value) return null;
      fmt = value.value;
      cursor = value.next;
      continue;
    }

    if (key.value === "authData") {
      const value = readCborBytes(bytes, cursor);
      if (!value) return null;
      authData = value.value;
      cursor = value.next;
      continue;
    }

    const next = skipCborValue(bytes, cursor);
    if (next == null) return null;
    cursor = next;
  }

  if (!fmt || !authData) {
    return null;
  }

  return { fmt, authData };
}

function parseAttestedCredentialData(bytes: Uint8Array): ParsedAttestedCredentialData | null {
  const parsed = parseAuthenticatorData(bytes);
  if (!parsed) return null;
  if ((parsed.flags & ATTESTED_CREDENTIAL_DATA_FLAG) === 0) return null;
  if (bytes.length < 55) return null;

  const credentialIdLength = ((bytes[53] ?? 0) << 8) | (bytes[54] ?? 0);
  const credentialIdStart = 55;
  const credentialIdEnd = credentialIdStart + credentialIdLength;
  if (credentialIdEnd > bytes.length) return null;

  const credentialPublicKeyStart = credentialIdEnd;
  const credentialPublicKeyEnd = skipCborValue(bytes, credentialPublicKeyStart);
  if (credentialPublicKeyEnd == null || credentialPublicKeyEnd > bytes.length) return null;

  return {
    ...parsed,
    credentialId: toBase64url(bytes.slice(credentialIdStart, credentialIdEnd)),
    credentialPublicKey: bytes.slice(credentialPublicKeyStart, credentialPublicKeyEnd),
  };
}

function readDerLength(bytes: Uint8Array, offset: number): { length: number; next: number } | null {
  if (offset >= bytes.length) return null;
  const first = bytes[offset];
  if ((first & 0x80) === 0) {
    return { length: first, next: offset + 1 };
  }

  const count = first & 0x7f;
  if (count < 1 || count > 4) return null;
  if (offset + 1 + count > bytes.length) return null;

  let length = 0;
  for (let index = 0; index < count; index += 1) {
    length = (length << 8) | bytes[offset + 1 + index];
  }

  return { length, next: offset + 1 + count };
}

function normalizeDerInteger(raw: Uint8Array, size: number): Uint8Array | null {
  let value = raw;
  while (value.length > 0 && value[0] === 0) {
    value = value.slice(1);
  }

  if (value.length > size) return null;
  const out = new Uint8Array(size);
  out.set(value, size - value.length);
  return out;
}

function derEcdsaSignatureToRaw(signature: Uint8Array, componentSize = 32): Uint8Array | null {
  if (signature.length < 8) return null;
  if (signature[0] !== 0x30) return null;

  const sequenceLen = readDerLength(signature, 1);
  if (!sequenceLen) return null;

  let cursor = sequenceLen.next;
  const expectedEnd = cursor + sequenceLen.length;
  if (expectedEnd > signature.length) return null;

  if (cursor >= signature.length || signature[cursor] !== 0x02) return null;
  cursor += 1;
  const rLen = readDerLength(signature, cursor);
  if (!rLen) return null;
  cursor = rLen.next;
  if (cursor + rLen.length > signature.length) return null;
  const r = signature.slice(cursor, cursor + rLen.length);
  cursor += rLen.length;

  if (cursor >= signature.length || signature[cursor] !== 0x02) return null;
  cursor += 1;
  const sLen = readDerLength(signature, cursor);
  if (!sLen) return null;
  cursor = sLen.next;
  if (cursor + sLen.length > signature.length) return null;
  const s = signature.slice(cursor, cursor + sLen.length);
  cursor += sLen.length;

  if (cursor !== expectedEnd) return null;

  const normR = normalizeDerInteger(r, componentSize);
  const normS = normalizeDerInteger(s, componentSize);
  if (!normR || !normS) return null;

  const raw = new Uint8Array(componentSize * 2);
  raw.set(normR, 0);
  raw.set(normS, componentSize);
  return raw;
}

function readCborLength(bytes: Uint8Array, offset: number, additional: number): { value: number; next: number } | null {
  if (additional < 24) {
    return { value: additional, next: offset };
  }
  if (additional === 24) {
    if (offset >= bytes.length) return null;
    return { value: bytes[offset], next: offset + 1 };
  }
  if (additional === 25) {
    if (offset + 1 >= bytes.length) return null;
    return { value: (bytes[offset] << 8) | bytes[offset + 1], next: offset + 2 };
  }
  if (additional === 26) {
    if (offset + 3 >= bytes.length) return null;
    return {
      value: (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3],
      next: offset + 4,
    };
  }
  return null;
}

function readCborInt(bytes: Uint8Array, offset: number): { value: number; next: number } | null {
  if (offset >= bytes.length) return null;
  const head = bytes[offset];
  const major = head >> 5;
  const additional = head & 0x1f;
  if (major !== 0 && major !== 1) return null;

  const parsed = readCborLength(bytes, offset + 1, additional);
  if (!parsed) return null;

  if (major === 0) {
    return { value: parsed.value, next: parsed.next };
  }

  return { value: -1 - parsed.value, next: parsed.next };
}

function readCborBytes(bytes: Uint8Array, offset: number): { value: Uint8Array; next: number } | null {
  if (offset >= bytes.length) return null;
  const head = bytes[offset];
  const major = head >> 5;
  const additional = head & 0x1f;
  if (major !== 2) return null;

  const parsed = readCborLength(bytes, offset + 1, additional);
  if (!parsed) return null;
  if (parsed.next + parsed.value > bytes.length) return null;

  return {
    value: bytes.slice(parsed.next, parsed.next + parsed.value),
    next: parsed.next + parsed.value,
  };
}

function decodeCoseEc2PublicKeyToRaw(cose: Uint8Array): Uint8Array | null {
  if (cose.length < 16) return null;
  const head = cose[0];
  const major = head >> 5;
  const additional = head & 0x1f;
  if (major !== 5) return null;

  const mapLen = readCborLength(cose, 1, additional);
  if (!mapLen) return null;

  const entries = mapLen.value;
  let cursor = mapLen.next;

  let kty: number | null = null;
  let crv: number | null = null;
  let x: Uint8Array | null = null;
  let y: Uint8Array | null = null;

  for (let index = 0; index < entries; index += 1) {
    const key = readCborInt(cose, cursor);
    if (!key) return null;
    cursor = key.next;

    if (key.value === -2 || key.value === -3) {
      const parsedBytes = readCborBytes(cose, cursor);
      if (!parsedBytes) return null;
      cursor = parsedBytes.next;
      if (key.value === -2) x = parsedBytes.value;
      if (key.value === -3) y = parsedBytes.value;
      continue;
    }

    const intValue = readCborInt(cose, cursor);
    if (!intValue) return null;
    cursor = intValue.next;
    if (key.value === 1) kty = intValue.value;
    if (key.value === -1) crv = intValue.value;
  }

  if (kty !== 2 || crv !== 1 || !x || !y || x.length !== 32 || y.length !== 32) {
    return null;
  }

  const raw = new Uint8Array(65);
  raw[0] = 0x04;
  raw.set(x, 1);
  raw.set(y, 33);
  return raw;
}

async function verifySignatureWithWebCrypto(
  publicKeyBytes: Uint8Array,
  signedData: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  const subtle = webcrypto?.subtle;
  if (!subtle) return false;

  const keyData = new Uint8Array(publicKeyBytes);
  const signedDataBytes = new Uint8Array(signedData);
  const signatureBytes = new Uint8Array(signature);
  const derConverted = derEcdsaSignatureToRaw(signatureBytes);
  const ecdsaSignatures: Uint8Array[] = [signatureBytes];
  if (derConverted && !bytesEqual(derConverted, signatureBytes)) {
    ecdsaSignatures.push(derConverted);
  }

  const ecdsaRawKeys: Uint8Array[] = [];
  if (keyData.length === 65 && keyData[0] === 0x04) {
    ecdsaRawKeys.push(new Uint8Array(keyData));
  }
  const coseDerivedRaw = decodeCoseEc2PublicKeyToRaw(keyData);
  if (coseDerivedRaw) {
    ecdsaRawKeys.push(coseDerivedRaw);
  }

  const verifyAttempts: Array<() => Promise<boolean>> = [
    async () => {
      const key = await subtle.importKey("spki", keyData, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      for (const candidateSignature of ecdsaSignatures) {
        if (await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, new Uint8Array(candidateSignature), signedDataBytes)) {
          return true;
        }
      }
      return false;
    },
    async () => {
      for (const rawKey of ecdsaRawKeys) {
        const key = await subtle.importKey("raw", new Uint8Array(rawKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        for (const candidateSignature of ecdsaSignatures) {
          if (await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, new Uint8Array(candidateSignature), signedDataBytes)) {
            return true;
          }
        }
      }
      return false;
    },
    async () => {
      const key = await subtle.importKey(
        "spki",
        keyData,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );
      return subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, signatureBytes, signedDataBytes);
    },
  ];

  for (const attempt of verifyAttempts) {
    try {
      const valid = await attempt();
      if (valid) return true;
    } catch {
      // try next key format
    }
  }

  return false;
}

function readVerifiedPasskeyRegistration(payload: PasskeySavePayload, senderUrl: string): {
  credentialId: string;
  publicKey: string;
  signCount: number;
  name?: string;
} {
  const challenge = consumePasskeyChallenge(payload.challengeId);
  if (!challenge) {
    fail("E_PAYLOAD_INVALID", "Invalid or expired challenge.");
  }

  const clientDataBytes = base64ToBuf(payload.clientDataJSON);
  const clientData = parsePasskeyClientData(clientDataBytes);
  if (!clientData) {
    fail("E_PAYLOAD_INVALID", "Passkey registration payload is invalid.");
  }
  if (clientData.type !== "webauthn.create") {
    fail("E_PAYLOAD_INVALID", "Invalid registration type.");
  }
  if (clientData.crossOrigin || !passkeyOriginMatchesTrustedSender(clientData.origin, senderUrl)) {
    fail("E_PAYLOAD_INVALID", "Origin mismatch.");
  }

  const receivedChallenge = base64urlToBuf(clientData.challenge);
  if (!bytesEqual(receivedChallenge, challenge)) {
    fail("E_PAYLOAD_INVALID", "Challenge mismatch.");
  }

  const attestationObjectBytes = base64ToBuf(payload.attestationObject);
  const attestation = parseAttestationObject(attestationObjectBytes);
  if (!attestation || !attestation.fmt.trim()) {
    fail("E_PAYLOAD_INVALID", "Invalid passkey registration response.");
  }

  const authenticatorData = parseAttestedCredentialData(attestation.authData);
  if (!authenticatorData) {
    fail("E_PAYLOAD_INVALID", "Invalid passkey registration response.");
  }
  if (!rpIdHashMatchesExpected(authenticatorData.rpIdHash, senderUrl)) {
    fail("E_PAYLOAD_INVALID", "RP ID hash mismatch.");
  }
  if ((authenticatorData.flags & AUTHENTICATOR_USER_PRESENT_FLAG) === 0) {
    fail("E_PAYLOAD_INVALID", "Passkey registration did not confirm user presence.");
  }
  if ((authenticatorData.flags & AUTHENTICATOR_USER_VERIFIED_FLAG) === 0) {
    fail("E_PAYLOAD_INVALID", "Passkey registration did not confirm user verification.");
  }

  // Attestation policy: self-attestation accepted.
  // We verify challenge, type, origin, and rpIdHash - sufficient to confirm the credential was created
  // by a real WebAuthn registration in this app. Hardware attestation root verification is not
  // required for a local-only Electron authenticator.
  return {
    credentialId: authenticatorData.credentialId,
    publicKey: toBase64url(authenticatorData.credentialPublicKey),
    signCount: authenticatorData.signCount,
    name: payload.name,
  };
}

async function verifyPasskeyAssertion(payload: PasskeyAssertionPayload, senderUrl: string): Promise<{ ok: boolean; cloneDetected: boolean }> {
  const challenge = consumePasskeyChallenge(payload.challengeId);
  if (!challenge) return { ok: false, cloneDetected: false };

  const credential = listPasskeyCredentials().find((item) => item.credentialId === payload.credentialId);
  if (!credential) return { ok: false, cloneDetected: false };

  try {
    const clientDataBytes = validateByteArray(payload.clientDataJSON, "clientDataJSON");
    const authDataBytes = validateByteArray(payload.authenticatorData, "authenticatorData");
    const signatureBytes = validateByteArray(payload.signature, "signature");

    const clientData = parsePasskeyClientData(clientDataBytes);
    if (!clientData) return { ok: false, cloneDetected: false };
    if (clientData.type !== "webauthn.get") return { ok: false, cloneDetected: false };
    if (clientData.crossOrigin) return { ok: false, cloneDetected: false };
    if (!passkeyOriginMatchesTrustedSender(clientData.origin, senderUrl)) return { ok: false, cloneDetected: false };

    const expectedChallenge = challenge;
    const receivedChallenge = base64urlToBuf(clientData.challenge);
    if (!bytesEqual(receivedChallenge, expectedChallenge)) return { ok: false, cloneDetected: false };

    const authenticatorData = parseAuthenticatorData(authDataBytes);
    if (!authenticatorData) return { ok: false, cloneDetected: false };

    if (!rpIdHashMatchesExpected(authenticatorData.rpIdHash, senderUrl)) return { ok: false, cloneDetected: false };
    if ((authenticatorData.flags & AUTHENTICATOR_USER_PRESENT_FLAG) === 0) return { ok: false, cloneDetected: false };
    if ((authenticatorData.flags & AUTHENTICATOR_USER_VERIFIED_FLAG) === 0) return { ok: false, cloneDetected: false };

    const clientDataHash = createHash("sha256").update(Buffer.from(clientDataBytes)).digest();
    const signedData = new Uint8Array(Buffer.concat([Buffer.from(authDataBytes), clientDataHash]));

    const publicKeyBytes = base64urlToBuf(credential.publicKey);
    const verified = await verifySignatureWithWebCrypto(publicKeyBytes, signedData, signatureBytes);
    if (!verified) {
      return { ok: false, cloneDetected: false };
    }

    if (credential.signCount > 0 && authenticatorData.signCount <= credential.signCount) {
      return { ok: false, cloneDetected: true };
    }

    if (authenticatorData.signCount > 0) {
      updatePasskeyCredentialSignCount(payload.credentialId, authenticatorData.signCount);
    }
    return { ok: true, cloneDetected: false };
  } catch {
    return { ok: false, cloneDetected: false };
  }
}

function isSecurityOptOutMethod(method: LockMethod): boolean {
  return method === "none" || method === "swipe";
}

function sanitizeQuickUnlockConfig(
  method: LockMethod,
  config: { windowsHello: boolean; passkey: boolean },
  options?: { passkeyRequired?: boolean }
): { windowsHello: boolean; passkey: boolean } {
  if (!lockMethodSupportsQuickUnlock(method)) {
    return { windowsHello: false, passkey: false };
  }

  const passkeyRequired = options?.passkeyRequired === true || method === "passkey";

  return {
    windowsHello: false,
    passkey: (passkeyRequired || !!config.passkey) && hasPasskeyCredential(),
  };
}

function lockMethodConfigured(method: LockMethod): boolean {
  if (method === "none") return false;
  if (method === "swipe") return true;
  if (method === "passkey") return hasPasskeyCredential();

  const credentialType = lockMethodCredentialType(method);
  if (!credentialType) return false;
  if (!hasCredential(credentialType)) return false;

  if (credentialType === "pin") {
    const digits = getPinDigits();
    return method === "pin6" ? digits === 6 : digits === 4;
  }

  return true;
}

function senderUrlIsTrusted(url: unknown): boolean {
  if (typeof url !== "string") return false;
  if (!app.isPackaged && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url)) return true;
  return url === TRUSTED_APP_PROTOCOL_ORIGIN || url.startsWith(`${TRUSTED_APP_PROTOCOL_ORIGIN}/`);
}

function requireTrustedLockAdminSender(event: IpcMainInvokeEvent): BrowserWindow {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    fail("E_PAYLOAD_INVALID", "This security action was rejected.");
  }

  const sender = event.sender;
  const hasParentWindow = typeof win.getParentWindow === "function" ? !!win.getParentWindow() : false;
  const isExpectedWebContents = sender === win.webContents;
  const senderUrl = typeof sender.getURL === "function" ? sender.getURL() : "";

  if (!isExpectedWebContents || hasParentWindow || !senderUrlIsTrusted(senderUrl)) {
    fail("E_PAYLOAD_INVALID", "This security action was rejected.");
  }

  return win;
}

function requireTrustedSecuritySender(event: IpcMainInvokeEvent): BrowserWindow {
  return requireTrustedLockAdminSender(event);
}

function hasAnyConfiguredCredential(): boolean {
  return hasCredential("pin") || hasCredential("password") || hasCredential("pattern") || hasPasskeyCredential();
}

function getConfiguredStepUpMethods(): StepUpMethod[] {
  const configured: StepUpMethod[] = [];
  const methods = getLockMethodsConfig();

  if (
    (methods.primaryLockMethod === "pin" ||
      methods.primaryLockMethod === "password" ||
      methods.primaryLockMethod === "pattern" ||
      methods.primaryLockMethod === "passkey") &&
    secureMethodConfigured(methods.primaryLockMethod)
  ) {
    configured.push(methods.primaryLockMethod);
  }

  if (
    methods.secondaryLockMethod &&
    secureMethodConfigured(methods.secondaryLockMethod) &&
    !configured.includes(methods.secondaryLockMethod)
  ) {
    configured.push(methods.secondaryLockMethod);
  }

  if (hasCredential("password") && !configured.includes("password")) {
    configured.push("password");
  }

  if (loadSettings().biometricEnabled && getVaultProtectionStatus().biometricEnrolled === true && canPromptBiometric()) {
    configured.push("biometric");
  }

  return configured;
}

function stepUpMethodAllowed(method: StepUpMethod): boolean {
  return getConfiguredStepUpMethods().includes(method);
}

function dropPasskeyFromLockMethodsConfig(): void {
  const current = getLockMethodsConfig();
  let nextPrimary = current.primaryLockMethod;
  let nextSecondary = current.secondaryLockMethod;

  if (nextPrimary === "passkey") {
    if (nextSecondary && nextSecondary !== "passkey") {
      nextPrimary = nextSecondary;
      nextSecondary = null;
    } else {
      nextPrimary = "none";
      nextSecondary = null;
    }
  } else if (nextSecondary === "passkey") {
    nextSecondary = null;
  }

  if (nextPrimary !== current.primaryLockMethod || nextSecondary !== current.secondaryLockMethod) {
    setLockMethodsConfig({
      primaryLockMethod: nextPrimary,
      secondaryLockMethod: nextSecondary,
    });
  }

  const primaryMethod = lockMethodFromMulti(nextPrimary);
  const currentQuick = getQuickUnlock();
  const nextQuick = sanitizeQuickUnlockConfig(
    primaryMethod,
    {
      windowsHello: currentQuick.windowsHello,
      passkey: false,
    },
    { passkeyRequired: false }
  );
  setQuickUnlock(nextQuick);
}

function ensureLockAdminAccess(event: IpcMainInvokeEvent): void {
  requireTrustedLockAdminSender(event);

  if (!locked) return;
  if (!hasAnyConfiguredCredential()) return;

  fail("E_LOCKED", "Unlock the app before using this feature.");
}

function hasLegacyPin4Configured(): boolean {
  return hasCredential("pin") && getPinDigits() === 4;
}

function ensureUnlocked(): void {
  if (!locked) return;
  if (hardenedVaultNeedsPasswordUnlock()) {
    fail("E_LOCKED", "Unlock the app before using this feature.");
  }
  const method = getLockMethod();
  if (!lockMethodConfigured(method)) return;
  if (method === "none" || method === "swipe") return;
  fail("E_LOCKED", "Unlock the app before using this feature.");
}

function ensureUnlockedFromTrustedSender(event: IpcMainInvokeEvent): BrowserWindow {
  const win = requireTrustedSecuritySender(event);
  ensureUnlocked();
  return win;
}

function canPromptBiometric(): boolean {
  if (process.platform === "darwin") {
    if (typeof systemPreferences.canPromptTouchID !== "function") return false;
    try {
      return systemPreferences.canPromptTouchID();
    } catch {
      return false;
    }
  }

  if (process.platform === "win32") {
    try {
      if (typeof systemPreferences.canPromptTouchID === "function" && systemPreferences.canPromptTouchID()) {
        return true;
      }
    } catch {
      // ignore
    }

    try {
      const maybeEnabled = systemPreferences.getUserDefault("WindowsBiometricEnabled", "boolean");
      return !!maybeEnabled;
    } catch {
      return false;
    }
  }

  return false;
}

async function promptBiometricUnlock(): Promise<boolean> {
  const settings = loadSettings();
  if (!settings.biometricEnabled) return false;

  if (process.platform === "darwin") {
    if (!canPromptBiometric()) return false;
    if (typeof systemPreferences.promptTouchID !== "function") return false;
    try {
      await systemPreferences.promptTouchID("Unlock Vault Authenticator");
      locked = false;
      return true;
    } catch {
      return false;
    }
  }

  if (process.platform === "win32") {
    if (!canPromptBiometric()) return false;
    if (typeof systemPreferences.promptTouchID !== "function") return false;
    try {
      await systemPreferences.promptTouchID("Unlock Vault Authenticator");
      locked = false;
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

async function promptBiometricStepUp(): Promise<boolean> {
  const settings = loadSettings();
  if (!settings.biometricEnabled || getVaultProtectionStatus().biometricEnrolled !== true) {
    return false;
  }

  if (!canPromptBiometric() || typeof systemPreferences.promptTouchID !== "function") {
    return false;
  }

  try {
    await systemPreferences.promptTouchID("Authenticate to continue");
    return true;
  } catch {
    return false;
  }
}

function sendShowLockScreen(win: BrowserWindow | null | undefined): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("auth:showLockScreen");
}

let locked = false;
let justUnlockedViaRecovery = false;
let requirePasswordUnlockAfterRecoveryReset = false;
const pendingStepUpVerifiedAt = new Map<number, number>();
const securitySessionLifecycleAttached = new WeakSet<object>();
let activeSecuritySession: SecuritySession | null = null;
let settingsAppliedListener: ((settings: AppSettings, sourceWindow: BrowserWindow | null) => void) | null = null;
let appLockedListener: ((sourceWindow: BrowserWindow | null) => void) | null = null;

function notifySettingsApplied(settings: AppSettings, sourceWindow: BrowserWindow | null): void {
  if (!settingsAppliedListener) {
    return;
  }
  settingsAppliedListener(settings, sourceWindow);
}

function notifyAppLocked(sourceWindow: BrowserWindow | null | undefined): void {
  if (!appLockedListener) {
    return;
  }
  appLockedListener(sourceWindow ?? null);
}

function currentVaultProtectionStatusForRenderer(): RendererVaultProtectionStatus {
  const status = getVaultProtectionStatus();
  const next: RendererVaultProtectionStatus = {
    ...status,
    vaultFormat: "vault-v4",
    migrationRequired: migrationRequired(),
    justUnlockedViaRecovery,
    appLockRequired: currentAppLockRequired(),
    mode: "vault-v4",
  };
  justUnlockedViaRecovery = false;
  return next;
}

function clearExpiredStepUpAuth(now = Date.now()): void {
  for (const [senderId, verifiedAt] of pendingStepUpVerifiedAt.entries()) {
    if (now - verifiedAt > STEP_UP_GRANT_TTL_MS) {
      pendingStepUpVerifiedAt.delete(senderId);
    }
  }
}

function recordStepUpAuth(event: IpcMainInvokeEvent): void {
  clearExpiredStepUpAuth();
  pendingStepUpVerifiedAt.set(event.sender.id, Date.now());
}

function clearStepUpAuth(): void {
  pendingStepUpVerifiedAt.clear();
}

function consumeStepUpAuth(event: IpcMainInvokeEvent): void {
  pendingStepUpVerifiedAt.delete(event.sender.id);
}

function closeSecuritySession(): void {
  activeSecuritySession = null;
}

function shouldLogSecuritySessionInvalidation(reason: string): boolean {
  return reason !== "renderer closed session";
}

export function invalidateSecuritySession(reason: string): void {
  const hadSession = activeSecuritySession !== null || pendingStepUpVerifiedAt.size > 0;
  closeSecuritySession();
  clearStepUpAuth();
  if (hadSession && shouldLogSecuritySessionInvalidation(reason)) {
    logDesktopDebug("security session invalidated", { reason });
  }
}

function requireStepUpAuth(event: IpcMainInvokeEvent): void {
  requireTrustedLockAdminSender(event);

  if (getConfiguredStepUpMethods().length === 0) {
    return;
  }

  clearExpiredStepUpAuth();
  if (pendingStepUpVerifiedAt.has(event.sender.id)) {
    return;
  }

  fail("E_STEP_UP_REQUIRED", "This action requires you to verify your identity.");
}

function openSecuritySession(event: IpcMainInvokeEvent): void {
  requireStepUpAuth(event);
  const now = Date.now();
  activeSecuritySession = {
    openedAt: now,
    expiresAt: now + SECURITY_SESSION_TTL_MS,
    webContentsId: event.sender.id,
  };
  consumeStepUpAuth(event);
}

function requireSecuritySession(event: IpcMainInvokeEvent): void {
  requireTrustedLockAdminSender(event);

  if (getConfiguredStepUpMethods().length === 0) {
    return;
  }

  if (!activeSecuritySession) {
    fail("E_STEP_UP_REQUIRED", "A security session is required. Open one first.");
  }

  if (Date.now() > activeSecuritySession.expiresAt || activeSecuritySession.webContentsId !== event.sender.id) {
    closeSecuritySession();
    fail("E_STEP_UP_REQUIRED", "A security session is required. Open one first.");
  }
}

export function attachSecuritySessionLifecycle(win: BrowserWindow): void {
  const webContents = win.webContents as unknown as object;
  if (securitySessionLifecycleAttached.has(webContents)) {
    return;
  }
  securitySessionLifecycleAttached.add(webContents);

  win.webContents.on("did-navigate", () => {
    invalidateSecuritySession("renderer navigated");
  });
  win.webContents.on("did-finish-load", () => {
    invalidateSecuritySession("renderer reloaded");
  });
  win.webContents.on("render-process-gone", () => {
    clearDecryptedCache();
    invalidateSecuritySession("renderer process gone");
  });
  win.webContents.on("destroyed", () => {
    clearDecryptedCache();
    invalidateSecuritySession("webcontents destroyed");
  });
  win.on("blur", () => {
    clearDecryptedCache();
    invalidateSecuritySession("window blurred");
  });
  win.on("minimize", () => {
    clearDecryptedCache();
    invalidateSecuritySession("window minimized");
  });
  win.on("hide", () => {
    clearDecryptedCache();
    invalidateSecuritySession("window hidden");
  });
  win.on("unresponsive", () => {
    clearDecryptedCache();
    invalidateSecuritySession("window unresponsive");
  });
  win.on("closed", () => {
    clearDecryptedCache();
    invalidateSecuritySession("window closed");
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const noop = (): void => undefined;

async function prepareWindowForScreenScan(parentWindow: BrowserWindow | undefined): Promise<{
  scanParentWindow: BrowserWindow | undefined;
  restoreWindow: () => void;
}> {
  if (!parentWindow || parentWindow.isDestroyed()) {
    return {
      scanParentWindow: parentWindow,
      restoreWindow: noop,
    };
  }

  const maybeWindow = parentWindow as BrowserWindow & {
    isMinimized?: () => boolean;
    isVisible?: () => boolean;
    minimize?: () => void;
    restore?: () => void;
    focus?: () => void;
    hide?: () => void;
    show?: () => void;
  };

  const canMinimize = typeof maybeWindow.minimize === "function";
  const canRestore = typeof maybeWindow.restore === "function";
  const isVisible = typeof maybeWindow.isVisible === "function" ? maybeWindow.isVisible() : true;
  const wasMinimized = typeof maybeWindow.isMinimized === "function" ? maybeWindow.isMinimized() : false;

  if (!canMinimize || !canRestore || !isVisible || wasMinimized) {
    return {
      scanParentWindow: parentWindow,
      restoreWindow: noop,
    };
  }

  const releaseFocusLossLock = suppressFocusLossLock();

  try {
    maybeWindow.minimize();
  } catch (error) {
    logDesktopDebug("scan window minimize failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    releaseFocusLossLock();
    return {
      scanParentWindow: parentWindow,
      restoreWindow: noop,
    };
  }

  let minimized = false;
  for (let index = 0; index < 12; index += 1) {
    if (parentWindow.isDestroyed()) {
      break;
    }
    if (typeof maybeWindow.isMinimized === "function" && maybeWindow.isMinimized()) {
      minimized = true;
      break;
    }
    await wait(15);
  }

  let hidden = false;
  if (!minimized && typeof maybeWindow.hide === "function") {
    try {
      maybeWindow.hide();
      hidden = true;
      logDesktopDebug("scan window hidden fallback used");
    } catch (error) {
      logDesktopDebug("scan window hide fallback failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!minimized && !hidden) {
    releaseFocusLossLock();
    return {
      scanParentWindow: parentWindow,
      restoreWindow: noop,
    };
  }

  logDesktopDebug("scan window temporarily backgrounded", {
    minimized,
    hidden,
  });

  return {
    scanParentWindow: undefined,
    restoreWindow: () => {
      try {
        if (parentWindow.isDestroyed()) return;

        if (hidden) {
          try {
            maybeWindow.show?.();
          } catch (error) {
            logDesktopDebug("scan window show after fallback failed", {
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (minimized) {
          try {
            maybeWindow.restore?.();
          } catch (error) {
            logDesktopDebug("scan window restore failed", {
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        try {
          maybeWindow.focus?.();
        } catch {
          // ignore focus failures
        }
      } finally {
        releaseFocusLossLock();
      }
    },
  };
}

function lockAppWindow(win: BrowserWindow | null | undefined): void {
  if (requirePasswordUnlockAfterRecoveryReset) {
    clearHardenedSession();
  } else {
    clearDecryptedCache();
  }
  if (hardenedVaultNeedsPasswordUnlock()) {
    invalidateSecuritySession("app locked");
    locked = true;
    sendShowLockScreen(win);
    notifyAppLocked(win ?? null);
    return;
  }

  const method = getLockMethod();
  if (!lockMethodConfigured(method)) return;
  if (method === "none") return;
  invalidateSecuritySession("app locked");
  locked = true;
  sendShowLockScreen(win);
  notifyAppLocked(win ?? null);
}

export function lockApp(win: BrowserWindow | null | undefined): void {
  lockAppWindow(win);
}

export function isAppLocked(): boolean {
  return locked;
}

export function setSettingsAppliedListener(listener: ((settings: AppSettings, sourceWindow: BrowserWindow | null) => void) | null): void {
  settingsAppliedListener = listener;
}

export function setAppLockedListener(listener: ((sourceWindow: BrowserWindow | null) => void) | null): void {
  appLockedListener = listener;
}

export function registerIpc(): void {
  const hardenedLockedAtStartup = hardenedVaultNeedsPasswordUnlock();
  locked = hardenedLockedAtStartup || shouldRequireLockOnStartup();
  requirePasswordUnlockAfterRecoveryReset = false;
  passkeyChallenges.clear();
  closeSecuritySession();
  clearStepUpAuth();
  if (!hardenedLockedAtStartup) {
    const startupMethod = getLockMethod();
    const startupMethodsConfig = getLockMethodsConfig();
    const startupPasskeyRequired =
      startupMethodsConfig.primaryLockMethod === "passkey" || startupMethodsConfig.secondaryLockMethod === "passkey";
    const startupQuickUnlock = sanitizeQuickUnlockConfig(startupMethod, getQuickUnlock(), {
      passkeyRequired: startupPasskeyRequired,
    });
    const currentQuickUnlock = getQuickUnlock();
    if (
      startupQuickUnlock.windowsHello !== currentQuickUnlock.windowsHello ||
      startupQuickUnlock.passkey !== currentQuickUnlock.passkey
    ) {
      setQuickUnlock(startupQuickUnlock);
    }
  }

  directHandle("lock:getMethod", (evt): LockMethod => {
    requireTrustedSecuritySender(evt);
    return hardenedVaultNeedsPasswordUnlock() ? "password" : getLockMethod();
  });

  directHandle("lock:getStatus", (evt): boolean => {
    requireTrustedSecuritySender(evt);
    return currentLockStatus();
  });

  directHandle("lock:getMethodsConfig", (evt): MultiLockMethodsConfig => {
    requireTrustedSecuritySender(evt);
    return hardenedVaultNeedsPasswordUnlock()
      ? { primaryLockMethod: "password", secondaryLockMethod: null }
      : getLockMethodsConfig();
  });

  directHandle("lock:getQuickUnlock", (evt): { windowsHello: boolean; passkey: boolean } => {
    requireTrustedSecuritySender(evt);
    if (hardenedVaultNeedsPasswordUnlock()) {
      return { windowsHello: false, passkey: false };
    }
    const method = getLockMethod();
    const methodsConfig = getLockMethodsConfig();
    const passkeyRequired = methodsConfig.primaryLockMethod === "passkey" || methodsConfig.secondaryLockMethod === "passkey";
    return sanitizeQuickUnlockConfig(method, getQuickUnlock(), { passkeyRequired });
  });

  directHandle("lock:setQuickUnlock", (_evt, rawConfig: unknown): void => {
    ensureLockAdminAccess(_evt);
    const config = validateQuickUnlockConfig(rawConfig);
    const method = getLockMethod();
    const methodsConfig = getLockMethodsConfig();
    const passkeyRequired = methodsConfig.primaryLockMethod === "passkey" || methodsConfig.secondaryLockMethod === "passkey";

    if (!lockMethodSupportsQuickUnlock(method)) {
      setQuickUnlock({ windowsHello: false, passkey: false });
      return;
    }

    const next = sanitizeQuickUnlockConfig(method, {
      windowsHello: false,
      passkey: (passkeyRequired || config.passkey) && hasPasskeyCredential(),
    }, {
      passkeyRequired,
    });
    setQuickUnlock(next);
  });

  directHandle("lock:setMethodsConfig", (_evt, rawConfig: unknown): void => {
    requireSecuritySession(_evt);
    ensureLockAdminAccess(_evt);
    const nextConfig = validateLockMethodsConfig(rawConfig);

    const secureMethods: MultiSecureLockMethod[] = [];
    if (isSecureMultiLockMethod(nextConfig.primaryLockMethod)) {
      secureMethods.push(nextConfig.primaryLockMethod);
    }
    if (nextConfig.secondaryLockMethod) {
      secureMethods.push(nextConfig.secondaryLockMethod);
    }

    for (const method of secureMethods) {
      if (secureMethodConfigured(method)) continue;
      if (method === "pin") {
        fail("E_PIN_REQUIRED", "Set a PIN before selecting it.");
      }
      if (method === "password") {
        fail("E_PAYLOAD_INVALID", "Set a password before selecting it.");
      }
      if (method === "pattern") {
        fail("E_PAYLOAD_INVALID", "Set a pattern before selecting it.");
      }
      fail("E_PAYLOAD_INVALID", "Register a passkey before selecting it.");
    }

    setLockMethodsConfig(nextConfig);

    const primaryMethod = lockMethodFromMulti(nextConfig.primaryLockMethod);
    const currentQuick = getQuickUnlock();
    const passkeyRequired =
      nextConfig.primaryLockMethod === "passkey" || nextConfig.secondaryLockMethod === "passkey";
    const nextQuick = sanitizeQuickUnlockConfig(
      primaryMethod,
      {
        windowsHello: currentQuick.windowsHello,
        passkey: (passkeyRequired || currentQuick.passkey) && hasPasskeyCredential(),
      },
      { passkeyRequired }
    );
    setQuickUnlock(nextQuick);
    locked = false;
  });

  directHandle("lock:setMethod", (_evt, rawMethod: unknown): void => {
    requireSecuritySession(_evt);
    ensureLockAdminAccess(_evt);
    const nextMethod = validateLockMethod(rawMethod);
    if (nextMethod === "pin4" && !hasLegacyPin4Configured()) {
      fail("E_PIN_INVALID", "PIN-4 is legacy only. Use a 6-digit PIN for new setups.");
    }
    if (nextMethod === "passkey" && !hasPasskeyCredential()) {
      fail("E_PAYLOAD_INVALID", "Register a passkey before selecting it.");
    }
    setLockMethod(nextMethod);

    const methodsConfig = getLockMethodsConfig();
    const passkeyRequired = methodsConfig.primaryLockMethod === "passkey" || methodsConfig.secondaryLockMethod === "passkey";
    const nextQuick = sanitizeQuickUnlockConfig(nextMethod, getQuickUnlock(), { passkeyRequired });
    setQuickUnlock(nextQuick);
    locked = false;
  });

  directHandle("lock:setCredential", async (_evt, rawType: unknown, rawValue: unknown): Promise<void> => {
    const type = validateCredentialType(rawType);
    const rawStringValue = validateCredentialValue(rawValue);

    if (type === "password" && (!hasProvisionedVault() || requiresVaultPasswordSetup())) {
      requireTrustedLockAdminSender(_evt);
      const value = validateNewMasterPassword(rawStringValue);
      await initializeVaultWithPassword(value);
      locked = false;
      return;
    }

    requireSecuritySession(_evt);
    ensureLockAdminAccess(_evt);
    const value = type === "password" ? validateNewMasterPassword(rawStringValue) : rawStringValue;
    try {
      await setCredential(type, value);
      if (type === "password" && hasProvisionedVault()) {
        await rotateHardenedVaultPassword(value);
      }
      locked = false;
    } catch (error) {
      if (type === "pin") {
        fail("E_PIN_INVALID", error instanceof Error ? error.message : "New PIN setup requires 6 digits.");
      }
      if (type === "password") {
        fail("E_PIN_INVALID", error instanceof Error ? error.message : getVaultPasswordPolicyMessage("too_short"));
      }
      fail("E_PIN_INVALID", error instanceof Error ? error.message : "Pattern is invalid.");
    }
  });

  directHandle("lock:verify", async (_evt, rawType: unknown, rawInput: unknown): Promise<VerifyCredentialResult> => {
    requireTrustedSecuritySender(_evt);
    const type = validateCredentialType(rawType);
    const input = validateStringPayload(rawInput, "E_PAYLOAD_INVALID", "We could not process this request. Please retry that action.");

    if (hardenedVaultNeedsPasswordUnlock()) {
      if (type !== "password") {
        return { result: "INCORRECT", attemptsUsed: 0 };
      }

      const unlockResult = await unlockHardenedVaultWithPassword(input);
      if (unlockResult.result !== "OK") {
        return unlockResult;
      }

      if (requirePasswordUnlockAfterRecoveryReset) {
        justUnlockedViaRecovery = true;
      }
      requirePasswordUnlockAfterRecoveryReset = false;
      locked = false;
      return { result: "OK" };
    }

    const result = await verifyCredentialWithLimit(type, input);
    if (result.result === "OK") {
      locked = false;
    }
    return result;
  });

  directHandle("lock:getLockState", (evt): { failedCount: number; lockUntilEpochMs: number } => {
    requireTrustedSecuritySender(evt);
    if (hardenedVaultNeedsPasswordUnlock()) {
      return getVaultProtectionStatus().masterPasswordLockState;
    }
    return getCredentialLockState();
  });

  directHandle("lock:hasCredential", (_evt, rawType: unknown): boolean => {
    requireTrustedSecuritySender(_evt);
    const type = validateCredentialType(rawType);
    if (hardenedVaultNeedsPasswordUnlock()) {
      return type === "password";
    }
    return hasCredential(type);
  });

  directHandle("lock:clearCredential", (_evt, rawType: unknown): void => {
    ensureLockAdminAccess(_evt);
    const type = validateCredentialType(rawType);
    if (type === "password" && loadAccounts().length > 0) {
      fail("E_POLICY_DENIED", "Password cannot be removed while accounts exist. The password protects your vault key.");
    }
    clearCredential(type);
  });

  directHandle("lock:lock", (evt): void => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    lockAppWindow(win);
  });

  directHandle("lock:biometricAvailable", (evt): boolean => {
    requireTrustedSecuritySender(evt);
    if (hasPendingRecoveryReset() || requirePasswordUnlockAfterRecoveryReset) {
      return false;
    }
    if (hardenedVaultNeedsPasswordUnlock()) {
      return process.platform === "darwin" && getVaultProtectionStatus().biometricEnrolled === true;
    }
    return canPromptBiometric();
  });

  directHandle("lock:promptBiometric", async (evt): Promise<boolean> => {
    requireTrustedSecuritySender(evt);
    if (hasPendingRecoveryReset() || requirePasswordUnlockAfterRecoveryReset) {
      return false;
    }
    if (hardenedVaultNeedsPasswordUnlock()) {
      return unlockVaultWithBiometric();
    }
    if (!getQuickUnlock().windowsHello) {
      fail("E_POLICY_DENIED", "Biometric unlock is disabled by quick-unlock policy.");
    }
    return promptBiometricUnlock();
  });

  directHandle("lock:getPinDigits", (evt): 4 | 6 => {
    requireTrustedSecuritySender(evt);
    if (hardenedVaultNeedsPasswordUnlock()) {
      return 4;
    }
    return getPinDigits();
  });

  safeHandle("lock:stepUpGetChallenge", (evt): { challengeId: string; challenge: number[] } => {
    ensureUnlockedFromTrustedSender(evt);
    if (!stepUpMethodAllowed("passkey")) {
      fail("E_PAYLOAD_INVALID", "Passkey verification is unavailable.");
    }
    return createPasskeyChallenge();
  });

  safeHandle("lock:stepUpVerify", async (evt, rawPayload: unknown): Promise<VerifyCredentialResult> => {
    ensureUnlockedFromTrustedSender(evt);
    const payload = validateStepUpVerifyPayload(rawPayload);
    if (!stepUpMethodAllowed(payload.method)) {
      fail("E_PAYLOAD_INVALID", "That verification method is unavailable.");
    }

    if (payload.method === "passkey") {
      const senderUrl = typeof evt.sender.getURL === "function" ? evt.sender.getURL() : "";
      const ok = await verifyPasskeyAssertion(payload, senderUrl);
      if (ok) {
        recordStepUpAuth(evt);
        return { result: "OK" };
      }
      return { result: "INCORRECT", attemptsUsed: 0 };
    }

    if (payload.method === "biometric") {
      const ok = await promptBiometricStepUp();
      if (ok) {
        recordStepUpAuth(evt);
        return { result: "OK" };
      }
      return { result: "INCORRECT", attemptsUsed: 0 };
    }

    const result = await verifyCredentialWithLimit(payload.method, payload.input);
    if (result.result === "OK") {
      recordStepUpAuth(evt);
    }
    return result;
  });

  safeHandle("lock:openSecuritySession", (evt): void => {
    ensureUnlockedFromTrustedSender(evt);
    openSecuritySession(evt);
  });

  safeHandle("lock:closeSecuritySession", (evt): void => {
    requireTrustedSecuritySender(evt);
    invalidateSecuritySession("renderer closed session");
  });

  safeHandle("lock:resetAppLock", (evt): boolean => {
    ensureLockAdminAccess(evt);
    requireSecuritySession(evt);
    saveAccounts([]);
    clearCredential("pin");
    clearCredential("password");
    clearCredential("pattern");
    clearCredentialLockState();
    clearPasskeyCredential();
    setQuickUnlock({ windowsHello: false, passkey: false });
    setLockMethod("none");
    invalidateSecuritySession("app lock reset");
    locked = false;
    return true;
  });

  directHandle("passkey:getChallenge", (evt): { challengeId: string; challenge: number[] } => {
    requireTrustedSecuritySender(evt);
    return createPasskeyChallenge();
  });

  safeHandle("passkey:saveCredential", (evt, rawPayload: unknown): boolean => {
    ensureLockAdminAccess(evt);
    requireSecuritySession(evt);
    const senderUrl = typeof evt.sender.getURL === "function" ? evt.sender.getURL() : "";
    const payload = validatePasskeySavePayload(rawPayload);
    const verifiedRegistration = readVerifiedPasskeyRegistration(payload, senderUrl);

    savePasskeyCredential(verifiedRegistration.credentialId, verifiedRegistration.publicKey, verifiedRegistration.name, verifiedRegistration.signCount);
    if (verifiedRegistration.signCount === 0) {
      logDesktopDebug("passkey signCount unavailable", {
        credentialId: verifiedRegistration.credentialId,
      });
    }
    const methodsConfig = getLockMethodsConfig();
    const passkeyRequired = methodsConfig.primaryLockMethod === "passkey" || methodsConfig.secondaryLockMethod === "passkey";
    if (passkeyRequired) {
      const primaryMethod = lockMethodFromMulti(methodsConfig.primaryLockMethod);
      const nextQuick = sanitizeQuickUnlockConfig(
        primaryMethod,
        {
          windowsHello: false,
          passkey: true,
        },
        { passkeyRequired: true }
      );
      setQuickUnlock(nextQuick);
    }
    return true;
  });

  directHandle(
    "passkey:listCredentials",
    (evt): Array<{ id: string; name: string; credentialId: string }> => {
      requireTrustedSecuritySender(evt);
      if (hardenedVaultNeedsPasswordUnlock()) {
        return [];
      }
      return listPasskeySummaries();
    }
  );

  safeHandle("passkey:renameCredential", (evt, rawPayload: unknown): boolean => {
    ensureLockAdminAccess(evt);
    requireSecuritySession(evt);
    try {
      const payload = validatePayload(rawPayload);
      const id = validatePasskeyRecordId(payload.id);
      const name = validatePasskeyDisplayName(payload.name);
      if (!name) {
        fail("E_PAYLOAD_INVALID", "Passkey name is required.");
      }
      return renamePasskeyCredential(id, name);
    } catch {
      return false;
    }
  });

  safeHandle("passkey:removeCredential", (evt, rawPayload: unknown): boolean => {
    ensureLockAdminAccess(evt);
    requireSecuritySession(evt);
    try {
      const payload = validatePayload(rawPayload);
      const id = validatePasskeyRecordId(payload.id);
      const removed = removePasskeyCredential(id);
      if (!removed) return false;
      if (!hasPasskeyCredential()) {
        dropPasskeyFromLockMethodsConfig();
      }
      return true;
    } catch {
      return false;
    }
  });

  directHandle("passkey:getCredentialId", (evt): string | null => {
    requireTrustedSecuritySender(evt);
    return getPasskeyCredential()?.credentialId ?? null;
  });

  directHandle("passkey:verifyAssertion", async (_evt, rawPayload: unknown): Promise<boolean> => {
    requireTrustedSecuritySender(_evt);
    try {
      const payload = validatePasskeyAssertionPayload(rawPayload);
      const senderUrl = typeof _evt.sender.getURL === "function" ? _evt.sender.getURL() : "";
      const result = await verifyPasskeyAssertion(payload, senderUrl);
      if (result.cloneDetected) {
        logDesktopDebug("Possible cloned authenticator detected", {
          credentialId: payload.credentialId,
        });
        lockAppWindow(BrowserWindow.fromWebContents(_evt.sender));
        return false;
      }
      if (result.ok) {
        locked = false;
      }
      return result.ok;
    } catch {
      return false;
    }
  });

  safeHandle("passkey:clearCredential", (evt): void => {
    ensureLockAdminAccess(evt);
    requireSecuritySession(evt);
    clearPasskeyCredential();
    dropPasskeyFromLockMethodsConfig();
  });

  safeHandle("vault:getProtectionStatus", (evt): RendererVaultProtectionStatus => {
    requireTrustedSecuritySender(evt);
    return currentVaultProtectionStatusForRenderer();
  });

  safeHandle("vault:enableHardenedMode", async (evt, rawPassword: unknown): Promise<VaultProtectionStatus> => {
    ensureLockAdminAccess(evt);
    requireSecuritySession(evt);
    if (hasProvisionedVault()) {
      fail("E_VAULT_MODE_INVALID", "Vault-v4 protection is already active.");
    }
    const password = validateNewMasterPassword(rawPassword);
    await initializeVaultWithPassword(password);
    return getVaultProtectionStatus();
  });

  safeHandle("vault:disableHardenedMode", async (evt): Promise<VaultProtectionStatus> => {
    ensureLockAdminAccess(evt);
    requireSecuritySession(evt);
    fail("E_VAULT_MODE_INVALID", "Standard mode has been removed.");
  });

  safeHandle("vault:enrollBiometric", async (evt): Promise<VaultProtectionStatus> => {
    ensureLockAdminAccess(evt);
    requireSecuritySession(evt);
    const enrolled = await enrollBiometricUnlock();
    if (!enrolled) {
      fail("E_POLICY_DENIED", "Biometric cold-start unlock is available on macOS only.");
    }
    return getVaultProtectionStatus();
  });

  safeHandle("vault:removeBiometric", async (evt): Promise<VaultProtectionStatus> => {
    ensureLockAdminAccess(evt);
    requireSecuritySession(evt);
    const passwordMethods = getConfiguredStepUpMethods();
    if (!passwordMethods.includes("password")) {
      fail("E_VAULT_MASTER_PASSWORD_INVALID", "Password verification is required before removing biometric vault unlock.");
    }
    await removeBiometricUnlock();
    return getVaultProtectionStatus();
  });

  safeHandle("vault:generateRecoverySecret", async (evt): Promise<string> => {
    ensureLockAdminAccess(evt);
    requireSecuritySession(evt);
    return generateRecoverySecret();
  });

  safeHandle("lock:validateAndBurnRecoverySecret", async (evt, rawSecret: unknown): Promise<{ valid: boolean }> => {
    requireTrustedSecuritySender(evt);
    if (!currentLockStatus()) {
      fail("E_POLICY_DENIED", "Recovery reset is only available from the locked vault screen.");
    }
    if (typeof rawSecret !== "string") {
      fail("E_RECOVERY_CODE_INVALID", "Enter a valid recovery secret.");
    }
    const valid = await validateAndBurnRecoverySecret(rawSecret);
    return { valid };
  });

  safeHandle("lock:setPasswordAfterRecovery", async (evt, rawPassword: unknown): Promise<{ success: boolean }> => {
    requireTrustedSecuritySender(evt);
    if (!currentLockStatus()) {
      fail("E_POLICY_DENIED", "Recovery password reset is only available from the locked vault screen.");
    }
    const password = validateNewMasterPassword(rawPassword);
    if (!hasPendingRecoveryReset()) {
      fail("E_RECOVERY_CODE_INVALID", "Recovery password reset is not available right now.");
    }
    const success = await setPasswordAfterRecovery(password);
    if (!success) {
      fail("E_RECOVERY_CODE_INVALID", "Recovery password reset is not available right now.");
    }
    requirePasswordUnlockAfterRecoveryReset = true;
    locked = true;
    justUnlockedViaRecovery = false;
    return { success: true };
  });

  safeHandle("vault:migrateWithPassword", async (evt, rawPassword: unknown): Promise<boolean> => {
    requireTrustedSecuritySender(evt);
    const password = validateExistingMasterPassword(rawPassword);
    if (!migrationRequired() || requiresVaultPasswordSetup()) {
      fail("E_VAULT_MODE_INVALID", "Password-based vault migration is not available right now.");
    }

    const result = await unlockHardenedVaultWithPassword(password);
    if (result.result === "OK") {
      locked = false;
      return true;
    }
    if (result.result === "LOCKED") {
      fail("E_LOCKED", "Vault migration is temporarily locked. Try again later.");
    }
    return false;
  });

  safeHandle("vault:migrateSetPassword", async (evt, rawPassword: unknown): Promise<boolean> => {
    requireTrustedSecuritySender(evt);
    const password = validateNewMasterPassword(rawPassword);
    if (!migrationRequired() || !requiresVaultPasswordSetup()) {
      fail("E_VAULT_MODE_INVALID", "Password setup migration is not available right now.");
    }
    await initializeVaultWithPassword(password);
    locked = false;
    return true;
  });

  safeHandle("app:getSettings", (evt): AppSettings => {
    requireTrustedSecuritySender(evt);
    return loadSettings();
  });

  safeHandle("app:updateSettings", (evt, rawSettings: unknown): AppSettings => {
    const win = ensureUnlockedFromTrustedSender(evt);
    const settings = validateSettings(rawSettings);
    saveSettings(settings);
    if (!win.isDestroyed()) {
      win.setContentProtection(settings.privacyScreen);
      win.setAlwaysOnTop(settings.alwaysOnTop);
      win.webContents.send("window:alwaysOnTopChanged", settings.alwaysOnTop);
    }
    notifySettingsApplied(settings, win);
    return settings;
  });

  safeHandle("settings:setBaseMode", (evt, rawBaseMode: unknown): BaseModeId => {
    ensureUnlockedFromTrustedSender(evt);
    const settings = loadSettings();
    const baseMode = validateBaseMode(rawBaseMode);

    const nextSettings: AppSettings = {
      ...settings,
      baseMode,
      themeColor: baseMode === "amoled" ? "neutral" : settings.themeColor,
      accentOverride: baseMode === "amoled" ? "none" : settings.accentOverride,
    };
    saveSettings(nextSettings);
    notifySettingsApplied(nextSettings, null);
    return baseMode;
  });

  safeHandle("settings:setThemeColor", (evt, rawThemeColor: unknown): ThemeColorId => {
    ensureUnlockedFromTrustedSender(evt);
    const settings = loadSettings();
    if (settings.baseMode === "amoled") {
      if (settings.themeColor !== "neutral") {
        const nextSettings: AppSettings = {
          ...settings,
          themeColor: "neutral",
          accentOverride: "none",
        };
        saveSettings(nextSettings);
        notifySettingsApplied(nextSettings, null);
      }
      return "neutral";
    }

    const themeColor = validateThemeColor(rawThemeColor);
    const nextSettings: AppSettings = {
      ...settings,
      themeColor,
    };
    saveSettings(nextSettings);
    notifySettingsApplied(nextSettings, null);
    return themeColor;
  });

  safeHandle("settings:setAccentOverride", (evt, rawAccentOverride: unknown): AccentOverrideId => {
    ensureUnlockedFromTrustedSender(evt);
    const settings = loadSettings();
    if (settings.baseMode === "amoled") {
      if (settings.accentOverride !== "none") {
        const nextSettings: AppSettings = {
          ...settings,
          accentOverride: "none",
          themeColor: "neutral",
        };
        saveSettings(nextSettings);
        notifySettingsApplied(nextSettings, null);
      }
      return "none";
    }

    const accentOverride = validateAccentOverride(rawAccentOverride);
    const nextSettings: AppSettings = {
      ...settings,
      accentOverride,
    };
    saveSettings(nextSettings);
    notifySettingsApplied(nextSettings, null);
    return accentOverride;
  });

  // Backward-compatible aliases.
  safeHandle("settings:setBaseTheme", (evt, rawBaseTheme: unknown): BaseModeId => {
    ensureUnlockedFromTrustedSender(evt);
    const settings = loadSettings();
    const baseMode = validateBaseMode(rawBaseTheme);
    const nextSettings: AppSettings = {
      ...settings,
      baseMode,
      themeColor: baseMode === "amoled" ? "neutral" : settings.themeColor,
      accentOverride: baseMode === "amoled" ? "none" : settings.accentOverride,
    };
    saveSettings(nextSettings);
    notifySettingsApplied(nextSettings, null);
    return baseMode;
  });

  safeHandle("settings:setAccent", (evt, rawAccent: unknown): AccentOverrideId => {
    ensureUnlockedFromTrustedSender(evt);
    const settings = loadSettings();
    if (settings.baseMode === "amoled") {
      if (settings.accentOverride !== "none") {
        const nextSettings: AppSettings = {
          ...settings,
          accentOverride: "none",
          themeColor: "neutral",
        };
        saveSettings(nextSettings);
        notifySettingsApplied(nextSettings, null);
      }
      return "none";
    }

    const accentOverride = validateAccentOverride(rawAccent);
    const nextSettings: AppSettings = {
      ...settings,
      accentOverride,
    };
    saveSettings(nextSettings);
    notifySettingsApplied(nextSettings, null);
    return accentOverride;
  });

  safeHandle("settings:getStartWithSystem", (evt): boolean => {
    requireTrustedSecuritySender(evt);
    return loadSettings().startWithSystem === true;
  });

  safeHandle("settings:setStartWithSystem", (evt, rawEnabled: unknown): boolean => {
    ensureUnlockedFromTrustedSender(evt);
    const settings = loadSettings();
    const startWithSystem = validateStartWithSystem(rawEnabled);
    const nextSettings = { ...settings, startWithSystem };
    saveSettings(nextSettings);
    notifySettingsApplied(nextSettings, null);
    return startWithSystem;
  });

  safeHandle("settings:getRunInBackground", (evt): boolean => {
    requireTrustedSecuritySender(evt);
    return loadSettings().runInBackground !== false;
  });

  safeHandle("settings:setRunInBackground", (evt, rawEnabled: unknown): boolean => {
    ensureUnlockedFromTrustedSender(evt);
    const settings = loadSettings();
    const runInBackground = validateRunInBackground(rawEnabled);
    const nextSettings = { ...settings, runInBackground };
    saveSettings(nextSettings);
    notifySettingsApplied(nextSettings, null);
    return runInBackground;
  });

  safeHandle("settings:getAutoLockTimeout", (evt): number => {
    requireTrustedSecuritySender(evt);
    return loadSettings().autoLockSeconds;
  });

  safeHandle("settings:setAutoLockTimeout", (evt, rawSeconds: unknown): number => {
    ensureUnlockedFromTrustedSender(evt);
    const settings = loadSettings();
    const autoLockSeconds = validateAutoLockSeconds(rawSeconds);
    saveSettings({ ...settings, autoLockSeconds });
    return autoLockSeconds;
  });

  safeHandle("settings:getLockOnFocusLoss", (evt): boolean => {
    requireTrustedSecuritySender(evt);
    return loadSettings().lockOnFocusLoss;
  });

  safeHandle("settings:setLockOnFocusLoss", (evt, rawEnabled: unknown): boolean => {
    ensureUnlockedFromTrustedSender(evt);
    const settings = loadSettings();
    const lockOnFocusLoss = validateLockOnFocusLoss(rawEnabled);
    saveSettings({ ...settings, lockOnFocusLoss });
    return lockOnFocusLoss;
  });

  safeHandle("clipboard:clear", async (_evt, rawExpectedText: unknown): Promise<boolean> => {
    requireTrustedSecuritySender(_evt);
    const expectedText = typeof rawExpectedText === "string" ? rawExpectedText.trim() : "";
    if (!expectedText || expectedText.length > 256) {
      return false;
    }

    let currentText = "";
    try {
      currentText = clipboard.readText();
    } catch {
      return false;
    }

    if (currentText.trim() !== expectedText) {
      return false;
    }

    try {
      clipboard.clear();
    } catch {
      return false;
    }

    await clearWindowsClipboardHistory();

    return true;
  });

  safeHandle("totp:list", (evt): AccountMeta[] => {
    ensureUnlockedFromTrustedSender(evt);
    return loadRuntimeAccounts("totp:list").map(toMeta);
  });

  safeHandle("totp:reorder", (evt, rawIds: unknown): AccountMeta[] => {
    ensureUnlockedFromTrustedSender(evt);
    if (!Array.isArray(rawIds)) {
      fail("E_PAYLOAD_INVALID", "Could not reorder accounts. Please try again.");
    }

    const ids = rawIds.map((value) => validateString(value, "E_PAYLOAD_INVALID", "Could not reorder accounts. Please try again.", 128));
    const accounts = loadAccounts();
    if (ids.length !== accounts.length) {
      fail("E_PAYLOAD_INVALID", "Could not reorder accounts. Refresh and try again.");
    }

    const byId = new Map(accounts.map((account) => [account.id, account]));
    if (byId.size !== accounts.length || ids.some((id) => !byId.has(id))) {
      fail("E_PAYLOAD_INVALID", "Could not reorder accounts. Refresh and try again.");
    }

    const reordered = ids.map((id) => byId.get(id) as StoredTotpAccount);
    saveAccounts(reordered);
    return reordered.map(toMeta);
  });

  safeHandle("totp:scanFromScreen", async (evt): Promise<string | null> => {
    const trustedWindow = ensureUnlockedFromTrustedSender(evt);
    logDesktopDebug("ipc totp:scanFromScreen invoked");
    const parentWindow = trustedWindow;
    const { scanParentWindow, restoreWindow } = await prepareWindowForScreenScan(parentWindow);

    try {
      const scanResult = await scanQrFromScreen(scanParentWindow);
      if (scanResult.status === "cancelled") {
        logDesktopDebug("ipc totp:scanFromScreen empty result");
        return null;
      }

      if (scanResult.status === "no_qr") {
        fail("E_SCAN_NO_QR", "No QR code found in the selected area.");
      }

      const decoded = scanResult.text;

      if (isOtpauthUri(decoded)) {
        logDesktopDebug("ipc totp:scanFromScreen otpauth success", { length: decoded.length });
        return decoded;
      }

      fail("E_URI_INVALID", "This QR code does not contain a valid otpauth URI.");
    } finally {
      restoreWindow();
    }
  });

  safeHandle("totp:getCode", (evt, rawId: unknown): { code: string; remainingSeconds: number } | null => {
    ensureUnlockedFromTrustedSender(evt);
    const id = validateString(rawId, "E_PAYLOAD_INVALID", "Could not generate a code for that account. Please try again.", 128);
    const account = loadRuntimeAccounts("totp:codes").find((item) => item.id === id);
    if (!account) {
      return null;
    }
    const { code, remainingSeconds } = totpCodeSync(account.secretBase32, {
      algorithm: account.algorithm,
      digits: account.digits,
      period: account.period,
    });
    return { code, remainingSeconds };
  });

  safeHandle("totp:revealSecret", (evt, rawId: unknown): string => {
    ensureUnlockedFromTrustedSender(evt);
    requireSecuritySession(evt);
    const id = validateString(rawId, "E_PAYLOAD_INVALID", "Could not reveal that secret. Please try again.", 128);
    const account = loadRuntimeAccounts("totp:list").find((item) => item.id === id);
    if (!account) {
      fail("E_PAYLOAD_INVALID", "Could not find that account. Refresh and try again.");
    }
    return account.secretBase32;
  });

  safeHandle(
    "totp:getForEdit",
    (evt, rawId: unknown): { id: string; issuer: string; label: string; digits: 6 | 8; period: number; algorithm: Algorithm } => {
      ensureUnlockedFromTrustedSender(evt);
      const id = validateString(rawId, "E_PAYLOAD_INVALID", "Could not open account details. Please try again.", 128);
      const account = loadAccounts().find((item) => item.id === id);
      if (!account) {
        fail("E_PAYLOAD_INVALID", "Could not find that account. Refresh and try again.");
      }
      return toEditable(account);
    }
  );

  safeHandle("totp:update", (evt, rawId: unknown, rawPayload: unknown): AccountMeta => {
    ensureUnlockedFromTrustedSender(evt);

    const id = validateString(rawId, "E_PAYLOAD_INVALID", "Could not update account. Please try again.", 128);
    const payload = validatePayload(rawPayload);
    const accounts = loadAccounts();
    const index = accounts.findIndex((item) => item.id === id);
    if (index < 0) {
      fail("E_PAYLOAD_INVALID", "Could not find that account. Refresh and try again.");
    }

    const existing = accounts[index];
    const issuer = validateOptionalString(payload.issuer, "E_PAYLOAD_INVALID", "Issuer text is too long.").trim();
    const labelInput = validateOptionalString(payload.label, "E_PAYLOAD_INVALID", "Label text is too long.").trim();
    const next: StoredTotpAccount = {
      ...existing,
      issuer,
      label: labelInput || existing.label || "Account",
      digits: payload.digits === undefined ? existing.digits : validateDigits(payload.digits),
      period: payload.period === undefined ? existing.period : validatePeriod(payload.period),
      algorithm: payload.algorithm === undefined ? existing.algorithm : validateAlgorithm(payload.algorithm),
      secretBase32:
        readSecretInput(payload) === undefined || String(readSecretInput(payload)).trim() === ""
          ? existing.secretBase32
          : validateSecretBase32(readSecretInput(payload)),
    };

    accounts[index] = next;
    saveAccounts(accounts);
    return toMeta(next);
  });

  safeHandle("totp:addUri", (evt, rawUri: unknown): AccountMeta => {
    ensureUnlockedFromTrustedSender(evt);
    const uri = validateString(rawUri, "E_URI_INVALID", "Paste a valid TOTP URI that starts with otpauth://totp/.");
    const parsed = parseOtpauthUri(uri);
    const stored: StoredTotpAccount = { id: randomUUID(), ...parsed };
    const accounts = loadAccounts();
    accounts.push(stored);
    saveAccounts(accounts);
    return toMeta(stored);
  });

  safeHandle("totp:addManual", (evt, payload: unknown): AccountMeta => {
    ensureUnlockedFromTrustedSender(evt);
    const p = validatePayload(payload);
    const stored: StoredTotpAccount = {
      id: randomUUID(),
      issuer: validateOptionalString(p.issuer, "E_PAYLOAD_INVALID", "Issuer text is too long."),
      label: validateOptionalString(p.label, "E_PAYLOAD_INVALID", "Label text is too long.") || "Account",
      secretBase32: validateSecretBase32(readSecretInput(p)),
      digits: validateDigits(p.digits),
      period: validatePeriod(p.period),
      algorithm: validateAlgorithm(p.algorithm),
    };
    const accounts = loadAccounts();
    accounts.push(stored);
    saveAccounts(accounts);
    return toMeta(stored);
  });

  safeHandle("totp:delete", (evt, rawId: unknown): boolean => {
    ensureUnlockedFromTrustedSender(evt);
    const id = validateString(rawId, "E_PAYLOAD_INVALID", "Could not delete account. Please try again.", 128);
    const accounts = loadAccounts().filter((a) => a.id !== id);
    saveAccounts(accounts);
    return true;
  });

  safeHandle("totp:codes", (evt): CodeResult[] => {
    ensureUnlockedFromTrustedSender(evt);
    const results: CodeResult[] = [];
    for (const account of loadRuntimeAccounts("totp:codes")) {
      try {
        const { code, remainingSeconds } = totpCodeSync(account.secretBase32, {
          algorithm: account.algorithm,
          digits: account.digits,
          period: account.period,
        });
        results.push({ id: account.id, code, remainingSeconds });
      } catch (error) {
        logDesktopDebug("totp code generation failed", {
          id: account.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  });

  safeHandle("backup:export", async (evt, rawPassphrase: unknown): Promise<boolean> => {
    const win = ensureUnlockedFromTrustedSender(evt);
    requireSecuritySession(evt);
    const passphrase = validateExportPassphrase(rawPassphrase);
    const result = await dialog.showSaveDialog(win, {
      title: "Export Encrypted Backup",
      defaultPath: "authenticator-backup.enc.json",
      filters: [{ name: "Encrypted Backup", extensions: ["json"] }],
    });
    ensureUnlockedFromTrustedSender(evt);
    if (result.canceled || !result.filePath) return false;
    if (!(await confirmSyncedFolderExport(win, result.filePath))) {
      return false;
    }

    const envelope = await encryptBackup(loadAccounts(), passphrase);
    try {
      await writeFile(result.filePath, JSON.stringify(envelope), "utf8");
    } catch {
      fail("E_BACKUP_FILE_INVALID", "Could not save backup to that location. Choose a writable folder and try again.");
    }
    return true;
  });

  safeHandle("backup:import", async (evt, rawPassphrase: unknown, rawMode: unknown): Promise<boolean> => {
    const win = ensureUnlockedFromTrustedSender(evt);
    const passphrase = validateBackupPassphrase(rawPassphrase);
    const mode = validateImportMode(rawMode);
    requireSecuritySession(evt);

    const result = await dialog.showOpenDialog(win, {
      title: "Import Encrypted Backup",
      properties: ["openFile"],
      filters: [{ name: "Encrypted Backup", extensions: ["json"] }],
    });
    ensureUnlockedFromTrustedSender(evt);

    if (result.canceled || result.filePaths.length === 0) return false;

    let content = "";
    try {
      content = await readFile(result.filePaths[0], "utf8");
    } catch {
      fail("E_BACKUP_FILE_INVALID", "Could not read that backup file. Choose another file and try again.");
    }

    let envelope: EncryptedBackup;
    try {
      envelope = validateEncryptedBackupEnvelope(JSON.parse(content));
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      fail("E_BACKUP_FILE_INVALID", "That file is not valid JSON. Select an encrypted backup file.");
    }

    let decrypted: Awaited<ReturnType<typeof decryptBackup>>;
    try {
      decrypted = await decryptBackup(envelope, passphrase);
    } catch {
      fail("E_BACKUP_DECRYPT_FAILED", "Could not decrypt backup. Check your passphrase and try again.");
    }

    const existing = loadAccounts();

    if (mode === "replace") {
      saveAccounts(decrypted.accounts);
      return true;
    }

    const byId = new Map(existing.map((a) => [a.id, a] as const));
    for (const account of decrypted.accounts) {
      byId.set(account.id, account);
    }
    saveAccounts(Array.from(byId.values()));
    return true;
  });
}
