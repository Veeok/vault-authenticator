import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountMeta } from "@authenticator/core";
import { App } from "./App";
import { DEFAULT_SETTINGS, type AppSettings, type Bridge, type LockApi } from "./bridge";

let currentVisibilityState: DocumentVisibilityState = "visible";

function createLockApi(overrides: Partial<LockApi> = {}): LockApi {
  const base: LockApi = {
    getMethod: async () => "none",
    setMethod: async () => {},
    getQuickUnlock: async () => ({ windowsHello: false, passkey: false }),
    setQuickUnlock: async () => {},
    setCredential: async () => {},
    verify: async () => ({ result: "OK" }),
    hasCredential: async () => false,
    clearCredential: async () => {},
    resetAppLock: async () => true,
    lock: async () => {},
    biometricAvailable: async () => false,
    promptBiometric: async () => false,
    onShowLockScreen: () => {},
    getPinDigits: async () => 4,
    passkeyGetChallenge: async () => ({ challengeId: "challenge-1", challenge: [1, 2, 3, 4] }),
    passkeyGetCredentialId: async () => null,
    passkeyListCredentials: async () => [],
    passkeySaveCredential: async () => true,
    passkeyRenameCredential: async () => true,
    passkeyRemoveCredential: async () => true,
    passkeyVerifyAssertion: async () => false,
    passkeyClearCredential: async () => {},
  };

  return { ...base, ...overrides };
}

function createBridge(initialSettings: AppSettings): Bridge {
  const persisted = { current: initialSettings };
  const placeholderAccount: AccountMeta = {
    id: "placeholder",
    issuer: "",
    label: "Account",
    digits: 6,
    period: 30,
  };

  return {
    lockAPI: createLockApi(),
    getSettings: async () => persisted.current,
    updateSettings: async (next) => {
      persisted.current = next;
      return next;
    },
    exportBackup: async () => false,
    importBackup: async () => false,
    list: async () => [],
    getAccountForEdit: async (id) => ({
      id,
      issuer: "",
      label: "Account",
      digits: 6,
      period: 30,
      algorithm: "SHA1",
    }),
    updateAccount: async () => placeholderAccount,
    addUri: async () => placeholderAccount,
    addManual: async () => placeholderAccount,
    del: async () => true,
    codes: async () => [],
  };
}

function mount(bridge: Bridge): { host: HTMLElement; root: Root; unmount: () => void } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<App bridge={bridge} />);
  });
  return {
    host,
    root,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function setMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function setVisibility(state: DocumentVisibilityState): void {
  currentVisibilityState = state;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  currentVisibilityState = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => currentVisibilityState,
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => currentVisibilityState !== "visible",
  });
  setMatchMedia(false);
});

afterEach(() => {
  delete document.documentElement.dataset.motion;
  delete document.documentElement.dataset.paused;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("App motion controller", () => {
  it("resolves system mode to reduced when OS prefers reduced motion", async () => {
    setMatchMedia(true);
    const ui = mount(createBridge({ ...DEFAULT_SETTINGS, motionMode: "system" }));

    await flush();

    expect(document.documentElement.dataset.motion).toBe("reduced");

    ui.unmount();
  });

  it("applies off mode immediately", async () => {
    const ui = mount(createBridge({ ...DEFAULT_SETTINGS, motionMode: "off" }));

    await flush();

    expect(document.documentElement.dataset.motion).toBe("off");

    ui.unmount();
  });

  it("pauses motion when document becomes hidden and resumes when visible", async () => {
    const ui = mount(createBridge({ ...DEFAULT_SETTINGS, motionMode: "full", pauseWhenBackground: true }));

    await flush();
    expect(document.documentElement.dataset.paused).toBe("false");

    setVisibility("hidden");
    await flush();
    expect(document.documentElement.dataset.paused).toBe("true");

    setVisibility("visible");
    await flush();
    expect(document.documentElement.dataset.paused).toBe("false");

    ui.unmount();
  });

  it("keeps motion running in background when pause-in-background is disabled", async () => {
    const ui = mount(createBridge({ ...DEFAULT_SETTINGS, motionMode: "full", pauseWhenBackground: false }));

    await flush();
    expect(document.documentElement.dataset.paused).toBe("false");

    setVisibility("hidden");
    await flush();
    expect(document.documentElement.dataset.paused).toBe("false");

    ui.unmount();
  });
});
