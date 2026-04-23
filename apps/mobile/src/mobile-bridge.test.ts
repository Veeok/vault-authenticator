import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@authenticator/ui";

type InMemoryStore = {
  vaultStore: any;
  legacyBlob: any;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function createVaultKeyMock() {
  const keyMap = new Map<string, Uint8Array>();
  return {
    VaultKey: {
      generateKey: vi.fn(async ({ alias }: { alias?: string }) => {
        const keyAlias = alias ?? `alias-${keyMap.size + 1}`;
        keyMap.set(keyAlias, crypto.getRandomValues(new Uint8Array(32)));
        return { alias: keyAlias };
      }),
      wrap: vi.fn(async ({ alias, plaintextBase64 }: { alias: string; plaintextBase64: string }) => {
        const key = keyMap.get(alias);
        if (!key) throw new Error("missing key");
        const plaintext = Uint8Array.from(atob(plaintextBase64), (char) => char.charCodeAt(0));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const cipherKey = await crypto.subtle.importKey("raw", toArrayBuffer(key), { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
        const encrypted = new Uint8Array(
          await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, cipherKey, toArrayBuffer(plaintext))
        );
        return {
          iv: btoa(String.fromCharCode(...iv)),
          wrappedKey: btoa(String.fromCharCode(...encrypted.slice(0, encrypted.length - 16))),
          authTag: btoa(String.fromCharCode(...encrypted.slice(encrypted.length - 16))),
        };
      }),
      unwrap: vi.fn(async ({ alias, iv, wrappedKey, authTag }: { alias: string; iv: string; wrappedKey: string; authTag: string }) => {
        const key = keyMap.get(alias);
        if (!key) throw new Error("missing key");
        const ivBytes = Uint8Array.from(atob(iv), (char) => char.charCodeAt(0));
        const cipherBytes = Uint8Array.from(atob(wrappedKey), (char) => char.charCodeAt(0));
        const tagBytes = Uint8Array.from(atob(authTag), (char) => char.charCodeAt(0));
        const encrypted = new Uint8Array(cipherBytes.length + tagBytes.length);
        encrypted.set(cipherBytes, 0);
        encrypted.set(tagBytes, cipherBytes.length);
        const cipherKey = await crypto.subtle.importKey("raw", toArrayBuffer(key), { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
        const plaintext = new Uint8Array(
          await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: toArrayBuffer(ivBytes) },
            cipherKey,
            toArrayBuffer(encrypted)
          )
        );
        return {
          plaintextBase64: btoa(String.fromCharCode(...plaintext)),
        };
      }),
      deleteKey: vi.fn(async ({ alias }: { alias: string }) => {
        keyMap.delete(alias);
        return { alias };
      }),
    },
  };
}

async function setupBridge(initialSettings?: AppSettings) {
  vi.resetModules();

  const state: InMemoryStore = {
    vaultStore: null,
    legacyBlob: null,
  };

  vi.doMock("./storage-adapter", () => ({
    clearVaultStore: vi.fn(async () => {
      state.vaultStore = null;
      state.legacyBlob = null;
    }),
    loadLegacyStoredBlob: vi.fn(async () => state.legacyBlob),
    loadSettings: vi.fn(async () => state.vaultStore?.settings ?? state.legacyBlob?.settings ?? initialSettings),
    loadVaultStore: vi.fn(async () => state.vaultStore),
    saveLegacyStoredBlob: vi.fn(async (next) => {
      state.legacyBlob = next;
    }),
    saveSettings: vi.fn(async (next) => {
      if (state.vaultStore) {
        state.vaultStore = { ...state.vaultStore, settings: next };
      }
    }),
    saveVaultStore: vi.fn(async (next) => {
      state.vaultStore = next;
    }),
  }));

  vi.doMock("./vault-key", () => createVaultKeyMock());

  const module = await import("./mobile-bridge");
  return {
    bridge: module.mobileBridge,
    state,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("mobileBridge v2", () => {
  it("returns default settings before a vault exists", async () => {
    const { bridge } = await setupBridge();
    const settings = await bridge.getSettings();
    expect(settings.baseMode).toBe("dark");
    expect(settings.themeColor).toBe("neutral");
  }, 20_000);

  it("creates a vault on first PIN setup and supports PIN lockout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-31T00:00:00.000Z"));
    const { bridge, state } = await setupBridge();

    await bridge.lockAPI.setCredential("pin", "482915");
    expect(state.vaultStore?.version).toBe(2);

    await bridge.lockAPI.lock();
    expect(await bridge.lockAPI.verify("pin", "000000")).toEqual({ result: "INCORRECT", attemptsUsed: 1 });
    expect(await bridge.lockAPI.verify("pin", "000000")).toEqual({ result: "INCORRECT", attemptsUsed: 2 });
    expect(await bridge.lockAPI.verify("pin", "000000")).toEqual({ result: "INCORRECT", attemptsUsed: 3 });
    expect(await bridge.lockAPI.verify("pin", "000000")).toEqual({
      result: "LOCKED",
      lockedUntil: Date.parse("2026-03-31T00:00:05.000Z"),
      attemptsUsed: 4,
    });
  }, 20_000);

  it("persists settings once the vault exists", async () => {
    const { bridge, state } = await setupBridge();
    await bridge.lockAPI.setCredential("pin", "482915");
    const updated = await bridge.updateSettings({
      ...(await bridge.getSettings()),
      baseMode: "light",
      themeColor: "blue",
      accentOverride: "purple",
    });

    expect(updated.baseMode).toBe("light");
    expect(state.vaultStore?.settings).toBeTruthy();
  }, 20_000);
});
