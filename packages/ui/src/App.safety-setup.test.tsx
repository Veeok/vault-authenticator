import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountMeta } from "@authenticator/core";
import { App } from "./App";
import { DEFAULT_SETTINGS, type AppSettings, type Bridge, type LockApi, type LockMethod, type VaultProtectionStatus } from "./bridge";

function createLockApi(method: LockMethod): LockApi {
  return {
    getMethod: async () => method,
    setMethod: async () => {},
    getQuickUnlock: async () => ({ windowsHello: false, passkey: false }),
    setQuickUnlock: async () => {},
    setCredential: async () => {},
    verify: async () => ({ result: "OK" }),
    hasCredential: async (type) => (type === "password" ? method === "password" : false),
    clearCredential: async () => {},
    resetAppLock: async () => true,
    lock: async () => {},
    biometricAvailable: async () => false,
    promptBiometric: async () => false,
    onShowLockScreen: () => {},
    getPinDigits: async () => 6,
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

function createBridge(method: LockMethod, settingsOverrides?: Partial<AppSettings>, vaultOverrides?: Partial<VaultProtectionStatus>): Bridge {
  const settings: AppSettings = { ...DEFAULT_SETTINGS, ...settingsOverrides };
  const account: AccountMeta = { id: "acc-1", issuer: "GitHub", label: "user@example.com", digits: 6, period: 30 };

  return {
    lockAPI: createLockApi(method),
    getSettings: async () => settings,
    updateSettings: async (next) => {
      Object.assign(settings, next);
      return settings;
    },
    getVaultProtectionStatus: async () => ({
      vaultFormat: "vault-v4",
      requiresMasterPassword: false,
      hardenedSessionUnlocked: true,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      recoveryGenerated: false,
      biometricEnrolled: false,
      migrationRequired: false,
      requiresPasswordSetup: false,
      justUnlockedViaRecovery: false,
      appLockRequired: true,
      ...vaultOverrides,
    }),
    generateRecoverySecret: async () => "SECRET1-SECRET2-SECRET3-SECRET4-SECRET5-SECRET6",
    enrollBiometricUnlock: async () => ({
      vaultFormat: "vault-v4",
      requiresMasterPassword: false,
      hardenedSessionUnlocked: true,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      recoveryGenerated: false,
      biometricEnrolled: true,
      migrationRequired: false,
      requiresPasswordSetup: false,
      justUnlockedViaRecovery: false,
      appLockRequired: true,
    }),
    removeBiometricUnlock: async () => ({
      vaultFormat: "vault-v4",
      requiresMasterPassword: false,
      hardenedSessionUnlocked: true,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      recoveryGenerated: false,
      biometricEnrolled: false,
      migrationRequired: false,
      requiresPasswordSetup: false,
      justUnlockedViaRecovery: false,
      appLockRequired: true,
    }),
    migrateWithPassword: async () => true,
    migrateSetPassword: async () => true,
    exportBackup: async () => false,
    importBackup: async () => false,
    list: async () => [account],
    getAccountForEdit: async (id) => ({ id, issuer: account.issuer, label: account.label, digits: 6, period: 30, algorithm: "SHA1" }),
    updateAccount: async () => account,
    addUri: async () => account,
    addManual: async () => account,
    del: async () => true,
    codes: async () => [{ id: account.id, code: "123456", remainingSeconds: 22 }],
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function waitForModalClose(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 260));
  });
}

function click(target: Element | null): void {
  if (!(target instanceof HTMLElement)) {
    throw new Error("Expected clickable element.");
  }
  act(() => target.click());
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
  act(() => root.render(<App bridge={bridge} />));
  return {
    host,
    root,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("App safety setup", () => {
  it("auto-shows Safety Setup for first-run unprotected state", async () => {
    const ui = mount(createBridge("none", { hasCompletedSafetySetup: false, hasSkippedSafetySetup: false }));
    await flush();
    expect(document.body.querySelector('[aria-label="Safety Setup"]')).toBeTruthy();
    ui.unmount();
  });

  it("persists skipped state when user skips setup", async () => {
    const bridge = createBridge("none", { hasCompletedSafetySetup: false, hasSkippedSafetySetup: false });
    const ui = mount(bridge);
    await flush();
    click(findButtonByText(document.body, "Close"));
    await flush();
    await waitForModalClose();
    expect(document.body.querySelector('[aria-label="Safety Setup"]')).toBeFalsy();
    ui.unmount();
  });

  it("reopens Safety Setup from Security settings", async () => {
    const ui = mount(createBridge("password", { hasCompletedSafetySetup: true, hasSkippedSafetySetup: false }));
    await flush();
    click(ui.host.querySelector('button[aria-label="Menu"]'));
    click(findButtonByText(document.body, "Settings"));
    await flush();
    click(findButtonByText(document.body, "Security"));
    await flush();
    click(findButtonByText(document.body, "Run Safety Setup again"));
    await flush();
    expect(document.body.querySelector('[aria-label="Safety Setup"]')).toBeTruthy();
    ui.unmount();
  });
});
