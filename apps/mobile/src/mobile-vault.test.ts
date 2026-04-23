import { describe, expect, it } from "vitest";
import {
  VAULT_INACCESSIBLE_INTEGRITY,
  VAULT_INACCESSIBLE_KEYSTORE,
  changeMobileVaultPin,
  createMobileVaultStore,
  enrollMobileVaultBiometric,
  generateMobileVaultRecovery,
  unlockMobileVaultWithBiometric,
  unlockMobileVaultWithPin,
  unlockMobileVaultWithRecovery,
  type VaultKeyDriver,
} from "./mobile-vault";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function createDriver(): VaultKeyDriver {
  const keys = new Map<string, Uint8Array>();

  return {
    async createKey(options) {
      const alias = options?.alias ?? `alias-${keys.size + 1}`;
      keys.set(alias, crypto.getRandomValues(new Uint8Array(32)));
      return { alias };
    },
    async wrap(alias, plaintext) {
      const key = keys.get(alias);
      if (!key) throw new Error("missing key");
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cryptoKey = await crypto.subtle.importKey("raw", toArrayBuffer(key), { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
      const encrypted = new Uint8Array(
        await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, cryptoKey, toArrayBuffer(plaintext))
      );
      return {
        iv: btoa(String.fromCharCode(...iv)),
        wrappedKey: btoa(String.fromCharCode(...encrypted.slice(0, encrypted.length - 16))),
        authTag: btoa(String.fromCharCode(...encrypted.slice(encrypted.length - 16))),
      };
    },
    async unwrap(alias, wrapped) {
      const key = keys.get(alias);
      if (!key) throw new Error("missing key");
      const ivBytes = Uint8Array.from(atob(wrapped.iv), (char) => char.charCodeAt(0));
      const cipherBytes = Uint8Array.from(atob(wrapped.wrappedKey), (char) => char.charCodeAt(0));
      const tagBytes = Uint8Array.from(atob(wrapped.authTag), (char) => char.charCodeAt(0));
      const encrypted = new Uint8Array(cipherBytes.length + tagBytes.length);
      encrypted.set(cipherBytes, 0);
      encrypted.set(tagBytes, cipherBytes.length);
      const cryptoKey = await crypto.subtle.importKey("raw", toArrayBuffer(key), { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      return {
        plaintext: new Uint8Array(
          await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: toArrayBuffer(ivBytes) },
            cryptoKey,
            toArrayBuffer(encrypted)
          )
        ),
        secureHardwareEnforced: false,
        securityLevel: "SOFTWARE",
      };
    },
    async deleteKey(alias) {
      keys.delete(alias);
    },
  };
}

describe("mobile vault v2", () => {
  it("unlocks with the correct PIN and fails closed when the keystore key is missing", async () => {
    const driver = createDriver();
    const store = await createMobileVaultStore(
      "1234",
      { accounts: [{ id: "a", issuer: "Issuer", label: "Label", secretBase32: "JBSWY3DPEHPK3PXP", digits: 6, period: 30, algorithm: "SHA1" }], recoveryVerifier: null },
      driver
    );

    const ok = await unlockMobileVaultWithPin(store, "1234", driver);
    expect(ok.ok).toBe(true);

    await driver.deleteKey(store.kskWrappedVdk.keyAlias);
    const missing = await unlockMobileVaultWithPin(store, "1234", driver);
    expect(missing).toEqual({ ok: false, code: "E_VAULT_INACCESSIBLE", message: VAULT_INACCESSIBLE_KEYSTORE });
  });

  it("detects VDK integrity mismatch between PDK and KSK unwrap paths", async () => {
    const driver = createDriver();
    const store = await createMobileVaultStore("1234", { accounts: [], recoveryVerifier: null }, driver);
    store.pdkWrappedVdk.wrappedKey = store.kskWrappedVdk.wrappedKey;
    const result = await unlockMobileVaultWithPin(store, "1234", driver);
    expect(result).toEqual({ ok: false, code: "E_LOCKED" });
  });

  it("rewraps only the PIN-derived VDK on PIN change", async () => {
    const driver = createDriver();
    const store = await createMobileVaultStore("1234", { accounts: [], recoveryVerifier: null }, driver);
    const beforeCiphertext = store.vault.ciphertext;
    const beforeKskWrappedVdk = store.kskWrappedVdk.wrappedKey;
    const changed = await changeMobileVaultPin(store, "1234", "5678", driver);

    expect(changed.store.vault.ciphertext).toBe(beforeCiphertext);
    expect(changed.store.kskWrappedVdk.wrappedKey).toBe(beforeKskWrappedVdk);
    expect(changed.store.pdkWrappedVdk.wrappedKey).not.toBe(store.pdkWrappedVdk.wrappedKey);
  });

  it("supports biometric and recovery alternative unwrap paths", async () => {
    const driver = createDriver();
    const store = await createMobileVaultStore("1234", { accounts: [], recoveryVerifier: null }, driver);
    const primary = await unlockMobileVaultWithPin(store, "1234", driver);
    if (!primary.ok) throw new Error("expected primary unlock to succeed");

    const withBiometric = await enrollMobileVaultBiometric(store, primary.vdk, driver);
    const biometric = await unlockMobileVaultWithBiometric(withBiometric, driver);
    expect(biometric.ok).toBe(true);

    const withRecovery = await generateMobileVaultRecovery(store, primary.vdk);
    expect(withRecovery.secret).toMatch(/^(?:[A-HJ-KMNP-Z2-9]{6}-){7}[A-HJ-KMNP-Z2-9]{6}$/);
    const recovery = await unlockMobileVaultWithRecovery(withRecovery.store, withRecovery.secret);
    expect(recovery.ok).toBe(true);
    const wrongRecovery = await unlockMobileVaultWithRecovery(withRecovery.store, "WRONG-WRONG-WRONG");
    expect(wrongRecovery).toEqual({ ok: false, code: "E_LOCKED" });
  });
});
