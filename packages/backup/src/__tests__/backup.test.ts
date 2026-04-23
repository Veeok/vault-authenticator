import { Algorithm, hashRaw as argon2HashRaw } from "@node-rs/argon2";
import { describe, expect, it } from "vitest";
import { decryptBackup, deriveKey, encryptBackup } from "../index";

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveLegacyV2Key(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const rawKey = new Uint8Array(
    await argon2HashRaw(new TextEncoder().encode(passphrase.trim()), {
      algorithm: Algorithm.Argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
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

describe("backup crypto", () => {
  const sampleAccounts = [
    {
      id: "acc-1",
      issuer: "Example",
      label: "user@example.com",
      secretBase32: "JBSWY3DPEHPK3PXP",
      digits: 6 as const,
      period: 30,
      algorithm: "SHA1" as const,
    },
    {
      id: "acc-2",
      issuer: "Example 2",
      label: "second@example.com",
      secretBase32: "GEZDGNBVGY3TQOJQ",
      digits: 8 as const,
      period: 45,
      algorithm: "SHA256" as const,
    },
  ];

  it("round-trips encrypted backups", async () => {
    const encrypted = await encryptBackup(sampleAccounts, "correct horse battery staple");
    const decrypted = await decryptBackup(encrypted, "correct horse battery staple");

    expect(encrypted.version).toBe(3);
    expect(encrypted.kdf).toBe("argon2id");
    if (encrypted.version === 3) {
      expect(encrypted.argon2Params).toEqual({ m: 65536, t: 3, p: 1 });
      expect(encrypted.algorithm).toBe("aes-256-gcm");
    }
    expect(decrypted.version).toBe(1);
    expect(decrypted.accounts).toEqual(sampleAccounts);
  });

  it("rejects export passphrases with leading or trailing whitespace", async () => {
    await expect(encryptBackup(sampleAccounts, " correct horse battery staple ")).rejects.toThrow(
      "Passphrase must not have leading or trailing spaces."
    );
  });

  it("fails when passphrase is incorrect", async () => {
    const encrypted = await encryptBackup(sampleAccounts, "correct horse battery staple");
    await expect(decryptBackup(encrypted, "wrong passphrase")).rejects.toThrow("Backup decryption failed");
  });

  it("still decrypts legacy v1 PBKDF2 backups", async () => {
    const payload = new TextEncoder().encode(JSON.stringify({ version: 1, accounts: sampleAccounts }));
    const salt = Uint8Array.from(Buffer.from("00112233445566778899aabbccddeeff", "hex"));
    const iv = Uint8Array.from(Buffer.from("0102030405060708090a0b0c", "hex"));
    const key = await deriveKey("correct horse battery staple", salt);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, payload);
    const encryptedBytes = new Uint8Array(encrypted);
    const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);
    const authTag = encryptedBytes.slice(encryptedBytes.length - 16);

    const legacyEnvelope = {
      version: 1 as const,
      kdf: "PBKDF2-SHA256" as const,
      iterations: 210000,
      algorithm: "AES-GCM" as const,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
      authTag: bytesToBase64(authTag),
    };

    const decrypted = await decryptBackup(legacyEnvelope, "correct horse battery staple");
    expect(decrypted.version).toBe(1);
    expect(decrypted.accounts).toEqual(sampleAccounts);
  });

  it("fails clearly for unknown backup versions", async () => {
    await expect(
      decryptBackup(
        {
          version: 2,
          kdf: "argon2id",
          argon2Params: { m: 1, t: 1, p: 1 },
          algorithm: "aes-256-gcm",
          salt: "salt",
          iv: "iv",
          ciphertext: "ciphertext",
          authTag: "authTag",
        },
        "correct horse battery staple"
      )
    ).rejects.toThrow("Unsupported backup format");
  });

  it("still decrypts legacy v2 Argon2 backups created with trimmed passphrases", async () => {
    const payload = new TextEncoder().encode(JSON.stringify({ version: 1, accounts: sampleAccounts }));
    const salt = Uint8Array.from(Buffer.from("11112222333344445555666677778888", "hex"));
    const iv = Uint8Array.from(Buffer.from("0c0b0a090807060504030201", "hex"));
    const key = await deriveLegacyV2Key("  correct horse battery staple  ", salt);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, payload);
    const encryptedBytes = new Uint8Array(encrypted);
    const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);
    const authTag = encryptedBytes.slice(encryptedBytes.length - 16);

    const legacyEnvelope = {
      version: 2 as const,
      kdf: "argon2id" as const,
      argon2Params: { m: 65536, t: 3, p: 1 },
      algorithm: "aes-256-gcm" as const,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
      authTag: bytesToBase64(authTag),
    };

    const decrypted = await decryptBackup(legacyEnvelope, "  correct horse battery staple  ");
    expect(decrypted.version).toBe(1);
    expect(decrypted.accounts).toEqual(sampleAccounts);
  });
});
