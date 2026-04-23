import { decryptBackup, encryptBackup, type EncryptedBackup } from "@authenticator/backup";
import {
  DEFAULT_SETTINGS,
  normalizeAccentId,
  normalizeBaseThemeId,
  normalizeMotionMode,
  normalizeTrayIconStyle,
  normalizeTrayMenuAnimations,
  normalizeTrayMenuStyle,
} from "@authenticator/ui";
import type { AppSettings, Bridge, EditableAccount, ManualPayload, UpdateAccountPayload } from "@authenticator/ui";
import type { AccountMeta, CodeResult, StoredTotpAccount } from "@authenticator/core";
import {
  MOBILE_PIN_MAX_LENGTH,
  MOBILE_PIN_MIN_LENGTH,
  getMobilePinPolicyIssue,
  getMobilePinPolicyMessage,
  parseOtpauthUri,
  totpCodeSync,
} from "@authenticator/core";
import {
  clearVaultStore,
  loadLegacyStoredBlob,
  loadSettings as loadPersistedSettings,
  loadVaultStore,
  saveLegacyStoredBlob,
  saveSettings as savePersistedSettings,
  saveVaultStore,
  type LegacyStoredBlob,
  type LockState as PersistedLockState,
  type MobileVaultPayload,
  type MobileVaultStore,
} from "./storage-adapter";
import {
  VAULT_INACCESSIBLE_INTEGRITY,
  VAULT_INACCESSIBLE_KEYSTORE,
  changeMobileVaultPin,
  createMobileVaultStore,
  decryptPayloadWithVdk,
  enrollMobileVaultBiometric,
  generateMobileVaultRecovery,
  migrateLegacyMobileVault,
  unlockMobileVaultWithBiometric,
  unlockMobileVaultWithPin,
  unlockMobileVaultWithRecovery,
  verifyPinCredential,
  type VaultKeyDriver,
} from "./mobile-vault";
import { VaultKey } from "./vault-key";

type ErrorCode =
  | "E_LOCKED"
  | "E_STEP_UP_REQUIRED"
  | "E_VAULT_INACCESSIBLE"
  | "E_BIOMETRIC_INVALIDATED"
  | "E_PIN_INVALID"
  | "E_PIN_REQUIRED"
  | "E_URI_INVALID"
  | "E_SECRET_INVALID"
  | "E_DIGITS_INVALID"
  | "E_PERIOD_INVALID"
  | "E_ALGORITHM_INVALID"
  | "E_PASSPHRASE_INVALID"
  | "E_BACKUP_FILE_INVALID"
  | "E_BACKUP_DECRYPT_FAILED"
  | "E_INTERNAL";

class BridgeError extends Error {
  code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "BridgeError";
  }
}

function fail(code: ErrorCode, message: string): never {
  throw new BridgeError(code, message);
}

function normalizeError(error: unknown): BridgeError {
  if (error instanceof BridgeError) return error;

  if (error instanceof Error) {
    const msg = error.message || "";
    if (/decryption failed|decrypt|auth tag/i.test(msg)) {
      return new BridgeError("E_BACKUP_DECRYPT_FAILED", "We could not decrypt the backup. Check your passphrase and try again.");
    }
    if (/json|unexpected token|invalid backup format/i.test(msg)) {
      return new BridgeError("E_BACKUP_FILE_INVALID", "That backup file is invalid. Select a valid encrypted backup file.");
    }
    if (/otpauth|uri|totp|scheme/i.test(msg)) {
      return new BridgeError("E_URI_INVALID", "Use a valid TOTP URI that starts with otpauth://totp/.");
    }

    if (/camera|permission|scanner|barcode|qr/i.test(msg)) {
      return new BridgeError(
        "E_INTERNAL",
        "Camera scanning is unavailable right now. Check camera permission and try again."
      );
    }
  }

  return new BridgeError("E_INTERNAL", "Something unexpected happened. Please try again.");
}

function throwNormalized(error: unknown): never {
  throw normalizeError(error);
}

let cachedVaultStore: MobileVaultStore | null = null;
let cachedLegacyBlob: LegacyStoredBlob | null = null;
let activeVaultPayload: MobileVaultPayload | null = null;
let activeVdk: Uint8Array | null = null;
let cachedPinLockState: PersistedLockState = { failedAttemptCount: 0, lockedUntilEpochMs: 0 };
let cachedBiometricLockState: PersistedLockState = { failedAttemptCount: 0, lockedUntilEpochMs: 0 };
let cachedRecoveryLockState: PersistedLockState = { failedAttemptCount: 0, lockedUntilEpochMs: 0 };
let statusLoaded = false;
let unlocked = false;
let biometricAvailable: boolean | null = null;
let pendingStepUpVerifiedAt = 0;
let activeSecuritySessionExpiresAt = 0;

const STEP_UP_GRANT_TTL_MS = 10_000;
const SECURITY_SESSION_TTL_MS = 60_000;

const DEFAULT_PIN_LOCK_STATE: PersistedLockState = {
  failedAttemptCount: 0,
  lockedUntilEpochMs: 0,
};

const vaultKeyDriver: VaultKeyDriver = {
  async createKey(options) {
    return VaultKey.generateKey({ alias: options?.alias });
  },
  async wrap(alias, plaintext) {
    return VaultKey.wrap({ alias, plaintextBase64: bytesToBase64(plaintext) });
  },
  async unwrap(alias, wrapped) {
    const result = await VaultKey.unwrap({ alias, iv: wrapped.iv, wrappedKey: wrapped.wrappedKey, authTag: wrapped.authTag });
    return {
      plaintext: base64ToBytes(result.plaintextBase64),
      secureHardwareEnforced: result.secureHardwareEnforced,
      securityLevel: result.securityLevel,
    };
  },
  async deleteKey(alias) {
    await VaultKey.deleteKey({ alias });
  },
};

function validatePin(pin: string): string {
  const clean = pin.trim();
  const issue = getMobilePinPolicyIssue(clean);
  if (issue) {
    fail("E_PIN_INVALID", getMobilePinPolicyMessage(issue));
  }
  return clean;
}

function validateSecretBase32(secret: string): string {
  const clean = secret.trim().replace(/\s/g, "").replace(/=/g, "").toUpperCase();
  if (!clean || !/^[A-Z2-7]+$/.test(clean)) {
    fail("E_SECRET_INVALID", "Use a Base32 secret with letters A-Z and numbers 2-7.");
  }
  return clean;
}

function readSecretInput(payload: Record<string, unknown>): unknown {
  if (payload.secret !== undefined) {
    return payload.secret;
  }
  return payload.secretBase32;
}

function validateDigits(digits: number): 6 | 8 {
  if (digits !== 6 && digits !== 8) {
    fail("E_DIGITS_INVALID", "Choose 6 or 8 digits.");
  }
  return digits;
}

function validatePeriod(period: number): number {
  if (!Number.isInteger(period) || period < 1 || period > 300) {
    fail("E_PERIOD_INVALID", "Use a period between 1 and 300 seconds.");
  }
  return period;
}

function validateAlgorithm(value: string): "SHA1" | "SHA256" | "SHA512" {
  if (value === "SHA1" || value === "SHA256" || value === "SHA512") {
    return value;
  }
  fail("E_ALGORITHM_INVALID", "Choose SHA1, SHA256, or SHA512.");
}

function validatePassphrase(passphrase: string): string {
  // TODO: passphrase trimming — see desktop fix in packages/backup/src/index.ts for the correct version-gated approach.
  const clean = passphrase.trim();
  if (clean.length < 8 || clean.length > 256) {
    fail("E_PASSPHRASE_INVALID", "Use a passphrase with 8 to 256 characters.");
  }
  return clean;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function zeroBytes(value: Uint8Array | null | undefined): void {
  if (!value) return;
  value.fill(0);
}

function stripPayloadAccounts(payload: MobileVaultPayload): MobileVaultPayload {
  return {
    ...payload,
    accounts: [],
  };
}

// Migration-only helper for legacy PBKDF2 PIN hashes.
// Successful verification immediately upgrades storage to Argon2id.
async function hashLegacyPinForMigration(pin: string, salt?: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const pinBytes = encoder.encode(pin);
  const pinKey = await crypto.subtle.importKey("raw", pinBytes, "PBKDF2", false, ["deriveBits"]);
  const saltBytes = new Uint8Array(16);
  if (salt) {
    saltBytes.set(salt.subarray(0, 16));
  } else {
    crypto.getRandomValues(saltBytes);
  }
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", iterations: 210000, salt: saltBytes },
    pinKey,
    256
  );
  return `v1$${bytesToBase64(saltBytes)}$${bytesToBase64(new Uint8Array(bits))}`;
}

async function verifyLegacyPinHashForMigration(pin: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const expected = base64ToBytes(parts[2]);
  const computedHash = await hashLegacyPinForMigration(pin, base64ToBytes(parts[1]));
  const computed = base64ToBytes(computedHash.split("$")[2]);
  if (expected.length !== computed.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected[i] ^ computed[i];
  return diff === 0;
}

function currentPinConfigured(): boolean {
  return !!cachedVaultStore?.pinCredential || !!cachedLegacyBlob?.pinHash;
}

function currentSettings(): AppSettings | undefined {
  return cachedVaultStore?.settings ?? cachedLegacyBlob?.settings;
}

async function persistCurrentStore(next: MobileVaultStore): Promise<void> {
  cachedVaultStore = next;
  cachedLegacyBlob = null;
  await saveVaultStore(next);
}

function clearActiveUnlockedSession(): void {
  if (activeVdk) {
    zeroBytes(activeVdk);
  }
  activeVdk = null;
  activeVaultPayload = null;
}

function setActiveUnlockedSession(vdk: Uint8Array, payload: MobileVaultPayload): void {
  clearActiveUnlockedSession();
  activeVdk = vdk;
  activeVaultPayload = stripPayloadAccounts(payload);
}

async function ensureStatusLoaded(): Promise<void> {
  if (statusLoaded) return;
  cachedVaultStore = await loadVaultStore();
  cachedLegacyBlob = cachedVaultStore ? null : await loadLegacyStoredBlob();
  cachedPinLockState = cachedVaultStore?.lockoutState ?? {
    failedAttemptCount: cachedLegacyBlob?.pinLockState?.failedCount ?? 0,
    lockedUntilEpochMs: cachedLegacyBlob?.pinLockState?.lockUntilEpochMs ?? 0,
  };
  cachedBiometricLockState = cloneLockState(cachedVaultStore?.biometricLockoutState ?? DEFAULT_PIN_LOCK_STATE);
  cachedRecoveryLockState = cloneLockState(cachedVaultStore?.recoveryLockoutState ?? DEFAULT_PIN_LOCK_STATE);
  unlocked = !currentPinConfigured();
  statusLoaded = true;
}

function delaySecondsForPinFailure(failedCount: number): number {
  if (failedCount <= 3) return 0;
  if (failedCount <= 6) return 5;
  if (failedCount <= 9) return 30;
  return 0;
}

function cloneLockState(state: PersistedLockState = DEFAULT_PIN_LOCK_STATE): PersistedLockState {
  return state.disabledAtEpochMs ? { ...state } : { failedAttemptCount: state.failedAttemptCount, lockedUntilEpochMs: state.lockedUntilEpochMs };
}

function isFactorDisabled(state: PersistedLockState): boolean {
  return (state.disabledAtEpochMs ?? 0) > 0;
}

function currentFactorLockResult(
  state: PersistedLockState
): { result: "LOCKED"; lockedUntil: number; attemptsUsed: number; disabled?: boolean } {
  if (isFactorDisabled(state)) {
    return { result: "LOCKED", lockedUntil: state.lockedUntilEpochMs, attemptsUsed: state.failedAttemptCount, disabled: true };
  }
  return {
    result: "LOCKED",
    lockedUntil: state.lockedUntilEpochMs,
    attemptsUsed: state.failedAttemptCount,
  };
}

async function persistPinLockState(next: PersistedLockState): Promise<void> {
  cachedPinLockState = cloneLockState(next);
  if (cachedVaultStore) {
    cachedVaultStore = {
      ...cachedVaultStore,
      lockoutState: cloneLockState(next),
    };
    await saveVaultStore(cachedVaultStore);
    return;
  }
  if (cachedLegacyBlob) {
    cachedLegacyBlob = {
      ...cachedLegacyBlob,
      pinLockState: {
        failedCount: next.failedAttemptCount,
        lockUntilEpochMs: next.lockedUntilEpochMs,
      },
    };
    await saveLegacyStoredBlob(cachedLegacyBlob);
  }
}

async function clearPinLockState(): Promise<void> {
  await persistPinLockState(DEFAULT_PIN_LOCK_STATE);
}

async function persistBiometricLockState(next: PersistedLockState): Promise<void> {
  cachedBiometricLockState = cloneLockState(next);
  if (!cachedVaultStore) {
    return;
  }
  cachedVaultStore = {
    ...cachedVaultStore,
    biometricLockoutState: cloneLockState(next),
  };
  await saveVaultStore(cachedVaultStore);
}

async function clearBiometricLockState(): Promise<void> {
  await persistBiometricLockState(DEFAULT_PIN_LOCK_STATE);
}

async function persistRecoveryLockState(next: PersistedLockState): Promise<void> {
  cachedRecoveryLockState = cloneLockState(next);
  if (!cachedVaultStore) {
    return;
  }
  cachedVaultStore = {
    ...cachedVaultStore,
    recoveryLockoutState: cloneLockState(next),
  };
  await saveVaultStore(cachedVaultStore);
}

async function clearRecoveryLockState(): Promise<void> {
  await persistRecoveryLockState(DEFAULT_PIN_LOCK_STATE);
}

async function recordPinFailure(now = Date.now()): Promise<
  { result: "INCORRECT"; attemptsUsed: number } | { result: "LOCKED"; lockedUntil: number; attemptsUsed: number; disabled?: boolean }
> {
  const attemptsUsed = Math.min(cachedPinLockState.failedAttemptCount + 1, 10);
  if (attemptsUsed >= 10) {
    await persistPinLockState({ failedAttemptCount: attemptsUsed, lockedUntilEpochMs: 0, disabledAtEpochMs: now });
    return { result: "LOCKED", lockedUntil: 0, attemptsUsed, disabled: true };
  }
  const delaySeconds = delaySecondsForPinFailure(attemptsUsed);
  const lockedUntilEpochMs = delaySeconds > 0 ? now + delaySeconds * 1000 : 0;
  await persistPinLockState({ failedAttemptCount: attemptsUsed, lockedUntilEpochMs });
  if (lockedUntilEpochMs > now) {
    return { result: "LOCKED", lockedUntil: lockedUntilEpochMs, attemptsUsed };
  }
  return { result: "INCORRECT", attemptsUsed };
}

async function recordBiometricFailure(now = Date.now()): Promise<void> {
  const attemptsUsed = Math.min(cachedBiometricLockState.failedAttemptCount + 1, 10);
  if (attemptsUsed >= 10) {
    await persistBiometricLockState({ failedAttemptCount: attemptsUsed, lockedUntilEpochMs: 0, disabledAtEpochMs: now });
    return;
  }
  const delaySeconds = delaySecondsForPinFailure(attemptsUsed);
  const lockedUntilEpochMs = delaySeconds > 0 ? now + delaySeconds * 1000 : 0;
  await persistBiometricLockState({ failedAttemptCount: attemptsUsed, lockedUntilEpochMs });
}

function clearExpiredStepUpAuth(now = Date.now()): void {
  if (pendingStepUpVerifiedAt && now - pendingStepUpVerifiedAt > STEP_UP_GRANT_TTL_MS) {
    pendingStepUpVerifiedAt = 0;
  }
  if (activeSecuritySessionExpiresAt && now > activeSecuritySessionExpiresAt) {
    activeSecuritySessionExpiresAt = 0;
  }
}

function recordStepUpAuth(): void {
  clearExpiredStepUpAuth();
  pendingStepUpVerifiedAt = Date.now();
}

function consumeStepUpAuth(): void {
  pendingStepUpVerifiedAt = 0;
}

function invalidateSecuritySession(): void {
  pendingStepUpVerifiedAt = 0;
  activeSecuritySessionExpiresAt = 0;
}

function openSecuritySession(): void {
  clearExpiredStepUpAuth();
  if (!pendingStepUpVerifiedAt) {
    fail("E_STEP_UP_REQUIRED", "This action requires you to verify your identity.");
  }
  activeSecuritySessionExpiresAt = Date.now() + SECURITY_SESSION_TTL_MS;
  consumeStepUpAuth();
}

function requireSecuritySession(): void {
  clearExpiredStepUpAuth();
  if (!activeSecuritySessionExpiresAt) {
    fail("E_STEP_UP_REQUIRED", "A security session is required. Open one first.");
  }
}

async function verifyStepUpPin(input: string): Promise<{ result: "OK" } | { result: "INCORRECT"; attemptsUsed: number } | { result: "LOCKED"; lockedUntil: number; attemptsUsed: number; disabled?: boolean }> {
  await ensureStatusLoaded();
  if (!currentPinConfigured()) {
    return { result: "INCORRECT", attemptsUsed: 0 };
  }

  if (isFactorDisabled(cachedPinLockState)) {
    return currentFactorLockResult(cachedPinLockState);
  }
  if (cachedPinLockState.lockedUntilEpochMs > Date.now()) {
    return currentFactorLockResult(cachedPinLockState);
  }

  const normalized = input.trim();
  if (!new RegExp(`^\\d{${MOBILE_PIN_MIN_LENGTH},${MOBILE_PIN_MAX_LENGTH}}$`).test(normalized)) {
    return await recordPinFailure();
  }

  if (cachedVaultStore) {
    const ok = await verifyPinCredential(normalized, cachedVaultStore.pinCredential);
    if (ok) {
      await clearPinLockState();
      return { result: "OK" };
    }
    return await recordPinFailure();
  }

  if (cachedLegacyBlob?.pinHash) {
    const ok = await verifyLegacyPinHashForMigration(normalized, cachedLegacyBlob.pinHash);
    if (ok) {
      await clearPinLockState();
      return { result: "OK" };
    }
    return await recordPinFailure();
  }

  return { result: "INCORRECT", attemptsUsed: 0 };
}

async function ensureUnlocked(): Promise<void> {
  await ensureStatusLoaded();
  if (currentPinConfigured() && !unlocked) {
    fail("E_LOCKED", "Unlock the app before using this feature.");
  }
}

function requireUnlockedPayload(): MobileVaultPayload {
  if (!activeVaultPayload || !activeVdk || !cachedVaultStore) {
    fail("E_LOCKED", "Unlock the app before using this feature.");
  }
  return activeVaultPayload;
}

async function persistUnlockedPayload(payload: MobileVaultPayload): Promise<void> {
  if (!cachedVaultStore || !activeVdk) {
    fail("E_LOCKED", "Unlock the app before using this feature.");
  }
  const nextStore: MobileVaultStore = {
    ...cachedVaultStore,
    vault: cachedVaultStore.vault,
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(activeVdk), { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(plaintext)));
  nextStore.vault = {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(encrypted.slice(0, encrypted.length - 16)),
    authTag: bytesToBase64(encrypted.slice(encrypted.length - 16)),
  };
  plaintext.fill(0);
  encrypted.fill(0);
  iv.fill(0);
  await persistCurrentStore(nextStore);
  activeVaultPayload = stripPayloadAccounts(payload);
}

async function loadAccounts(): Promise<StoredTotpAccount[]> {
  await ensureUnlocked();
  if (cachedVaultStore && activeVdk) {
    return (await decryptPayloadWithVdk(activeVdk, cachedVaultStore.vault)).accounts;
  }
  return cachedLegacyBlob?.accounts ?? [];
}

async function saveAccounts(accounts: StoredTotpAccount[]): Promise<void> {
  await ensureUnlocked();
  const payload = cachedVaultStore && activeVdk ? await decryptPayloadWithVdk(activeVdk, cachedVaultStore.vault) : requireUnlockedPayload();
  await persistUnlockedPayload({
    ...payload,
    accounts,
  });
}

async function tryBiometricPrompt(): Promise<boolean> {
  const moduleName = "@aparajita/capacitor-biometric-auth";
  try {
    const biometricModule = (await import(moduleName)) as any;
    const api = biometricModule.BiometricAuth ?? biometricModule.default ?? biometricModule;
    const check =
      typeof api.isAvailable === "function"
        ? await api.isAvailable()
        : typeof api.checkBiometry === "function"
          ? await api.checkBiometry()
          : { isAvailable: false };
    const available = !!(check?.isAvailable ?? check?.available);
    if (!available || typeof api.authenticate !== "function") return false;
    const result = await api.authenticate({ reason: "Unlock Vault Authenticator" });
    return !!(result?.verified ?? result?.isAuthenticated ?? result?.success);
  } catch {
    return false;
  }
}

async function detectBiometricAvailability(): Promise<boolean> {
  if (biometricAvailable != null) return biometricAvailable;
  const moduleName = "@aparajita/capacitor-biometric-auth";
  try {
    const biometricModule = (await import(moduleName)) as any;
    const api = biometricModule.BiometricAuth ?? biometricModule.default ?? biometricModule;
    const check =
      typeof api.isAvailable === "function"
        ? await api.isAvailable()
        : typeof api.checkBiometry === "function"
          ? await api.checkBiometry()
          : { isAvailable: false };
    biometricAvailable = !!(check?.isAvailable ?? check?.available);
    return biometricAvailable;
  } catch {
    biometricAvailable = false;
    return false;
  }
}

function createId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function storedSettingsMatches(candidate: unknown, expected: AppSettings): boolean {
  if (!candidate || typeof candidate !== "object") return false;
  const current = candidate as Partial<AppSettings>;
  return (
    current.defaultDigits === expected.defaultDigits &&
    current.defaultPeriod === expected.defaultPeriod &&
    current.hideLabelsOnSmall === expected.hideLabelsOnSmall &&
    current.privacyScreen === expected.privacyScreen &&
    current.clipboardSafetyEnabled === expected.clipboardSafetyEnabled &&
    current.runInBackground === expected.runInBackground &&
    current.startWithSystem === expected.startWithSystem &&
    current.trayMenuStyle === expected.trayMenuStyle &&
    current.trayMenuAnimations === expected.trayMenuAnimations &&
    current.trayMenuThemeSync === expected.trayMenuThemeSync &&
    current.trayIconStyle === expected.trayIconStyle &&
    current.alwaysOnTop === expected.alwaysOnTop &&
    current.baseMode === expected.baseMode &&
    current.accentOverride === expected.accentOverride &&
    current.motionMode === expected.motionMode &&
    current.pauseWhenBackground === expected.pauseWhenBackground &&
    current.accountsLayoutMode === expected.accountsLayoutMode &&
    current.accountsGridColumns === expected.accountsGridColumns &&
    current.accountsDensity === expected.accountsDensity &&
    current.biometricEnabled === expected.biometricEnabled &&
    current.autoLockSeconds === expected.autoLockSeconds &&
    current.lockOnFocusLoss === expected.lockOnFocusLoss
  );
}

function normalizeAccountsLayoutMode(value: unknown): AppSettings["accountsLayoutMode"] {
  if (value === "list") return "list";
  if (value === "grid") return "grid";
  return "auto";
}

function normalizeAccountsGridColumns(value: unknown): AppSettings["accountsGridColumns"] {
  if (value === 1 || value === 2 || value === 3) return value;
  return "auto";
}

function normalizeAccountsDensity(value: unknown): AppSettings["accountsDensity"] {
  if (value === "compact") return "compact";
  return "comfortable";
}

function normalizeAutoLockSeconds(value: unknown): number {
  if (value === 0) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 15 || value > 86400) {
    return DEFAULT_SETTINGS.autoLockSeconds;
  }
  return value;
}

function validateSettings(next: unknown): { settings: AppSettings; hadSettingsFallback: boolean } {
  const candidate = next && typeof next === "object" ? (next as Partial<AppSettings>) : {};
  const baseMode = normalizeBaseThemeId((candidate as { baseMode?: unknown; baseTheme?: unknown }).baseMode ?? (candidate as { baseTheme?: unknown }).baseTheme);
  const normalizedAccent = normalizeAccentId(
    (candidate as { accentOverride?: unknown; accent?: unknown }).accentOverride ?? (candidate as { accent?: unknown }).accent
  );
  const accentOverride = baseMode === "amoled" ? "none" : normalizedAccent;
  const motionMode = normalizeMotionMode((candidate as { motionMode?: unknown }).motionMode);
  const pauseWhenBackground =
    typeof (candidate as { pauseWhenBackground?: unknown }).pauseWhenBackground === "boolean"
      ? !!(candidate as { pauseWhenBackground?: unknown }).pauseWhenBackground
      : DEFAULT_SETTINGS.pauseWhenBackground;
  const clipboardSafetyEnabled =
    typeof (candidate as { clipboardSafetyEnabled?: unknown }).clipboardSafetyEnabled === "boolean"
      ? !!(candidate as { clipboardSafetyEnabled?: unknown }).clipboardSafetyEnabled
      : DEFAULT_SETTINGS.clipboardSafetyEnabled;
  const runInBackground =
    typeof (candidate as { runInBackground?: unknown }).runInBackground === "boolean"
      ? !!(candidate as { runInBackground?: unknown }).runInBackground
      : DEFAULT_SETTINGS.runInBackground;
  const startWithSystem =
    typeof (candidate as { startWithSystem?: unknown }).startWithSystem === "boolean"
      ? !!(candidate as { startWithSystem?: unknown }).startWithSystem
      : DEFAULT_SETTINGS.startWithSystem;
  const trayMenuStyle = normalizeTrayMenuStyle((candidate as { trayMenuStyle?: unknown }).trayMenuStyle);
  const trayMenuAnimations = normalizeTrayMenuAnimations((candidate as { trayMenuAnimations?: unknown }).trayMenuAnimations);
  const trayMenuThemeSync =
    typeof (candidate as { trayMenuThemeSync?: unknown }).trayMenuThemeSync === "boolean"
      ? !!(candidate as { trayMenuThemeSync?: unknown }).trayMenuThemeSync
      : DEFAULT_SETTINGS.trayMenuThemeSync;
  const trayIconStyle = normalizeTrayIconStyle((candidate as { trayIconStyle?: unknown }).trayIconStyle);

  const hadSettingsFallback =
    ((candidate as { baseMode?: unknown; baseTheme?: unknown }).baseMode !== undefined &&
      (candidate as { baseMode?: unknown }).baseMode !== baseMode) ||
    ((candidate as { baseTheme?: unknown }).baseTheme !== undefined && (candidate as { baseTheme?: unknown }).baseTheme !== baseMode) ||
    (((candidate as { accentOverride?: unknown; accent?: unknown }).accentOverride !== undefined ||
      (candidate as { accent?: unknown }).accent !== undefined) &&
      ((candidate as { accentOverride?: unknown; accent?: unknown }).accentOverride !== undefined
        ? (candidate as { accentOverride?: unknown }).accentOverride !== normalizedAccent || accentOverride !== normalizedAccent
        : (candidate as { accent?: unknown }).accent !== normalizedAccent || accentOverride !== normalizedAccent)) ||
    ((candidate as { motionMode?: unknown }).motionMode !== undefined &&
      (candidate as { motionMode?: unknown }).motionMode !== motionMode) ||
    ((candidate as { pauseWhenBackground?: unknown }).pauseWhenBackground !== undefined &&
      typeof (candidate as { pauseWhenBackground?: unknown }).pauseWhenBackground !== "boolean") ||
    ((candidate as { clipboardSafetyEnabled?: unknown }).clipboardSafetyEnabled !== undefined &&
      typeof (candidate as { clipboardSafetyEnabled?: unknown }).clipboardSafetyEnabled !== "boolean") ||
    ((candidate as { runInBackground?: unknown }).runInBackground !== undefined &&
      typeof (candidate as { runInBackground?: unknown }).runInBackground !== "boolean") ||
    ((candidate as { startWithSystem?: unknown }).startWithSystem !== undefined &&
      typeof (candidate as { startWithSystem?: unknown }).startWithSystem !== "boolean") ||
    ((candidate as { trayMenuThemeSync?: unknown }).trayMenuThemeSync !== undefined &&
      typeof (candidate as { trayMenuThemeSync?: unknown }).trayMenuThemeSync !== "boolean") ||
    ((candidate as { trayMenuStyle?: unknown }).trayMenuStyle !== undefined &&
      (candidate as { trayMenuStyle?: unknown }).trayMenuStyle !== trayMenuStyle) ||
    ((candidate as { trayMenuAnimations?: unknown }).trayMenuAnimations !== undefined &&
      (candidate as { trayMenuAnimations?: unknown }).trayMenuAnimations !== trayMenuAnimations) ||
    ((candidate as { trayIconStyle?: unknown }).trayIconStyle !== undefined &&
      (candidate as { trayIconStyle?: unknown }).trayIconStyle !== trayIconStyle);

  return {
    settings: {
      defaultDigits: candidate.defaultDigits === 8 ? 8 : 6,
      defaultPeriod:
        typeof candidate.defaultPeriod === "number" &&
        Number.isInteger(candidate.defaultPeriod) &&
        candidate.defaultPeriod >= 1 &&
        candidate.defaultPeriod <= 300
          ? candidate.defaultPeriod
          : 30,
      hideLabelsOnSmall: !!candidate.hideLabelsOnSmall,
      privacyScreen: candidate.privacyScreen !== false,
      clipboardSafetyEnabled,
      runInBackground,
      startWithSystem,
      trayMenuStyle,
      trayMenuAnimations,
      trayMenuThemeSync,
      trayIconStyle,
      alwaysOnTop: !!(candidate as { alwaysOnTop?: unknown }).alwaysOnTop,
      baseMode,
      themeColor: baseMode === "amoled" ? "neutral" : DEFAULT_SETTINGS.themeColor,
      accentOverride,
      motionMode,
      pauseWhenBackground,
      accountsLayoutMode: normalizeAccountsLayoutMode(candidate.accountsLayoutMode),
      accountsGridColumns: normalizeAccountsGridColumns(candidate.accountsGridColumns),
      accountsDensity: normalizeAccountsDensity(candidate.accountsDensity),
      biometricEnabled: candidate.biometricEnabled !== false,
      autoLockSeconds: normalizeAutoLockSeconds(candidate.autoLockSeconds),
      lockOnFocusLoss: !!candidate.lockOnFocusLoss,
      hasCompletedSafetySetup: candidate.hasCompletedSafetySetup === true,
      hasSkippedSafetySetup: candidate.hasCompletedSafetySetup === true ? false : candidate.hasSkippedSafetySetup === true,
      lastSafetySetupReminderAt:
        typeof candidate.lastSafetySetupReminderAt === "number" && Number.isFinite(candidate.lastSafetySetupReminderAt)
          ? Math.floor(candidate.lastSafetySetupReminderAt)
          : undefined,
    },
    hadSettingsFallback,
  };
}

function logThemeFallback(source: "load" | "update", hadSettingsFallback: boolean): void {
  if (!hadSettingsFallback) return;
  console.warn("[theme] fallback to default theme id", {
    source,
    reason: "invalid-theme-or-motion-settings",
  });
}

async function pickBackupText(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      try {
        const file = input.files?.[0];
        if (!file) resolve(null);
        else resolve(await file.text());
      } finally {
        document.body.removeChild(input);
      }
    });
    input.click();
  });
}

function triggerDownload(text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `authenticator-backup-${new Date().toISOString().slice(0, 10)}.enc.json`;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toMeta(a: StoredTotpAccount): AccountMeta {
  return { id: a.id, issuer: a.issuer, label: a.label, digits: a.digits, period: a.period };
}

export const mobileBridge: Bridge = {
  lockAPI: {
    async getMethod(): Promise<string> {
      await ensureStatusLoaded();
      return currentPinConfigured() ? "pin6" : "none";
    },

    async getMethodsConfig() {
      await ensureStatusLoaded();
      return {
        primaryLockMethod: currentPinConfigured() ? "pin" : "none",
        secondaryLockMethod: null,
      };
    },

    async setMethod(method: string): Promise<void> {
      await ensureStatusLoaded();
      if (method === "none" || method === "swipe") {
        const accounts = currentPinConfigured() && unlocked ? await loadAccounts() : [];
        if (accounts.length > 0) {
          fail("E_PIN_REQUIRED", "PIN cannot be removed while accounts exist.");
        }
        await clearVaultStore();
        cachedVaultStore = null;
        cachedLegacyBlob = null;
        clearActiveUnlockedSession();
        invalidateSecuritySession();
        unlocked = true;
        return;
      }

      if (method === "pin" || method === "pin4" || method === "pin6") {
        return;
      }

      fail("E_INTERNAL", "This lock method is not supported on mobile.");
    },

    async setMethodsConfig(config: { primaryLockMethod: string; secondaryLockMethod: string | null }): Promise<void> {
      await ensureStatusLoaded();
      if (config.secondaryLockMethod) {
        fail("E_INTERNAL", "Secondary lock methods are not supported on mobile.");
      }
      const primary = config.primaryLockMethod;
      if (primary === "none" || primary === "swipe") {
        await this.setMethod(primary);
        return;
      }
      if (primary === "pin") {
        await this.setMethod("pin6");
        return;
      }
      fail("E_INTERNAL", "This lock method is not supported on mobile.");
    },

    async getQuickUnlock() {
      return { windowsHello: false, passkey: false };
    },

    async setQuickUnlock(): Promise<void> {
      return;
    },

    async setCredential(type: string, value: string): Promise<void> {
      if (type !== "pin") {
        fail("E_INTERNAL", "Only PIN credentials are supported on mobile.");
      }
      const validated = validatePin(value);
      if (cachedVaultStore && activeVdk && activeVaultPayload) {
        const changed = await changeMobileVaultPin(cachedVaultStore, validated, validated, vaultKeyDriver);
        await persistCurrentStore(changed.store);
        setActiveUnlockedSession(changed.vdk, await decryptPayloadWithVdk(changed.vdk, changed.store.vault));
        await clearPinLockState();
        unlocked = true;
        return;
      }

      if (cachedLegacyBlob?.pinHash) {
        const legacyPinOk = await verifyLegacyPinHashForMigration(validated, cachedLegacyBlob.pinHash);
        if (!legacyPinOk) {
          fail("E_VAULT_INACCESSIBLE", VAULT_INACCESSIBLE_KEYSTORE);
        }
        const migrated = await migrateLegacyMobileVault(cachedLegacyBlob, validated, vaultKeyDriver);
        await persistCurrentStore(migrated);
        const unlockedVault = await unlockMobileVaultWithPin(migrated, validated, vaultKeyDriver);
        if (!unlockedVault.ok) {
          fail(unlockedVault.code, unlockedVault.message ?? "Vault migration failed.");
        }
        setActiveUnlockedSession(unlockedVault.vdk, unlockedVault.payload);
        await clearPinLockState();
        unlocked = true;
        return;
      }

      const created = await createMobileVaultStore(
        validated,
        {
          accounts: cachedLegacyBlob?.accounts ?? [],
          recoveryVerifier: null,
        },
        vaultKeyDriver,
        currentSettings() ?? DEFAULT_SETTINGS
      );
      await persistCurrentStore(created);
      const unlockedVault = await unlockMobileVaultWithPin(created, validated, vaultKeyDriver);
      if (!unlockedVault.ok) {
        fail(unlockedVault.code, unlockedVault.message ?? "Vault initialization failed.");
      }
      setActiveUnlockedSession(unlockedVault.vdk, unlockedVault.payload);
      unlocked = true;
      statusLoaded = true;
    },

    async verify(type: string, input: string) {
      if (type !== "pin") {
        return { result: "INCORRECT", attemptsUsed: 0 } as const;
      }

      await ensureStatusLoaded();
      if (!currentPinConfigured()) {
        return { result: "INCORRECT", attemptsUsed: 0 } as const;
      }

      if (isFactorDisabled(cachedPinLockState)) {
        return currentFactorLockResult(cachedPinLockState);
      }
      if (cachedPinLockState.lockedUntilEpochMs > Date.now()) {
        return currentFactorLockResult(cachedPinLockState);
      }

      const normalized = input.trim();
      if (!new RegExp(`^\\d{${MOBILE_PIN_MIN_LENGTH},${MOBILE_PIN_MAX_LENGTH}}$`).test(normalized)) {
        unlocked = false;
        return await recordPinFailure();
      }

      if (cachedVaultStore) {
        const result = await unlockMobileVaultWithPin(cachedVaultStore, normalized, vaultKeyDriver);
        if (result.ok) {
          setActiveUnlockedSession(result.vdk, result.payload);
          unlocked = true;
          await clearPinLockState();
          return { result: "OK" } as const;
        }
        if (result.code === "E_VAULT_INACCESSIBLE") {
          fail("E_INTERNAL", result.message ?? VAULT_INACCESSIBLE_INTEGRITY);
        }
        unlocked = false;
        return await recordPinFailure();
      }

      if (cachedLegacyBlob?.pinHash) {
        const ok = await verifyLegacyPinHashForMigration(normalized, cachedLegacyBlob.pinHash);
        if (!ok) {
          unlocked = false;
          return await recordPinFailure();
        }
        const migrated = await migrateLegacyMobileVault(cachedLegacyBlob, normalized, vaultKeyDriver);
        await persistCurrentStore(migrated);
        const unlockedVault = await unlockMobileVaultWithPin(migrated, normalized, vaultKeyDriver);
        if (!unlockedVault.ok) {
          fail(unlockedVault.code, unlockedVault.message ?? VAULT_INACCESSIBLE_KEYSTORE);
        }
        setActiveUnlockedSession(unlockedVault.vdk, unlockedVault.payload);
        unlocked = true;
        await clearPinLockState();
        return { result: "OK" } as const;
      }

      return { result: "INCORRECT", attemptsUsed: 0 } as const;
    },

    async getLockState() {
      await ensureStatusLoaded();
      return {
        failedCount: cachedPinLockState.failedAttemptCount,
        lockUntilEpochMs: cachedPinLockState.lockedUntilEpochMs,
      };
    },

    async hasCredential(type: string): Promise<boolean> {
      await ensureStatusLoaded();
      if (type !== "pin") return false;
      return currentPinConfigured();
    },

    async clearCredential(type: string): Promise<void> {
      await ensureStatusLoaded();
      if (type !== "pin") return;
      if ((currentPinConfigured() && unlocked ? await loadAccounts() : []).length > 0) {
        fail("E_PIN_REQUIRED", "PIN cannot be removed while accounts exist.");
      }
      await clearVaultStore();
      cachedVaultStore = null;
      cachedLegacyBlob = null;
      clearActiveUnlockedSession();
      invalidateSecuritySession();
      await clearPinLockState();
      await clearBiometricLockState();
      await clearRecoveryLockState();
      unlocked = true;
    },

    async resetAppLock(): Promise<boolean> {
      await clearVaultStore();
      cachedVaultStore = null;
      cachedLegacyBlob = null;
      clearActiveUnlockedSession();
      invalidateSecuritySession();
      await clearPinLockState();
      await clearBiometricLockState();
      await clearRecoveryLockState();
      unlocked = true;
      return true;
    },

    async lock(): Promise<void> {
      await ensureStatusLoaded();
      if (currentPinConfigured()) {
        unlocked = false;
        clearActiveUnlockedSession();
        invalidateSecuritySession();
      }
    },

    async biometricAvailable(): Promise<boolean> {
      await ensureStatusLoaded();
      if (isFactorDisabled(cachedBiometricLockState)) {
        return false;
      }
      if (cachedBiometricLockState.lockedUntilEpochMs > Date.now()) {
        return false;
      }
      return !!cachedVaultStore?.biometricWrappedVdk && (await detectBiometricAvailability());
    },

    async promptBiometric(): Promise<boolean> {
      await ensureStatusLoaded();
      if (!currentPinConfigured()) {
        unlocked = true;
        await clearBiometricLockState();
        return true;
      }
      if (isFactorDisabled(cachedBiometricLockState) || cachedBiometricLockState.lockedUntilEpochMs > Date.now()) {
        unlocked = false;
        return false;
      }
      const ok = await tryBiometricPrompt();
      if (!ok || !cachedVaultStore) {
        await recordBiometricFailure();
        unlocked = false;
        return false;
      }
      const result = await unlockMobileVaultWithBiometric(cachedVaultStore, vaultKeyDriver);
      if (result.ok) {
        setActiveUnlockedSession(result.vdk, result.payload);
        unlocked = true;
        await clearBiometricLockState();
        if (result.securityLevel || result.secureHardwareEnforced !== undefined) {
          console.info("[mobile-security] biometric keystore enforcement", {
            securityLevel: result.securityLevel ?? "unknown",
            secureHardwareEnforced: result.secureHardwareEnforced === true,
          });
        }
        return true;
      }
      if (result.code === "E_BIOMETRIC_INVALIDATED") {
        fail("E_BIOMETRIC_INVALIDATED", "Your biometric settings changed. Please re-enable Touch ID / Face ID in Security settings.");
      }
      await recordBiometricFailure();
      unlocked = false;
      return false;
    },

    async openSecuritySession(): Promise<boolean> {
      openSecuritySession();
      return true;
    },

    async closeSecuritySession(): Promise<boolean> {
      invalidateSecuritySession();
      return true;
    },

    async stepUpVerify(payload) {
      await ensureStatusLoaded();
      if (payload.method === "biometric") {
        if (isFactorDisabled(cachedBiometricLockState)) {
          return currentFactorLockResult(cachedBiometricLockState);
        }
        if (cachedBiometricLockState.lockedUntilEpochMs > Date.now()) {
          return currentFactorLockResult(cachedBiometricLockState);
        }
        const available = !!cachedVaultStore?.biometricWrappedVdk && (await detectBiometricAvailability());
        if (!available) {
          return { result: "INCORRECT", attemptsUsed: 0 } as const;
        }
        const ok = await tryBiometricPrompt();
        if (!ok) {
          await recordBiometricFailure();
          if (isFactorDisabled(cachedBiometricLockState) || cachedBiometricLockState.lockedUntilEpochMs > Date.now()) {
            return currentFactorLockResult(cachedBiometricLockState);
          }
          return { result: "INCORRECT", attemptsUsed: cachedBiometricLockState.failedAttemptCount } as const;
        }
        await clearBiometricLockState();
        recordStepUpAuth();
        return { result: "OK" } as const;
      }

      if (payload.method === "password" || payload.method === "pin") {
        const result = await verifyStepUpPin(payload.input);
        if (result.result === "OK") {
          recordStepUpAuth();
        }
        return result;
      }

      return { result: "INCORRECT", attemptsUsed: 0 } as const;
    },

    onShowLockScreen(): void {
      return;
    },

    async getPinDigits(): Promise<4 | 6> {
      await ensureStatusLoaded();
      return currentPinConfigured() ? 6 : 6;
    },

    async passkeyGetChallenge() {
      const challenge = Array.from(crypto.getRandomValues(new Uint8Array(32)));
      return { challengeId: createId(), challenge };
    },

    async passkeyGetCredentialId() {
      return null;
    },

    async passkeyListCredentials() {
      return [];
    },

    async passkeySaveCredential() {
      return false;
    },

    async passkeyRenameCredential() {
      return false;
    },

    async passkeyRemoveCredential() {
      return false;
    },

    async passkeyVerifyAssertion() {
      return false;
    },

    async passkeyClearCredential(): Promise<void> {
      return;
    },
  },

  async getSettings(): Promise<AppSettings> {
    try {
      await ensureUnlocked();
      const storedSettings = await loadPersistedSettings();
      if (!storedSettings) {
        return DEFAULT_SETTINGS;
      }

      const { settings, hadSettingsFallback } = validateSettings(storedSettings);
      logThemeFallback("load", hadSettingsFallback);

      if (!storedSettingsMatches(storedSettings, settings)) {
          await savePersistedSettings(settings);
      }

      return settings;
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async updateSettings(next: AppSettings): Promise<AppSettings> {
    try {
      await ensureUnlocked();
      const { settings, hadSettingsFallback } = validateSettings(next);
      logThemeFallback("update", hadSettingsFallback);
      await savePersistedSettings(settings);
      return settings;
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async exportBackup(passphrase: string): Promise<boolean> {
    try {
      await ensureUnlocked();
      requireSecuritySession();
      const cleanPassphrase = validatePassphrase(passphrase);
      const envelope = await encryptBackup(await loadAccounts(), cleanPassphrase);
      triggerDownload(JSON.stringify(envelope));
      return true;
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async importBackup(passphrase: string, mode: "merge" | "replace"): Promise<boolean> {
    try {
      await ensureUnlocked();
      requireSecuritySession();
      const cleanPassphrase = validatePassphrase(passphrase);
      const raw = await pickBackupText();
      if (!raw) return false;
      let envelope: EncryptedBackup;
      try {
        envelope = JSON.parse(raw) as EncryptedBackup;
      } catch {
        fail("E_BACKUP_FILE_INVALID", "That file is not valid JSON. Select an encrypted backup file.");
      }
      const decrypted = await decryptBackup(envelope, cleanPassphrase);
      if (mode === "replace") {
        await saveAccounts(decrypted.accounts);
        return true;
      }
      const existing = await loadAccounts();
      const byId = new Map(existing.map((a) => [a.id, a] as const));
      for (const account of decrypted.accounts) byId.set(account.id, account);
      await saveAccounts(Array.from(byId.values()));
      return true;
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async list(): Promise<AccountMeta[]> {
    try {
      await ensureUnlocked();
      return (await loadAccounts()).map(toMeta);
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async getTotpCode(id: string): Promise<{ code: string; remainingSeconds: number } | null> {
    try {
      await ensureUnlocked();
      const cleanId = id.trim();
      if (!cleanId) {
        fail("E_INTERNAL", "Could not generate a code for that account. Please try again.");
      }
      const account = (await loadAccounts()).find((item) => item.id === cleanId);
      if (!account) {
        return null;
      }
      const { code, remainingSeconds } = totpCodeSync(account.secretBase32, {
        algorithm: account.algorithm,
        digits: account.digits,
        period: account.period,
      });
      return { code, remainingSeconds };
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async revealSecret(id: string): Promise<string> {
    try {
      await ensureUnlocked();
      requireSecuritySession();
      const cleanId = id.trim();
      if (!cleanId) {
        fail("E_INTERNAL", "Could not reveal that secret. Please try again.");
      }
      const account = (await loadAccounts()).find((item) => item.id === cleanId);
      if (!account) {
        fail("E_INTERNAL", "Could not find that account. Refresh and try again.");
      }
      return account.secretBase32;
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async getAccountForEdit(id: string): Promise<EditableAccount> {
    try {
      await ensureUnlocked();
      const cleanId = id.trim();
      if (!cleanId) {
        fail("E_INTERNAL", "Could not open account details. Please try again.");
      }

      const account = (await loadAccounts()).find((item) => item.id === cleanId);
      if (!account) {
        fail("E_INTERNAL", "Could not find that account. Refresh and try again.");
      }

      return {
        id: account.id,
        issuer: account.issuer,
        label: account.label,
        digits: account.digits,
        period: account.period,
        algorithm: account.algorithm,
      };
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async updateAccount(id: string, payload: UpdateAccountPayload): Promise<AccountMeta> {
    try {
      await ensureUnlocked();
      const cleanId = id.trim();
      if (!cleanId) {
        fail("E_INTERNAL", "Could not update that account. Please try again.");
      }

      const accounts = await loadAccounts();
      const index = accounts.findIndex((item) => item.id === cleanId);
      if (index < 0) {
        fail("E_INTERNAL", "Could not find that account. Refresh and try again.");
      }

      const existing = accounts[index];
      const secretInput = readSecretInput(payload as unknown as Record<string, unknown>);
      const normalizedSecret = typeof secretInput === "string" ? secretInput.trim() : "";
      const next: StoredTotpAccount = {
        ...existing,
        issuer: payload.issuer.trim(),
        label: payload.label.trim() || existing.label || "Account",
        digits: validateDigits(payload.digits),
        period: validatePeriod(payload.period),
        algorithm: validateAlgorithm(payload.algorithm),
        secretBase32: normalizedSecret ? validateSecretBase32(normalizedSecret) : existing.secretBase32,
      };

      accounts[index] = next;
      await saveAccounts(accounts);
      return toMeta(next);
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async reorderAccounts(ids: string[]): Promise<AccountMeta[]> {
    try {
      await ensureUnlocked();
      const accounts = await loadAccounts();
      if (ids.length !== accounts.length) {
        fail("E_INTERNAL", "Could not reorder accounts. Refresh and try again.");
      }

      const byId = new Map(accounts.map((account) => [account.id, account]));
      if (byId.size !== accounts.length || ids.some((id) => !byId.has(id))) {
        fail("E_INTERNAL", "Could not reorder accounts. Refresh and try again.");
      }

      const reordered = ids.map((id) => byId.get(id) as StoredTotpAccount);
      await saveAccounts(reordered);
      return reordered.map(toMeta);
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async addUri(uri: string): Promise<AccountMeta> {
    try {
      await ensureUnlocked();
      const value = uri.trim();
      if (!value) {
        fail("E_URI_INVALID", "Paste a valid TOTP URI that starts with otpauth://totp/.");
      }
      const parsed = parseOtpauthUri(value);
      const stored: StoredTotpAccount = { id: createId(), ...parsed };
      const accounts = await loadAccounts();
      accounts.push(stored);
      await saveAccounts(accounts);
      return toMeta(stored);
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async addManual(payload: ManualPayload): Promise<AccountMeta> {
    try {
      await ensureUnlocked();
      const stored: StoredTotpAccount = {
        id: createId(),
        issuer: payload.issuer.trim(),
        label: payload.label.trim() || "Account",
        secretBase32: validateSecretBase32(String(readSecretInput(payload as unknown as Record<string, unknown>) ?? "")),
        digits: validateDigits(payload.digits),
        period: validatePeriod(payload.period),
        algorithm: validateAlgorithm(payload.algorithm),
      };
      const accounts = await loadAccounts();
      accounts.push(stored);
      await saveAccounts(accounts);
      return toMeta(stored);
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async del(id: string): Promise<boolean> {
    try {
      await ensureUnlocked();
      const cleanId = id.trim();
      if (!cleanId) {
        fail("E_INTERNAL", "Could not delete that account. Please try again.");
      }
      const accounts = (await loadAccounts()).filter((a) => a.id !== cleanId);
      await saveAccounts(accounts);
      return true;
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async scanQr(): Promise<string | null> {
    try {
      const { scanQrCode } = await import("./scanner");
      return scanQrCode();
    } catch (error) {
      return throwNormalized(error);
    }
  },

  async codes(): Promise<CodeResult[]> {
    try {
      await ensureUnlocked();
      const accounts = await loadAccounts();
      return accounts.map((a) => {
        const { code, remainingSeconds } = totpCodeSync(a.secretBase32, {
          algorithm: a.algorithm,
          digits: a.digits,
          period: a.period,
        });
        return { id: a.id, code, remainingSeconds };
      });
    } catch (error) {
      return throwNormalized(error);
    }
  },
};
