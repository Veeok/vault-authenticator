import { beforeEach, describe, expect, it, vi } from "vitest";

const exposures: Record<string, unknown> = {};

const invokeMock = vi.fn();
const onMock = vi.fn();
const removeListenerMock = vi.fn();

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown) => {
      exposures[key] = value;
    },
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => invokeMock(...args),
    on: (...args: unknown[]) => onMock(...args),
    removeListener: (...args: unknown[]) => removeListenerMock(...args),
  },
}));

type WindowApi = {
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  close(): Promise<void>;
  getVersion(): Promise<string>;
  isMaximized(): Promise<boolean>;
  isBackgrounded(): Promise<boolean>;
  getAlwaysOnTop(): Promise<boolean>;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  onMaximizedChanged(cb: (maximized: boolean) => void): () => void;
  onAlwaysOnTopChanged(cb: (enabled: boolean) => void): () => void;
  onBackgroundedChanged(cb: (backgrounded: boolean) => void): () => void;
  onAppCommand(cb: (command: string) => void): () => void;
};

type ClipboardApi = {
  clear(expectedText: string): Promise<boolean>;
};

type AppApi = {
  getVaultProtectionStatus(): Promise<unknown>;
  generateRecoverySecret(): Promise<string>;
  enrollBiometricUnlock(): Promise<unknown>;
  removeBiometricUnlock(): Promise<unknown>;
  migrateWithPassword(password: string): Promise<boolean>;
  migrateSetPassword(password: string): Promise<boolean>;
};

type LockApi = {
  validateAndBurnRecoverySecret(secret: string): Promise<{ valid: boolean }>;
  setPasswordAfterRecovery(password: string): Promise<{ success: boolean }>;
};

async function loadWindowApi(): Promise<WindowApi> {
  vi.resetModules();
  invokeMock.mockReset();
  onMock.mockReset();
  removeListenerMock.mockReset();
  for (const key of Object.keys(exposures)) {
    delete exposures[key];
  }

  await import("../preload");

  const windowApi = exposures.windowAPI;
  if (!windowApi || typeof windowApi !== "object") {
    throw new Error("windowAPI bridge was not exposed.");
  }

  return windowApi as WindowApi;
}

async function loadClipboardApi(): Promise<ClipboardApi> {
  vi.resetModules();
  invokeMock.mockReset();
  onMock.mockReset();
  removeListenerMock.mockReset();
  for (const key of Object.keys(exposures)) {
    delete exposures[key];
  }

  await import("../preload");

  const clipboardApi = exposures.clipboardAPI;
  if (!clipboardApi || typeof clipboardApi !== "object") {
    throw new Error("clipboardAPI bridge was not exposed.");
  }

  return clipboardApi as ClipboardApi;
}

async function loadAppApi(): Promise<AppApi> {
  vi.resetModules();
  invokeMock.mockReset();
  onMock.mockReset();
  removeListenerMock.mockReset();
  for (const key of Object.keys(exposures)) {
    delete exposures[key];
  }

  await import("../preload");

  const appApi = exposures.appAPI;
  if (!appApi || typeof appApi !== "object") {
    throw new Error("appAPI bridge was not exposed.");
  }

  return appApi as AppApi;
}

async function loadLockApi(): Promise<LockApi> {
  vi.resetModules();
  invokeMock.mockReset();
  onMock.mockReset();
  removeListenerMock.mockReset();
  for (const key of Object.keys(exposures)) {
    delete exposures[key];
  }

  await import("../preload");

  const lockApi = exposures.lockAPI;
  if (!lockApi || typeof lockApi !== "object") {
    throw new Error("lockAPI bridge was not exposed.");
  }

  return lockApi as LockApi;
}

describe("preload window API bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes expected window control channels", async () => {
    const windowApi = await loadWindowApi();

    await windowApi.minimize();
    await windowApi.maximize();
    await windowApi.unmaximize();
    await windowApi.close();

    invokeMock.mockResolvedValueOnce("1.2.0");
    await expect(windowApi.getVersion()).resolves.toBe("1.2.0");
    invokeMock.mockResolvedValueOnce(true);
    await expect(windowApi.isMaximized()).resolves.toBe(true);
    invokeMock.mockResolvedValueOnce(true);
    await expect(windowApi.isBackgrounded()).resolves.toBe(true);
    invokeMock.mockResolvedValueOnce(false);
    await expect(windowApi.getAlwaysOnTop()).resolves.toBe(false);
    await windowApi.setAlwaysOnTop(true);

    expect(invokeMock.mock.calls.map((call) => call[0])).toEqual([
      "window:minimize",
      "window:maximize",
      "window:unmaximize",
      "window:close",
      "window:getVersion",
      "window:isMaximized",
      "window:isBackgrounded",
      "window:getAlwaysOnTop",
      "window:setAlwaysOnTop",
    ]);
  });

  it("subscribes and unsubscribes maximize state notifications", async () => {
    const windowApi = await loadWindowApi();
    const callback = vi.fn();

    const unsubscribe = windowApi.onMaximizedChanged(callback);

    expect(onMock).toHaveBeenCalledWith("window:maximizedChanged", expect.any(Function));

    const listener = onMock.mock.calls[0]?.[1] as ((event: unknown, maximized: unknown) => void) | undefined;
    if (!listener) {
      throw new Error("maximize listener was not registered");
    }

    listener({}, true);
    listener({}, false);

    expect(callback).toHaveBeenNthCalledWith(1, true);
    expect(callback).toHaveBeenNthCalledWith(2, false);

    unsubscribe();
    expect(removeListenerMock).toHaveBeenCalledWith("window:maximizedChanged", listener);
  });

  it("subscribes and unsubscribes always-on-top notifications", async () => {
    const windowApi = await loadWindowApi();
    const callback = vi.fn();

    const unsubscribe = windowApi.onAlwaysOnTopChanged(callback);

    expect(onMock).toHaveBeenCalledWith("window:alwaysOnTopChanged", expect.any(Function));

    const listener = onMock.mock.calls.find((call) => call[0] === "window:alwaysOnTopChanged")?.[1] as
      | ((event: unknown, enabled: unknown) => void)
      | undefined;
    if (!listener) {
      throw new Error("always-on-top listener was not registered");
    }

    listener({}, true);
    listener({}, false);

    expect(callback).toHaveBeenNthCalledWith(1, true);
    expect(callback).toHaveBeenNthCalledWith(2, false);

    unsubscribe();
    expect(removeListenerMock).toHaveBeenCalledWith("window:alwaysOnTopChanged", listener);
  });

  it("subscribes and unsubscribes backgrounded notifications", async () => {
    const windowApi = await loadWindowApi();
    const callback = vi.fn();

    const unsubscribe = windowApi.onBackgroundedChanged(callback);

    expect(onMock).toHaveBeenCalledWith("window:backgroundedChanged", expect.any(Function));

    const listener = onMock.mock.calls.find((call) => call[0] === "window:backgroundedChanged")?.[1] as
      | ((event: unknown, backgrounded: unknown) => void)
      | undefined;
    if (!listener) {
      throw new Error("backgrounded listener was not registered");
    }

    listener({}, true);
    listener({}, false);

    expect(callback).toHaveBeenNthCalledWith(1, true);
    expect(callback).toHaveBeenNthCalledWith(2, false);

    unsubscribe();
    expect(removeListenerMock).toHaveBeenCalledWith("window:backgroundedChanged", listener);
  });

  it("subscribes and unsubscribes app command notifications", async () => {
    const windowApi = await loadWindowApi();
    const callback = vi.fn();

    const unsubscribe = windowApi.onAppCommand(callback);

    expect(onMock).toHaveBeenCalledWith("window:appCommand", expect.any(Function));

    const listener = onMock.mock.calls.find((call) => call[0] === "window:appCommand")?.[1] as
      | ((event: unknown, command: unknown) => void)
      | undefined;
    if (!listener) {
      throw new Error("app command listener was not registered");
    }

    listener({}, "open-search");
    listener({}, "open-settings");

    expect(callback).toHaveBeenNthCalledWith(1, "open-search");
    expect(callback).toHaveBeenNthCalledWith(2, "open-settings");

    unsubscribe();
    expect(removeListenerMock).toHaveBeenCalledWith("window:appCommand", listener);
  });

  it("invokes clipboard clear channel", async () => {
    const clipboardApi = await loadClipboardApi();

    invokeMock.mockResolvedValueOnce({ ok: true, data: true });
    await expect(clipboardApi.clear("123456")).resolves.toBe(true);

    expect(invokeMock).toHaveBeenCalledWith("clipboard:clear", "123456");
  });

  it("wires vault recovery, biometric, and migration app channels", async () => {
    const appApi = await loadAppApi();

    expect("enableHardenedMode" in (appApi as Record<string, unknown>)).toBe(false);
    expect("disableHardenedMode" in (appApi as Record<string, unknown>)).toBe(false);

    invokeMock.mockResolvedValueOnce({ ok: true, data: { vaultFormat: "vault-v4" } });
    await appApi.getVaultProtectionStatus();
    invokeMock.mockResolvedValueOnce({ ok: true, data: "RECOVERY-SECRET" });
    await expect(appApi.generateRecoverySecret()).resolves.toBe("RECOVERY-SECRET");
    invokeMock.mockResolvedValueOnce({ ok: true, data: { vaultFormat: "vault-v4" } });
    await appApi.enrollBiometricUnlock();
    invokeMock.mockResolvedValueOnce({ ok: true, data: { vaultFormat: "vault-v4" } });
    await appApi.removeBiometricUnlock();
    invokeMock.mockResolvedValueOnce({ ok: true, data: true });
    await expect(appApi.migrateWithPassword("pw")).resolves.toBe(true);
    invokeMock.mockResolvedValueOnce({ ok: true, data: true });
    await expect(appApi.migrateSetPassword("pw")).resolves.toBe(true);

    expect(invokeMock.mock.calls.map((call) => call[0])).toEqual([
      "vault:getProtectionStatus",
      "vault:generateRecoverySecret",
      "vault:enrollBiometric",
      "vault:removeBiometric",
      "vault:migrateWithPassword",
      "vault:migrateSetPassword",
    ]);
  });

  it("wires recovery reset channels on lockAPI", async () => {
    const lockApi = await loadLockApi();

    invokeMock.mockResolvedValueOnce({ ok: true, data: { valid: true } });
    await expect(lockApi.validateAndBurnRecoverySecret("SECRET")).resolves.toEqual({ valid: true });
    invokeMock.mockResolvedValueOnce({ ok: true, data: { success: true } });
    await expect(lockApi.setPasswordAfterRecovery("CurrentPass!234")).resolves.toEqual({ success: true });

    expect(invokeMock.mock.calls).toEqual([
      ["lock:validateAndBurnRecoverySecret", "SECRET"],
      ["lock:setPasswordAfterRecovery", "CurrentPass!234"],
    ]);
  });
});
