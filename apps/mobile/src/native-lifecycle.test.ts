import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Bridge, EditableAccount } from "@authenticator/ui";

const listenerMap = vi.hoisted(() => new Map<string, (...args: any[]) => void>());
const addListenerMock = vi.hoisted(() =>
  vi.fn(async (eventName: string, listener: (...args: any[]) => void) => {
    listenerMap.set(eventName, listener);
    return {
      remove: vi.fn(async () => undefined),
    };
  })
);

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: addListenerMock,
  },
}));

const editableAccount: EditableAccount = {
  id: "",
  issuer: "",
  label: "",
  digits: 6,
  period: 30,
  algorithm: "SHA1",
};

function createBridgeStub(overrides?: Partial<Bridge["lockAPI"]>): Bridge {
  return {
    lockAPI: {
      getMethod: vi.fn(async () => "pin6"),
      setMethod: vi.fn(async () => undefined),
      getQuickUnlock: vi.fn(async () => ({ windowsHello: false, passkey: false })),
      setQuickUnlock: vi.fn(async () => undefined),
      setCredential: vi.fn(async () => undefined),
      verify: vi.fn(async () => ({ result: "OK" as const })),
      hasCredential: vi.fn(async () => true),
      clearCredential: vi.fn(async () => undefined),
      resetAppLock: vi.fn(async () => false),
      lock: vi.fn(async () => undefined),
      biometricAvailable: vi.fn(async () => false),
      promptBiometric: vi.fn(async () => false),
      closeSecuritySession: vi.fn(async () => true),
      onShowLockScreen: vi.fn(),
      passkeyGetChallenge: vi.fn(async () => ({ challengeId: "", challenge: [] })),
      passkeyGetCredentialId: vi.fn(async () => null),
      passkeyListCredentials: vi.fn(async () => []),
      passkeySaveCredential: vi.fn(async () => false),
      passkeyRenameCredential: vi.fn(async () => false),
      passkeyRemoveCredential: vi.fn(async () => false),
      passkeyVerifyAssertion: vi.fn(async () => false),
      passkeyClearCredential: vi.fn(async () => undefined),
      ...overrides,
    },
    getSettings: vi.fn(async () => ({} as never)),
    updateSettings: vi.fn(async () => ({} as never)),
    exportBackup: vi.fn(async () => false),
    importBackup: vi.fn(async () => false),
    list: vi.fn(async () => []),
    getAccountForEdit: vi.fn(async () => editableAccount),
    updateAccount: vi.fn(async () => ({ id: "", issuer: "", label: "" } as never)),
    addUri: vi.fn(async () => ({ id: "", issuer: "", label: "" } as never)),
    addManual: vi.fn(async () => ({ id: "", issuer: "", label: "" } as never)),
    del: vi.fn(async () => false),
    codes: vi.fn(async () => []),
  };
}

describe("native mobile lifecycle locking", () => {
  beforeEach(() => {
    listenerMap.clear();
    addListenerMock.mockClear();
  });

  it("registers native background listeners and locks on app background", async () => {
    vi.resetModules();
    const { registerNativeLifecycleLocking } = await import("./native-lifecycle");
    const lock = vi.fn(async () => undefined);
    const closeSecuritySession = vi.fn(async () => true);

    await registerNativeLifecycleLocking(createBridgeStub({ lock, closeSecuritySession }));

    expect(addListenerMock).toHaveBeenCalledTimes(2);
    expect(listenerMap.has("appStateChange")).toBe(true);
    expect(listenerMap.has("pause")).toBe(true);

    listenerMap.get("appStateChange")?.({ isActive: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(lock).toHaveBeenCalledTimes(1);
    expect(closeSecuritySession).toHaveBeenCalledTimes(1);

    listenerMap.get("pause")?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(lock).toHaveBeenCalledTimes(2);
    expect(closeSecuritySession).toHaveBeenCalledTimes(2);
  });

  it("does not relock on active app-state notifications", async () => {
    vi.resetModules();
    const { registerNativeLifecycleLocking } = await import("./native-lifecycle");
    const lock = vi.fn(async () => undefined);

    await registerNativeLifecycleLocking(createBridgeStub({ lock }));

    listenerMap.get("appStateChange")?.({ isActive: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(lock).not.toHaveBeenCalled();
  });
});
