import { Algorithm, hashRaw as argon2HashRaw } from "@node-rs/argon2";

export type BackupAccount = {
  id: string;
  issuer: string;
  label: string;
  secretBase32: string;
  digits: 6 | 8;
  period: number;
  algorithm: "SHA1" | "SHA256" | "SHA512";
};

export type BackupPayload = {
  version: 1;
  accounts: BackupAccount[];
};

export type EncryptedBackupV1 = {
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  algorithm: "AES-GCM";
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
};

export type EncryptedBackupV2 = {
  version: 2;
  kdf: "argon2id";
  argon2Params: {
    m: number;
    t: number;
    p: number;
  };
  algorithm: "aes-256-gcm";
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
};

export type EncryptedBackupV3 = {
  version: 3;
  kdf: "argon2id";
  argon2Params: {
    m: number;
    t: number;
    p: number;
  };
  algorithm: "aes-256-gcm";
  salt: string;
  iv: string;
  ciphertext: string;
  authTag: string;
};

export type EncryptedBackup = EncryptedBackupV1 | EncryptedBackupV2 | EncryptedBackupV3;

const ITERATIONS = 210000;
const CURRENT_BACKUP_VERSION = 3;
const LEGACY_TRIMMED_BACKUP_VERSION = 2;
const ARGON2_PARAMS = {
  m: 65536,
  t: 3,
  p: 1,
} as const;

function bytesToBase64(bytes: Uint8Array): string {
  const globalBuffer = (globalThis as any).Buffer;
  if (globalBuffer) {
    return globalBuffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const globalBuffer = (globalThis as any).Buffer;
  if (globalBuffer) {
    return new Uint8Array(globalBuffer.from(base64, "base64"));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function normalizePassphrase(passphrase: string, options?: { trimLegacy?: boolean }): string {
  const pass = options?.trimLegacy === true ? passphrase.trim() : passphrase;
  if (pass.length < 8 || pass.length > 256) {
    throw new Error("Passphrase must be 8-256 characters");
  }
  return pass;
}

function normalizeExportPassphrase(passphrase: string): string {
  const pass = normalizePassphrase(passphrase);
  if (pass.trim() !== pass) {
    throw new Error("Passphrase must not have leading or trailing spaces.");
  }
  return pass;
}

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const pass = normalizePassphrase(passphrase, { trimLegacy: true });
  const raw = new TextEncoder().encode(pass);
  const base = await crypto.subtle.importKey("raw", raw, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations: ITERATIONS,
    },
    base,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

async function deriveKeyV2(passphrase: string, salt: Uint8Array, options?: { trimLegacy?: boolean }): Promise<CryptoKey> {
  const pass = normalizePassphrase(passphrase, options);
  const rawKey = new Uint8Array(
    await argon2HashRaw(new TextEncoder().encode(pass), {
      algorithm: Algorithm.Argon2id,
      memoryCost: ARGON2_PARAMS.m,
      timeCost: ARGON2_PARAMS.t,
      parallelism: ARGON2_PARAMS.p,
      outputLen: 32,
      salt,
    })
  );

  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(rawKey),
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function splitEncryptedBytes(encryptedBytes: Uint8Array): { ciphertext: Uint8Array; authTag: Uint8Array } {
  if (encryptedBytes.length < 16) {
    throw new Error("Encryption failed");
  }

  const tagLength = 16;
  return {
    ciphertext: encryptedBytes.slice(0, encryptedBytes.length - tagLength),
    authTag: encryptedBytes.slice(encryptedBytes.length - tagLength),
  };
}

function joinCiphertextAndAuthTag(ciphertext: Uint8Array, authTag: Uint8Array): Uint8Array {
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);
  return combined;
}

async function decryptWithKey(
  envelope: Pick<EncryptedBackup, "iv" | "ciphertext" | "authTag">,
  key: CryptoKey
): Promise<BackupPayload> {
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const authTag = base64ToBytes(envelope.authTag);
  const sealed = joinCiphertextAndAuthTag(ciphertext, authTag);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(sealed)
  );
  const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as BackupPayload;
  if (parsed.version !== 1 || !Array.isArray(parsed.accounts)) {
    throw new Error("Invalid backup data");
  }
  return parsed;
}

export async function encryptBackup(accounts: BackupAccount[], passphrase: string): Promise<EncryptedBackup> {
  const normalizedPassphrase = normalizeExportPassphrase(passphrase);
  const payload: BackupPayload = { version: 1, accounts };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKeyV2(normalizedPassphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, plaintext);
  const { ciphertext, authTag } = splitEncryptedBytes(new Uint8Array(encrypted));

  return {
    version: CURRENT_BACKUP_VERSION,
    kdf: "argon2id",
    argon2Params: { ...ARGON2_PARAMS },
    algorithm: "aes-256-gcm",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    authTag: bytesToBase64(authTag),
  };
}

export async function decryptBackup(envelope: EncryptedBackup, passphrase: string): Promise<BackupPayload> {
  try {
    if (envelope.version === 1) {
      if (
        envelope.version !== 1 ||
        envelope.kdf !== "PBKDF2-SHA256" ||
        envelope.algorithm !== "AES-GCM" ||
        envelope.iterations !== ITERATIONS
      ) {
        throw new Error("Unsupported backup format");
      }

      const key = await deriveKey(passphrase, base64ToBytes(envelope.salt));
      return await decryptWithKey(envelope, key);
    }

    if (envelope.version === 2 || envelope.version === 3) {
      if (
        envelope.kdf !== "argon2id" ||
        envelope.algorithm !== "aes-256-gcm" ||
        envelope.argon2Params.m !== ARGON2_PARAMS.m ||
        envelope.argon2Params.t !== ARGON2_PARAMS.t ||
        envelope.argon2Params.p !== ARGON2_PARAMS.p
      ) {
        throw new Error("Unsupported backup format");
      }

      const key = await deriveKeyV2(passphrase, base64ToBytes(envelope.salt), {
        trimLegacy: envelope.version <= LEGACY_TRIMMED_BACKUP_VERSION,
      });
      return await decryptWithKey(envelope, key);
    }

    throw new Error("Unsupported backup format");
  } catch (error) {
    if (error instanceof Error && error.message === "Unsupported backup format") {
      throw error;
    }
    throw new Error("Backup decryption failed");
  }
}
