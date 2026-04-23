import { systemPreferences } from "electron";
import { Algorithm, hashRaw as argon2HashRaw } from "@node-rs/argon2";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getVaultPasswordPolicyIssue, getVaultPasswordPolicyMessage, VAULT_PASSWORD_MAX_LENGTH } from "@authenticator/core";
import { deleteMacKeychainSecret, readMacKeychainSecret, saveMacKeychainSecret } from "./mac-keychain";

export type Argon2Params = {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
};

export type LegacyRecoveryVerifier = {
  hash: string;
  salt: string;
  argon2Params: Argon2Params;
};

export type RecoveryVerifier = string | LegacyRecoveryVerifier;

export type WrappedSecretEnvelope = {
  iv: string;
  wrappedKey: string;
  authTag: string;
};

export type PasswordWrappedVdk = WrappedSecretEnvelope & {
  argon2Params: Argon2Params;
  salt: string;
};

export type RecoveryWrappedVdk = WrappedSecretEnvelope & {
  argon2Params: Argon2Params;
  salt: string;
};

export type BiometricWrappedVdk = WrappedSecretEnvelope & {
  keychainItemLabel: string;
};

export type VaultCipherEnvelope = {
  iv: string;
  ciphertext: string;
  authTag: string;
};

export type VaultOuterMeta = {
  biometricEnrolled: boolean;
  recoveryGenerated: boolean;
};

export type VaultEnvelopeV4 = {
  version: 4;
  vault: VaultCipherEnvelope;
  passwordWrappedVdk: PasswordWrappedVdk;
  biometricWrappedVdk: BiometricWrappedVdk | null;
  recoveryWrappedVdk: RecoveryWrappedVdk | null;
  outerMeta: VaultOuterMeta;
  passwordUnlockLockState?: {
    failedCount: number;
    lockUntilEpochMs: number;
    disabledAtEpochMs?: number;
  };
};

export type LegacyHardenedEnvelope = {
  version: 1;
  mode: "hardened";
  argon2Params: {
    m: number;
    t: number;
    p: number;
  };
  salt: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  unlockLockState?: {
    failedCount?: unknown;
    lockUntilEpochMs?: unknown;
  };
};

export type PasswordUnlockResult =
  | { result: "OK"; vdk: Buffer; payloadJson: string }
  | { result: "INCORRECT"; attemptsUsed: number }
  | { result: "LOCKED"; lockedUntil: number; attemptsUsed: number; disabled?: boolean };

export type RecoveryUnlockResult =
  | { result: "OK"; vdk: Buffer; payloadJson: string }
  | { result: "LOCKED" };

export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

const RECOVERY_VERIFIER_ARGON2_PARAMS: Argon2Params = {
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

const DEFAULT_LOCK_STATE = {
  failedCount: 0,
  lockUntilEpochMs: 0,
};

function normalizeExistingPasswordLikeSecret(value: string): string {
  if (typeof value !== "string") {
    throw new Error("Password is required.");
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > VAULT_PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must be 1-${VAULT_PASSWORD_MAX_LENGTH} characters.`);
  }
  return normalized;
}

function normalizeNewPasswordLikeSecret(value: string): string {
  const normalized = normalizeExistingPasswordLikeSecret(value);
  const issue = getVaultPasswordPolicyIssue(normalized);
  if (issue) {
    throw new Error(getVaultPasswordPolicyMessage(issue));
  }
  return normalized;
}

function bytesToBase64(bytes: Uint8Array | Buffer): string {
  return Buffer.from(bytes).toString("base64");
}

function bytesToUnpaddedBase64(bytes: Uint8Array | Buffer): string {
  return bytesToBase64(bytes).replace(/=+$/g, "");
}

function unpaddedBase64ToBuffer(input: string, label: string): Buffer {
  const padded = `${input}${"=".repeat((4 - (input.length % 4 || 4)) % 4)}`;
  return base64ToBuffer(padded, label);
}

function encodeArgon2idPhc(hash: Buffer, salt: Buffer, params: Argon2Params): string {
  return `$argon2id$v=19$m=${params.memoryCost},t=${params.timeCost},p=${params.parallelism}$${bytesToUnpaddedBase64(salt)}$${bytesToUnpaddedBase64(hash)}`;
}

function decodeArgon2idPhc(encoded: string): { hash: Buffer; salt: Buffer; argon2Params: Argon2Params } | null {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[1] !== "argon2id") return null;
  if (parts[2] !== "v=19") return null;

  const params = new Map<string, number>();
  for (const segment of parts[3].split(",")) {
    const [key, rawValue] = segment.split("=");
    const value = Number.parseInt(rawValue ?? "", 10);
    if (!key || !Number.isFinite(value) || value <= 0) {
      return null;
    }
    params.set(key, value);
  }

  const memoryCost = params.get("m");
  const timeCost = params.get("t");
  const parallelism = params.get("p");
  if (!memoryCost || !timeCost || !parallelism) {
    return null;
  }

  try {
    return {
      hash: unpaddedBase64ToBuffer(parts[5], "Recovery verifier hash"),
      salt: unpaddedBase64ToBuffer(parts[4], "Recovery verifier salt"),
      argon2Params: {
        memoryCost,
        timeCost,
        parallelism,
      },
    };
  } catch {
    return null;
  }
}

function base64ToBuffer(base64: string, label: string): Buffer {
  try {
    const value = Buffer.from(base64, "base64");
    if (value.length === 0) {
      throw new Error(`${label} is empty.`);
    }
    return value;
  } catch {
    throw new Error(`${label} is invalid.`);
  }
}

function encryptWithAesGcm(plaintext: Buffer, key: Buffer): VaultCipherEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    authTag: bytesToBase64(authTag),
  };
}

function decryptWithAesGcm(parts: VaultCipherEnvelope | WrappedSecretEnvelope, key: Buffer): Buffer {
  const iv = base64ToBuffer(parts.iv, "IV");
  const ciphertext = base64ToBuffer("ciphertext" in parts ? parts.ciphertext : parts.wrappedKey, "Ciphertext");
  const authTag = base64ToBuffer(parts.authTag, "Authentication tag");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function deriveKey(secret: string, salt: Buffer, params: Argon2Params = DEFAULT_ARGON2_PARAMS): Promise<Buffer> {
  return Buffer.from(
    await argon2HashRaw(new TextEncoder().encode(secret), {
      algorithm: Algorithm.Argon2id,
      memoryCost: params.memoryCost,
      timeCost: params.timeCost,
      parallelism: params.parallelism,
      outputLen: 32,
      salt,
    })
  );
}

async function createPasswordWrappedVdk(vdk: Buffer, password: string): Promise<PasswordWrappedVdk> {
  const salt = randomBytes(32);
  const derivedKey = await deriveKey(normalizeNewPasswordLikeSecret(password), salt);
  const wrapped = encryptWithAesGcm(vdk, derivedKey);
  return {
    argon2Params: { ...DEFAULT_ARGON2_PARAMS },
    salt: bytesToBase64(salt),
    iv: wrapped.iv,
    wrappedKey: wrapped.ciphertext,
    authTag: wrapped.authTag,
  };
}

async function unwrapPasswordWrappedVdk(passwordWrappedVdk: PasswordWrappedVdk, password: string): Promise<Buffer> {
  const derivedKey = await deriveKey(
    normalizeExistingPasswordLikeSecret(password),
    base64ToBuffer(passwordWrappedVdk.salt, "Salt"),
    passwordWrappedVdk.argon2Params
  );
  return decryptWithAesGcm(passwordWrappedVdk, derivedKey);
}

async function createRecoveryWrappedVdk(secret: string, vdk: Buffer): Promise<RecoveryWrappedVdk> {
  const salt = randomBytes(32);
  const recoveryKey = await deriveKey(secret, salt);
  const wrapped = encryptWithAesGcm(vdk, recoveryKey);
  return {
    argon2Params: { ...DEFAULT_ARGON2_PARAMS },
    salt: bytesToBase64(salt),
    iv: wrapped.iv,
    wrappedKey: wrapped.ciphertext,
    authTag: wrapped.authTag,
  };
}

async function unwrapRecoveryWrappedVdk(recoveryWrappedVdk: RecoveryWrappedVdk, secret: string): Promise<Buffer> {
  const recoveryKey = await deriveKey(secret, base64ToBuffer(recoveryWrappedVdk.salt, "Salt"), recoveryWrappedVdk.argon2Params);
  return decryptWithAesGcm(recoveryWrappedVdk, recoveryKey);
}

function createOuterMeta(overrides?: Partial<VaultOuterMeta>): VaultOuterMeta {
  return {
    biometricEnrolled: overrides?.biometricEnrolled === true,
    recoveryGenerated: overrides?.recoveryGenerated === true,
  };
}

function normalizeLockState(value: unknown): { failedCount: number; lockUntilEpochMs: number; disabledAtEpochMs?: number } {
  if (!value || typeof value !== "object") {
    return DEFAULT_LOCK_STATE;
  }
  const candidate = value as Partial<{ failedCount: number; lockUntilEpochMs: number }>;
  const failedCount =
    typeof candidate.failedCount === "number" && Number.isInteger(candidate.failedCount) && candidate.failedCount > 0
      ? candidate.failedCount
      : 0;
  const lockUntilEpochMs =
    typeof candidate.lockUntilEpochMs === "number" && Number.isFinite(candidate.lockUntilEpochMs) && candidate.lockUntilEpochMs > 0
      ? Math.floor(candidate.lockUntilEpochMs)
      : 0;
  const disabledAtEpochMs =
    typeof (candidate as { disabledAtEpochMs?: unknown }).disabledAtEpochMs === "number" &&
    Number.isFinite((candidate as { disabledAtEpochMs?: number }).disabledAtEpochMs) &&
    ((candidate as { disabledAtEpochMs?: number }).disabledAtEpochMs ?? 0) > 0
      ? Math.floor((candidate as { disabledAtEpochMs?: number }).disabledAtEpochMs ?? 0)
      : 0;
  return disabledAtEpochMs > 0 ? { failedCount, lockUntilEpochMs, disabledAtEpochMs } : { failedCount, lockUntilEpochMs };
}

export function normalizeVaultEnvelope(input: unknown): VaultEnvelopeV4 | undefined {
  if (!input || typeof input !== "object") return undefined;
  const candidate = input as Partial<VaultEnvelopeV4> & {
    passwordWrappedVdk?: Partial<PasswordWrappedVdk>;
    recoveryWrappedVdk?: Partial<RecoveryWrappedVdk> | null;
    biometricWrappedVdk?: Partial<BiometricWrappedVdk> | null;
    outerMeta?: Partial<VaultOuterMeta>;
  };
  if (candidate.version !== 4) return undefined;
  if (!candidate.vault || typeof candidate.vault !== "object") return undefined;
  if (!candidate.passwordWrappedVdk || typeof candidate.passwordWrappedVdk !== "object") return undefined;

  const vault = candidate.vault as Partial<VaultCipherEnvelope>;
  const passwordWrappedVdk = candidate.passwordWrappedVdk;
  if (
    typeof vault.iv !== "string" ||
    typeof vault.ciphertext !== "string" ||
    typeof vault.authTag !== "string" ||
    typeof passwordWrappedVdk.salt !== "string" ||
    typeof passwordWrappedVdk.iv !== "string" ||
    typeof passwordWrappedVdk.wrappedKey !== "string" ||
    typeof passwordWrappedVdk.authTag !== "string" ||
    !passwordWrappedVdk.argon2Params ||
    typeof passwordWrappedVdk.argon2Params.memoryCost !== "number" ||
    typeof passwordWrappedVdk.argon2Params.timeCost !== "number" ||
    typeof passwordWrappedVdk.argon2Params.parallelism !== "number"
  ) {
    return undefined;
  }

  const biometricWrappedVdk = (() => {
    if (candidate.biometricWrappedVdk == null) return null;
    const value = candidate.biometricWrappedVdk;
    if (
      typeof value.keychainItemLabel !== "string" ||
      typeof value.iv !== "string" ||
      typeof value.wrappedKey !== "string" ||
      typeof value.authTag !== "string"
    ) {
      return null;
    }
    return {
      keychainItemLabel: value.keychainItemLabel,
      iv: value.iv,
      wrappedKey: value.wrappedKey,
      authTag: value.authTag,
    };
  })();

  const recoveryWrappedVdk = (() => {
    if (candidate.recoveryWrappedVdk == null) return null;
    const value = candidate.recoveryWrappedVdk;
    if (
      typeof value.salt !== "string" ||
      typeof value.iv !== "string" ||
      typeof value.wrappedKey !== "string" ||
      typeof value.authTag !== "string" ||
      !value.argon2Params ||
      typeof value.argon2Params.memoryCost !== "number" ||
      typeof value.argon2Params.timeCost !== "number" ||
      typeof value.argon2Params.parallelism !== "number"
    ) {
      return null;
    }
    return {
      argon2Params: {
        memoryCost: value.argon2Params.memoryCost,
        timeCost: value.argon2Params.timeCost,
        parallelism: value.argon2Params.parallelism,
      },
      salt: value.salt,
      iv: value.iv,
      wrappedKey: value.wrappedKey,
      authTag: value.authTag,
    };
  })();

  return {
    version: 4,
    vault: {
      iv: vault.iv,
      ciphertext: vault.ciphertext,
      authTag: vault.authTag,
    },
    passwordWrappedVdk: {
      argon2Params: {
        memoryCost: passwordWrappedVdk.argon2Params.memoryCost,
        timeCost: passwordWrappedVdk.argon2Params.timeCost,
        parallelism: passwordWrappedVdk.argon2Params.parallelism,
      },
      salt: passwordWrappedVdk.salt,
      iv: passwordWrappedVdk.iv,
      wrappedKey: passwordWrappedVdk.wrappedKey,
      authTag: passwordWrappedVdk.authTag,
    },
    biometricWrappedVdk,
    recoveryWrappedVdk,
    outerMeta: createOuterMeta(candidate.outerMeta),
    passwordUnlockLockState: normalizeLockState(candidate.passwordUnlockLockState),
  };
}

export function decryptVaultPayload(vdk: Buffer, envelope: VaultEnvelopeV4): string {
  return decryptWithAesGcm(envelope.vault, vdk).toString("utf8");
}

export async function createVaultEnvelope(payloadJson: string, password: string, outerMeta?: Partial<VaultOuterMeta>): Promise<{
  envelope: VaultEnvelopeV4;
  vdk: Buffer;
}> {
  const vdk = randomBytes(32);
  return {
    vdk,
    envelope: {
      version: 4,
      vault: encryptWithAesGcm(Buffer.from(payloadJson, "utf8"), vdk),
      passwordWrappedVdk: await createPasswordWrappedVdk(vdk, password),
      biometricWrappedVdk: null,
      recoveryWrappedVdk: null,
      outerMeta: createOuterMeta(outerMeta),
      passwordUnlockLockState: DEFAULT_LOCK_STATE,
    },
  };
}

export function rewriteVaultEnvelopeWithVdk(
  envelope: VaultEnvelopeV4,
  payloadJson: string,
  vdk: Buffer,
  updates?: Partial<Pick<VaultEnvelopeV4, "biometricWrappedVdk" | "recoveryWrappedVdk" | "outerMeta" | "passwordUnlockLockState">>
): VaultEnvelopeV4 {
  const hasBiometricWrappedVdkUpdate = !!updates && Object.prototype.hasOwnProperty.call(updates, "biometricWrappedVdk");
  const hasRecoveryWrappedVdkUpdate = !!updates && Object.prototype.hasOwnProperty.call(updates, "recoveryWrappedVdk");
  return {
    ...envelope,
    vault: encryptWithAesGcm(Buffer.from(payloadJson, "utf8"), vdk),
    biometricWrappedVdk: hasBiometricWrappedVdkUpdate ? (updates?.biometricWrappedVdk ?? null) : envelope.biometricWrappedVdk,
    recoveryWrappedVdk: hasRecoveryWrappedVdkUpdate ? (updates?.recoveryWrappedVdk ?? null) : envelope.recoveryWrappedVdk,
    outerMeta: updates?.outerMeta ?? envelope.outerMeta,
    passwordUnlockLockState: updates?.passwordUnlockLockState ?? envelope.passwordUnlockLockState ?? DEFAULT_LOCK_STATE,
  };
}

export async function unlockEnvelopeWithPassword(password: string, envelope: VaultEnvelopeV4): Promise<PasswordUnlockResult> {
  const state = normalizeLockState(envelope.passwordUnlockLockState);
  const now = Date.now();
  if ((state as { disabledAtEpochMs?: number }).disabledAtEpochMs) {
    return {
      result: "LOCKED",
      lockedUntil: state.lockUntilEpochMs,
      attemptsUsed: state.failedCount,
      disabled: true,
    };
  }
  if (state.lockUntilEpochMs > now) {
    return {
      result: "LOCKED",
      lockedUntil: state.lockUntilEpochMs,
      attemptsUsed: state.failedCount,
    };
  }

  try {
    const vdk = await unwrapPasswordWrappedVdk(envelope.passwordWrappedVdk, password);
    return {
      result: "OK",
      vdk,
      payloadJson: decryptVaultPayload(vdk, envelope),
    };
  } catch {
    const attemptsUsed = Math.min(state.failedCount + 1, 10);
    if (attemptsUsed >= 10) {
      envelope.passwordUnlockLockState = {
        failedCount: attemptsUsed,
        lockUntilEpochMs: 0,
        disabledAtEpochMs: now,
      };
      return {
        result: "LOCKED",
        lockedUntil: 0,
        attemptsUsed,
        disabled: true,
      };
    }
    const delaySeconds = attemptsUsed <= 3 ? 0 : attemptsUsed <= 6 ? 5 : 30;
    const lockedUntil = delaySeconds > 0 ? now + delaySeconds * 1000 : 0;
    envelope.passwordUnlockLockState = {
      failedCount: attemptsUsed,
      lockUntilEpochMs: lockedUntil,
    };
    if (lockedUntil > now) {
      return {
        result: "LOCKED",
        lockedUntil,
        attemptsUsed,
      };
    }
    return {
      result: "INCORRECT",
      attemptsUsed,
    };
  }
}

export function clearPasswordUnlockLockState(envelope: VaultEnvelopeV4): VaultEnvelopeV4 {
  return {
    ...envelope,
    passwordUnlockLockState: DEFAULT_LOCK_STATE,
  };
}

export async function rotatePasswordWrap(envelope: VaultEnvelopeV4, password: string): Promise<VaultEnvelopeV4> {
  const vdk = await unwrapPasswordWrappedVdk(envelope.passwordWrappedVdk, password);
  const nextPasswordWrappedVdk = await createPasswordWrappedVdk(vdk, password);
  return {
    ...envelope,
    passwordWrappedVdk: nextPasswordWrappedVdk,
    passwordUnlockLockState: DEFAULT_LOCK_STATE,
  };
}

export async function replacePasswordWrapWithVdk(envelope: VaultEnvelopeV4, vdk: Buffer, password: string): Promise<VaultEnvelopeV4> {
  const nextPasswordWrappedVdk = await createPasswordWrappedVdk(vdk, password);
  return {
    ...envelope,
    passwordWrappedVdk: nextPasswordWrappedVdk,
    passwordUnlockLockState: DEFAULT_LOCK_STATE,
  };
}

const RECOVERY_SECRET_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_SECRET_GROUP_SIZE = 6;
const RECOVERY_SECRET_GROUP_COUNT = 8;
const RECOVERY_SECRET_MAX_AMBIGUOUS_VARIANTS = 16;

function createRecoverySecret(): string {
  const chars: string[] = [];
  const maxByte = Math.floor(256 / RECOVERY_SECRET_ALPHABET.length) * RECOVERY_SECRET_ALPHABET.length;
  while (chars.length < RECOVERY_SECRET_GROUP_SIZE * RECOVERY_SECRET_GROUP_COUNT) {
    const chunk = randomBytes(32);
    for (const byte of chunk) {
      if (byte >= maxByte) {
        continue;
      }
      chars.push(RECOVERY_SECRET_ALPHABET[byte % RECOVERY_SECRET_ALPHABET.length]);
      if (chars.length === RECOVERY_SECRET_GROUP_SIZE * RECOVERY_SECRET_GROUP_COUNT) {
        break;
      }
    }
  }
  const groups: string[] = [];
  for (let index = 0; index < chars.length; index += RECOVERY_SECRET_GROUP_SIZE) {
    groups.push(chars.slice(index, index + RECOVERY_SECRET_GROUP_SIZE).join(""));
  }
  return groups.join("-");
}

function normalizeRecoverySecretInput(secret: string): string {
  const normalized = secret.replace(/[^A-Z0-9]/gi, "").toUpperCase().replace(/0/g, "O");
  if (normalized.length < 16) {
    throw new Error("Recovery secret is invalid.");
  }
  return normalized;
}

function expandRecoverySecretCandidates(secret: string): string[] {
  const normalized = normalizeRecoverySecretInput(secret);
  if (!normalized.includes("1")) {
    return [normalized];
  }

  let candidates = [""];
  for (const char of normalized) {
    if (char !== "1") {
      candidates = candidates.map((candidate) => `${candidate}${char}`);
      continue;
    }

    const nextCandidates: string[] = [];
    for (const candidate of candidates) {
      nextCandidates.push(`${candidate}I`);
      if (nextCandidates.length >= RECOVERY_SECRET_MAX_AMBIGUOUS_VARIANTS) break;
      nextCandidates.push(`${candidate}L`);
      if (nextCandidates.length >= RECOVERY_SECRET_MAX_AMBIGUOUS_VARIANTS) break;
    }
    candidates = nextCandidates;
    if (candidates.length >= RECOVERY_SECRET_MAX_AMBIGUOUS_VARIANTS) {
      break;
    }
  }

  return [...new Set(candidates)];
}

export function normalizeRecoverySecret(secret: string): string {
  return expandRecoverySecretCandidates(secret)[0];
}

export async function createRecoverySecretAndWrap(vdk: Buffer): Promise<{
  secret: string;
  recoveryVerifier: string;
  recoveryWrappedVdk: RecoveryWrappedVdk;
}> {
  const recoverySecret = createRecoverySecret();
  const normalizedSecret = normalizeRecoverySecret(recoverySecret);
  const verifierSalt = randomBytes(32);
  const verifierHash = await deriveKey(normalizedSecret, verifierSalt, RECOVERY_VERIFIER_ARGON2_PARAMS);
  return {
    secret: recoverySecret,
    recoveryVerifier: encodeArgon2idPhc(verifierHash, verifierSalt, RECOVERY_VERIFIER_ARGON2_PARAMS),
    recoveryWrappedVdk: await createRecoveryWrappedVdk(normalizedSecret, vdk),
  };
}

export async function unlockEnvelopeWithRecoverySecret(secret: string, envelope: VaultEnvelopeV4): Promise<RecoveryUnlockResult> {
  if (!envelope.recoveryWrappedVdk) {
    return { result: "LOCKED" };
  }
  let candidates: string[];
  try {
    candidates = expandRecoverySecretCandidates(secret);
  } catch {
    return { result: "LOCKED" };
  }
  for (const candidate of candidates) {
    try {
      const vdk = await unwrapRecoveryWrappedVdk(envelope.recoveryWrappedVdk, candidate);
      return {
        result: "OK",
        vdk,
        payloadJson: decryptVaultPayload(vdk, envelope),
      };
    } catch {
      continue;
    }
  }
  return { result: "LOCKED" };
}

export async function verifyRecoverySecret(secret: string, verifier: RecoveryVerifier | null): Promise<boolean> {
  if (!verifier) return false;
  const parsed =
    typeof verifier === "string"
      ? decodeArgon2idPhc(verifier)
      : {
          hash: base64ToBuffer(verifier.hash, "Recovery verifier"),
          salt: base64ToBuffer(verifier.salt, "Recovery salt"),
          argon2Params: verifier.argon2Params,
        };
  if (!parsed) {
    return false;
  }
  let candidates: string[];
  try {
    candidates = expandRecoverySecretCandidates(secret);
  } catch {
    return false;
  }
  for (const candidate of candidates) {
    const computed = await deriveKey(candidate, parsed.salt, parsed.argon2Params);
    if (parsed.hash.length === computed.length && timingSafeEqual(parsed.hash, computed)) {
      return true;
    }
  }
  return false;
}

function biometricKeychainLabel(): string {
  return `vault-authenticator-vdk-${randomUUID()}`;
}

export async function enrollMacBiometricWrappedVdk(vdk: Buffer): Promise<BiometricWrappedVdk | null> {
  if (process.platform !== "darwin") {
    return null;
  }

  // macOS only. Windows Hello VDK integration
  // requires a separate native module and is
  // tracked as a future hardening item.
  // See BUG_HUNT_REPORT.md.
  await systemPreferences.promptTouchID("Enroll Touch ID unlock for your vault");
  const bek = randomBytes(32);
  const keychainItemLabel = biometricKeychainLabel();
  await saveMacKeychainSecret(keychainItemLabel, bytesToBase64(bek));
  const wrapped = encryptWithAesGcm(vdk, bek);
  return {
    keychainItemLabel,
    iv: wrapped.iv,
    wrappedKey: wrapped.ciphertext,
    authTag: wrapped.authTag,
  };
}

export async function removeMacBiometricWrappedVdk(biometricWrappedVdk: BiometricWrappedVdk | null): Promise<void> {
  if (!biometricWrappedVdk || process.platform !== "darwin") {
    return;
  }
  await deleteMacKeychainSecret(biometricWrappedVdk.keychainItemLabel).catch((): undefined => undefined);
}

export async function unlockEnvelopeWithBiometric(envelope: VaultEnvelopeV4): Promise<{ vdk: Buffer; payloadJson: string }> {
  if (process.platform !== "darwin") {
    throw new Error("Biometric cold-start: macOS only.");
  }
  if (!envelope.biometricWrappedVdk) {
    throw new Error("Biometric not enrolled.");
  }

  // macOS only. Windows Hello VDK integration
  // requires a separate native module and is
  // tracked as a future hardening item.
  // See BUG_HUNT_REPORT.md.
  await systemPreferences.promptTouchID("Unlock your vault");
  const keychainKey = Buffer.from(await readMacKeychainSecret(envelope.biometricWrappedVdk.keychainItemLabel), "base64");
  const vdk = decryptWithAesGcm(envelope.biometricWrappedVdk, keychainKey);
  return {
    vdk,
    payloadJson: decryptVaultPayload(vdk, envelope),
  };
}

export function normalizeLegacyHardenedEnvelope(input: unknown): LegacyHardenedEnvelope | undefined {
  if (!input || typeof input !== "object") return undefined;
  const candidate = input as Partial<LegacyHardenedEnvelope> & {
    argon2Params?: { m?: unknown; t?: unknown; p?: unknown };
  };
  if (candidate.version !== 1 || candidate.mode !== "hardened") return undefined;
  if (
    typeof candidate.salt !== "string" ||
    typeof candidate.ciphertext !== "string" ||
    typeof candidate.iv !== "string" ||
    typeof candidate.authTag !== "string" ||
    !candidate.argon2Params ||
    typeof candidate.argon2Params.m !== "number" ||
    typeof candidate.argon2Params.t !== "number" ||
    typeof candidate.argon2Params.p !== "number"
  ) {
    return undefined;
  }
  return {
    version: 1,
    mode: "hardened",
    argon2Params: {
      m: candidate.argon2Params.m,
      t: candidate.argon2Params.t,
      p: candidate.argon2Params.p,
    },
    salt: candidate.salt,
    ciphertext: candidate.ciphertext,
    iv: candidate.iv,
    authTag: candidate.authTag,
    unlockLockState: candidate.unlockLockState,
  };
}

export async function decryptLegacyHardenedPayload(legacyEnvelope: LegacyHardenedEnvelope, password: string): Promise<string> {
  const legacyKey = Buffer.from(
    await argon2HashRaw(new TextEncoder().encode(normalizeExistingPasswordLikeSecret(password)), {
      algorithm: Algorithm.Argon2id,
      memoryCost: legacyEnvelope.argon2Params.m,
      timeCost: legacyEnvelope.argon2Params.t,
      parallelism: legacyEnvelope.argon2Params.p,
      outputLen: 32,
      salt: base64ToBuffer(legacyEnvelope.salt, "Salt"),
    })
  );
  return decryptWithAesGcm(
    {
      iv: legacyEnvelope.iv,
      ciphertext: legacyEnvelope.ciphertext,
      authTag: legacyEnvelope.authTag,
    },
    legacyKey
  ).toString("utf8");
}

export function encodeLegacyStandardBlob(payloadJson: string): string {
  return Buffer.from(payloadJson, "utf8").toString("base64");
}

export function decodeLegacyStandardBlob(blob: string): string {
  return Buffer.from(blob, "base64").toString("utf8");
}

export function outerMetaFromEnvelope(envelope: VaultEnvelopeV4 | null | undefined): VaultOuterMeta {
  return createOuterMeta(envelope?.outerMeta);
}

export function recoveryGenerated(envelope: VaultEnvelopeV4 | null | undefined): boolean {
  return !!envelope?.recoveryWrappedVdk;
}

export function biometricEnrolled(envelope: VaultEnvelopeV4 | null | undefined): boolean {
  return !!envelope?.biometricWrappedVdk;
}

export function envelopeHasSamePassword(envelope: VaultEnvelopeV4, password: string): Promise<boolean> {
  return unwrapPasswordWrappedVdk(envelope.passwordWrappedVdk, password)
    .then((vdk) => {
      const digest = createHash("sha256").update(vdk).digest();
      const redecrypted = createHash("sha256").update(decryptVaultPayload(vdk, envelope), "utf8").digest();
      return digest.length > 0 && redecrypted.length > 0;
    })
    .catch(() => false);
}
