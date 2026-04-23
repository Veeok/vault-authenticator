import { argon2id } from "hash-wasm";
import type { StoredTotpAccount } from "@authenticator/core";
import type {
  Argon2Params,
  BiometricWrappedVdk,
  KskWrappedVdk,
  LegacyRecoveryVerifier,
  LockState,
  MobileVaultPayload,
  MobileVaultStore,
  PdkWrappedVdk,
  PinCredential,
  RecoveryVerifier,
  RecoveryWrappedVdk,
  WrappedSecret,
  LegacyStoredBlob,
} from "./storage-adapter";

export type VaultKeyDriver = {
  createKey(options?: { alias?: string; biometric?: boolean }): Promise<{ alias: string }>;
  wrap(alias: string, plaintext: Uint8Array): Promise<WrappedSecret>;
  unwrap(alias: string, wrapped: WrappedSecret): Promise<{
    plaintext: Uint8Array;
    secureHardwareEnforced?: boolean;
    securityLevel?: string;
  }>;
  deleteKey(alias: string): Promise<void>;
};

export const MOBILE_ARGON2_PARAMS: Argon2Params = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

const RECOVERY_VERIFIER_ARGON2_PARAMS: Argon2Params = {
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

export const VAULT_INACCESSIBLE_KEYSTORE =
  "Vault cannot be opened on this device. Use biometrics, recovery codes, or restore from an encrypted backup.";

export const VAULT_INACCESSIBLE_INTEGRITY = "Vault integrity check failed. Restore from an encrypted backup.";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function bytesToUnpaddedBase64(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/=+$/g, "");
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index);
  }
  return out;
}

function unpaddedBase64ToBytes(base64: string): Uint8Array {
  return base64ToBytes(`${base64}${"=".repeat((4 - (base64.length % 4 || 4)) % 4)}`);
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function zeroBytes(value: Uint8Array | null | undefined): void {
  if (!value) return;
  value.fill(0);
}

async function aesEncrypt(keyBytes: Uint8Array, plaintext: Uint8Array): Promise<{ iv: string; ciphertext: string; authTag: string }> {
  const iv = randomBytes(12);
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(plaintext)));
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(encrypted.slice(0, encrypted.length - 16)),
    authTag: bytesToBase64(encrypted.slice(encrypted.length - 16)),
  };
}

async function aesDecrypt(keyBytes: Uint8Array, wrapped: { iv: string; wrappedKey: string; authTag: string } | { iv: string; ciphertext: string; authTag: string }): Promise<Uint8Array> {
  const iv = base64ToBytes(wrapped.iv);
  const ciphertext = base64ToBytes("wrappedKey" in wrapped ? wrapped.wrappedKey : wrapped.ciphertext);
  const authTag = base64ToBytes(wrapped.authTag);
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const encrypted = new Uint8Array(ciphertext.length + authTag.length);
  encrypted.set(ciphertext, 0);
  encrypted.set(authTag, ciphertext.length);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(encrypted)));
}

async function deriveArgon2(secret: string, salt: Uint8Array, params: Argon2Params = MOBILE_ARGON2_PARAMS): Promise<Uint8Array> {
  return argon2id({
    password: secret,
    salt,
    parallelism: params.parallelism,
    iterations: params.timeCost,
    memorySize: params.memoryCost,
    hashLength: 32,
    outputType: "binary",
  });
}

function encodeArgon2idPhc(hash: Uint8Array, salt: Uint8Array, params: Argon2Params): string {
  return `$argon2id$v=19$m=${params.memoryCost},t=${params.timeCost},p=${params.parallelism}$${bytesToUnpaddedBase64(salt)}$${bytesToUnpaddedBase64(hash)}`;
}

function decodeArgon2idPhc(encoded: string): { hash: Uint8Array; salt: Uint8Array; argon2Params: Argon2Params } | null {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[1] !== "argon2id" || parts[2] !== "v=19") {
    return null;
  }

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
      hash: unpaddedBase64ToBytes(parts[5]),
      salt: unpaddedBase64ToBytes(parts[4]),
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

export async function createPinCredential(pin: string): Promise<PinCredential> {
  const salt = randomBytes(32);
  const hash = await deriveArgon2(pin, salt);
  return {
    hash: bytesToBase64(hash),
    salt: bytesToBase64(salt),
    argon2Params: { ...MOBILE_ARGON2_PARAMS },
  };
}

export async function verifyPinCredential(pin: string, credential: PinCredential): Promise<boolean> {
  const computed = await deriveArgon2(pin, base64ToBytes(credential.salt), credential.argon2Params);
  const expected = base64ToBytes(credential.hash);
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < computed.length; index += 1) {
    diff |= computed[index] ^ expected[index];
  }
  return diff === 0;
}

const RECOVERY_SECRET_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_SECRET_GROUP_SIZE = 6;
const RECOVERY_SECRET_GROUP_COUNT = 8;
const RECOVERY_SECRET_MAX_AMBIGUOUS_VARIANTS = 16;

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

function normalizeRecoverySecret(secret: string): string {
  return expandRecoverySecretCandidates(secret)[0];
}

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

async function createRecoveryVerifier(secret: string): Promise<RecoveryVerifier> {
  const salt = randomBytes(32);
  const hash = await deriveArgon2(secret, salt, RECOVERY_VERIFIER_ARGON2_PARAMS);
  return encodeArgon2idPhc(hash, salt, RECOVERY_VERIFIER_ARGON2_PARAMS);
}

async function verifyRecoveryVerifier(secret: string, verifier: RecoveryVerifier | null): Promise<boolean> {
  if (!verifier) return false;
  const parsed =
    typeof verifier === "string"
      ? decodeArgon2idPhc(verifier)
      : {
          hash: base64ToBytes((verifier as LegacyRecoveryVerifier).hash),
          salt: base64ToBytes((verifier as LegacyRecoveryVerifier).salt),
          argon2Params: (verifier as LegacyRecoveryVerifier).argon2Params,
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
    const computed = await deriveArgon2(candidate, parsed.salt, parsed.argon2Params);
    if (computed.length !== parsed.hash.length) {
      continue;
    }
    let diff = 0;
    for (let index = 0; index < computed.length; index += 1) {
      diff |= computed[index] ^ parsed.hash[index];
    }
    if (diff === 0) {
      return true;
    }
  }
  return false;
}

export async function createMobileVaultStore(
  pin: string,
  payload: MobileVaultPayload,
  driver: VaultKeyDriver,
  settings?: MobileVaultStore["settings"]
): Promise<MobileVaultStore> {
  const vdk = randomBytes(32);
  const pinCredential = await createPinCredential(pin);
  const pdkSalt = randomBytes(32);
  const pdk = await deriveArgon2(pin, pdkSalt);
  const pdkWrappedVdkCipher = await aesEncrypt(pdk, vdk);
  const { alias: keyAlias } = await driver.createKey();
  const kskWrappedVdk = await driver.wrap(keyAlias, vdk);
  const vault = await aesEncrypt(vdk, new TextEncoder().encode(JSON.stringify(payload)));

  return {
    version: 2,
    vault,
    kskWrappedVdk: { ...kskWrappedVdk, keyAlias },
    pdkWrappedVdk: {
      iv: pdkWrappedVdkCipher.iv,
      wrappedKey: pdkWrappedVdkCipher.ciphertext,
      authTag: pdkWrappedVdkCipher.authTag,
      salt: bytesToBase64(pdkSalt),
      argon2Params: { ...MOBILE_ARGON2_PARAMS },
    },
    biometricWrappedVdk: null,
    recoveryWrappedVdk: null,
    pinCredential,
    lockoutState: { failedAttemptCount: 0, lockedUntilEpochMs: 0 },
    biometricLockoutState: { failedAttemptCount: 0, lockedUntilEpochMs: 0 },
    recoveryLockoutState: { failedAttemptCount: 0, lockedUntilEpochMs: 0 },
    settings,
  };
}

export async function decryptPayloadWithVdk(vdk: Uint8Array, vault: MobileVaultStore["vault"]): Promise<MobileVaultPayload> {
  return JSON.parse(new TextDecoder().decode(await aesDecrypt(vdk, vault))) as MobileVaultPayload;
}

export async function unlockMobileVaultWithPin(store: MobileVaultStore, pin: string, driver: VaultKeyDriver): Promise<
  | { ok: true; vdk: Uint8Array; payload: MobileVaultPayload }
  | { ok: false; code: "E_LOCKED" | "E_VAULT_INACCESSIBLE"; message?: string }
> {
  const pinMatches = await verifyPinCredential(pin, store.pinCredential);
  if (!pinMatches) {
    return { ok: false, code: "E_LOCKED" };
  }

  const pdk = await deriveArgon2(pin, base64ToBytes(store.pdkWrappedVdk.salt), store.pdkWrappedVdk.argon2Params);
  const pdkVdk = await aesDecrypt(pdk, store.pdkWrappedVdk).catch(() => null);
  zeroBytes(pdk);
  if (!pdkVdk) {
    return { ok: false, code: "E_LOCKED" };
  }

  let kskVdk: Uint8Array;
  try {
    // Both keys required by design. KSK loss = this
    // path fails closed. Use biometric, recovery, or
    // backup restore. Do not add a fallback.
    kskVdk = (await driver.unwrap(store.kskWrappedVdk.keyAlias, store.kskWrappedVdk)).plaintext;
  } catch {
    return { ok: false, code: "E_VAULT_INACCESSIBLE", message: VAULT_INACCESSIBLE_KEYSTORE };
  }

  if (pdkVdk.length !== kskVdk.length) {
    zeroBytes(pdkVdk);
    zeroBytes(kskVdk);
    return { ok: false, code: "E_VAULT_INACCESSIBLE", message: VAULT_INACCESSIBLE_INTEGRITY };
  }
  let diff = 0;
  for (let index = 0; index < pdkVdk.length; index += 1) {
    diff |= pdkVdk[index] ^ kskVdk[index];
  }
  if (diff !== 0) {
    zeroBytes(pdkVdk);
    zeroBytes(kskVdk);
    return { ok: false, code: "E_VAULT_INACCESSIBLE", message: VAULT_INACCESSIBLE_INTEGRITY };
  }

  zeroBytes(pdkVdk);

  return {
    ok: true,
    vdk: kskVdk,
    payload: await decryptPayloadWithVdk(kskVdk, store.vault),
  };
}

export async function changeMobileVaultPin(store: MobileVaultStore, currentPin: string, nextPin: string, driver: VaultKeyDriver): Promise<{
  store: MobileVaultStore;
  vdk: Uint8Array;
}> {
  const unlocked = await unlockMobileVaultWithPin(store, currentPin, driver);
  if (!unlocked.ok) {
    throw new Error(unlocked.message ?? unlocked.code);
  }

  const nextCredential = await createPinCredential(nextPin);
  const nextSalt = randomBytes(32);
  const nextPdk = await deriveArgon2(nextPin, nextSalt);
  const nextWrapped = await aesEncrypt(nextPdk, unlocked.vdk);
  zeroBytes(nextPdk);

  return {
    vdk: unlocked.vdk,
    store: {
      ...store,
      pinCredential: nextCredential,
      pdkWrappedVdk: {
        iv: nextWrapped.iv,
        wrappedKey: nextWrapped.ciphertext,
        authTag: nextWrapped.authTag,
        salt: bytesToBase64(nextSalt),
        argon2Params: { ...MOBILE_ARGON2_PARAMS },
      },
      lockoutState: { failedAttemptCount: 0, lockedUntilEpochMs: 0 },
      biometricLockoutState: store.biometricLockoutState,
      recoveryLockoutState: store.recoveryLockoutState,
    },
  };
}

export async function enrollMobileVaultBiometric(store: MobileVaultStore, vdk: Uint8Array, driver: VaultKeyDriver): Promise<MobileVaultStore> {
  const { alias } = await driver.createKey({ biometric: true });
  const wrapped = await driver.wrap(alias, vdk);
  return {
    ...store,
    biometricWrappedVdk: {
      keyAlias: alias,
      ...wrapped,
    },
  };
}

export async function unlockMobileVaultWithBiometric(store: MobileVaultStore, driver: VaultKeyDriver): Promise<
  | { ok: true; vdk: Uint8Array; payload: MobileVaultPayload; secureHardwareEnforced?: boolean; securityLevel?: string }
  | { ok: false; code?: "E_BIOMETRIC_INVALIDATED" }
> {
  if (!store.biometricWrappedVdk) {
    return { ok: false };
  }
  try {
    const unwrapped = await driver.unwrap(store.biometricWrappedVdk.keyAlias, store.biometricWrappedVdk);
    const vdk = unwrapped.plaintext;
    return {
      ok: true,
      vdk,
      payload: await decryptPayloadWithVdk(vdk, store.vault),
      secureHardwareEnforced: unwrapped.secureHardwareEnforced,
      securityLevel: unwrapped.securityLevel,
    };
  } catch (error) {
    if (error instanceof Error && /E_BIOMETRIC_INVALIDATED|KEY_INVALIDATED_BY_BIOMETRIC_ENROLLMENT/i.test(error.message)) {
      return { ok: false, code: "E_BIOMETRIC_INVALIDATED" };
    }
    return { ok: false };
  }
}

export async function generateMobileVaultRecovery(store: MobileVaultStore, vdk: Uint8Array): Promise<{
  store: MobileVaultStore;
  secret: string;
}> {
  const secret = createRecoverySecret();
  const normalized = normalizeRecoverySecret(secret);
  const verifier = await createRecoveryVerifier(normalized);
  const salt = randomBytes(32);
  const recoveryKey = await deriveArgon2(normalized, salt);
  const wrapped = await aesEncrypt(recoveryKey, vdk);
  zeroBytes(recoveryKey);
  const payload = await decryptPayloadWithVdk(vdk, store.vault);
  payload.recoveryVerifier = verifier;
  const vault = await aesEncrypt(vdk, new TextEncoder().encode(JSON.stringify(payload)));
  return {
    secret,
    store: {
      ...store,
      vault,
      recoveryWrappedVdk: {
        iv: wrapped.iv,
        wrappedKey: wrapped.ciphertext,
        authTag: wrapped.authTag,
        salt: bytesToBase64(salt),
        argon2Params: { ...MOBILE_ARGON2_PARAMS },
      },
    },
  };
}

export async function unlockMobileVaultWithRecovery(store: MobileVaultStore, secret: string): Promise<
  | { ok: true; vdk: Uint8Array; payload: MobileVaultPayload }
  | { ok: false; code: "E_LOCKED" }
> {
  if (!store.recoveryWrappedVdk) {
    return { ok: false, code: "E_LOCKED" };
  }
  let candidates: string[];
  try {
    candidates = expandRecoverySecretCandidates(secret);
  } catch {
    return { ok: false, code: "E_LOCKED" };
  }
  for (const candidate of candidates) {
    try {
      const recoveryKey = await deriveArgon2(candidate, base64ToBytes(store.recoveryWrappedVdk.salt), store.recoveryWrappedVdk.argon2Params);
      const vdk = await aesDecrypt(recoveryKey, store.recoveryWrappedVdk);
      zeroBytes(recoveryKey);
      const payload = await decryptPayloadWithVdk(vdk, store.vault);
      if (payload.recoveryVerifier && !(await verifyRecoveryVerifier(secret, payload.recoveryVerifier))) {
        zeroBytes(vdk);
        continue;
      }
      if (payload.recoveryVerifier && typeof payload.recoveryVerifier !== "string") {
        payload.recoveryVerifier = await createRecoveryVerifier(candidate);
      }
      return {
        ok: true,
        vdk,
        payload,
      };
    } catch {
      continue;
    }
  }
  return { ok: false, code: "E_LOCKED" };
}

export async function migrateLegacyMobileVault(
  legacy: LegacyStoredBlob,
  pin: string,
  driver: VaultKeyDriver
): Promise<MobileVaultStore> {
  return createMobileVaultStore(
    pin,
    {
      accounts: legacy.accounts,
      recoveryVerifier: null,
    },
    driver,
    legacy.settings
  );
}
