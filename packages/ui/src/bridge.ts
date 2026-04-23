import type { AccountMeta, CodeResult } from "@authenticator/core";

export type LockMethod = "none" | "swipe" | "pin4" | "pin6" | "password" | "pattern" | "passkey";
export type LockMethodKind = "none" | "swipe" | "pin" | "password" | "pattern" | "passkey";
export type SecureLockMethodKind = "pin" | "password" | "pattern" | "passkey";

export type LockMethodsConfig = {
  primaryLockMethod: LockMethodKind;
  secondaryLockMethod: SecureLockMethodKind | null;
};
export type CredentialType = "pin" | "password" | "pattern";

export type QuickUnlockConfig = {
  windowsHello: boolean;
  passkey: boolean;
};

export type VaultProtectionStatus = {
  vaultFormat?: "vault-v4";
  requiresMasterPassword: boolean;
  hardenedSessionUnlocked: boolean;
  masterPasswordLockState: {
    failedCount: number;
    lockUntilEpochMs: number;
  };
  recoveryGenerated?: boolean;
  biometricEnrolled?: boolean;
  migrationRequired?: boolean;
  requiresPasswordSetup?: boolean;
  justUnlockedViaRecovery?: boolean;
  appLockRequired: boolean;
};

export type VaultUnlockResult =
  | { result: "OK"; appLockRequired: boolean }
  | { result: "INCORRECT"; attemptsUsed: number }
  | { result: "LOCKED"; lockedUntil: number; attemptsUsed: number };

export type StepUpVerifyPayload =
  | {
      method: CredentialType;
      input: string;
    }
  | {
      method: "biometric";
    }
  | {
      method: "passkey";
      challengeId: string;
      credentialId: string;
      clientDataJSON: number[];
      authenticatorData: number[];
      signature: number[];
    };

export type PasskeySummary = {
  id: string;
  name: string;
  credentialId: string;
};

export type PasskeyRegistrationPayload = {
  challengeId: string;
  credentialId: string;
  attestationObject: string;
  clientDataJSON: string;
  name?: string;
};

export const BASE_MODE_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "amoled", label: "Amoled" },
] as const;

export type BaseModeId = (typeof BASE_MODE_OPTIONS)[number]["value"];

export const THEME_COLOR_OPTIONS = [
  { value: "neutral", label: "Neutral" },
  { value: "gray", label: "Gray" },
  { value: "slate", label: "Slate" },
  { value: "black", label: "Black" },
  { value: "white", label: "White" },
  { value: "lightGray", label: "Light Gray" },
  { value: "red", label: "Red" },
  { value: "rose", label: "Rose" },
  { value: "pink", label: "Pink" },
  { value: "orange", label: "Orange" },
  { value: "amber", label: "Amber" },
  { value: "yellow", label: "Yellow" },
  { value: "lime", label: "Lime" },
  { value: "green", label: "Green" },
  { value: "emerald", label: "Emerald" },
  { value: "teal", label: "Teal" },
  { value: "cyan", label: "Cyan" },
  { value: "lightBlue", label: "Light Blue" },
  { value: "sky", label: "Sky" },
  { value: "blue", label: "Blue" },
  { value: "indigo", label: "Indigo" },
  { value: "violet", label: "Violet" },
  { value: "purple", label: "Purple" },
] as const;

export type ThemeColorId = (typeof THEME_COLOR_OPTIONS)[number]["value"];

export const ACCENT_OVERRIDE_OPTIONS = [
  { value: "theme", label: "Theme default" },
  { value: "none", label: "None" },
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "indigo", label: "Indigo" },
  { value: "violet", label: "Violet" },
  { value: "purple", label: "Purple" },
  { value: "pink", label: "Pink" },
  { value: "teal", label: "Teal" },
  { value: "cyan", label: "Cyan" },
  { value: "lime", label: "Lime" },
  { value: "gray", label: "Gray" },
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
  { value: "lightGray", label: "Light Gray" },
  { value: "lightBlue", label: "Light Blue" },
] as const;

export type AccentOverrideId = (typeof ACCENT_OVERRIDE_OPTIONS)[number]["value"];

// Backward-compatible aliases for in-flight refactors.
export const BASE_THEME_OPTIONS = BASE_MODE_OPTIONS;
export type BaseThemeId = BaseModeId;
export const ACCENT_OPTIONS = ACCENT_OVERRIDE_OPTIONS;
export type AccentId = AccentOverrideId;

export const MOTION_MODE_OPTIONS = [
  { value: "system", label: "System" },
  { value: "full", label: "Full" },
  { value: "reduced", label: "Reduced" },
  { value: "off", label: "Off" },
] as const;

export type MotionMode = (typeof MOTION_MODE_OPTIONS)[number]["value"];

export const TRAY_MENU_STYLE_OPTIONS = [
  { value: "native", label: "Native (Recommended)" },
  { value: "themed", label: "Custom themed" },
] as const;

export type TrayMenuStyle = (typeof TRAY_MENU_STYLE_OPTIONS)[number]["value"];

export const TRAY_MENU_ANIMATION_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "reduced", label: "Reduced" },
] as const;

export type TrayMenuAnimations = (typeof TRAY_MENU_ANIMATION_OPTIONS)[number]["value"];

export const TRAY_ICON_STYLE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export type TrayIconStyle = (typeof TRAY_ICON_STYLE_OPTIONS)[number]["value"];

export type AccountsLayoutMode = "auto" | "list" | "grid";
export type AccountsGridColumns = "auto" | 1 | 2 | 3;
export type AccountsDensity = "comfortable" | "compact";

export const DEFAULT_BASE_MODE_ID: BaseModeId = "dark";
export const DEFAULT_THEME_COLOR_ID: ThemeColorId = "neutral";
export const DEFAULT_ACCENT_OVERRIDE_ID: AccentOverrideId = "none";
export const DEFAULT_MOTION_MODE: MotionMode = "system";
export const DEFAULT_PAUSE_WHEN_BACKGROUND = true;
export const DEFAULT_CLIPBOARD_SAFETY_ENABLED = true;
export const DEFAULT_RUN_IN_BACKGROUND = true;
export const DEFAULT_START_WITH_SYSTEM = false;
export const DEFAULT_TRAY_MENU_STYLE: TrayMenuStyle = "native";
export const DEFAULT_TRAY_MENU_ANIMATIONS: TrayMenuAnimations = "off";
export const DEFAULT_TRAY_MENU_THEME_SYNC = true;
export const DEFAULT_TRAY_ICON_STYLE: TrayIconStyle = "auto";

const BASE_MODE_LABEL_BY_ID: Record<BaseModeId, string> = {
  light: "Light",
  dark: "Dark",
  amoled: "Amoled",
};

const THEME_COLOR_LABEL_BY_ID: Record<ThemeColorId, string> = {
  neutral: "Neutral",
  gray: "Gray",
  slate: "Slate",
  black: "Black",
  white: "White",
  lightGray: "Light Gray",
  red: "Red",
  rose: "Rose",
  pink: "Pink",
  orange: "Orange",
  amber: "Amber",
  yellow: "Yellow",
  lime: "Lime",
  green: "Green",
  emerald: "Emerald",
  teal: "Teal",
  cyan: "Cyan",
  lightBlue: "Light Blue",
  sky: "Sky",
  blue: "Blue",
  indigo: "Indigo",
  violet: "Violet",
  purple: "Purple",
};

const ACCENT_OVERRIDE_LABEL_BY_ID: Record<AccentOverrideId, string> = {
  theme: "Theme default",
  none: "None",
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  indigo: "Indigo",
  violet: "Violet",
  purple: "Purple",
  pink: "Pink",
  teal: "Teal",
  cyan: "Cyan",
  lime: "Lime",
  gray: "Gray",
  white: "White",
  black: "Black",
  lightGray: "Light Gray",
  lightBlue: "Light Blue",
};

const MOTION_MODE_LABEL_BY_ID: Record<MotionMode, string> = {
  system: "System",
  full: "Full",
  reduced: "Reduced",
  off: "Off",
};

function isBaseModeId(value: unknown): value is BaseModeId {
  return value === "light" || value === "dark" || value === "amoled";
}

function isThemeColorId(value: unknown): value is ThemeColorId {
  return THEME_COLOR_OPTIONS.some((option) => option.value === value);
}

function isAccentOverrideId(value: unknown): value is AccentOverrideId {
  return (
    value === "theme" ||
    value === "none" ||
    value === "red" ||
    value === "orange" ||
    value === "yellow" ||
    value === "green" ||
    value === "blue" ||
    value === "indigo" ||
    value === "violet" ||
    value === "purple" ||
    value === "pink" ||
    value === "teal" ||
    value === "cyan" ||
    value === "lime" ||
    value === "gray" ||
    value === "white" ||
    value === "black" ||
    value === "lightGray" ||
    value === "lightBlue"
  );
}

function isMotionMode(value: unknown): value is MotionMode {
  return value === "system" || value === "full" || value === "reduced" || value === "off";
}

function isTrayMenuStyle(value: unknown): value is TrayMenuStyle {
  return value === "native" || value === "themed";
}

function isTrayMenuAnimations(value: unknown): value is TrayMenuAnimations {
  return value === "off" || value === "reduced";
}

function isTrayIconStyle(value: unknown): value is TrayIconStyle {
  return value === "auto" || value === "light" || value === "dark";
}

export function normalizeBaseModeId(value: unknown): BaseModeId {
  return isBaseModeId(value) ? value : DEFAULT_BASE_MODE_ID;
}

export function normalizeThemeColorId(value: unknown): ThemeColorId {
  return isThemeColorId(value) ? value : DEFAULT_THEME_COLOR_ID;
}

export function normalizeAccentOverrideId(value: unknown): AccentOverrideId {
  return isAccentOverrideId(value) ? value : DEFAULT_ACCENT_OVERRIDE_ID;
}

export function normalizeMotionMode(value: unknown): MotionMode {
  return isMotionMode(value) ? value : DEFAULT_MOTION_MODE;
}

export function normalizeTrayMenuStyle(value: unknown): TrayMenuStyle {
  return isTrayMenuStyle(value) ? value : DEFAULT_TRAY_MENU_STYLE;
}

export function normalizeTrayMenuAnimations(value: unknown): TrayMenuAnimations {
  return isTrayMenuAnimations(value) ? value : DEFAULT_TRAY_MENU_ANIMATIONS;
}

export function normalizeTrayIconStyle(value: unknown): TrayIconStyle {
  return isTrayIconStyle(value) ? value : DEFAULT_TRAY_ICON_STYLE;
}

export function baseModeLabel(baseMode: BaseModeId): string {
  return BASE_MODE_LABEL_BY_ID[baseMode] ?? BASE_MODE_LABEL_BY_ID[DEFAULT_BASE_MODE_ID];
}

export function themeColorLabel(themeColor: ThemeColorId): string {
  return THEME_COLOR_LABEL_BY_ID[themeColor] ?? THEME_COLOR_LABEL_BY_ID[DEFAULT_THEME_COLOR_ID];
}

export function accentOverrideLabel(accentOverride: AccentOverrideId): string {
  return ACCENT_OVERRIDE_LABEL_BY_ID[accentOverride] ?? ACCENT_OVERRIDE_LABEL_BY_ID[DEFAULT_ACCENT_OVERRIDE_ID];
}

// Backward-compatible aliases for in-flight refactors.
export const DEFAULT_BASE_THEME_ID = DEFAULT_BASE_MODE_ID;
export const DEFAULT_ACCENT_ID = DEFAULT_ACCENT_OVERRIDE_ID;
export const normalizeBaseThemeId = normalizeBaseModeId;
export const normalizeAccentId = normalizeAccentOverrideId;
export const baseThemeLabel = baseModeLabel;
export const accentLabel = accentOverrideLabel;

export function motionModeLabel(mode: MotionMode): string {
  return MOTION_MODE_LABEL_BY_ID[mode] ?? MOTION_MODE_LABEL_BY_ID[DEFAULT_MOTION_MODE];
}

export interface AppSettings {
  defaultDigits: 6 | 8;
  defaultPeriod: number;
  hideLabelsOnSmall: boolean;
  privacyScreen: boolean;
  clipboardSafetyEnabled: boolean;
  runInBackground: boolean;
  startWithSystem: boolean;
  trayMenuStyle: TrayMenuStyle;
  trayMenuAnimations: TrayMenuAnimations;
  trayMenuThemeSync: boolean;
  trayIconStyle: TrayIconStyle;
  alwaysOnTop: boolean;
  baseMode: BaseModeId;
  themeColor: ThemeColorId;
  accentOverride: AccentOverrideId;
  motionMode: MotionMode;
  pauseWhenBackground: boolean;
  accountsLayoutMode: AccountsLayoutMode;
  accountsGridColumns: AccountsGridColumns;
  accountsDensity: AccountsDensity;
  biometricEnabled: boolean;
  autoLockSeconds: number;
  lockOnFocusLoss: boolean;
  hasCompletedSafetySetup: boolean;
  hasSkippedSafetySetup: boolean;
  lastSafetySetupReminderAt?: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultDigits: 6,
  defaultPeriod: 30,
  hideLabelsOnSmall: false,
  privacyScreen: true,
  clipboardSafetyEnabled: DEFAULT_CLIPBOARD_SAFETY_ENABLED,
  runInBackground: DEFAULT_RUN_IN_BACKGROUND,
  startWithSystem: DEFAULT_START_WITH_SYSTEM,
  trayMenuStyle: DEFAULT_TRAY_MENU_STYLE,
  trayMenuAnimations: DEFAULT_TRAY_MENU_ANIMATIONS,
  trayMenuThemeSync: DEFAULT_TRAY_MENU_THEME_SYNC,
  trayIconStyle: DEFAULT_TRAY_ICON_STYLE,
  alwaysOnTop: false,
  baseMode: DEFAULT_BASE_MODE_ID,
  themeColor: DEFAULT_THEME_COLOR_ID,
  accentOverride: DEFAULT_ACCENT_OVERRIDE_ID,
  motionMode: DEFAULT_MOTION_MODE,
  pauseWhenBackground: DEFAULT_PAUSE_WHEN_BACKGROUND,
  accountsLayoutMode: "auto",
  accountsGridColumns: "auto",
  accountsDensity: "comfortable",
  biometricEnabled: true,
  autoLockSeconds: 300,
  lockOnFocusLoss: false,
  hasCompletedSafetySetup: false,
  hasSkippedSafetySetup: false,
  lastSafetySetupReminderAt: undefined,
};

function normalizeAccountsLayoutMode(value: unknown): AccountsLayoutMode {
  if (value === "list") return "list";
  if (value === "grid") return "grid";
  return "auto";
}

function normalizeAccountsGridColumns(value: unknown): AccountsGridColumns {
  if (value === 1 || value === 2 || value === 3) return value;
  return "auto";
}

function normalizeAccountsDensity(value: unknown): AccountsDensity {
  if (value === "compact") return "compact";
  return "comfortable";
}

function normalizeSafetySetupReminderAt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

export interface EditableAccount {
  id: string;
  issuer: string;
  label: string;
  digits: 6 | 8;
  period: number;
  algorithm: "SHA1" | "SHA256" | "SHA512";
}

export interface UpdateAccountPayload {
  issuer: string;
  label: string;
  digits: 6 | 8;
  period: number;
  algorithm: "SHA1" | "SHA256" | "SHA512";
  secret?: string;
}

export interface ManualPayload {
  issuer: string;
  label: string;
  secret: string;
  digits: 6 | 8;
  period: number;
  algorithm: "SHA1" | "SHA256" | "SHA512";
}

export interface TotpCodePayload {
  code: string;
  remainingSeconds: number;
}

export interface LockApi {
  getMethod(): Promise<string>;
  getStatus?(): Promise<boolean>;
  getMethodsConfig?(): Promise<LockMethodsConfig>;
  setMethod(method: string): Promise<void>;
  setMethodsConfig?(config: LockMethodsConfig): Promise<void>;
  getQuickUnlock(): Promise<QuickUnlockConfig>;
  setQuickUnlock(config: QuickUnlockConfig): Promise<void>;
  setCredential(type: string, value: string): Promise<void>;
  verify(type: string, input: string): Promise<LockVerifyResult>;
  getLockState?(): Promise<{ failedCount: number; lockUntilEpochMs: number }>;
  hasCredential(type: string): Promise<boolean>;
  clearCredential(type: string): Promise<void>;
  resetAppLock(): Promise<boolean>;
  lock(): Promise<void>;
  biometricAvailable(): Promise<boolean>;
  promptBiometric(): Promise<boolean>;
  validateAndBurnRecoverySecret?(secret: string): Promise<{ valid: boolean }>;
  setPasswordAfterRecovery?(password: string): Promise<{ success: boolean }>;
  openSecuritySession?(): Promise<boolean | void>;
  closeSecuritySession?(): Promise<boolean | void>;
  onShowLockScreen(cb: () => void): (() => void) | void;
  getPinDigits?(): Promise<4 | 6>;
  stepUpGetChallenge?(): Promise<{ challengeId: string; challenge: number[] }>;
  stepUpVerify?(payload: StepUpVerifyPayload): Promise<LockVerifyResult>;
  passkeyGetChallenge(): Promise<{ challengeId: string; challenge: number[] }>;
  passkeyGetCredentialId(): Promise<string | null>;
  passkeyListCredentials(): Promise<PasskeySummary[]>;
  passkeySaveCredential(payload: PasskeyRegistrationPayload): Promise<boolean>;
  passkeyRenameCredential(id: string, name: string): Promise<boolean>;
  passkeyRemoveCredential(id: string): Promise<boolean>;
  passkeyVerifyAssertion(args: {
    challengeId: string;
    credentialId: string;
    clientDataJSON: number[];
    authenticatorData: number[];
    signature: number[];
  }): Promise<boolean>;
  passkeyClearCredential(): Promise<void>;
}

export type LockVerifyResult =
  | { result: "OK" }
  | { result: "INCORRECT"; attemptsUsed: number }
  | { result: "LOCKED"; lockedUntil: number; attemptsUsed: number; disabled?: boolean };

export interface Bridge {
  lockAPI: LockApi;
  getSettings(): Promise<AppSettings>;
  updateSettings(next: AppSettings): Promise<AppSettings>;
  getVaultProtectionStatus?(): Promise<VaultProtectionStatus>;
  generateRecoverySecret?(): Promise<string>;
  enrollBiometricUnlock?(): Promise<VaultProtectionStatus>;
  removeBiometricUnlock?(): Promise<VaultProtectionStatus>;
  migrateWithPassword?(password: string): Promise<boolean>;
  migrateSetPassword?(password: string): Promise<boolean>;
  setBaseMode?(baseMode: BaseModeId): Promise<BaseModeId>;
  setThemeColor?(themeColor: ThemeColorId): Promise<ThemeColorId>;
  setAccentOverride?(accentOverride: AccentOverrideId): Promise<AccentOverrideId>;
  // Backward-compatible aliases.
  setBaseTheme?(baseTheme: BaseModeId): Promise<BaseModeId>;
  setAccent?(accent: AccentOverrideId): Promise<AccentOverrideId>;
  getAutoLockTimeout?(): Promise<number>;
  setAutoLockTimeout?(seconds: number): Promise<number>;
  getLockOnFocusLoss?(): Promise<boolean>;
  setLockOnFocusLoss?(enabled: boolean): Promise<boolean>;
  exportBackup(passphrase: string): Promise<boolean>;
  importBackup(passphrase: string, mode: "merge" | "replace"): Promise<boolean>;
  list(): Promise<AccountMeta[]>;
  reorderAccounts?(ids: string[]): Promise<AccountMeta[]>;
  getAccountForEdit(id: string): Promise<EditableAccount>;
  updateAccount(id: string, payload: UpdateAccountPayload): Promise<AccountMeta>;
  addUri(uri: string): Promise<AccountMeta>;
  addManual(payload: ManualPayload): Promise<AccountMeta>;
  del(id: string): Promise<boolean>;
  getTotpCode?(id: string): Promise<TotpCodePayload | null>;
  revealSecret?(id: string): Promise<string>;
  scanFromScreen?(): Promise<string | null>;
  codes(): Promise<CodeResult[]>;
  scanQr?(): Promise<string | null>;
  clearClipboard?(expectedText: string): Promise<boolean>;
}

function authApi(): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return ((window as any).authAPI ?? {}) as Record<string, (...args: unknown[]) => Promise<unknown>>;
}

function appApi(): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return ((window as any).appAPI ?? {}) as Record<string, (...args: unknown[]) => Promise<unknown>>;
}

function lockApi(): Record<string, (...args: unknown[]) => Promise<unknown> | unknown> {
  return ((window as any).lockAPI ?? {}) as Record<string, (...args: unknown[]) => Promise<unknown> | unknown>;
}

function rethrowKnownBridgeError(error: unknown): void {
  if (!error || typeof error !== "object") return;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code.trim()) {
    throw error;
  }
}

function maybeThrowMissingHandlerRestartError(error: unknown, channel: string, message: string): void {
  if (!(error instanceof Error)) return;
  if (!error.message.includes(`No handler registered for '${channel}'`)) {
    return;
  }
  throw {
    name: "AppError",
    code: "E_APP_RESTART_REQUIRED",
    message,
  };
}

function clipboardApi(): Record<string, (...args: unknown[]) => Promise<unknown>> {
  return ((window as any).clipboardAPI ?? {}) as Record<string, (...args: unknown[]) => Promise<unknown>>;
}

function normalizeLockMethod(value: unknown): LockMethod {
  if (value === "none") return "none";
  if (value === "swipe") return "swipe";
  if (value === "pin4") return "pin4";
  if (value === "pin6") return "pin6";
  if (value === "password") return "password";
  if (value === "pattern") return "pattern";
  if (value === "passkey") return "passkey";
  if (value === "pin") return "pin4";
  return "none";
}

function normalizeLockMethodKind(value: unknown): LockMethodKind | null {
  if (value === "none") return "none";
  if (value === "swipe") return "swipe";
  if (value === "pin" || value === "pin4" || value === "pin6") return "pin";
  if (value === "password") return "password";
  if (value === "pattern") return "pattern";
  if (value === "passkey") return "passkey";
  return null;
}

function isSecureLockMethodKind(value: LockMethodKind | null): value is SecureLockMethodKind {
  return value === "pin" || value === "password" || value === "pattern" || value === "passkey";
}

function normalizeLockMethodsConfig(value: unknown): LockMethodsConfig {
  if (!value || typeof value !== "object") {
    return { primaryLockMethod: "none", secondaryLockMethod: null };
  }

  const payload = value as { primaryLockMethod?: unknown; secondaryLockMethod?: unknown };
  const primary = normalizeLockMethodKind(payload.primaryLockMethod) ?? "none";
  const candidateSecondary = normalizeLockMethodKind(payload.secondaryLockMethod);
  let secondary: SecureLockMethodKind | null = isSecureLockMethodKind(candidateSecondary) ? candidateSecondary : null;

  if (primary === "none" || primary === "swipe") {
    secondary = null;
  }

  if (secondary === primary) {
    secondary = null;
  }

  return {
    primaryLockMethod: primary,
    secondaryLockMethod: secondary,
  };
}

function normalizeAutoLockSeconds(value: unknown): number {
  if (value === 0) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 15 || value > 86400) {
    return DEFAULT_SETTINGS.autoLockSeconds;
  }
  return value;
}

function normalizeVaultProtectionStatus(value: unknown): VaultProtectionStatus {
  if (!value || typeof value !== "object") {
    return {
      vaultFormat: "vault-v4",
      requiresMasterPassword: false,
      hardenedSessionUnlocked: true,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      recoveryGenerated: false,
      biometricEnrolled: false,
      migrationRequired: false,
      requiresPasswordSetup: false,
      justUnlockedViaRecovery: false,
      appLockRequired: false,
    };
  }

  const payload = value as {
    vaultFormat?: unknown;
    mode?: unknown;
    requiresMasterPassword?: unknown;
    hardenedSessionUnlocked?: unknown;
    masterPasswordLockState?: unknown;
    recoveryGenerated?: unknown;
    biometricEnrolled?: unknown;
    migrationRequired?: unknown;
    requiresPasswordSetup?: unknown;
    justUnlockedViaRecovery?: unknown;
    appLockRequired?: unknown;
  };
  const lockStatePayload =
    payload.masterPasswordLockState && typeof payload.masterPasswordLockState === "object"
      ? (payload.masterPasswordLockState as { failedCount?: unknown; lockUntilEpochMs?: unknown })
      : {};

  return {
    vaultFormat: payload.vaultFormat === "vault-v4" || payload.mode === "vault-v4" ? "vault-v4" : "vault-v4",
    requiresMasterPassword: payload.requiresMasterPassword === true,
    hardenedSessionUnlocked: payload.hardenedSessionUnlocked !== false,
    masterPasswordLockState: {
      failedCount:
        typeof lockStatePayload.failedCount === "number" && Number.isInteger(lockStatePayload.failedCount) && lockStatePayload.failedCount > 0
          ? lockStatePayload.failedCount
          : 0,
      lockUntilEpochMs:
        typeof lockStatePayload.lockUntilEpochMs === "number" && Number.isFinite(lockStatePayload.lockUntilEpochMs) && lockStatePayload.lockUntilEpochMs > 0
          ? lockStatePayload.lockUntilEpochMs
          : 0,
    },
    recoveryGenerated: payload.recoveryGenerated === true,
    biometricEnrolled: payload.biometricEnrolled === true,
    migrationRequired: payload.migrationRequired === true,
    requiresPasswordSetup: payload.requiresPasswordSetup === true,
    justUnlockedViaRecovery: payload.justUnlockedViaRecovery === true,
    appLockRequired: payload.appLockRequired === true,
  };
}

function isDevRuntime(): boolean {
  if (typeof window !== "undefined") {
    return /localhost|127\.0\.0\.1/.test(window.location.host);
  }
  return false;
}

function normalizeAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const payload = value as Partial<AppSettings> & {
    baseMode?: unknown;
    themeColor?: unknown;
    accentOverride?: unknown;
    baseTheme?: unknown;
    accent?: unknown;
    motionMode?: unknown;
    pauseWhenBackground?: unknown;
    clipboardSafetyEnabled?: unknown;
    runInBackground?: unknown;
    startWithSystem?: unknown;
    trayMenuStyle?: unknown;
    trayMenuAnimations?: unknown;
    trayMenuThemeSync?: unknown;
    trayIconStyle?: unknown;
    hasCompletedSafetySetup?: unknown;
    hasSkippedSafetySetup?: unknown;
    lastSafetySetupReminderAt?: unknown;
  };
  const resolvedBaseMode = normalizeBaseModeId(payload.baseMode ?? payload.baseTheme);
  const resolvedThemeColor = normalizeThemeColorId(payload.themeColor);
  const resolvedAccentOverride = normalizeAccentOverrideId(payload.accentOverride ?? payload.accent);
  const effectiveThemeColor = resolvedBaseMode === "amoled" ? "neutral" : resolvedThemeColor;
  const effectiveAccentOverride = resolvedBaseMode === "amoled" ? "none" : resolvedAccentOverride;
  const resolvedMotionMode = normalizeMotionMode(payload.motionMode);
  const resolvedPauseWhenBackground = payload.pauseWhenBackground !== false;
  const resolvedClipboardSafetyEnabled = payload.clipboardSafetyEnabled !== false;
  const resolvedRunInBackground = payload.runInBackground !== false;
  const resolvedStartWithSystem = payload.startWithSystem === true;
  const resolvedTrayMenuStyle = normalizeTrayMenuStyle(payload.trayMenuStyle);
  const resolvedTrayMenuAnimations = normalizeTrayMenuAnimations(payload.trayMenuAnimations);
  const resolvedTrayMenuThemeSync = payload.trayMenuThemeSync !== false;
  const resolvedTrayIconStyle = normalizeTrayIconStyle(payload.trayIconStyle);
  const resolvedHasCompletedSafetySetup = payload.hasCompletedSafetySetup === true;
  const resolvedHasSkippedSafetySetup = resolvedHasCompletedSafetySetup ? false : payload.hasSkippedSafetySetup === true;
  const resolvedLastSafetySetupReminderAt = normalizeSafetySetupReminderAt(payload.lastSafetySetupReminderAt);

  if (isDevRuntime()) {
    if ((payload.baseMode !== undefined && payload.baseMode !== resolvedBaseMode) || (payload.baseTheme !== undefined && payload.baseTheme !== resolvedBaseMode)) {
      console.warn("[theme] invalid base mode, defaulting", {
        received: payload.baseMode ?? payload.baseTheme,
        resolved: resolvedBaseMode,
      });
    }
    if (payload.themeColor !== undefined && (payload.themeColor !== resolvedThemeColor || effectiveThemeColor !== resolvedThemeColor)) {
      console.warn("[theme] invalid theme color or amoled override", {
        received: payload.themeColor,
        resolved: effectiveThemeColor,
        baseMode: resolvedBaseMode,
      });
    }
    if ((payload.accentOverride !== undefined || payload.accent !== undefined) && effectiveAccentOverride !== resolvedAccentOverride) {
      console.warn("[theme] invalid accent override or amoled override", {
        received: payload.accentOverride ?? payload.accent,
        resolved: effectiveAccentOverride,
        baseMode: resolvedBaseMode,
      });
    }
    if (payload.motionMode !== undefined && payload.motionMode !== resolvedMotionMode) {
      console.warn("[motion] invalid motion mode, defaulting", {
        received: payload.motionMode,
        resolved: resolvedMotionMode,
      });
    }
    if (payload.pauseWhenBackground !== undefined && typeof payload.pauseWhenBackground !== "boolean") {
      console.warn("[motion] invalid pauseWhenBackground value, defaulting", {
        received: payload.pauseWhenBackground,
        resolved: resolvedPauseWhenBackground,
      });
    }
    if (payload.clipboardSafetyEnabled !== undefined && typeof payload.clipboardSafetyEnabled !== "boolean") {
      console.warn("[security] invalid clipboardSafetyEnabled value, defaulting", {
        received: payload.clipboardSafetyEnabled,
        resolved: resolvedClipboardSafetyEnabled,
      });
    }
    if (payload.runInBackground !== undefined && typeof payload.runInBackground !== "boolean") {
      console.warn("[runtime] invalid runInBackground value, defaulting", {
        received: payload.runInBackground,
        resolved: resolvedRunInBackground,
      });
    }
    if (payload.startWithSystem !== undefined && typeof payload.startWithSystem !== "boolean") {
      console.warn("[runtime] invalid startWithSystem value, defaulting", {
        received: payload.startWithSystem,
        resolved: resolvedStartWithSystem,
      });
    }
    if (payload.trayMenuStyle !== undefined && payload.trayMenuStyle !== resolvedTrayMenuStyle) {
      console.warn("[tray] invalid trayMenuStyle value, defaulting", {
        received: payload.trayMenuStyle,
        resolved: resolvedTrayMenuStyle,
      });
    }
    if (payload.trayMenuAnimations !== undefined && payload.trayMenuAnimations !== resolvedTrayMenuAnimations) {
      console.warn("[tray] invalid trayMenuAnimations value, defaulting", {
        received: payload.trayMenuAnimations,
        resolved: resolvedTrayMenuAnimations,
      });
    }
    if (payload.trayMenuThemeSync !== undefined && typeof payload.trayMenuThemeSync !== "boolean") {
      console.warn("[tray] invalid trayMenuThemeSync value, defaulting", {
        received: payload.trayMenuThemeSync,
        resolved: resolvedTrayMenuThemeSync,
      });
    }
    if (payload.trayIconStyle !== undefined && payload.trayIconStyle !== resolvedTrayIconStyle) {
      console.warn("[tray] invalid trayIconStyle value, defaulting", {
        received: payload.trayIconStyle,
        resolved: resolvedTrayIconStyle,
      });
    }
  }

  return {
    defaultDigits: payload.defaultDigits === 8 ? 8 : 6,
    defaultPeriod:
      typeof payload.defaultPeriod === "number" && Number.isInteger(payload.defaultPeriod) && payload.defaultPeriod >= 1 && payload.defaultPeriod <= 300
        ? payload.defaultPeriod
        : DEFAULT_SETTINGS.defaultPeriod,
    hideLabelsOnSmall: !!payload.hideLabelsOnSmall,
    privacyScreen: payload.privacyScreen !== false,
    clipboardSafetyEnabled: resolvedClipboardSafetyEnabled,
    runInBackground: resolvedRunInBackground,
    startWithSystem: resolvedStartWithSystem,
    trayMenuStyle: resolvedTrayMenuStyle,
    trayMenuAnimations: resolvedTrayMenuAnimations,
    trayMenuThemeSync: resolvedTrayMenuThemeSync,
    trayIconStyle: resolvedTrayIconStyle,
    alwaysOnTop: !!(payload as { alwaysOnTop?: unknown }).alwaysOnTop,
    baseMode: resolvedBaseMode,
    themeColor: effectiveThemeColor,
    accentOverride: effectiveAccentOverride,
    motionMode: resolvedMotionMode,
    pauseWhenBackground: resolvedPauseWhenBackground,
    accountsLayoutMode: normalizeAccountsLayoutMode((payload as { accountsLayoutMode?: unknown }).accountsLayoutMode),
    accountsGridColumns: normalizeAccountsGridColumns((payload as { accountsGridColumns?: unknown }).accountsGridColumns),
    accountsDensity: normalizeAccountsDensity((payload as { accountsDensity?: unknown }).accountsDensity),
    biometricEnabled: payload.biometricEnabled !== false,
    autoLockSeconds: normalizeAutoLockSeconds((payload as { autoLockSeconds?: unknown }).autoLockSeconds),
    lockOnFocusLoss: !!(payload as { lockOnFocusLoss?: unknown }).lockOnFocusLoss,
    hasCompletedSafetySetup: resolvedHasCompletedSafetySetup,
    hasSkippedSafetySetup: resolvedHasSkippedSafetySetup,
    lastSafetySetupReminderAt: resolvedLastSafetySetupReminderAt,
  };
}

function normalizeVerifyResult(value: unknown): LockVerifyResult {
  if (value === true) {
    return { result: "OK" };
  }
  if (value && typeof value === "object") {
    const payload = value as { result?: unknown; attemptsUsed?: unknown; lockedUntil?: unknown; disabled?: unknown };
    if (payload.result === "OK") return { result: "OK" };
    if (payload.result === "INCORRECT") {
      const attemptsUsed = typeof payload.attemptsUsed === "number" && Number.isInteger(payload.attemptsUsed) ? payload.attemptsUsed : 0;
      return { result: "INCORRECT", attemptsUsed };
    }
    if (payload.result === "LOCKED") {
      const attemptsUsed = typeof payload.attemptsUsed === "number" && Number.isInteger(payload.attemptsUsed) ? payload.attemptsUsed : 0;
      const lockedUntil = typeof payload.lockedUntil === "number" && Number.isFinite(payload.lockedUntil) ? payload.lockedUntil : Date.now();
      return { result: "LOCKED", lockedUntil, attemptsUsed, disabled: payload.disabled === true };
    }
  }
  return { result: "INCORRECT", attemptsUsed: 0 };
}

export const desktopBridge: Bridge = {
  lockAPI: {
    getMethod: async () => {
      try {
        const fn = lockApi().getMethod;
        if (!fn) return "none";
        return normalizeLockMethod(await fn()) as string;
      } catch {
        return "none";
      }
    },
    getStatus: async () => {
      try {
        const fn = lockApi().getStatus;
        if (!fn) return false;
        return !!(await fn());
      } catch {
        return false;
      }
    },
    getMethodsConfig: async () => {
      try {
        const fn = lockApi().getMethodsConfig;
        if (!fn) {
          return { primaryLockMethod: "none", secondaryLockMethod: null };
        }
        return normalizeLockMethodsConfig(await fn());
      } catch {
        return { primaryLockMethod: "none", secondaryLockMethod: null };
      }
    },
    setMethod: async (method) => {
      try {
        const fn = lockApi().setMethod;
        if (!fn) return;
        await fn(method);
      } catch {
        // no-op
      }
    },
    setMethodsConfig: async (config) => {
      try {
        const fn = lockApi().setMethodsConfig;
        if (!fn) return;
        const normalized = normalizeLockMethodsConfig(config);
        await fn(normalized);
      } catch {
        // no-op
      }
    },
    getQuickUnlock: async () => {
      try {
        const fn = lockApi().getQuickUnlock;
        if (!fn) return { windowsHello: false, passkey: false };
        const value = await fn();
        if (!value || typeof value !== "object") return { windowsHello: false, passkey: false };
        const payload = value as Partial<QuickUnlockConfig>;
        return {
          windowsHello: false,
          passkey: !!payload.passkey,
        };
      } catch {
        return { windowsHello: false, passkey: false };
      }
    },
    setQuickUnlock: async (config) => {
      try {
        const fn = lockApi().setQuickUnlock;
        if (!fn) return;
        await fn({
          windowsHello: false,
          passkey: !!config.passkey,
        });
      } catch {
        // no-op
      }
    },
    setCredential: async (type, value) => {
      try {
        const fn = lockApi().setCredential;
        if (!fn) return;
        await fn(type, value);
      } catch {
        // no-op
      }
    },
    verify: async (type, input) => {
      try {
        const fn = lockApi().verify;
        if (!fn) return { result: "INCORRECT", attemptsUsed: 0 };
        return normalizeVerifyResult(await fn(type, input));
      } catch {
        return { result: "INCORRECT", attemptsUsed: 0 };
      }
    },
    getLockState: async () => {
      try {
        const fn = lockApi().getLockState;
        if (!fn) return { failedCount: 0, lockUntilEpochMs: 0 };
        const value = await fn();
        if (!value || typeof value !== "object") return { failedCount: 0, lockUntilEpochMs: 0 };
        const payload = value as { failedCount?: unknown; lockUntilEpochMs?: unknown };
        const failedCount =
          typeof payload.failedCount === "number" && Number.isInteger(payload.failedCount) && payload.failedCount > 0
            ? payload.failedCount
            : 0;
        const lockUntilEpochMs =
          typeof payload.lockUntilEpochMs === "number" && Number.isFinite(payload.lockUntilEpochMs) && payload.lockUntilEpochMs > 0
            ? payload.lockUntilEpochMs
            : 0;
        return { failedCount, lockUntilEpochMs };
      } catch {
        return { failedCount: 0, lockUntilEpochMs: 0 };
      }
    },
    hasCredential: async (type) => {
      try {
        const fn = lockApi().hasCredential;
        if (!fn) return false;
        return (await fn(type)) as boolean;
      } catch {
        return false;
      }
    },
    clearCredential: async (type) => {
      try {
        const fn = lockApi().clearCredential;
        if (!fn) return;
        await fn(type);
      } catch {
        // no-op
      }
    },
    resetAppLock: async () => {
      try {
        const fn = lockApi().resetAppLock;
        if (!fn) return false;
        return !!(await fn());
      } catch (error) {
        rethrowKnownBridgeError(error);
        return false;
      }
    },
    lock: async () => {
      try {
        const fn = lockApi().lock;
        if (!fn) return;
        await fn();
      } catch {
        // no-op
      }
    },
    biometricAvailable: async () => {
      try {
        const fn = lockApi().biometricAvailable;
        if (!fn) return false;
        return (await fn()) as boolean;
      } catch {
        return false;
      }
    },
    promptBiometric: async () => {
      try {
        const fn = lockApi().promptBiometric;
        if (!fn) return false;
        return (await fn()) as boolean;
      } catch {
        return false;
      }
    },
    validateAndBurnRecoverySecret: async (secret) => {
      try {
        const fn = lockApi().validateAndBurnRecoverySecret;
        if (!fn) return { valid: false };
        const value = await fn(secret);
        if (!value || typeof value !== "object") return { valid: false };
        return { valid: (value as { valid?: unknown }).valid === true };
      } catch (error) {
        maybeThrowMissingHandlerRestartError(error, "lock:validateAndBurnRecoverySecret", "Restart the desktop app to load the latest recovery flow, then try again.");
        rethrowKnownBridgeError(error);
        return { valid: false };
      }
    },
    setPasswordAfterRecovery: async (password) => {
      try {
        const fn = lockApi().setPasswordAfterRecovery;
        if (!fn) return { success: false };
        const value = await fn(password);
        if (!value || typeof value !== "object") return { success: false };
        return { success: (value as { success?: unknown }).success === true };
      } catch (error) {
        maybeThrowMissingHandlerRestartError(error, "lock:setPasswordAfterRecovery", "Restart the desktop app to load the latest recovery flow, then try again.");
        rethrowKnownBridgeError(error);
        return { success: false };
      }
    },
    openSecuritySession: async () => {
      try {
        const fn = lockApi().openSecuritySession;
        if (!fn) return false;
        return (await fn()) !== false;
      } catch (error) {
        rethrowKnownBridgeError(error);
        return false;
      }
    },
    closeSecuritySession: async () => {
      try {
        const fn = lockApi().closeSecuritySession;
        if (!fn) return false;
        return (await fn()) !== false;
      } catch (error) {
        rethrowKnownBridgeError(error);
        return false;
      }
    },
    onShowLockScreen: (cb) => {
      try {
        const fn = lockApi().onShowLockScreen;
        if (!fn) return;
        return fn(cb) as (() => void) | void;
      } catch {
        // no-op
      }
    },
    getPinDigits: async () => {
      try {
        const fn = lockApi().getPinDigits;
        if (!fn) return 4;
        const value = await fn();
        return value === 6 ? 6 : 4;
      } catch {
        return 4;
      }
    },
    stepUpGetChallenge: async () => {
      try {
        const fn = lockApi().stepUpGetChallenge;
        if (!fn) return { challengeId: "", challenge: [] };
        const value = await fn();
        if (!value || typeof value !== "object") return { challengeId: "", challenge: [] };
        const result = value as { challengeId?: unknown; challenge?: unknown };
        const challenge = Array.isArray(result.challenge)
          ? (result.challenge
              .filter((item): item is number => typeof item === "number" && Number.isInteger(item) && item >= 0 && item <= 255)
              .map((item) => item & 255) as number[])
          : [];
        const challengeId = typeof result.challengeId === "string" ? result.challengeId : "";
        return { challengeId, challenge };
      } catch (error) {
        rethrowKnownBridgeError(error);
        return { challengeId: "", challenge: [] };
      }
    },
    stepUpVerify: async (payload) => {
      try {
        const fn = lockApi().stepUpVerify;
        if (!fn) return { result: "INCORRECT", attemptsUsed: 0 } as LockVerifyResult;
        return normalizeVerifyResult(await fn(payload));
      } catch (error) {
        rethrowKnownBridgeError(error);
        return { result: "INCORRECT", attemptsUsed: 0 } as LockVerifyResult;
      }
    },
    passkeyGetChallenge: async () => {
      try {
        const fn = lockApi().passkeyGetChallenge;
        if (!fn) return { challengeId: "", challenge: [] };
        const value = await fn();
        if (!value || typeof value !== "object") return { challengeId: "", challenge: [] };
        const result = value as { challengeId?: unknown; challenge?: unknown };
        const challenge = Array.isArray(result.challenge)
          ? (result.challenge
              .filter((item): item is number => typeof item === "number" && Number.isInteger(item) && item >= 0 && item <= 255)
              .map((item) => item & 255) as number[])
          : [];
        const challengeId = typeof result.challengeId === "string" ? result.challengeId : "";
        return { challengeId, challenge };
      } catch {
        return { challengeId: "", challenge: [] };
      }
    },
    passkeyGetCredentialId: async () => {
      try {
        const fn = lockApi().passkeyGetCredentialId;
        if (!fn) return null;
        const value = await fn();
        return typeof value === "string" && value.trim() ? value : null;
      } catch {
        return null;
      }
    },
    passkeyListCredentials: async () => {
      try {
        const fn = lockApi().passkeyListCredentials;
        if (!fn) return [];
        const value = await fn();
        if (!Array.isArray(value)) return [];
        const results: PasskeySummary[] = [];
        for (const item of value) {
          if (!item || typeof item !== "object") continue;
          const candidate = item as { id?: unknown; name?: unknown; credentialId?: unknown };
          if (
            typeof candidate.id !== "string" ||
            typeof candidate.name !== "string" ||
            typeof candidate.credentialId !== "string"
          ) {
            continue;
          }
          results.push({
            id: candidate.id,
            name: candidate.name,
            credentialId: candidate.credentialId,
          });
        }
        return results;
      } catch {
        return [];
      }
    },
    passkeySaveCredential: async (payload) => {
      try {
        const fn = lockApi().passkeySaveCredential;
        if (!fn) return false;
        return (await fn(payload)) as boolean;
      } catch (error) {
        rethrowKnownBridgeError(error);
        return false;
      }
    },
    passkeyRenameCredential: async (id, name) => {
      try {
        const fn = lockApi().passkeyRenameCredential;
        if (!fn) return false;
        return (await fn(id, name)) as boolean;
      } catch (error) {
        rethrowKnownBridgeError(error);
        return false;
      }
    },
    passkeyRemoveCredential: async (id) => {
      try {
        const fn = lockApi().passkeyRemoveCredential;
        if (!fn) return false;
        return (await fn(id)) as boolean;
      } catch (error) {
        rethrowKnownBridgeError(error);
        return false;
      }
    },
    passkeyVerifyAssertion: async (args) => {
      try {
        const fn = lockApi().passkeyVerifyAssertion;
        if (!fn) return false;
        return (await fn(args)) as boolean;
      } catch {
        return false;
      }
    },
    passkeyClearCredential: async () => {
      try {
        const fn = lockApi().passkeyClearCredential;
        if (!fn) return;
        await fn();
      } catch (error) {
        rethrowKnownBridgeError(error);
        // no-op
      }
    },
  },
  getSettings: async () => {
    try {
      const fn = appApi().getSettings;
      if (!fn) return DEFAULT_SETTINGS;
      return normalizeAppSettings(await fn());
    } catch {
      return DEFAULT_SETTINGS;
    }
  },
  updateSettings: async (next) => {
    try {
      const fn = appApi().updateSettings;
      if (!fn) return normalizeAppSettings(next);
      return normalizeAppSettings(await fn(next));
    } catch {
      return normalizeAppSettings(next);
    }
  },
  getVaultProtectionStatus: async () => {
    try {
      const fn = appApi().getVaultProtectionStatus;
      if (!fn) {
        return normalizeVaultProtectionStatus(undefined);
      }
      return normalizeVaultProtectionStatus(await fn());
    } catch {
      return normalizeVaultProtectionStatus(undefined);
    }
  },
  generateRecoverySecret: async () => {
    try {
      const fn = appApi().generateRecoverySecret;
      if (!fn) {
        return "";
      }
      const value = await fn();
      return typeof value === "string" ? value : "";
    } catch (error) {
      rethrowKnownBridgeError(error);
      return "";
    }
  },
  enrollBiometricUnlock: async () => {
    try {
      const fn = appApi().enrollBiometricUnlock;
      if (!fn) {
        return normalizeVaultProtectionStatus(undefined);
      }
      return normalizeVaultProtectionStatus(await fn());
    } catch (error) {
      rethrowKnownBridgeError(error);
      return normalizeVaultProtectionStatus(undefined);
    }
  },
  removeBiometricUnlock: async () => {
    try {
      const fn = appApi().removeBiometricUnlock;
      if (!fn) {
        return normalizeVaultProtectionStatus(undefined);
      }
      return normalizeVaultProtectionStatus(await fn());
    } catch (error) {
      rethrowKnownBridgeError(error);
      return normalizeVaultProtectionStatus(undefined);
    }
  },
  migrateWithPassword: async (password) => {
    try {
      const fn = appApi().migrateWithPassword;
      if (!fn) {
        return false;
      }
      return (await fn(password)) === true;
    } catch (error) {
      rethrowKnownBridgeError(error);
      return false;
    }
  },
  migrateSetPassword: async (password) => {
    try {
      const fn = appApi().migrateSetPassword;
      if (!fn) {
        return false;
      }
      return (await fn(password)) === true;
    } catch (error) {
      rethrowKnownBridgeError(error);
      return false;
    }
  },
  setBaseMode: async (baseMode) => {
    try {
      const fn = appApi().setBaseMode ?? appApi().setBaseTheme;
      if (!fn) return normalizeBaseModeId(baseMode);
      return normalizeBaseModeId(await fn(baseMode));
    } catch {
      return normalizeBaseModeId(baseMode);
    }
  },
  setThemeColor: async (themeColor) => {
    try {
      const fn = appApi().setThemeColor;
      if (!fn) return normalizeThemeColorId(themeColor);
      return normalizeThemeColorId(await fn(themeColor));
    } catch {
      return normalizeThemeColorId(themeColor);
    }
  },
  setAccentOverride: async (accentOverride) => {
    try {
      const fn = appApi().setAccentOverride ?? appApi().setAccent;
      if (!fn) return normalizeAccentOverrideId(accentOverride);
      return normalizeAccentOverrideId(await fn(accentOverride));
    } catch {
      return normalizeAccentOverrideId(accentOverride);
    }
  },
  // Backward-compatible aliases.
  setBaseTheme: async (baseTheme) => {
    try {
      const fn = appApi().setBaseTheme ?? appApi().setBaseMode;
      if (!fn) return normalizeBaseModeId(baseTheme);
      return normalizeBaseModeId(await fn(baseTheme));
    } catch {
      return normalizeBaseModeId(baseTheme);
    }
  },
  setAccent: async (accent) => {
    try {
      const fn = appApi().setAccent;
      if (!fn) return normalizeAccentOverrideId(accent);
      return normalizeAccentOverrideId(await fn(accent));
    } catch {
      return normalizeAccentOverrideId(accent);
    }
  },
  getAutoLockTimeout: async () => {
    try {
      const fn = appApi().getAutoLockTimeout;
      if (!fn) return DEFAULT_SETTINGS.autoLockSeconds;
      const value = await fn();
      return normalizeAutoLockSeconds(value);
    } catch {
      return DEFAULT_SETTINGS.autoLockSeconds;
    }
  },
  setAutoLockTimeout: async (seconds) => {
    try {
      const fn = appApi().setAutoLockTimeout;
      if (!fn) return normalizeAutoLockSeconds(seconds);
      const value = await fn(seconds);
      return normalizeAutoLockSeconds(value);
    } catch {
      return normalizeAutoLockSeconds(seconds);
    }
  },
  getLockOnFocusLoss: async () => {
    try {
      const fn = appApi().getLockOnFocusLoss;
      if (!fn) return false;
      const value = await fn();
      return !!value;
    } catch {
      return false;
    }
  },
  setLockOnFocusLoss: async (enabled) => {
    try {
      const fn = appApi().setLockOnFocusLoss;
      if (!fn) return !!enabled;
      const value = await fn(enabled);
      return !!value;
    } catch {
      return !!enabled;
    }
  },
  exportBackup: async (passphrase) => {
    const fn = appApi().exportBackup;
    if (!fn) return false;
    return (await fn(passphrase)) as boolean;
  },
  importBackup: async (passphrase, mode) => {
    const fn = appApi().importBackup;
    if (!fn) return false;
    return (await fn(passphrase, mode)) as boolean;
  },
  list: async () => {
    const fn = authApi().list;
    if (!fn) return [];
    return (await fn()) as AccountMeta[];
  },
  reorderAccounts: async (ids) => {
    const fn = appApi().reorderAccounts;
    if (!fn) {
      return desktopBridge.list();
    }
    return (await fn(ids)) as AccountMeta[];
  },
  getAccountForEdit: async (id) => {
    const fn = appApi().getAccountForEdit;
    if (!fn) {
      return {
        id,
        issuer: "",
        label: "Account",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      };
    }
    return (await fn(id)) as EditableAccount;
  },
  updateAccount: async (id, payload) => {
    const fn = appApi().updateAccount;
    if (!fn) {
      return {
        id,
        issuer: payload.issuer,
        label: payload.label,
        digits: payload.digits,
        period: payload.period,
      } as AccountMeta;
    }
    return (await fn(id, payload)) as AccountMeta;
  },
  addUri: async (uri) => {
    const fn = authApi().addUri;
    if (!fn) throw new Error("Add URI is unavailable.");
    return (await fn(uri)) as AccountMeta;
  },
  addManual: async (payload) => {
    const fn = authApi().addManual;
    if (!fn) throw new Error("Add Manual is unavailable.");
    return (await fn(payload)) as AccountMeta;
  },
  del: async (id) => {
    const fn = authApi().del;
    if (!fn) return false;
    return (await fn(id)) as boolean;
  },
  getTotpCode: async (id) => {
    const fn = authApi().getTotpCode;
    if (!fn) return null;
    const value = await fn(id);
    if (!value || typeof value !== "object") return null;
    const payload = value as { code?: unknown; remainingSeconds?: unknown };
    if (typeof payload.code !== "string" || typeof payload.remainingSeconds !== "number") {
      return null;
    }
    return { code: payload.code, remainingSeconds: payload.remainingSeconds };
  },
  revealSecret: async (id) => {
    const fn = authApi().revealSecret;
    if (!fn) throw new Error("Secret reveal is unavailable.");
    const value = await fn(id);
    return typeof value === "string" ? value : "";
  },
  scanFromScreen: async () => {
    const fn = authApi().scanFromScreen;
    if (!fn) return null;
    return (await fn()) as string | null;
  },
  codes: async () => {
    const fn = authApi().codes;
    if (!fn) return [];
    return (await fn()) as CodeResult[];
  },
  clearClipboard: async (expectedText) => {
    const fn = clipboardApi().clear;
    if (fn) {
      try {
        return !!(await fn(expectedText));
      } catch {
        // fall through to renderer clipboard fallback
      }
    }

    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard?.readText || !clipboard?.writeText) {
      return false;
    }

    try {
      const currentText = await clipboard.readText();
      if (currentText !== expectedText) {
        return false;
      }
      await clipboard.writeText("");
      return true;
    } catch {
      return false;
    }
  },
};
