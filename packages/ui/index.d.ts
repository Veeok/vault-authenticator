import type { ComponentType } from "react";
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

export type BaseModeId = "light" | "dark" | "amoled";
export type ThemeColorId =
  | "neutral"
  | "gray"
  | "slate"
  | "black"
  | "white"
  | "lightGray"
  | "red"
  | "rose"
  | "pink"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "lightBlue"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple";
export type AccentOverrideId =
  | "theme"
  | "none"
  | "green"
  | "red"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "pink"
  | "orange"
  | "yellow"
  | "teal"
  | "cyan"
  | "lime"
  | "gray"
  | "white"
  | "black"
  | "lightGray"
  | "lightBlue";
export type BaseThemeId = BaseModeId;
export type AccentId = AccentOverrideId;
export type MotionMode = "system" | "full" | "reduced" | "off";
export type TrayMenuStyle = "native" | "themed";
export type TrayMenuAnimations = "off" | "reduced";
export type TrayIconStyle = "auto" | "light" | "dark";

export type AccountsLayoutMode = "auto" | "list" | "grid";
export type AccountsGridColumns = "auto" | 1 | 2 | 3;
export type AccountsDensity = "comfortable" | "compact";

export const DEFAULT_BASE_MODE_ID: BaseModeId;
export const DEFAULT_THEME_COLOR_ID: ThemeColorId;
export const DEFAULT_ACCENT_OVERRIDE_ID: AccentOverrideId;
export const DEFAULT_BASE_THEME_ID: BaseThemeId;
export const DEFAULT_ACCENT_ID: AccentId;
export const DEFAULT_MOTION_MODE: MotionMode;
export const DEFAULT_PAUSE_WHEN_BACKGROUND: boolean;
export const DEFAULT_CLIPBOARD_SAFETY_ENABLED: boolean;
export const DEFAULT_RUN_IN_BACKGROUND: boolean;
export const DEFAULT_START_WITH_SYSTEM: boolean;
export const DEFAULT_TRAY_MENU_STYLE: TrayMenuStyle;
export const DEFAULT_TRAY_MENU_ANIMATIONS: TrayMenuAnimations;
export const DEFAULT_TRAY_MENU_THEME_SYNC: boolean;
export const DEFAULT_TRAY_ICON_STYLE: TrayIconStyle;
export const BASE_MODE_OPTIONS: ReadonlyArray<{ value: BaseModeId; label: string }>;
export const THEME_COLOR_OPTIONS: ReadonlyArray<{ value: ThemeColorId; label: string }>;
export const ACCENT_OVERRIDE_OPTIONS: ReadonlyArray<{ value: AccentOverrideId; label: string }>;
export const BASE_THEME_OPTIONS: ReadonlyArray<{ value: BaseThemeId; label: string }>;
export const ACCENT_OPTIONS: ReadonlyArray<{ value: AccentId; label: string }>;
export const MOTION_MODE_OPTIONS: ReadonlyArray<{ value: MotionMode; label: string }>;
export const TRAY_MENU_STYLE_OPTIONS: ReadonlyArray<{ value: TrayMenuStyle; label: string }>;
export const TRAY_MENU_ANIMATION_OPTIONS: ReadonlyArray<{ value: TrayMenuAnimations; label: string }>;
export const TRAY_ICON_STYLE_OPTIONS: ReadonlyArray<{ value: TrayIconStyle; label: string }>;
export function normalizeBaseModeId(value: unknown): BaseModeId;
export function normalizeThemeColorId(value: unknown): ThemeColorId;
export function normalizeAccentOverrideId(value: unknown): AccentOverrideId;
export function normalizeBaseThemeId(value: unknown): BaseThemeId;
export function normalizeAccentId(value: unknown): AccentId;
export function normalizeMotionMode(value: unknown): MotionMode;
export function normalizeTrayMenuStyle(value: unknown): TrayMenuStyle;
export function normalizeTrayMenuAnimations(value: unknown): TrayMenuAnimations;
export function normalizeTrayIconStyle(value: unknown): TrayIconStyle;
export function baseModeLabel(baseMode: BaseModeId): string;
export function themeColorLabel(themeColor: ThemeColorId): string;
export function accentOverrideLabel(accentOverride: AccentOverrideId): string;
export function baseThemeLabel(baseTheme: BaseThemeId): string;
export function accentLabel(accent: AccentId): string;
export function motionModeLabel(mode: MotionMode): string;

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

export type LockVerifyResult =
  | { result: "OK" }
  | { result: "INCORRECT"; attemptsUsed: number }
  | { result: "LOCKED"; lockedUntil: number; attemptsUsed: number; disabled?: boolean };

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
  setBaseTheme?(baseTheme: BaseThemeId): Promise<BaseThemeId>;
  setAccent?(accent: AccentId): Promise<AccentId>;
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

export interface WindowControls {
  minimize(): Promise<void> | void;
  maximize(): Promise<void> | void;
  unmaximize(): Promise<void> | void;
  close(): Promise<void> | void;
  getVersion?(): Promise<string>;
  isMaximized(): Promise<boolean>;
  isBackgrounded?(): Promise<boolean>;
  getAlwaysOnTop?(): Promise<boolean>;
  setAlwaysOnTop?(enabled: boolean): Promise<void> | void;
  onMaximizedChanged?(cb: (maximized: boolean) => void): (() => void) | void;
  onAlwaysOnTopChanged?(cb: (enabled: boolean) => void): (() => void) | void;
  onBackgroundedChanged?(cb: (backgrounded: boolean) => void): (() => void) | void;
}

export const App: ComponentType<{ bridge: Bridge; windowControls?: WindowControls; titleBarIconSrc?: string }>;
export const desktopBridge: Bridge;
export const DEFAULT_SETTINGS: AppSettings;
