import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountMeta } from "@authenticator/core";
import { App } from "./App";
import { DEFAULT_SETTINGS, type AppSettings, type Bridge, type LockApi, type VaultProtectionStatus } from "./bridge";

function createLockApi(): LockApi {
  return {
    getMethod: async () => "password",
    getMethodsConfig: async () => ({ primaryLockMethod: "password", secondaryLockMethod: null }),
    setMethod: async () => {},
    getQuickUnlock: async () => ({ windowsHello: false, passkey: false }),
    setQuickUnlock: async () => {},
    setCredential: async () => {},
    verify: async () => ({ result: "OK" }),
    hasCredential: async () => true,
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

function createBridge(vaultOverrides?: Partial<VaultProtectionStatus>): Bridge {
  const settings: AppSettings = { ...DEFAULT_SETTINGS };
  const account: AccountMeta = { id: "acc-1", issuer: "GitHub", label: "user@example.com", digits: 6, period: 30 };
  return {
    lockAPI: createLockApi(),
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

function click(target: Element | null): void {
  if (!(target instanceof HTMLElement)) {
    throw new Error("Expected clickable element to exist.");
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

describe("App vault protection settings", () => {
  it("shows recovery secret actions instead of a vault mode toggle", async () => {
    const ui = mount(createBridge());
    await flush();

    click(ui.host.querySelector('button[aria-label="Menu"]'));
    click(findButtonByText(document.body, "Settings"));
    await flush();
    click(findButtonByText(document.body, "Security"));
    await flush();

    expect(document.body.textContent ?? "").toContain("Vault v4 (password-backed)");
    expect(document.body.textContent ?? "").toContain("Recovery secret: Not set up");
    expect(document.body.textContent ?? "").not.toContain("Enable Hardened Mode");

    ui.unmount();
  });

  it("shows the migration modal when migration is required", async () => {
    const ui = mount(createBridge({ migrationRequired: true, requiresPasswordSetup: false }));
    await flush();

    expect(document.body.textContent ?? "").toContain("Vault security upgrade");
    expect(document.body.textContent ?? "").toContain("Upgrade vault");

    ui.unmount();
  });

  it("shows the post-recovery prompt after the first normal unlock", async () => {
    const ui = mount(createBridge({ justUnlockedViaRecovery: true, recoveryGenerated: true }));
    await flush();

    expect(document.body.textContent ?? "").toContain("Recovery secret used");
    expect(document.body.textContent ?? "").toContain("Open Security");

    click(findButtonByText(document.body, "Open Security"));
    await flush();

    expect(document.body.textContent ?? "").toContain("Your previous recovery secret has been used. Generate a new one to stay protected.");
    expect(document.body.textContent ?? "").toContain("Regenerate");

    ui.unmount();
  });
});
