import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { DEFAULT_SETTINGS, type AppSettings, type Bridge, type LockApi } from "./bridge";

type Harness = {
  bridge: Bridge;
  persisted: { current: AppSettings };
  updateSettingsSpy: ReturnType<typeof vi.fn>;
};

function createLockApi(): LockApi {
  return {
    getMethod: async () => "password",
    getStatus: async () => false,
    setMethod: async () => {},
    getQuickUnlock: async () => ({ windowsHello: false, passkey: false }),
    setQuickUnlock: async () => {},
    setCredential: async () => {},
    verify: async () => ({ result: "OK" }),
    getLockState: async () => ({ failedCount: 0, lockUntilEpochMs: 0 }),
    hasCredential: async (type) => type === "password",
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
}

function createHarness(): Harness {
  const persisted = {
    current: {
      ...DEFAULT_SETTINGS,
      hasCompletedSafetySetup: true,
      hasSkippedSafetySetup: false,
      clipboardSafetyEnabled: true,
      runInBackground: true,
    },
  };

  const updateSettingsSpy = vi.fn(async (next: AppSettings) => {
    persisted.current = { ...next };
    return { ...persisted.current };
  });

  const bridge: Bridge = {
    lockAPI: createLockApi(),
    getSettings: async () => ({ ...persisted.current }),
    updateSettings: updateSettingsSpy,
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
    updateAccount: async () => ({ id: "acc-1", issuer: "", label: "Account", digits: 6, period: 30 }),
    addUri: async () => ({ id: "acc-1", issuer: "", label: "Account", digits: 6, period: 30 }),
    addManual: async () => ({ id: "acc-1", issuer: "", label: "Account", digits: 6, period: 30 }),
    del: async () => true,
    codes: async () => [],
  };

  return { bridge, persisted, updateSettingsSpy };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function click(target: Element | null): void {
  if (!(target instanceof HTMLElement)) {
    throw new Error("Expected clickable element to exist.");
  }
  act(() => {
    target.click();
  });
}

function findButtonByText(container: ParentNode, text: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const found = buttons.find((button) => (button.textContent ?? "").replace(/\s+/g, " ").trim().includes(text));
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Expected to find button with text "${text}".`);
  }
  return found;
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

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("App settings sync", () => {
  it("preserves tray-mutated settings when saving another setting from the renderer", async () => {
    const harness = createHarness();
    const ui = mount(harness.bridge);
    await flush();

    harness.persisted.current = {
      ...harness.persisted.current,
      runInBackground: false,
    };

    click(ui.host.querySelector('button[aria-label="Menu"]'));
    click(findButtonByText(document.body, "Settings"));
    await flush();

    click(document.body.querySelector('button[aria-label="Open Security settings"]'));
    await flush();

    click(document.body.querySelector('input[aria-label="Enable clipboard safety auto-clear"]'));
    await flush();

    const calls = harness.updateSettingsSpy.mock.calls;
    const lastCall = (calls.length > 0 ? calls[calls.length - 1]?.[0] : undefined) as AppSettings | undefined;
    expect(lastCall).toBeTruthy();
    expect(lastCall?.clipboardSafetyEnabled).toBe(false);
    expect(lastCall?.runInBackground).toBe(false);
    expect(harness.persisted.current.runInBackground).toBe(false);
    expect(harness.persisted.current.clipboardSafetyEnabled).toBe(false);

    ui.unmount();
  });
});
