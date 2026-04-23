type BaseModeId = "light" | "dark" | "amoled";
type ThemeColorId =
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
type AccentOverrideId =
  | "theme"
  | "none"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "pink"
  | "teal"
  | "cyan"
  | "lime"
  | "gray"
  | "white"
  | "black"
  | "lightGray"
  | "lightBlue";

type RendererAppSettings = {
  defaultDigits: 6 | 8;
  defaultPeriod: number;
  hideLabelsOnSmall: boolean;
  privacyScreen: boolean;
  clipboardSafetyEnabled: boolean;
  runInBackground: boolean;
  startWithSystem: boolean;
  trayMenuStyle: "native" | "themed";
  trayMenuAnimations: "off" | "reduced";
  trayMenuThemeSync: boolean;
  trayIconStyle: "auto" | "light" | "dark";
  alwaysOnTop: boolean;
  baseMode: BaseModeId;
  themeColor: ThemeColorId;
  accentOverride: AccentOverrideId;
  motionMode: "system" | "full" | "reduced" | "off";
  pauseWhenBackground: boolean;
  accountsLayoutMode: "auto" | "list" | "grid";
  accountsGridColumns: "auto" | 1 | 2 | 3;
  accountsDensity: "comfortable" | "compact";
  biometricEnabled: boolean;
  autoLockSeconds: number;
  lockOnFocusLoss: boolean;
  hasCompletedSafetySetup: boolean;
  hasSkippedSafetySetup: boolean;
  lastSafetySetupReminderAt?: number;
};

type RendererVaultProtectionStatus = {
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
  mode?: "standard" | "hardened" | "vault-v4";
};

interface Window {
  authAPI: {
    list(): Promise<Array<{ id: string; issuer: string; label: string; digits: number; period: number }>>;
    scanFromScreen(): Promise<string | null>;
    addUri(uri: string): Promise<{ id: string; issuer: string; label: string }>;
    addManual(p: unknown): Promise<{ id: string; issuer: string; label: string }>;
    del(id: string): Promise<boolean>;
    codes(): Promise<Array<{ id: string; code: string; remainingSeconds: number }>>;
  };

  appAPI: {
    getSettings(): Promise<RendererAppSettings>;
    updateSettings(next: RendererAppSettings): Promise<RendererAppSettings>;
    getVaultProtectionStatus(): Promise<RendererVaultProtectionStatus>;
    generateRecoverySecret(): Promise<string>;
    enrollBiometricUnlock(): Promise<RendererVaultProtectionStatus>;
    removeBiometricUnlock(): Promise<RendererVaultProtectionStatus>;
    migrateWithPassword(password: string): Promise<boolean>;
    migrateSetPassword(password: string): Promise<boolean>;
    setBaseMode(baseMode: BaseModeId): Promise<BaseModeId>;
    setThemeColor(themeColor: ThemeColorId): Promise<ThemeColorId>;
    setAccentOverride(accentOverride: AccentOverrideId): Promise<AccentOverrideId>;

    // Backward-compatible aliases.
    setBaseTheme(baseTheme: BaseModeId): Promise<BaseModeId>;
    setAccent(accent: AccentOverrideId): Promise<AccentOverrideId>;

    getAutoLockTimeout(): Promise<number>;
    setAutoLockTimeout(seconds: number): Promise<number>;
    getLockOnFocusLoss(): Promise<boolean>;
    setLockOnFocusLoss(enabled: boolean): Promise<boolean>;
    getStartWithSystem(): Promise<boolean>;
    setStartWithSystem(enabled: boolean): Promise<boolean>;
    getRunInBackground(): Promise<boolean>;
    setRunInBackground(enabled: boolean): Promise<boolean>;
    exportBackup(passphrase: string): Promise<boolean>;
    importBackup(passphrase: string, mode: "merge" | "replace"): Promise<boolean>;
    reorderAccounts(ids: string[]): Promise<Array<{ id: string; issuer: string; label: string; digits: number; period: number }>>;
    getAccountForEdit(id: string): Promise<{
      id: string;
      issuer: string;
      label: string;
      digits: 6 | 8;
      period: number;
      algorithm: "SHA1" | "SHA256" | "SHA512";
    }>;
    updateAccount(
      id: string,
      payload: {
        issuer: string;
        label: string;
        digits: 6 | 8;
        period: number;
        algorithm: "SHA1" | "SHA256" | "SHA512";
      }
    ): Promise<{ id: string; issuer: string; label: string; digits: number; period: number }>;
  };

  lockAPI: {
    getMethod(): Promise<"none" | "swipe" | "pin4" | "pin6" | "password" | "pattern" | "passkey">;
    getStatus(): Promise<boolean>;
    getMethodsConfig(): Promise<{ primaryLockMethod: string; secondaryLockMethod: string | null }>;
    setMethod(method: string): Promise<void>;
    setMethodsConfig(config: { primaryLockMethod: string; secondaryLockMethod: string | null }): Promise<void>;
    getQuickUnlock(): Promise<{ windowsHello: boolean; passkey: boolean }>;
    setQuickUnlock(config: { windowsHello: boolean; passkey: boolean }): Promise<void>;
    setCredential(type: string, value: string): Promise<void>;
    verify(type: string, input: string): Promise<
      | { result: "OK" }
      | { result: "INCORRECT"; attemptsUsed: number }
      | { result: "LOCKED"; lockedUntil: number; attemptsUsed: number; disabled?: boolean }
    >;
    getLockState(): Promise<{ failedCount: number; lockUntilEpochMs: number }>;
    hasCredential(type: string): Promise<boolean>;
    clearCredential?(type: string): Promise<void>;
    resetAppLock(): Promise<boolean>;
    lock(): Promise<void>;
    biometricAvailable(): Promise<boolean>;
    promptBiometric(): Promise<boolean>;
    validateAndBurnRecoverySecret?(secret: string): Promise<{ valid: boolean }>;
    setPasswordAfterRecovery?(password: string): Promise<{ success: boolean }>;
    openSecuritySession?(): Promise<boolean | void>;
    closeSecuritySession?(): Promise<boolean | void>;
    onShowLockScreen(cb: () => void): (() => void) | void;
    getPinDigits(): Promise<4 | 6>;
    stepUpGetChallenge?(): Promise<{ challengeId: string; challenge: number[] }>;
    stepUpVerify?(
      payload:
        | { method: "pin" | "password" | "pattern"; input: string }
        | {
            method: "passkey";
            challengeId: string;
            credentialId: string;
            clientDataJSON: number[];
            authenticatorData: number[];
            signature: number[];
          }
    ): Promise<
      | { result: "OK" }
      | { result: "INCORRECT"; attemptsUsed: number }
      | { result: "LOCKED"; lockedUntil: number; attemptsUsed: number; disabled?: boolean }
    >;
    passkeyGetChallenge(): Promise<{ challengeId: string; challenge: number[] }>;
    passkeyGetCredentialId(): Promise<string | null>;
    passkeyListCredentials(): Promise<Array<{ id: string; name: string; credentialId: string }>>;
    passkeySaveCredential(payload: {
      challengeId: string;
      credentialId: string;
      attestationObject: string;
      clientDataJSON: string;
      name?: string;
    }): Promise<boolean>;
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
  };

  windowAPI: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    unmaximize(): Promise<void>;
    close(): Promise<void>;
    getVersion(): Promise<string>;
    isMaximized(): Promise<boolean>;
    isBackgrounded(): Promise<boolean>;
    getAlwaysOnTop(): Promise<boolean>;
    setAlwaysOnTop(enabled: boolean): Promise<void>;
    onMaximizedChanged(cb: (maximized: boolean) => void): () => void;
    onAlwaysOnTopChanged(cb: (enabled: boolean) => void): () => void;
    onBackgroundedChanged(cb: (backgrounded: boolean) => void): () => void;
    onAppCommand?(cb: (command: string) => void): () => void;
  };

  clipboardAPI?: {
    clear(expectedText: string): Promise<boolean>;
  };
}
