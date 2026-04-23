import { app, dialog, safeStorage } from "electron";
import Store from "electron-store";
import { Algorithm, hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { createHash } from "node:crypto";
import {
  getVaultPasswordPolicyIssue,
  getVaultPasswordPolicyMessage,
  VAULT_PASSWORD_MAX_LENGTH,
  type StoredTotpAccount,
} from "@authenticator/core";
import { logDesktopDebug } from "./diagnostics";
import {
  DEFAULT_ACCENT_OVERRIDE_ID,
  DEFAULT_BASE_MODE_ID,
  DEFAULT_THEME_COLOR_ID,
  normalizeThemeSettings,
  type AccentOverrideId,
  type BaseModeId,
  type ThemeColorId,
} from "./theme-settings";
import {
  DEFAULT_MOTION_MODE,
  DEFAULT_PAUSE_WHEN_BACKGROUND,
  normalizeMotionMode,
  normalizePauseWhenBackground,
  type MotionMode,
} from "./motion-settings";
import {
  biometricEnrolled,
  clearPasswordUnlockLockState,
  createRecoverySecretAndWrap,
  createVaultEnvelope,
  decryptVaultPayload,
  decryptLegacyHardenedPayload,
  normalizeLegacyHardenedEnvelope,
  normalizeVaultEnvelope,
  outerMetaFromEnvelope,
  replacePasswordWrapWithVdk,
  recoveryGenerated,
  rewriteVaultEnvelopeWithVdk,
  rotatePasswordWrap,
  type Argon2Params,
  type LegacyHardenedEnvelope,
  type LegacyRecoveryVerifier,
  type RecoveryVerifier as VaultRecoveryVerifier,
  type VaultEnvelopeV4,
} from "./vault-v4";

export type LockMethod = "none" | "swipe" | "pin4" | "pin6" | "password" | "pattern" | "passkey";

export type LockMethodKind = "none" | "swipe" | "pin" | "password" | "pattern" | "passkey";

export type SecureLockMethodKind = "pin" | "password" | "pattern" | "passkey";

export type LockMethodsConfig = {
  primaryLockMethod: LockMethodKind;
  secondaryLockMethod: SecureLockMethodKind | null;
};

export type QuickUnlockConfig = {
  windowsHello: boolean;
  passkey: boolean;
};

export type LegacyHashRecord = {
  hash: string;
  salt: string;
};

export type CredentialRecord = {
  hash: string;
  salt?: string;
};

export type PinCredentialRecord = CredentialRecord & {
  digits: 4 | 6;
};

export type BackupCodeRecord = LegacyHashRecord;

export type VaultMode = "hardened";

export type LockState = {
  failedCount: number;
  lockUntilEpochMs: number;
  disabledAtEpochMs?: number;
};

export type HardenedVaultEnvelope = LegacyHardenedEnvelope;

export type VaultPasswordUnlockResult =
  | { result: "OK" }
  | { result: "INCORRECT"; attemptsUsed: number }
  | { result: "LOCKED"; lockedUntil: number; attemptsUsed: number; disabled?: boolean };

export type VaultProtectionStatus = {
  mode: VaultMode;
  requiresMasterPassword: boolean;
  hardenedSessionUnlocked: boolean;
  masterPasswordLockState: LockState;
  biometricEnrolled?: boolean;
  recoveryGenerated?: boolean;
  requiresPasswordSetup?: boolean;
};

export type OuterVaultMetadataDebug = {
  rawVaultMode: VaultMode | undefined;
  resolvedVaultMode: VaultMode;
  hasLegacyBlob: boolean;
  hasLegacyHardenedEnvelope: boolean;
  hasVaultEnvelope: boolean;
  hasAuthUiSettings: boolean;
  migrated: boolean;
};

export type RecoveryVerifier = VaultRecoveryVerifier;

export type PasskeyCredentialRecord = {
  id: string;
  name: string;
  credentialId: string;
  publicKey: string;
  signCount: number;
};

type EncryptedPayload = {
  accounts: StoredTotpAccount[];
  backupCodes?: BackupCodeRecord[];
  backupCodeLockState?: LockState;
  settings?: unknown;
  lockState?: LockState;
  pinLockState?: LockState;
  passwordLockState?: LockState;
  patternLockState?: LockState;
  lockMethod?: unknown;
  primaryLockMethod?: unknown;
  secondaryLockMethod?: unknown;
  quickUnlock?: QuickUnlockConfig;
  pinCredential?: PinCredentialRecord;
  passwordCredential?: CredentialRecord;
  patternCredential?: CredentialRecord;
  passkeyCredentials?: PasskeyCredentialRecord[];
  passkeyCredential?: PasskeyCredentialRecord;
  recoveryVerifier?: RecoveryVerifier | null;
  pin?: {
    hash?: unknown;
    salt?: unknown;
  };
  pinHash?: string;
  recoveryCodeHashes?: string[];
};

export type AppSettings = {
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
  motionMode: MotionMode;
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

export type AuthUiSettings = {
  baseMode: BaseModeId;
  themeColor: ThemeColorId;
  accentOverride: AccentOverrideId;
  motionMode: MotionMode;
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultDigits: 6,
  defaultPeriod: 30,
  hideLabelsOnSmall: false,
  privacyScreen: true,
  clipboardSafetyEnabled: true,
  runInBackground: true,
  startWithSystem: false,
  trayMenuStyle: "native",
  trayMenuAnimations: "off",
  trayMenuThemeSync: true,
  trayIconStyle: "auto",
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

const DEFAULT_AUTH_UI_SETTINGS: AuthUiSettings = {
  baseMode: DEFAULT_BASE_MODE_ID,
  themeColor: DEFAULT_THEME_COLOR_ID,
  accentOverride: DEFAULT_ACCENT_OVERRIDE_ID,
  motionMode: DEFAULT_MOTION_MODE,
};

function normalizeAccountsLayoutMode(value: unknown): "auto" | "list" | "grid" {
  if (value === "list") return "list";
  if (value === "grid") return "grid";
  return "auto";
}

function normalizeAccountsGridColumns(value: unknown): "auto" | 1 | 2 | 3 {
  if (value === 1 || value === 2 || value === 3) return value;
  return "auto";
}

function normalizeAccountsDensity(value: unknown): "comfortable" | "compact" {
  if (value === "compact") return "compact";
  return "comfortable";
}

function normalizeTrayMenuStyle(value: unknown): "native" | "themed" {
  if (value === "themed") return "themed";
  return "native";
}

function normalizeTrayMenuAnimations(value: unknown): "off" | "reduced" {
  if (value === "reduced") return "reduced";
  return "off";
}

function normalizeTrayIconStyle(value: unknown): "auto" | "light" | "dark" {
  if (value === "light") return "light";
  if (value === "dark") return "dark";
  return "auto";
}

const DEFAULT_LOCK_STATE: LockState = {
  failedCount: 0,
  lockUntilEpochMs: 0,
};

const DEFAULT_QUICK_UNLOCK: QuickUnlockConfig = {
  windowsHello: false,
  passkey: false,
};

const DEFAULT_LOCK_METHODS: LockMethodsConfig = {
  primaryLockMethod: "none",
  secondaryLockMethod: null,
};

type SecretStore = {
  get(key: "vaultEnvelope"): VaultEnvelopeV4 | undefined;
  get(key: "blob"): string | undefined;
  get(key: "vaultMode"): string | undefined;
  get(key: "hardenedEnvelope"): HardenedVaultEnvelope | undefined;
  get(key: "authUiSettings"): AuthUiSettings | undefined;
  set(key: "vaultEnvelope", value: VaultEnvelopeV4): void;
  set(key: "blob", value: string): void;
  set(key: "vaultMode", value: string): void;
  set(key: "hardenedEnvelope", value: HardenedVaultEnvelope): void;
  set(key: "authUiSettings", value: AuthUiSettings): void;
  delete(key: "vaultEnvelope" | "blob" | "vaultMode" | "hardenedEnvelope" | "authUiSettings"): void;
};

const store = new Store<{
  vaultEnvelope?: VaultEnvelopeV4;
  blob?: string;
  vaultMode?: string;
  hardenedEnvelope?: HardenedVaultEnvelope;
  authUiSettings?: AuthUiSettings;
}>({
  name: "authenticator-secrets",
}) as unknown as SecretStore;
let corruptedStoreHandled = false;
type HardenedSession = {
  vaultKey: Buffer;
  payload: EncryptedPayload | null;
  payloadBuffer: Buffer | null;
};

let hardenedSession: HardenedSession | null = null;
let pendingRecoveryReset: { vaultKey: Buffer; payload: EncryptedPayload } | null = null;

function recoverySecretFingerprint(secret: string): string {
  return createHash("sha256")
    .update(secret.replace(/[^A-Z0-9]/gi, "").toUpperCase())
    .digest("hex")
    .slice(0, 12);
}

function clearPendingRecoveryReset(): void {
  if (pendingRecoveryReset) {
    pendingRecoveryReset.vaultKey.fill(0);
  }
  pendingRecoveryReset = null;
}

export function clearHardenedSession(): void {
  if (hardenedSession) {
    clearDecryptedCache();
    hardenedSession.vaultKey.fill(0);
  }
  hardenedSession = null;
}

function parseEncryptedPayloadJson(payloadJson: string): EncryptedPayload {
  return normalizeParsedPayload(JSON.parse(payloadJson) as unknown);
}

export function clearDecryptedCache(): void {
  if (!hardenedSession) {
    return;
  }

  if (hardenedSession.payloadBuffer) {
    hardenedSession.payloadBuffer.fill(0);
    hardenedSession.payloadBuffer = null;
  }

  if (hardenedSession.payload) {
    hardenedSession.payload = null;
  }
}

export function hasDecryptedPayloadCache(): boolean {
  return hardenedSession?.payload !== null;
}

function setUnlockedHardenedSession(vaultKey: Buffer, payloadJson: string): void {
  clearHardenedSession();
  hardenedSession = {
    vaultKey: Buffer.from(vaultKey),
    payload: null,
    payloadBuffer: null,
  };
  cacheDecryptedPayload(payloadJson);
}

function cacheDecryptedPayload(payloadJson: string): EncryptedPayload {
  if (!hardenedSession) {
    throw new HardenedVaultLockedError();
  }
  clearDecryptedCache();
  const payload = parseEncryptedPayloadJson(payloadJson);
  hardenedSession.payload = payload;
  hardenedSession.payloadBuffer = Buffer.from(payloadJson, "utf8");
  return payload;
}

function decryptPayloadFromUnlockedSession(): EncryptedPayload {
  const envelope = loadVaultEnvelope();
  if (!envelope || !hardenedSession) {
    throw new HardenedVaultLockedError();
  }

  try {
    const payloadJson = decryptVaultPayload(hardenedSession.vaultKey, envelope);
    return cacheDecryptedPayload(payloadJson);
  } catch {
    handleCorruptedStore();
  }
}

export function hasPendingRecoveryReset(): boolean {
  return pendingRecoveryReset !== null;
}

class SecureStoreCorruptedError extends Error {
  constructor() {
    super("Secure storage is corrupted.");
    this.name = "SecureStoreCorruptedError";
  }
}

class HardenedVaultLockedError extends Error {
  constructor() {
    super("Hardened vault is locked.");
    this.name = "HardenedVaultLockedError";
  }
}

function ensureEncryptionReady(): void {
  if (!app.isReady()) throw new Error("App not ready");
  if (!safeStorage.isEncryptionAvailable()) {
    dialog.showErrorBox(
      "Encryption Unavailable",
      "Secure storage is not available on this system. Cannot run safely."
    );
    app.quit();
    throw new Error("OS encryption not available");
  }
}

function handleCorruptedStore(): never {
  if (!corruptedStoreHandled) {
    corruptedStoreHandled = true;
    dialog.showErrorBox(
      "Secure Storage Corrupted",
      "Vault Authenticator could not decrypt or parse its encrypted local vault. The app will close instead of opening an empty unlocked vault. Restore from backup or remove the corrupted app data before reopening."
    );
    app.quit();
  }

  throw new SecureStoreCorruptedError();
}

function loadVaultEnvelope(): VaultEnvelopeV4 | undefined {
  return normalizeVaultEnvelope(store.get("vaultEnvelope"));
}

function saveVaultEnvelope(envelope: VaultEnvelopeV4): void {
  store.set("vaultEnvelope", envelope);
}

function hasLegacyStandardBlob(): boolean {
  return typeof store.get("blob") === "string";
}

function hasLegacyHardenedEnvelopeData(): boolean {
  return !!normalizeLegacyHardenedEnvelope(store.get("hardenedEnvelope"));
}

function hasPersistentVaultData(): boolean {
  return !!loadVaultEnvelope() || hasLegacyStandardBlob() || hasLegacyHardenedEnvelopeData();
}

export function hasProvisionedVault(): boolean {
  return hasPersistentVaultData();
}

function getPersistedVaultMode(): VaultMode {
  return "hardened";
}

export function ensureOuterVaultMetadata(): OuterVaultMetadataDebug {
  const rawVaultMode = store.get("vaultMode") === "hardened" ? "hardened" : undefined;
  const hasLegacyBlob = hasLegacyStandardBlob();
  const hasLegacyHardenedEnvelope = hasLegacyHardenedEnvelopeData();
  const hasVaultEnvelope = !!loadVaultEnvelope();
  const hasAuthUiSettings = !!store.get("authUiSettings");
  let migrated = false;

  if (store.get("vaultMode") !== "hardened" && hasPersistentVaultData()) {
    store.set("vaultMode", "hardened");
    migrated = true;
  }

  return {
    rawVaultMode,
    resolvedVaultMode: getPersistedVaultMode(),
    hasLegacyBlob,
    hasLegacyHardenedEnvelope,
    hasVaultEnvelope,
    hasAuthUiSettings,
    migrated,
  };
}

function normalizeExistingMasterPassword(value: string): string {
  if (typeof value !== "string") {
    throw new Error("Current password is required.");
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > VAULT_PASSWORD_MAX_LENGTH) {
    throw new Error(`Current password must be 1-${VAULT_PASSWORD_MAX_LENGTH} characters.`);
  }
  return normalized;
}

function normalizeNewMasterPassword(value: string): string {
  const normalized = normalizeExistingMasterPassword(value);
  const issue = getVaultPasswordPolicyIssue(normalized);
  if (issue) {
    throw new Error(getVaultPasswordPolicyMessage(issue));
  }
  return normalized;
}

function createDefaultPayload(): EncryptedPayload {
  return {
    accounts: [],
    lockMethod: "none",
    primaryLockMethod: DEFAULT_LOCK_METHODS.primaryLockMethod,
    secondaryLockMethod: DEFAULT_LOCK_METHODS.secondaryLockMethod,
    quickUnlock: DEFAULT_QUICK_UNLOCK,
    backupCodes: [],
    backupCodeLockState: DEFAULT_LOCK_STATE,
    lockState: DEFAULT_LOCK_STATE,
    pinLockState: DEFAULT_LOCK_STATE,
    passwordLockState: DEFAULT_LOCK_STATE,
    patternLockState: DEFAULT_LOCK_STATE,
    settings: DEFAULT_SETTINGS,
    recoveryVerifier: null,
  };
}

function loadLegacyStandardPayload(): EncryptedPayload {
  ensureEncryptionReady();
  const blob = store.get("blob");
  if (!blob) {
    return createDefaultPayload();
  }

  try {
    // safeStorage: one-time legacy migration read only.
    // Not used in vault-v4 or any subsequent operation.
    const decrypted = safeStorage.decryptString(Buffer.from(blob, "base64"));
    return normalizeParsedPayload(JSON.parse(decrypted) as unknown);
  } catch {
    return handleCorruptedStore();
  }
}

function loadLegacyHardenedEnvelope(): HardenedVaultEnvelope | undefined {
  return normalizeLegacyHardenedEnvelope(store.get("hardenedEnvelope"));
}

function loadLegacyHardenedEnvelopeOrThrow(): HardenedVaultEnvelope {
  const envelope = loadLegacyHardenedEnvelope();
  if (!envelope) {
    return handleCorruptedStore();
  }
  return envelope;
}

function hasVaultEnvelope(): boolean {
  return !!loadVaultEnvelope();
}

function hasPasswordSetupRequirement(): boolean {
  if (hasVaultEnvelope() || hasLegacyHardenedEnvelopeData()) {
    return false;
  }
  if (!hasLegacyStandardBlob()) {
    return false;
  }
  return !loadLegacyStandardPayload().passwordCredential;
}

export function requiresVaultPasswordSetup(): boolean {
  return hasPasswordSetupRequirement();
}

function canReadVaultPayload(): boolean {
  return !hasPersistentVaultData() || hardenedSession !== null;
}

function persistUnlockedPayload(
  payload: EncryptedPayload,
  updates?: Partial<Pick<VaultEnvelopeV4, "biometricWrappedVdk" | "recoveryWrappedVdk" | "outerMeta" | "passwordUnlockLockState">>
): void {
  const envelope = loadVaultEnvelope();
  if (!envelope || !hardenedSession) {
    throw new HardenedVaultLockedError();
  }
  try {
    const settings = loadSettingsFromPayload(payload);
    const payloadJson = JSON.stringify(payload);
    const nextEnvelope = rewriteVaultEnvelopeWithVdk(envelope, payloadJson, hardenedSession.vaultKey, updates);
    saveVaultEnvelope(nextEnvelope);
    store.set("vaultMode", "hardened");
    cacheDecryptedPayload(payloadJson);
    persistAuthUiSettings(authUiSettingsFromAppSettings(settings));
  } catch {
    handleCorruptedStore();
  }
}

function loadSettingsFromPayload(payload: EncryptedPayload): AppSettings {
  const normalized = normalizeSettings(payload.settings);
  payload.settings = normalized.settings;
  return normalized.settings;
}

async function createPasswordCredentialRecord(password: string): Promise<CredentialRecord> {
  return {
    hash: await argon2Hash(normalizeNewMasterPassword(password), {
      algorithm: Algorithm.Argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    }),
  };
}

async function verifyPasswordCredentialRecord(record: CredentialRecord | undefined, password: string): Promise<boolean> {
  if (!record) return false;
  if (record.hash.startsWith("$argon2")) {
    return argon2Verify(record.hash, normalizeExistingMasterPassword(password)).catch(() => false);
  }
  if (!record.salt) {
    return false;
  }
  const legacyHash = createHash("sha256")
    .update(`${normalizeExistingMasterPassword(password)}${record.salt}`)
    .digest("hex");
  return legacyHash === record.hash;
}

async function persistFreshVaultWithPassword(basePayload: EncryptedPayload, password: string): Promise<void> {
  const nextPayload = normalizeParsedPayload(basePayload);
  nextPayload.passwordCredential = await createPasswordCredentialRecord(password);
  if (nextPayload.primaryLockMethod === "none") {
    nextPayload.primaryLockMethod = "password";
    nextPayload.lockMethod = "password";
  }
  const settings = loadSettingsFromPayload(nextPayload);
  const payloadJson = JSON.stringify(nextPayload);
  const { envelope, vdk } = await createVaultEnvelope(payloadJson, password, {
    biometricEnrolled: false,
    recoveryGenerated: false,
  });
  saveVaultEnvelope(envelope);
  store.set("vaultMode", "hardened");
  store.delete("blob");
  store.delete("hardenedEnvelope");
  setUnlockedHardenedSession(vdk, payloadJson);
  persistAuthUiSettings(authUiSettingsFromAppSettings(settings));
}

export async function initializeVaultWithPassword(password: string): Promise<void> {
  if (hasVaultEnvelope()) {
    throw new Error("Vault is already initialized.");
  }
  const basePayload = hasLegacyStandardBlob() ? loadLegacyStandardPayload() : createDefaultPayload();
  await persistFreshVaultWithPassword(basePayload, password);
}

function loadPayload(): EncryptedPayload {
  if (hardenedSession?.payload) {
    return hardenedSession.payload;
  }
  if (hardenedSession) {
    return decryptPayloadFromUnlockedSession();
  }
  if (hasLegacyStandardBlob()) {
    void loadLegacyStandardPayload();
  }
  if (hasPersistentVaultData()) {
    throw new HardenedVaultLockedError();
  }
  return createDefaultPayload();
}

function savePayload(payload: EncryptedPayload): void {
  if (!hasPersistentVaultData()) {
    const settings = loadSettingsFromPayload(payload);
    persistAuthUiSettings(authUiSettingsFromAppSettings(settings));
    return;
  }
  persistUnlockedPayload(payload);
}

function isHex(value: string, expectedLength: number): boolean {
  return new RegExp(`^[a-f0-9]{${expectedLength}}$`).test(value);
}

function normalizeLockMethodKind(input: unknown): LockMethodKind | null {
  if (input === "none") return "none";
  if (input === "swipe") return "swipe";
  if (input === "pin" || input === "pin4" || input === "pin6") return "pin";
  if (input === "password") return "password";
  if (input === "pattern") return "pattern";
  if (input === "passkey") return "passkey";
  return null;
}

function isSecureLockMethodKind(method: LockMethodKind | null): method is SecureLockMethodKind {
  return method === "pin" || method === "password" || method === "pattern" || method === "passkey";
}

function lockMethodKindFromLegacy(method: LockMethod): LockMethodKind {
  if (method === "pin4" || method === "pin6") return "pin";
  if (method === "password") return "password";
  if (method === "pattern") return "pattern";
  if (method === "passkey") return "passkey";
  if (method === "swipe") return "swipe";
  return "none";
}

function lockMethodFromKind(method: LockMethodKind, pinDigits: 4 | 6 = 4): LockMethod {
  if (method === "none") return "none";
  if (method === "swipe") return "swipe";
  if (method === "pin") return pinDigits === 6 ? "pin6" : "pin4";
  if (method === "password") return "password";
  if (method === "pattern") return "pattern";
  return "passkey";
}

function normalizeLockMethodsConfig(
  primaryInput: unknown,
  secondaryInput: unknown,
  fallbackPrimary: LockMethodKind = "none"
): LockMethodsConfig {
  const fallback = normalizeLockMethodKind(fallbackPrimary) ?? "none";
  const primary: LockMethodKind = normalizeLockMethodKind(primaryInput) ?? fallback;
  const candidateSecondary = normalizeLockMethodKind(secondaryInput);
  let secondary: SecureLockMethodKind | null = isSecureLockMethodKind(candidateSecondary) ? candidateSecondary : null;

  if (primary === "none" || primary === "swipe") {
    secondary = null;
  }

  if (secondary && secondary === primary) {
    secondary = null;
  }

  return {
    primaryLockMethod: primary,
    secondaryLockMethod: secondary,
  };
}

function pickSecondaryLockMethod(
  primary: LockMethodKind,
  hasPin: boolean,
  hasPassword: boolean,
  hasPattern: boolean,
  hasPasskey: boolean
): SecureLockMethodKind | null {
  const candidates: SecureLockMethodKind[] = [];
  if (hasPassword) candidates.push("password");
  if (hasPin) candidates.push("pin");
  if (hasPattern) candidates.push("pattern");
  if (hasPasskey) candidates.push("passkey");

  for (const candidate of candidates) {
    if (candidate !== primary) return candidate;
  }

  return null;
}

function normalizeLockMethod(input: unknown, pinDigits: 4 | 6 = 4): LockMethod {
  if (input === "none") return "none";
  if (input === "swipe") return "swipe";
  if (input === "pin4") return "pin4";
  if (input === "pin6") return "pin6";
  if (input === "pin") return pinDigits === 6 ? "pin6" : "pin4";
  if (input === "password") return "password";
  if (input === "pattern") return "pattern";
  if (input === "passkey") return "passkey";
  return "none";
}

function normalizeQuickUnlock(input: unknown): QuickUnlockConfig {
  if (!input || typeof input !== "object") return DEFAULT_QUICK_UNLOCK;
  const candidate = input as Partial<QuickUnlockConfig>;
  return {
    windowsHello: false,
    passkey: !!candidate.passkey,
  };
}

function methodSupportsQuickUnlock(method: LockMethod): boolean {
  return method === "pin4" || method === "pin6" || method === "password" || method === "pattern" || method === "passkey";
}

function normalizeBase64url(value: unknown, maxLen = 8192): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLen) return undefined;
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) return undefined;
  return normalized;
}

function normalizeSimpleId(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  if (!normalized || normalized.length > 64) return fallback;
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) return fallback;
  return normalized;
}

function normalizePasskeyName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;
  if (normalized.length > 80) return normalized.slice(0, 80);
  return normalized;
}

function normalizeAutoLockSeconds(value: unknown): number {
  if (value === 0) return 0;
  if (typeof value !== "number" || !Number.isInteger(value)) return DEFAULT_SETTINGS.autoLockSeconds;
  if (value < 15 || value > 86400) return DEFAULT_SETTINGS.autoLockSeconds;
  return value;
}

function normalizeSafetySetupReminderAt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

function normalizeLockState(input: unknown): LockState {
  if (!input || typeof input !== "object") return DEFAULT_LOCK_STATE;
  const candidate = input as Partial<LockState>;
  const failedCount =
    typeof candidate.failedCount === "number" && Number.isInteger(candidate.failedCount) && candidate.failedCount > 0
      ? candidate.failedCount
      : 0;
  const lockUntilEpochMs =
    typeof candidate.lockUntilEpochMs === "number" && Number.isFinite(candidate.lockUntilEpochMs) && candidate.lockUntilEpochMs > 0
      ? Math.floor(candidate.lockUntilEpochMs)
      : 0;
  const disabledAtEpochMs =
    typeof candidate.disabledAtEpochMs === "number" && Number.isFinite(candidate.disabledAtEpochMs) && candidate.disabledAtEpochMs > 0
      ? Math.floor(candidate.disabledAtEpochMs)
      : 0;
  return disabledAtEpochMs > 0 ? { failedCount, lockUntilEpochMs, disabledAtEpochMs } : { failedCount, lockUntilEpochMs };
}

function settingsMatchesNormalized(candidate: Record<string, unknown>, normalized: AppSettings): boolean {
  return (
    candidate.defaultDigits === normalized.defaultDigits &&
    candidate.defaultPeriod === normalized.defaultPeriod &&
    candidate.hideLabelsOnSmall === normalized.hideLabelsOnSmall &&
    candidate.privacyScreen === normalized.privacyScreen &&
    candidate.clipboardSafetyEnabled === normalized.clipboardSafetyEnabled &&
    candidate.runInBackground === normalized.runInBackground &&
    candidate.startWithSystem === normalized.startWithSystem &&
    candidate.trayMenuStyle === normalized.trayMenuStyle &&
    candidate.trayMenuAnimations === normalized.trayMenuAnimations &&
    candidate.trayMenuThemeSync === normalized.trayMenuThemeSync &&
    candidate.trayIconStyle === normalized.trayIconStyle &&
    candidate.alwaysOnTop === normalized.alwaysOnTop &&
    candidate.baseMode === normalized.baseMode &&
    candidate.themeColor === normalized.themeColor &&
    candidate.accentOverride === normalized.accentOverride &&
    candidate.motionMode === normalized.motionMode &&
    candidate.pauseWhenBackground === normalized.pauseWhenBackground &&
    candidate.accountsLayoutMode === normalized.accountsLayoutMode &&
    candidate.accountsGridColumns === normalized.accountsGridColumns &&
    candidate.accountsDensity === normalized.accountsDensity &&
    candidate.biometricEnabled === normalized.biometricEnabled &&
    candidate.autoLockSeconds === normalized.autoLockSeconds &&
    candidate.lockOnFocusLoss === normalized.lockOnFocusLoss &&
    candidate.hasCompletedSafetySetup === normalized.hasCompletedSafetySetup &&
    candidate.hasSkippedSafetySetup === normalized.hasSkippedSafetySetup &&
    candidate.lastSafetySetupReminderAt === normalized.lastSafetySetupReminderAt &&
    !("theme" in candidate) &&
    !("baseTheme" in candidate) &&
    !("accent" in candidate)
  );
}

function normalizeSettings(input: unknown): { settings: AppSettings; changed: boolean } {
  if (!input || typeof input !== "object") {
    return { settings: DEFAULT_SETTINGS, changed: false };
  }

  const candidate = input as Record<string, unknown>;
  const theme = normalizeThemeSettings({
    baseMode: candidate.baseMode,
    themeColor: candidate.themeColor,
    accentOverride: candidate.accentOverride,
    baseTheme: candidate.baseTheme,
    accent: candidate.accent,
    theme: candidate.theme,
  });

  const settings: AppSettings = {
    defaultDigits: candidate.defaultDigits === 8 ? 8 : 6,
    defaultPeriod:
      typeof candidate.defaultPeriod === "number" &&
      Number.isInteger(candidate.defaultPeriod) &&
      candidate.defaultPeriod >= 1 &&
      candidate.defaultPeriod <= 300
        ? candidate.defaultPeriod
        : DEFAULT_SETTINGS.defaultPeriod,
    hideLabelsOnSmall: !!candidate.hideLabelsOnSmall,
    privacyScreen: candidate.privacyScreen !== false,
    clipboardSafetyEnabled: candidate.clipboardSafetyEnabled !== false,
    runInBackground: candidate.runInBackground !== false,
    startWithSystem: candidate.startWithSystem === true,
    trayMenuStyle: normalizeTrayMenuStyle(candidate.trayMenuStyle),
    trayMenuAnimations: normalizeTrayMenuAnimations(candidate.trayMenuAnimations),
    trayMenuThemeSync: candidate.trayMenuThemeSync !== false,
    trayIconStyle: normalizeTrayIconStyle(candidate.trayIconStyle),
    alwaysOnTop: !!candidate.alwaysOnTop,
    baseMode: theme.baseMode,
    themeColor: theme.themeColor,
    accentOverride: theme.accentOverride,
    motionMode: normalizeMotionMode(candidate.motionMode),
    pauseWhenBackground: normalizePauseWhenBackground(candidate.pauseWhenBackground),
    accountsLayoutMode: normalizeAccountsLayoutMode(candidate.accountsLayoutMode),
    accountsGridColumns: normalizeAccountsGridColumns(candidate.accountsGridColumns),
    accountsDensity: normalizeAccountsDensity(candidate.accountsDensity),
    biometricEnabled: candidate.biometricEnabled !== false,
    autoLockSeconds: normalizeAutoLockSeconds(candidate.autoLockSeconds),
    lockOnFocusLoss: !!candidate.lockOnFocusLoss,
    hasCompletedSafetySetup: candidate.hasCompletedSafetySetup === true,
    hasSkippedSafetySetup: candidate.hasSkippedSafetySetup === true,
    lastSafetySetupReminderAt: normalizeSafetySetupReminderAt(candidate.lastSafetySetupReminderAt),
  };

  if (settings.hasCompletedSafetySetup && settings.hasSkippedSafetySetup) {
    settings.hasSkippedSafetySetup = false;
  }

  return {
    settings,
    changed:
      !settingsMatchesNormalized(candidate, settings) ||
      theme.usedLegacyTheme ||
      theme.usedLegacyBaseThemeAccent ||
      theme.hadInvalidBaseMode ||
      theme.hadInvalidThemeColor ||
      theme.hadInvalidAccentOverride,
  };
}

function authUiSettingsFromAppSettings(settings: AppSettings): AuthUiSettings {
  return {
    baseMode: settings.baseMode,
    themeColor: settings.themeColor,
    accentOverride: settings.accentOverride,
    motionMode: settings.motionMode,
  };
}

function normalizeAuthUiSettings(input: unknown): AuthUiSettings {
  if (!input || typeof input !== "object") {
    return DEFAULT_AUTH_UI_SETTINGS;
  }

  const candidate = input as Record<string, unknown>;
  const theme = normalizeThemeSettings({
    baseMode: candidate.baseMode,
    themeColor: candidate.themeColor,
    accentOverride: candidate.accentOverride,
    baseTheme: candidate.baseTheme,
    accent: candidate.accent,
    theme: candidate.theme,
  });

  return {
    baseMode: theme.baseMode,
    themeColor: theme.themeColor,
    accentOverride: theme.accentOverride,
    motionMode: normalizeMotionMode(candidate.motionMode),
  };
}

function persistAuthUiSettings(settings: AuthUiSettings): void {
  store.set("authUiSettings", settings);
}

function normalizeLegacyHashRecord(input: unknown): LegacyHashRecord | undefined {
  if (!input || typeof input !== "object") return undefined;
  const candidate = input as Partial<LegacyHashRecord>;
  if (typeof candidate.hash !== "string" || typeof candidate.salt !== "string") return undefined;
  const hash = candidate.hash.trim().toLowerCase();
  const salt = candidate.salt.trim().toLowerCase();
  if (!isHex(hash, 64) || !isHex(salt, 32)) return undefined;
  return { hash, salt };
}

function normalizeCredentialRecord(input: unknown): CredentialRecord | undefined {
  if (!input || typeof input !== "object") return undefined;
  const candidate = input as Partial<CredentialRecord>;
  if (typeof candidate.hash !== "string") return undefined;
  const hash = candidate.hash.trim();
  if (!hash) return undefined;
  if (hash.startsWith("$argon2")) {
    return { hash };
  }

  if (typeof candidate.salt !== "string") return undefined;
  const legacyHash = hash.toLowerCase();
  const legacySalt = candidate.salt.trim().toLowerCase();
  if (!isHex(legacyHash, 64) || !isHex(legacySalt, 32)) return undefined;
  return { hash: legacyHash, salt: legacySalt };
}

function normalizePinCredential(input: unknown): PinCredentialRecord | undefined {
  if (!input || typeof input !== "object") return undefined;
  const candidate = input as Partial<PinCredentialRecord>;
  const hashRecord = normalizeCredentialRecord(candidate);
  if (!hashRecord) return undefined;
  const digits = candidate.digits === 6 ? 6 : candidate.digits === 4 ? 4 : undefined;
  if (!digits) return undefined;
  return { ...hashRecord, digits };
}

function normalizeLegacyPinCredential(input: unknown): PinCredentialRecord | undefined {
  const hashRecord = normalizeLegacyHashRecord(input);
  if (!hashRecord) return undefined;
  return { ...hashRecord, digits: 4 };
}

function decodeLegacyEncodedHash(input: string): LegacyHashRecord | undefined {
  try {
    const parts = input.split("$");
    if (parts.length !== 3 || parts[0] !== "v1") return undefined;
    const salt = Buffer.from(parts[1], "base64").toString("hex").toLowerCase();
    const hash = Buffer.from(parts[2], "base64").toString("hex").toLowerCase();
    if (!isHex(hash, 64) || !isHex(salt, 32)) return undefined;
    return { hash, salt };
  } catch {
    return undefined;
  }
}

function normalizeBackupCodeRecords(input: unknown): BackupCodeRecord[] {
  if (!Array.isArray(input)) return [];
  const next: BackupCodeRecord[] = [];
  for (const item of input) {
    const normalized = normalizeLegacyHashRecord(item);
    if (normalized) {
      next.push(normalized);
    }
  }
  return next;
}

function normalizePasskeyCredential(input: unknown, fallbackName: string, fallbackId: string): PasskeyCredentialRecord | undefined {
  if (!input || typeof input !== "object") return undefined;
  const candidate = input as Partial<PasskeyCredentialRecord>;
  const id = normalizeSimpleId(candidate.id, fallbackId);
  const name = normalizePasskeyName(candidate.name, fallbackName);
  const credentialId = normalizeBase64url(candidate.credentialId, 1024);
  const publicKey = normalizeBase64url(candidate.publicKey, 16384);
  if (!credentialId || !publicKey) return undefined;
  return {
    id,
    name,
    credentialId,
    publicKey,
    signCount:
      typeof candidate.signCount === "number" && Number.isInteger(candidate.signCount) && candidate.signCount >= 0
        ? candidate.signCount
        : 0,
  };
}

function normalizePasskeyCredentials(input: unknown): PasskeyCredentialRecord[] {
  if (!Array.isArray(input)) return [];
  const next: PasskeyCredentialRecord[] = [];
  const usedIds = new Set<string>();
  let index = 1;

  for (const item of input) {
    const fallbackId = `passkey_${index}`;
    const fallbackName = `Passkey ${index}`;
    const normalized = normalizePasskeyCredential(item, fallbackName, fallbackId);
    index += 1;
    if (!normalized) continue;

    let id = normalized.id;
    let suffix = 1;
    while (usedIds.has(id)) {
      id = `${normalized.id}_${suffix}`;
      suffix += 1;
    }

    usedIds.add(id);
    next.push({ ...normalized, id });
  }

  return next;
}

function normalizeLegacyRecoveryHashes(input: unknown): BackupCodeRecord[] {
  if (!Array.isArray(input)) return [];
  const next: BackupCodeRecord[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const decoded = decodeLegacyEncodedHash(item);
    if (decoded) {
      next.push(decoded);
    }
  }
  return next;
}

function normalizeRecoveryVerifier(input: unknown): RecoveryVerifier | null {
  if (typeof input === "string") {
    return input.startsWith("$argon2id$") ? input : null;
  }
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<LegacyRecoveryVerifier> & {
    argon2Params?: Partial<Argon2Params>;
  };
  if (typeof candidate.hash !== "string" || typeof candidate.salt !== "string") {
    return null;
  }
  if (
    !candidate.argon2Params ||
    typeof candidate.argon2Params.memoryCost !== "number" ||
    typeof candidate.argon2Params.timeCost !== "number" ||
    typeof candidate.argon2Params.parallelism !== "number"
  ) {
    return null;
  }
  return {
    hash: candidate.hash,
    salt: candidate.salt,
    argon2Params: {
      memoryCost: candidate.argon2Params.memoryCost,
      timeCost: candidate.argon2Params.timeCost,
      parallelism: candidate.argon2Params.parallelism,
    },
  };
}

function normalizeParsedPayload(parsed: unknown): EncryptedPayload {
  if (Array.isArray(parsed)) {
    return {
      accounts: parsed as StoredTotpAccount[],
      lockMethod: "none",
      primaryLockMethod: DEFAULT_LOCK_METHODS.primaryLockMethod,
      secondaryLockMethod: DEFAULT_LOCK_METHODS.secondaryLockMethod,
      quickUnlock: DEFAULT_QUICK_UNLOCK,
      backupCodes: [],
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      accounts: [],
      lockMethod: "none",
      primaryLockMethod: DEFAULT_LOCK_METHODS.primaryLockMethod,
      secondaryLockMethod: DEFAULT_LOCK_METHODS.secondaryLockMethod,
      quickUnlock: DEFAULT_QUICK_UNLOCK,
      backupCodes: [],
    };
  }

  const candidate = parsed as Partial<EncryptedPayload>;
  const pinCredential =
    normalizePinCredential(candidate.pinCredential) ??
    normalizeLegacyPinCredential(candidate.pin) ??
    (() => {
      const legacy = typeof candidate.pinHash === "string" ? decodeLegacyEncodedHash(candidate.pinHash) : undefined;
      return legacy ? { ...legacy, digits: 4 as const } : undefined;
    })();

  const passwordCredential = normalizeCredentialRecord(candidate.passwordCredential);
  const patternCredential = normalizeCredentialRecord(candidate.patternCredential);
  let passkeyCredentials = normalizePasskeyCredentials(candidate.passkeyCredentials);
  const legacyPasskeyCredential = normalizePasskeyCredential(candidate.passkeyCredential, "Passkey 1", "passkey_1");
  if (passkeyCredentials.length === 0 && legacyPasskeyCredential) {
    passkeyCredentials = [legacyPasskeyCredential];
  }
  const hasExplicitLockMethods = candidate.primaryLockMethod !== undefined || candidate.secondaryLockMethod !== undefined;
  const rawLockMethod = candidate.lockMethod;
  let quickUnlock = normalizeQuickUnlock(candidate.quickUnlock);

  if (!hasExplicitLockMethods && rawLockMethod === "windowshello") {
    quickUnlock = { ...quickUnlock, windowsHello: true };
  }
  if (!hasExplicitLockMethods && rawLockMethod === "passkey") {
    quickUnlock = { ...quickUnlock, passkey: true };
  }

  const backupCodes = (() => {
    const modern = normalizeBackupCodeRecords(candidate.backupCodes);
    if (modern.length > 0) return modern;
    return normalizeLegacyRecoveryHashes(candidate.recoveryCodeHashes);
  })();

  const pinDigits = pinCredential?.digits ?? 4;
  const legacyMethodInput = !hasExplicitLockMethods && (rawLockMethod === "windowshello" || rawLockMethod === "passkey") ? "none" : rawLockMethod;

  let lockMethod = normalizeLockMethod(legacyMethodInput, pinDigits);
  if (lockMethod === "none") {
    if (pinCredential) lockMethod = pinCredential.digits === 6 ? "pin6" : "pin4";
    else if (passwordCredential) lockMethod = "password";
    else if (patternCredential) lockMethod = "pattern";
  }

  const fallbackLockMethods = normalizeLockMethodsConfig(
    lockMethodKindFromLegacy(lockMethod),
    pickSecondaryLockMethod(
      lockMethodKindFromLegacy(lockMethod),
      !!pinCredential,
      !!passwordCredential,
      !!patternCredential,
      quickUnlock.passkey && passkeyCredentials.length > 0
    )
  );

  const lockMethods = hasExplicitLockMethods
    ? normalizeLockMethodsConfig(candidate.primaryLockMethod, candidate.secondaryLockMethod, fallbackLockMethods.primaryLockMethod)
    : fallbackLockMethods;

  lockMethod = lockMethodFromKind(lockMethods.primaryLockMethod, pinDigits);

  if (lockMethods.primaryLockMethod === "passkey" || lockMethods.secondaryLockMethod === "passkey") {
    quickUnlock = { ...quickUnlock, passkey: passkeyCredentials.length > 0 };
  }

  if (!methodSupportsQuickUnlock(lockMethod)) {
    quickUnlock = DEFAULT_QUICK_UNLOCK;
  }
  if (passkeyCredentials.length === 0) {
    quickUnlock = { ...quickUnlock, passkey: false };
  }

  const legacyLockState = normalizeLockState(candidate.lockState);

  return {
    accounts: Array.isArray(candidate.accounts) ? (candidate.accounts as StoredTotpAccount[]) : [],
    primaryLockMethod: lockMethods.primaryLockMethod,
    secondaryLockMethod: lockMethods.secondaryLockMethod,
    lockMethod,
    quickUnlock,
    pinCredential,
    passwordCredential,
    patternCredential,
    passkeyCredentials,
    backupCodes,
    recoveryVerifier: normalizeRecoveryVerifier(candidate.recoveryVerifier),
    backupCodeLockState: normalizeLockState(candidate.backupCodeLockState),
    lockState: legacyLockState,
    pinLockState: normalizeLockState(candidate.pinLockState ?? candidate.lockState),
    passwordLockState: normalizeLockState(candidate.passwordLockState ?? candidate.lockState),
    patternLockState: normalizeLockState(candidate.patternLockState ?? candidate.lockState),
    settings: candidate.settings,
  };
}

export function loadAccounts(): StoredTotpAccount[] {
  return loadPayload().accounts;
}

export function saveAccounts(accounts: StoredTotpAccount[]): void {
  if (!hasPersistentVaultData()) {
    throw new Error("Set a password before creating or importing accounts.");
  }
  const payload = loadPayload();
  payload.accounts = accounts;
  savePayload(payload);
}

export function loadLockMethod(): LockMethod {
  const payload = loadPayload();
  const pinDigits = payload.pinCredential?.digits ?? 4;
  const config = normalizeLockMethodsConfig(payload.primaryLockMethod, payload.secondaryLockMethod, lockMethodKindFromLegacy(normalizeLockMethod(payload.lockMethod, pinDigits)));
  return lockMethodFromKind(config.primaryLockMethod, pinDigits);
}

export function saveLockMethod(method: LockMethod): void {
  const payload = loadPayload();
  const pinDigits = payload.pinCredential?.digits ?? 4;
  const normalized = normalizeLockMethod(method, pinDigits);
  const currentConfig = normalizeLockMethodsConfig(
    payload.primaryLockMethod,
    payload.secondaryLockMethod,
    lockMethodKindFromLegacy(normalized)
  );
  const nextConfig = normalizeLockMethodsConfig(lockMethodKindFromLegacy(normalized), currentConfig.secondaryLockMethod);

  payload.primaryLockMethod = nextConfig.primaryLockMethod;
  payload.secondaryLockMethod = nextConfig.secondaryLockMethod;
  payload.lockMethod = lockMethodFromKind(nextConfig.primaryLockMethod, pinDigits);
  savePayload(payload);
}

export function loadLockMethodsConfig(): LockMethodsConfig {
  const payload = loadPayload();
  const pinDigits = payload.pinCredential?.digits ?? 4;
  return normalizeLockMethodsConfig(
    payload.primaryLockMethod,
    payload.secondaryLockMethod,
    lockMethodKindFromLegacy(normalizeLockMethod(payload.lockMethod, pinDigits))
  );
}

export function saveLockMethodsConfig(config: LockMethodsConfig): void {
  const payload = loadPayload();
  const pinDigits = payload.pinCredential?.digits ?? 4;
  const normalized = normalizeLockMethodsConfig(config.primaryLockMethod, config.secondaryLockMethod);

  payload.primaryLockMethod = normalized.primaryLockMethod;
  payload.secondaryLockMethod = normalized.secondaryLockMethod;
  payload.lockMethod = lockMethodFromKind(normalized.primaryLockMethod, pinDigits);
  savePayload(payload);
}

export function loadQuickUnlock(): QuickUnlockConfig {
  const payload = loadPayload();
  return normalizeQuickUnlock(payload.quickUnlock);
}

export function saveQuickUnlock(config: QuickUnlockConfig): void {
  const payload = loadPayload();
  const pinDigits = payload.pinCredential?.digits ?? 4;
  const lockMethods = normalizeLockMethodsConfig(
    payload.primaryLockMethod,
    payload.secondaryLockMethod,
    lockMethodKindFromLegacy(normalizeLockMethod(payload.lockMethod, pinDigits))
  );
  const passkeyRequired = lockMethods.primaryLockMethod === "passkey" || lockMethods.secondaryLockMethod === "passkey";
  payload.quickUnlock = normalizeQuickUnlock({
    windowsHello: false,
    passkey: passkeyRequired ? true : !!config.passkey,
  });
  savePayload(payload);
}

export function loadPinCredential(): PinCredentialRecord | undefined {
  return loadPayload().pinCredential;
}

export function savePinCredential(record: PinCredentialRecord): void {
  const payload = loadPayload();
  payload.pinCredential = normalizePinCredential(record);
  savePayload(payload);
}

export function clearPinCredential(): void {
  const payload = loadPayload();
  delete payload.pinCredential;
  savePayload(payload);
}

export function loadPasswordCredential(): CredentialRecord | undefined {
  return loadPayload().passwordCredential;
}

export function savePasswordCredential(record: CredentialRecord): void {
  const payload = loadPayload();
  payload.passwordCredential = normalizeCredentialRecord(record);
  savePayload(payload);
}

export function clearPasswordCredential(): void {
  const payload = loadPayload();
  delete payload.passwordCredential;
  savePayload(payload);
}

export function loadPatternCredential(): CredentialRecord | undefined {
  return loadPayload().patternCredential;
}

export function savePatternCredential(record: CredentialRecord): void {
  const payload = loadPayload();
  payload.patternCredential = normalizeCredentialRecord(record);
  savePayload(payload);
}

export function clearPatternCredential(): void {
  const payload = loadPayload();
  delete payload.patternCredential;
  savePayload(payload);
}

export function loadPasskeyCredential(): PasskeyCredentialRecord | undefined {
  return loadPayload().passkeyCredentials?.[0];
}

export function savePasskeyCredential(record: PasskeyCredentialRecord): void {
  const payload = loadPayload();
  const current = normalizePasskeyCredentials(payload.passkeyCredentials);
  const fallbackId = `passkey_${current.length + 1}`;
  const fallbackName = `Passkey ${current.length + 1}`;
  const normalized = normalizePasskeyCredential(record, fallbackName, fallbackId);
  if (!normalized) return;

  const existingIndex = current.findIndex(
    (item) => item.id === normalized.id || item.credentialId === normalized.credentialId
  );
  if (existingIndex >= 0) {
    current[existingIndex] = normalized;
  } else {
    current.push(normalized);
  }

  payload.passkeyCredentials = current;
  delete payload.passkeyCredential;
  savePayload(payload);
}

export function clearPasskeyCredential(): void {
  const payload = loadPayload();
  payload.passkeyCredentials = [];
  delete payload.passkeyCredential;
  savePayload(payload);
}

export function loadPasskeyCredentials(): PasskeyCredentialRecord[] {
  return loadPayload().passkeyCredentials ?? [];
}

export function savePasskeyCredentials(records: PasskeyCredentialRecord[]): void {
  const payload = loadPayload();
  payload.passkeyCredentials = normalizePasskeyCredentials(records);
  delete payload.passkeyCredential;
  savePayload(payload);
}

export function loadBackupCodeRecords(): BackupCodeRecord[] {
  return loadPayload().backupCodes ?? [];
}

export function saveBackupCodeRecords(records: BackupCodeRecord[]): void {
  const payload = loadPayload();
  payload.backupCodes = normalizeBackupCodeRecords(records);
  savePayload(payload);
}

export function clearBackupCodeRecords(): void {
  const payload = loadPayload();
  payload.backupCodes = [];
   payload.backupCodeLockState = DEFAULT_LOCK_STATE;
  savePayload(payload);
}

export function loadBackupCodeLockState(): LockState {
  const payload = loadPayload();
  return normalizeLockState(payload.backupCodeLockState);
}

export function saveBackupCodeLockState(state: LockState): void {
  const payload = loadPayload();
  payload.backupCodeLockState = normalizeLockState(state);
  savePayload(payload);
}

export function loadLockState(): LockState {
  const payload = loadPayload();
  return normalizeLockState(payload.pinLockState ?? payload.lockState);
}

export function saveLockState(state: LockState): void {
  const payload = loadPayload();
  payload.pinLockState = normalizeLockState(state);
  payload.lockState = normalizeLockState(state);
  savePayload(payload);
}

export function loadCredentialLockState(type: "pin" | "password" | "pattern"): LockState {
  const payload = loadPayload();
  if (type === "password") {
    return normalizeLockState(payload.passwordLockState ?? payload.lockState);
  }
  if (type === "pattern") {
    return normalizeLockState(payload.patternLockState ?? payload.lockState);
  }
  return normalizeLockState(payload.pinLockState ?? payload.lockState);
}

export function saveCredentialLockState(type: "pin" | "password" | "pattern", state: LockState): void {
  const payload = loadPayload();
  const normalized = normalizeLockState(state);
  if (type === "password") {
    payload.passwordLockState = normalized;
  } else if (type === "pattern") {
    payload.patternLockState = normalized;
  } else {
    payload.pinLockState = normalized;
    payload.lockState = normalized;
  }
  savePayload(payload);
}

export function getVaultMode(): VaultMode {
  return getPersistedVaultMode();
}

export function isHardenedVaultUnlocked(): boolean {
  return !hasPersistentVaultData() || hardenedSession !== null;
}

export function getVaultProtectionStatus(): VaultProtectionStatus {
  const envelope = loadVaultEnvelope();
  if (!hasPersistentVaultData()) {
    return {
      mode: "hardened",
      requiresMasterPassword: false,
      hardenedSessionUnlocked: true,
      masterPasswordLockState: DEFAULT_LOCK_STATE,
      biometricEnrolled: false,
      recoveryGenerated: false,
      requiresPasswordSetup: false,
    };
  }

  if (!envelope) {
    return {
      mode: "hardened",
      requiresMasterPassword: true,
      hardenedSessionUnlocked: false,
      masterPasswordLockState: DEFAULT_LOCK_STATE,
      biometricEnrolled: false,
      recoveryGenerated: false,
      requiresPasswordSetup: hasPasswordSetupRequirement(),
    };
  }

  return {
    mode: "hardened",
    requiresMasterPassword: hardenedSession === null,
    hardenedSessionUnlocked: hardenedSession !== null,
    masterPasswordLockState: normalizeLockState(envelope.passwordUnlockLockState),
    biometricEnrolled: biometricEnrolled(envelope),
    recoveryGenerated: recoveryGenerated(envelope),
    requiresPasswordSetup: false,
  };
}

function saveMasterPasswordLockState(state: LockState): void {
  const envelope = loadVaultEnvelope();
  if (!envelope) {
    return;
  }
  saveVaultEnvelope({
    ...envelope,
    passwordUnlockLockState: normalizeLockState(state),
  });
}

export async function unlockHardenedVaultWithPassword(passphrase: string): Promise<VaultPasswordUnlockResult> {
  const envelope = loadVaultEnvelope();
  if (envelope) {
    const result = await import("./vault-v4").then(({ unlockEnvelopeWithPassword }) => unlockEnvelopeWithPassword(passphrase, envelope));
    if (result.result !== "OK") {
      saveVaultEnvelope(envelope);
      return result;
    }
    setUnlockedHardenedSession(result.vdk, result.payloadJson);
    clearPendingRecoveryReset();
    saveMasterPasswordLockState(DEFAULT_LOCK_STATE);
    return { result: "OK" };
  }

  if (hasLegacyHardenedEnvelopeData()) {
    try {
      const payload = normalizeParsedPayload(JSON.parse(await decryptLegacyHardenedPayload(loadLegacyHardenedEnvelopeOrThrow(), passphrase)) as unknown);
      await persistFreshVaultWithPassword(payload, passphrase);
      return { result: "OK" };
    } catch {
      return { result: "INCORRECT", attemptsUsed: 1 };
    }
  }

  if (hasLegacyStandardBlob()) {
    const payload = loadLegacyStandardPayload();
    const ok = await verifyPasswordCredentialRecord(payload.passwordCredential, passphrase);
    if (!ok) {
      return { result: "INCORRECT", attemptsUsed: 1 };
    }
    await persistFreshVaultWithPassword(payload, passphrase);
    return { result: "OK" };
  }

  return { result: "INCORRECT", attemptsUsed: 1 };
}

export async function enableHardenedMode(passphrase: string): Promise<void> {
  if (hasVaultEnvelope()) {
    throw new Error("Vault v4 is already active.");
  }
  await initializeVaultWithPassword(passphrase);
}

export async function disableHardenedMode(): Promise<void> {
  throw new Error("Standard mode has been removed.");
}

export async function rotateHardenedVaultPassword(passphrase: string): Promise<void> {
  const envelope = loadVaultEnvelope();
  if (!envelope || !hardenedSession) {
    throw new HardenedVaultLockedError();
  }
  const normalizedPassword = normalizeNewMasterPassword(passphrase);
  saveVaultEnvelope(await rotatePasswordWrap(envelope, normalizedPassword));
}

export function loadSettings(): AppSettings {
  if (hasPersistentVaultData() && hardenedSession === null) {
    const authUi = loadAuthUiSettings();
    return {
      ...DEFAULT_SETTINGS,
      ...authUi,
    };
  }

  const payload = loadPayload();
  const normalized = normalizeSettings(payload.settings);
  if (normalized.changed) {
    payload.settings = normalized.settings;
    savePayload(payload);
  }
  persistAuthUiSettings(authUiSettingsFromAppSettings(normalized.settings));
  return normalized.settings;
}

export function saveSettings(settings: AppSettings): void {
  const normalizedSettings = normalizeSettings(settings).settings;
  if (!hasPersistentVaultData()) {
    persistAuthUiSettings(authUiSettingsFromAppSettings(normalizedSettings));
    return;
  }
  const payload = loadPayload();
  payload.settings = normalizedSettings;
  savePayload(payload);
  persistAuthUiSettings(authUiSettingsFromAppSettings(normalizedSettings));
}

export function loadAuthUiSettings(): AuthUiSettings {
  const persisted = normalizeAuthUiSettings(store.get("authUiSettings"));
  if (hasPersistentVaultData() && hardenedSession === null) {
    return persisted;
  }

  try {
    const settings = loadSettings();
    const next = authUiSettingsFromAppSettings(settings);
    persistAuthUiSettings(next);
    return next;
  } catch {
    return persisted;
  }
}

export function loadProtectedSettingsIfUnlocked(): AppSettings | null {
  if (!canReadVaultPayload() || !hasPersistentVaultData()) {
    return null;
  }
  return loadSettings();
}

export async function unlockVaultWithBiometric(): Promise<boolean> {
  const envelope = loadVaultEnvelope();
  if (!envelope) {
    return false;
  }
  const unlocked = await import("./vault-v4").then(({ unlockEnvelopeWithBiometric }) => unlockEnvelopeWithBiometric(envelope));
  setUnlockedHardenedSession(unlocked.vdk, unlocked.payloadJson);
  clearPendingRecoveryReset();
  saveVaultEnvelope(clearPasswordUnlockLockState(envelope));
  return true;
}

export async function enrollBiometricUnlock(): Promise<boolean> {
  if (!hardenedSession) {
    throw new HardenedVaultLockedError();
  }
  const envelope = loadVaultEnvelope();
  if (!envelope) {
    return false;
  }
  const payload = loadPayload();
  const biometricWrappedVdk = await import("./vault-v4").then(({ enrollMacBiometricWrappedVdk }) => enrollMacBiometricWrappedVdk(hardenedSession.vaultKey));
  if (!biometricWrappedVdk) {
    return false;
  }
  persistUnlockedPayload(payload, {
    biometricWrappedVdk,
    outerMeta: {
      ...outerMetaFromEnvelope(envelope),
      biometricEnrolled: true,
    },
  });
  return true;
}

export async function removeBiometricUnlock(): Promise<void> {
  if (!hardenedSession) {
    throw new HardenedVaultLockedError();
  }
  const envelope = loadVaultEnvelope();
  if (!envelope) {
    return;
  }
  const payload = loadPayload();
  await import("./vault-v4").then(({ removeMacBiometricWrappedVdk }) => removeMacBiometricWrappedVdk(envelope.biometricWrappedVdk));
  persistUnlockedPayload(payload, {
    biometricWrappedVdk: null,
    outerMeta: {
      ...outerMetaFromEnvelope(envelope),
      biometricEnrolled: false,
    },
  });
}

export async function generateRecoverySecret(): Promise<string> {
  if (!hardenedSession) {
    throw new HardenedVaultLockedError();
  }
  const envelope = loadVaultEnvelope();
  if (!envelope) {
    throw new HardenedVaultLockedError();
  }
  const payload = loadPayload();
  const generated = await createRecoverySecretAndWrap(hardenedSession.vaultKey);
  payload.recoveryVerifier = generated.recoveryVerifier;
  persistUnlockedPayload(payload, {
    recoveryWrappedVdk: generated.recoveryWrappedVdk,
    outerMeta: {
      ...outerMetaFromEnvelope(envelope),
      recoveryGenerated: true,
    },
  });
  logDesktopDebug("recovery secret generated", {
    fingerprint: recoverySecretFingerprint(generated.secret),
    groups: generated.secret.split("-").length,
    groupSizes: generated.secret.split("-").map((group) => group.length),
    hasRecoveryWrappedVdk: true,
  });
  return generated.secret;
}

export async function validateAndBurnRecoverySecret(secret: string): Promise<boolean> {
  const envelope = loadVaultEnvelope();
  if (!envelope) {
    logDesktopDebug("recovery secret validate failed: missing envelope", {
      fingerprint: recoverySecretFingerprint(secret),
    });
    return false;
  }
  logDesktopDebug("recovery secret validate attempt", {
    fingerprint: recoverySecretFingerprint(secret),
    hasRecoveryWrappedVdk: !!envelope.recoveryWrappedVdk,
    pendingRecoveryReset: pendingRecoveryReset !== null,
  });
  const unlocked = await import("./vault-v4").then(({ unlockEnvelopeWithRecoverySecret }) => unlockEnvelopeWithRecoverySecret(secret, envelope));
  if (unlocked.result !== "OK") {
    logDesktopDebug("recovery secret unwrap rejected", {
      fingerprint: recoverySecretFingerprint(secret),
    });
    return false;
  }
  const payload = normalizeParsedPayload(JSON.parse(unlocked.payloadJson) as unknown);
  if (payload.recoveryVerifier) {
    const verified = await import("./vault-v4").then(({ verifyRecoverySecret }) => verifyRecoverySecret(secret, payload.recoveryVerifier ?? null));
    if (!verified) {
      logDesktopDebug("recovery secret verifier mismatch", {
        fingerprint: recoverySecretFingerprint(secret),
      });
      return false;
    }
  }

  payload.recoveryVerifier = null;
  clearHardenedSession();
  clearPendingRecoveryReset();
  pendingRecoveryReset = {
    vaultKey: Buffer.from(unlocked.vdk),
    payload,
  };
  saveVaultEnvelope(
    rewriteVaultEnvelopeWithVdk(envelope, JSON.stringify(payload), pendingRecoveryReset.vaultKey, {
      recoveryWrappedVdk: null,
      outerMeta: {
        ...outerMetaFromEnvelope(envelope),
        recoveryGenerated: false,
      },
      passwordUnlockLockState: clearPasswordUnlockLockState(envelope).passwordUnlockLockState,
    })
  );
  logDesktopDebug("recovery secret burned for password reset", {
    fingerprint: recoverySecretFingerprint(secret),
  });
  return true;
}

export async function setPasswordAfterRecovery(password: string): Promise<boolean> {
  if (!pendingRecoveryReset) {
    return false;
  }
  const envelope = loadVaultEnvelope();
  if (!envelope) {
    clearPendingRecoveryReset();
    return false;
  }

  const normalizedPassword = normalizeNewMasterPassword(password);
  const nextPayload = normalizeParsedPayload(pendingRecoveryReset.payload);
  nextPayload.passwordCredential = await createPasswordCredentialRecord(normalizedPassword);
  if (nextPayload.primaryLockMethod === "none") {
    nextPayload.primaryLockMethod = "password";
    nextPayload.lockMethod = "password";
  }
  nextPayload.recoveryVerifier = null;

  const updatedEnvelope = await replacePasswordWrapWithVdk(
    rewriteVaultEnvelopeWithVdk(envelope, JSON.stringify(nextPayload), pendingRecoveryReset.vaultKey, {
      recoveryWrappedVdk: null,
      outerMeta: {
        ...outerMetaFromEnvelope(envelope),
        recoveryGenerated: false,
      },
      passwordUnlockLockState: DEFAULT_LOCK_STATE,
    }),
    pendingRecoveryReset.vaultKey,
    normalizedPassword
  );
  saveVaultEnvelope(updatedEnvelope);
  clearPendingRecoveryReset();
  logDesktopDebug("recovery password reset completed");
  return true;
}
