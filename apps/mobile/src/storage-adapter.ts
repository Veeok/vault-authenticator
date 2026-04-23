import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import type { StoredTotpAccount } from "@authenticator/core";
import type { AppSettings } from "@authenticator/ui";

export type LockState = {
  failedAttemptCount: number;
  lockedUntilEpochMs: number;
  disabledAtEpochMs?: number;
};

export type Argon2Params = {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
};

export type WrappedSecret = {
  iv: string;
  wrappedKey: string;
  authTag: string;
};

export type PdkWrappedVdk = WrappedSecret & {
  argon2Params: Argon2Params;
  salt: string;
};

export type RecoveryWrappedVdk = WrappedSecret & {
  argon2Params: Argon2Params;
  salt: string;
};

export type KskWrappedVdk = WrappedSecret & {
  keyAlias: string;
};

export type BiometricWrappedVdk = WrappedSecret & {
  keyAlias: string;
};

export type PinCredential = {
  hash: string;
  salt: string;
  argon2Params: Argon2Params;
};

export type LegacyRecoveryVerifier = {
  hash: string;
  salt: string;
  argon2Params: Argon2Params;
};

export type RecoveryVerifier = string | LegacyRecoveryVerifier;

export type MobileVaultPayload = {
  accounts: StoredTotpAccount[];
  recoveryVerifier: RecoveryVerifier | null;
};

export type MobileVaultStore = {
  version: 2;
  vault: {
    iv: string;
    ciphertext: string;
    authTag: string;
  };
  kskWrappedVdk: KskWrappedVdk;
  pdkWrappedVdk: PdkWrappedVdk;
  biometricWrappedVdk: BiometricWrappedVdk | null;
  recoveryWrappedVdk: RecoveryWrappedVdk | null;
  pinCredential: PinCredential;
  lockoutState: LockState;
  biometricLockoutState?: LockState;
  recoveryLockoutState?: LockState;
  settings?: AppSettings;
};

export type LegacyStoredBlob = {
  accounts: StoredTotpAccount[];
  pinHash?: string;
  pinLockState?: { failedCount?: number; lockUntilEpochMs?: number };
  recoveryCodeHashes?: string[];
  settings?: AppSettings;
};

const SECURE_BLOB_KEY = "authenticator.secureBlob";

const DEFAULT_LOCK_STATE: LockState = {
  failedAttemptCount: 0,
  lockedUntilEpochMs: 0,
};

function normalizeLockState(value: unknown): LockState {
  if (!value || typeof value !== "object") {
    return DEFAULT_LOCK_STATE;
  }
  const candidate = value as Partial<LockState> & {
    failedCount?: unknown;
    lockUntilEpochMs?: unknown;
  };
  const failedAttemptCount =
    typeof candidate.failedAttemptCount === "number"
      ? candidate.failedAttemptCount
      : typeof candidate.failedCount === "number"
        ? candidate.failedCount
        : 0;
  const normalized: LockState = {
    failedAttemptCount: Number.isInteger(failedAttemptCount) && failedAttemptCount > 0 ? failedAttemptCount : 0,
    lockedUntilEpochMs:
      typeof candidate.lockedUntilEpochMs === "number" && Number.isFinite(candidate.lockedUntilEpochMs) && candidate.lockedUntilEpochMs > 0
        ? Math.floor(candidate.lockedUntilEpochMs)
        : 0,
  };
  const disabledAtEpochMs =
    typeof (candidate as { disabledAtEpochMs?: unknown }).disabledAtEpochMs === "number" &&
    Number.isFinite((candidate as { disabledAtEpochMs?: number }).disabledAtEpochMs) &&
    ((candidate as { disabledAtEpochMs?: number }).disabledAtEpochMs ?? 0) > 0
      ? Math.floor((candidate as { disabledAtEpochMs?: number }).disabledAtEpochMs ?? 0)
      : 0;
  if (disabledAtEpochMs > 0) {
    normalized.disabledAtEpochMs = disabledAtEpochMs;
  }
  return normalized;
}

function normalizeArgon2Params(value: unknown): Argon2Params | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Argon2Params>;
  if (
    typeof candidate.memoryCost !== "number" ||
    typeof candidate.timeCost !== "number" ||
    typeof candidate.parallelism !== "number"
  ) {
    return null;
  }
  return {
    memoryCost: candidate.memoryCost,
    timeCost: candidate.timeCost,
    parallelism: candidate.parallelism,
  };
}

function normalizeWrappedSecret(value: unknown): WrappedSecret | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<WrappedSecret>;
  if (
    typeof candidate.iv !== "string" ||
    typeof candidate.wrappedKey !== "string" ||
    typeof candidate.authTag !== "string"
  ) {
    return null;
  }
  return {
    iv: candidate.iv,
    wrappedKey: candidate.wrappedKey,
    authTag: candidate.authTag,
  };
}

function normalizeVaultCipher(value: unknown): { iv: string; ciphertext: string; authTag: string } | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<{ iv: string; ciphertext: string; authTag: string }>;
  if (
    typeof candidate.iv !== "string" ||
    typeof candidate.ciphertext !== "string" ||
    typeof candidate.authTag !== "string"
  ) {
    return null;
  }
  return {
    iv: candidate.iv,
    ciphertext: candidate.ciphertext,
    authTag: candidate.authTag,
  };
}

function normalizeVaultStore(value: unknown): MobileVaultStore | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MobileVaultStore> & {
    kskWrappedVdk?: Partial<KskWrappedVdk>;
    biometricWrappedVdk?: Partial<BiometricWrappedVdk> | null;
    pdkWrappedVdk?: Partial<PdkWrappedVdk>;
    recoveryWrappedVdk?: Partial<RecoveryWrappedVdk> | null;
    pinCredential?: Partial<PinCredential>;
  };
  if (candidate.version !== 2) return null;
  const vault = normalizeVaultCipher(candidate.vault);
  const kskWrappedVdk = normalizeWrappedSecret(candidate.kskWrappedVdk);
  const pdkWrappedBase = normalizeWrappedSecret(candidate.pdkWrappedVdk);
  const pdkParams = normalizeArgon2Params(candidate.pdkWrappedVdk?.argon2Params);
  const pinParams = normalizeArgon2Params(candidate.pinCredential?.argon2Params);
  if (
    !vault ||
    !kskWrappedVdk ||
    !pdkWrappedBase ||
    !pdkParams ||
    !candidate.kskWrappedVdk ||
    typeof candidate.kskWrappedVdk.keyAlias !== "string" ||
    !candidate.pdkWrappedVdk ||
    typeof candidate.pdkWrappedVdk.salt !== "string" ||
    !candidate.pinCredential ||
    typeof candidate.pinCredential.hash !== "string" ||
    typeof candidate.pinCredential.salt !== "string" ||
    !pinParams
  ) {
    return null;
  }

  const biometricWrappedVdk = (() => {
    if (candidate.biometricWrappedVdk == null) return null;
    const wrapped = normalizeWrappedSecret(candidate.biometricWrappedVdk);
    if (!wrapped || typeof candidate.biometricWrappedVdk.keyAlias !== "string") {
      return null;
    }
    return { ...wrapped, keyAlias: candidate.biometricWrappedVdk.keyAlias };
  })();

  const recoveryWrappedVdk = (() => {
    if (candidate.recoveryWrappedVdk == null) return null;
    const wrapped = normalizeWrappedSecret(candidate.recoveryWrappedVdk);
    const params = normalizeArgon2Params(candidate.recoveryWrappedVdk.argon2Params);
    if (!wrapped || !params || typeof candidate.recoveryWrappedVdk.salt !== "string") {
      return null;
    }
    return { ...wrapped, salt: candidate.recoveryWrappedVdk.salt, argon2Params: params };
  })();

  return {
    version: 2,
    vault,
    kskWrappedVdk: { ...kskWrappedVdk, keyAlias: candidate.kskWrappedVdk.keyAlias },
    pdkWrappedVdk: { ...pdkWrappedBase, salt: candidate.pdkWrappedVdk.salt, argon2Params: pdkParams },
    biometricWrappedVdk,
    recoveryWrappedVdk,
    pinCredential: {
      hash: candidate.pinCredential.hash,
      salt: candidate.pinCredential.salt,
      argon2Params: pinParams,
    },
    lockoutState: normalizeLockState(candidate.lockoutState),
    biometricLockoutState: normalizeLockState(candidate.biometricLockoutState),
    recoveryLockoutState: normalizeLockState(candidate.recoveryLockoutState),
    settings: candidate.settings,
  };
}

export async function loadRawSecureBlob(): Promise<unknown> {
  try {
    const result = await SecureStorage.get(SECURE_BLOB_KEY);
    if (typeof result !== "string" || result.length === 0) return null;
    return JSON.parse(result) as unknown;
  } catch {
    return null;
  }
}

export async function loadVaultStore(): Promise<MobileVaultStore | null> {
  return normalizeVaultStore(await loadRawSecureBlob());
}

export async function loadLegacyStoredBlob(): Promise<LegacyStoredBlob | null> {
  const raw = await loadRawSecureBlob();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as Partial<LegacyStoredBlob>;
  if ((candidate as { version?: unknown }).version === 2) {
    return null;
  }
  return {
    accounts: Array.isArray(candidate.accounts) ? (candidate.accounts as StoredTotpAccount[]) : [],
    pinHash: typeof candidate.pinHash === "string" ? candidate.pinHash : undefined,
    pinLockState: candidate.pinLockState,
    recoveryCodeHashes: Array.isArray(candidate.recoveryCodeHashes)
      ? candidate.recoveryCodeHashes.filter((value): value is string => typeof value === "string" && value.length > 0)
      : undefined,
    settings: candidate.settings,
  };
}

export async function saveLegacyStoredBlob(blob: LegacyStoredBlob): Promise<void> {
  await SecureStorage.set(SECURE_BLOB_KEY, JSON.stringify(blob));
}

export async function saveVaultStore(store: MobileVaultStore): Promise<void> {
  await SecureStorage.set(SECURE_BLOB_KEY, JSON.stringify(store));
}

export async function clearVaultStore(): Promise<void> {
  await SecureStorage.remove(SECURE_BLOB_KEY);
}

export async function loadSettings(): Promise<AppSettings | undefined> {
  return (await loadVaultStore())?.settings;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const current = await loadVaultStore();
  if (!current) return;
  current.settings = settings;
  await saveVaultStore(current);
}
