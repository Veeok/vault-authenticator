import { beforeEach, describe, expect, it, vi } from "vitest";
import { totpCodeSync, type StoredTotpAccount } from "@authenticator/core";
import { Algorithm, hash as argon2Hash } from "@node-rs/argon2";

const storeState = vi.hoisted(() => ({
  vaultEnvelope: undefined as Record<string, unknown> | undefined,
  blob: undefined as string | undefined,
  vaultMode: undefined as string | undefined,
  hardenedEnvelope: undefined as Record<string, unknown> | undefined,
  authUiSettings: undefined as Record<string, unknown> | undefined,
}));
const keychainState = vi.hoisted(() => new Map<string, string>());
const appQuitMock = vi.hoisted(() => vi.fn());
const showErrorBoxMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: (
    _file: string,
    args: string[],
    _options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void
  ) => {
    const command = args[0];
    const label = args[args.indexOf("-a") + 1];
    if (command === "add-generic-password") {
      const secret = args[args.indexOf("-w") + 1] ?? "";
      keychainState.set(label, secret);
      callback(null, "", "");
      return;
    }
    if (command === "find-generic-password") {
      const secret = keychainState.get(label);
      if (!secret) {
        callback(new Error("Missing keychain item"), "", "Missing keychain item");
        return;
      }
      callback(null, `${secret}\n`, "");
      return;
    }
    if (command === "delete-generic-password") {
      keychainState.delete(label);
      callback(null, "", "");
      return;
    }
    callback(new Error(`Unsupported command: ${command}`), "", `Unsupported command: ${command}`);
  },
}));

vi.mock("electron", () => ({
  app: {
    isReady: () => true,
    quit: appQuitMock,
  },
  dialog: {
    showErrorBox: showErrorBoxMock,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, "utf8"),
    decryptString: (value: Buffer) => Buffer.from(value).toString("utf8"),
  },
  systemPreferences: {
    promptTouchID: vi.fn(async () => undefined),
  },
}));

vi.mock("electron-store", () => ({
  default: class MockStore {
    get(key: string): unknown {
      if (key === "vaultEnvelope") return storeState.vaultEnvelope;
      if (key === "blob") return storeState.blob;
      if (key === "vaultMode") return storeState.vaultMode;
      if (key === "hardenedEnvelope") return storeState.hardenedEnvelope;
      if (key === "authUiSettings") return storeState.authUiSettings;
      return undefined;
    }

    set(key: string, value: unknown): void {
      if (key === "vaultEnvelope") {
        storeState.vaultEnvelope = value as Record<string, unknown>;
        return;
      }
      if (key === "blob") {
        storeState.blob = value as string;
        return;
      }
      if (key === "vaultMode") {
        storeState.vaultMode = value as string;
        return;
      }
      if (key === "hardenedEnvelope") {
        storeState.hardenedEnvelope = value as Record<string, unknown>;
        return;
      }
      if (key === "authUiSettings") {
        storeState.authUiSettings = value as Record<string, unknown>;
      }
    }

    delete(key: string): void {
      if (key === "vaultEnvelope") {
        storeState.vaultEnvelope = undefined;
        return;
      }
      if (key === "blob") {
        storeState.blob = undefined;
        return;
      }
      if (key === "vaultMode") {
        storeState.vaultMode = undefined;
        return;
      }
      if (key === "hardenedEnvelope") {
        storeState.hardenedEnvelope = undefined;
        return;
      }
      if (key === "authUiSettings") {
        storeState.authUiSettings = undefined;
      }
    }
  },
}));

const accountFixture: StoredTotpAccount = {
  id: "acc-001",
  issuer: "Example",
  label: "user@example.com",
  secretBase32: "JBSWY3DPEHPK3PXP",
  digits: 6,
  period: 30,
  algorithm: "SHA1",
};

async function loadSecureStoreModule() {
  vi.resetModules();
  return import("../main/secure-store");
}

function persistLegacyStandardBlob(payload: unknown): void {
  storeState.blob = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

beforeEach(() => {
  storeState.vaultEnvelope = undefined;
  storeState.blob = undefined;
  storeState.vaultMode = undefined;
  storeState.hardenedEnvelope = undefined;
  storeState.authUiSettings = undefined;
  keychainState.clear();
  appQuitMock.mockReset();
  showErrorBoxMock.mockReset();
});

describe("desktop vault redesign", () => {
  it("creates vault-v4 with password wrapping and reopens it after a cold start", async () => {
    let secureStore = await loadSecureStoreModule();
    await secureStore.initializeVaultWithPassword("current-password-123");
    secureStore.saveAccounts([accountFixture]);

    expect(storeState.vaultEnvelope?.version).toBe(4);
    expect(storeState.blob).toBeUndefined();

    secureStore = await loadSecureStoreModule();
    expect(secureStore.loadProtectedSettingsIfUnlocked()).toBeNull();
    await expect(secureStore.unlockHardenedVaultWithPassword("current-password-123")).resolves.toEqual({ result: "OK" });
    expect(secureStore.loadAccounts()).toEqual([accountFixture]);
  });

  it("clears the decrypted payload cache and re-decrypts on demand after unlock", async () => {
    let secureStore = await loadSecureStoreModule();
    await secureStore.initializeVaultWithPassword("current-password-123");
    secureStore.saveAccounts([accountFixture]);

    secureStore = await loadSecureStoreModule();
    await expect(secureStore.unlockHardenedVaultWithPassword("current-password-123")).resolves.toEqual({ result: "OK" });
    expect(secureStore.hasDecryptedPayloadCache()).toBe(true);

    secureStore.clearDecryptedCache();
    expect(secureStore.hasDecryptedPayloadCache()).toBe(false);

    const accounts = secureStore.loadAccounts();
    expect(accounts).toEqual([accountFixture]);
    expect(secureStore.hasDecryptedPayloadCache()).toBe(true);

    const generated = totpCodeSync(accounts[0].secretBase32, {
      algorithm: accounts[0].algorithm,
      digits: accounts[0].digits,
      period: accounts[0].period,
    });
    expect(generated.code).toMatch(/^\d{6}$/);

    secureStore.clearDecryptedCache();
    expect(secureStore.hasDecryptedPayloadCache()).toBe(false);
  });

  it("fails closed with the wrong password", async () => {
    let secureStore = await loadSecureStoreModule();
    await secureStore.initializeVaultWithPassword("current-password-123");
    secureStore.saveAccounts([accountFixture]);

    secureStore = await loadSecureStoreModule();
    await expect(secureStore.unlockHardenedVaultWithPassword("wrong-password")).resolves.toEqual({
      result: "INCORRECT",
      attemptsUsed: 1,
    });
  });

  it("burns a recovery secret before allowing a password reset", async () => {
    let secureStore = await loadSecureStoreModule();
    await secureStore.initializeVaultWithPassword("current-password-123");
    secureStore.saveAccounts([accountFixture]);
    const recoverySecret = await secureStore.generateRecoverySecret();
    expect(recoverySecret).toMatch(/^(?:[A-HJ-KMNP-Z2-9]{6}-){7}[A-HJ-KMNP-Z2-9]{6}$/);

    expect(storeState.vaultEnvelope?.recoveryWrappedVdk).toBeTruthy();
    expect(storeState.vaultEnvelope?.outerMeta).toMatchObject({ recoveryGenerated: true });

    secureStore = await loadSecureStoreModule();
    await expect(secureStore.validateAndBurnRecoverySecret(recoverySecret)).resolves.toBe(true);
    expect(storeState.vaultEnvelope?.recoveryWrappedVdk).toBeNull();
    expect(storeState.vaultEnvelope?.outerMeta).toMatchObject({ recoveryGenerated: false });
    await expect(secureStore.validateAndBurnRecoverySecret(recoverySecret)).resolves.toBe(false);
    await expect(secureStore.setPasswordAfterRecovery("next-password-123")).resolves.toBe(true);

    secureStore = await loadSecureStoreModule();
    await expect(secureStore.unlockHardenedVaultWithPassword("current-password-123")).resolves.toEqual({ result: "INCORRECT", attemptsUsed: 1 });
    await expect(secureStore.unlockHardenedVaultWithPassword("next-password-123")).resolves.toEqual({ result: "OK" });
    expect(secureStore.loadAccounts()).toEqual([accountFixture]);
  });

  it("rejects setting a recovery password when no burned recovery session exists", async () => {
    const secureStore = await loadSecureStoreModule();
    await secureStore.initializeVaultWithPassword("current-password-123");

    await expect(secureStore.setPasswordAfterRecovery("next-password-123")).resolves.toBe(false);
  });

  it("supports macOS biometric enrollment and unlock with a wrapped VDK", async () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    try {
      let secureStore = await loadSecureStoreModule();
      await secureStore.initializeVaultWithPassword("current-password-123");
      secureStore.saveAccounts([accountFixture]);

      await expect(secureStore.enrollBiometricUnlock()).resolves.toBe(true);
      expect(storeState.vaultEnvelope?.biometricWrappedVdk).toBeTruthy();
      expect(storeState.vaultEnvelope?.outerMeta).toMatchObject({ biometricEnrolled: true });

      secureStore = await loadSecureStoreModule();
      await expect(secureStore.unlockVaultWithBiometric()).resolves.toBe(true);
      expect(secureStore.loadAccounts()).toEqual([accountFixture]);
    } finally {
      platformSpy.mockRestore();
    }
  });

  it("reports biometric enrollment unavailable on non-macOS", async () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    try {
      const secureStore = await loadSecureStoreModule();
      await secureStore.initializeVaultWithPassword("current-password-123");
      await expect(secureStore.enrollBiometricUnlock()).resolves.toBe(false);
    } finally {
      platformSpy.mockRestore();
    }
  });

  it("migrates a legacy safeStorage vault with an existing password credential", async () => {
    persistLegacyStandardBlob({
      accounts: [accountFixture],
      passwordCredential: { hash: await argon2Hash("current-password-123", {
        algorithm: Algorithm.Argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }) },
      settings: { baseMode: "light", themeColor: "blue", accentOverride: "purple", motionMode: "reduced" },
    });

    const secureStore = await loadSecureStoreModule();
    await expect(secureStore.unlockHardenedVaultWithPassword("current-password-123")).resolves.toEqual({ result: "OK" });
    expect(storeState.vaultEnvelope?.version).toBe(4);
    expect(storeState.blob).toBeUndefined();
    expect(secureStore.loadAccounts()).toEqual([accountFixture]);
  });

  it("requires password setup for a legacy vault that never had a password credential", async () => {
    persistLegacyStandardBlob({
      accounts: [accountFixture],
      settings: { baseMode: "light", themeColor: "blue", accentOverride: "purple", motionMode: "reduced" },
    });

    let secureStore = await loadSecureStoreModule();
    expect(secureStore.getVaultProtectionStatus().requiresPasswordSetup).toBe(true);

    await secureStore.initializeVaultWithPassword("current-password-123");
    expect(storeState.vaultEnvelope?.version).toBe(4);
    expect(storeState.blob).toBeUndefined();

    secureStore = await loadSecureStoreModule();
    await expect(secureStore.unlockHardenedVaultWithPassword("current-password-123")).resolves.toEqual({ result: "OK" });
    expect(secureStore.loadAccounts()).toEqual([accountFixture]);
  });

  it("fails closed on corrupted legacy storage and never opens an empty vault", async () => {
    storeState.blob = "not-valid-base64";

    const secureStore = await loadSecureStoreModule();
    expect(() => secureStore.loadAccounts()).toThrowError("Secure storage is corrupted.");
    expect(showErrorBoxMock).toHaveBeenCalledTimes(1);
    expect(appQuitMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes persisted settings after unlock and keeps auth UI metadata outside the locked vault", async () => {
    let secureStore = await loadSecureStoreModule();
    await secureStore.initializeVaultWithPassword("current-password-123");
    secureStore.saveSettings({
      ...secureStore.loadSettings(),
      baseMode: "light",
      themeColor: "blue",
      accentOverride: "purple",
      motionMode: "reduced",
      hasCompletedSafetySetup: true,
      hasSkippedSafetySetup: true,
      lastSafetySetupReminderAt: 1234.56,
    });

    secureStore = await loadSecureStoreModule();
    expect(secureStore.loadAuthUiSettings()).toEqual({
      baseMode: "light",
      themeColor: "blue",
      accentOverride: "purple",
      motionMode: "reduced",
    });
    expect(secureStore.loadProtectedSettingsIfUnlocked()).toBeNull();

    await secureStore.unlockHardenedVaultWithPassword("current-password-123");
    const settings = secureStore.loadSettings();
    expect(settings.baseMode).toBe("light");
    expect(settings.themeColor).toBe("blue");
    expect(settings.accentOverride).toBe("purple");
    expect(settings.motionMode).toBe("reduced");
    expect(settings.hasCompletedSafetySetup).toBe(true);
    expect(settings.hasSkippedSafetySetup).toBe(false);
    expect(settings.lastSafetySetupReminderAt).toBe(1234);
  });
});
