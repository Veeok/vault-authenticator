import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type LockApi, type VaultProtectionStatus } from "../bridge";
import { SafetySetupModal } from "./SafetySetupModal";
import "../ui.css";

function createLockApi(overrides: Partial<LockApi> = {}): LockApi {
  return {
    getMethod: async () => "password",
    setMethod: async () => {},
    getQuickUnlock: async () => ({ windowsHello: false, passkey: false }),
    setQuickUnlock: async () => {},
    setCredential: async () => {},
    verify: async () => ({ result: "OK" }),
    getLockState: async () => ({ failedCount: 0, lockUntilEpochMs: 0 }),
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
    ...overrides,
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
    throw new Error("Expected clickable element.");
  }
  act(() => {
    target.click();
  });
}

function typeInInput(input: Element | null, value: string): void {
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected input element.");
  }
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
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

function findButtonByExactText(container: ParentNode, text: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const found = buttons.find((button) => (button.textContent ?? "").replace(/\s+/g, " ").trim() === text);
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Expected to find button with exact text "${text}".`);
  }
  return found;
}

function listButtonText(container: ParentNode): string[] {
  return Array.from(container.querySelectorAll("button")).map((button) => (button.textContent ?? "").replace(/\s+/g, " ").trim());
}

function countDots(container: HTMLElement): number {
  return container.querySelectorAll(".auth-dot-stepper-dot").length;
}

function defaultVaultProtection(overrides: Partial<VaultProtectionStatus> = {}): VaultProtectionStatus {
  return {
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
    ...overrides,
  };
}

function mount(overrides: Partial<React.ComponentProps<typeof SafetySetupModal>> = {}) {
  const app = document.createElement("div");
  app.className = "auth-root theme-dark accent-none";
  document.body.appendChild(app);

  const root: Root = createRoot(app);
  const onSkip = vi.fn(async () => {});
  const onClose = vi.fn();
  const onComplete = vi.fn(async () => true);
  const onGenerateRecoverySecret = vi.fn(async () => "SECRET1-SECRET2-SECRET3-SECRET4-SECRET5-SECRET6");
  const onEnrollBiometric = vi.fn(async () => true);
  const onRemoveBiometric = vi.fn(async () => true);
  const onCopyRecoverySecret = vi.fn(async () => true);
  const runSensitiveAction = vi.fn(async <T,>(action: () => Promise<T>) => ({ status: "ok" as const, value: await action() })) as React.ComponentProps<
    typeof SafetySetupModal
  >["runSensitiveAction"];
  const onMethodSaved = vi.fn(async () => {});
  const onOpenAddAccount = vi.fn(async () => {});

  let props: React.ComponentProps<typeof SafetySetupModal> = {
    mode: "manual",
    isClosing: false,
    themeClass: "theme-dark",
    settings: { ...DEFAULT_SETTINGS },
    lockApi: createLockApi(),
    passwordLockConfigured: false,
    vaultProtection: defaultVaultProtection(),
    accountCount: 0,
    runSensitiveAction,
    onMethodSaved,
    onGenerateRecoverySecret,
    onCopyRecoverySecret,
    onEnrollBiometric,
    onRemoveBiometric,
    onOpenAddAccount,
    onSettingsChange: vi.fn(async () => {}),
    onError: vi.fn(),
    onSkip,
    onClose,
    onComplete,
    ...overrides,
  };

  act(() => {
    root.render(<SafetySetupModal {...props} />);
  });

  return {
    app,
    onSkip,
    onClose,
    onComplete,
    onGenerateRecoverySecret,
    onEnrollBiometric,
    onRemoveBiometric,
    onCopyRecoverySecret,
    runSensitiveAction,
    onMethodSaved,
    onOpenAddAccount,
    rerender(nextOverrides: Partial<React.ComponentProps<typeof SafetySetupModal>>) {
      props = { ...props, ...nextOverrides };
      act(() => {
        root.render(<SafetySetupModal {...props} />);
      });
    },
    unmount: () => {
      act(() => root.unmount());
      app.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("SafetySetupModal", () => {
  it("shows the visible non-mac step count and lets overview cards jump into the flow", async () => {
    const ui = mount();
    await flush();

    expect(ui.app.textContent).toContain("Let's protect your accounts.");
    expect(countDots(ui.app)).toBe(5);

    click(findButtonByText(ui.app, "Close"));
    await flush();
    expect(ui.onClose).toHaveBeenCalledTimes(1);

    click(findButtonByText(ui.app, "Emergency backup"));
    await flush();

    expect(ui.app.textContent).toContain("Save an emergency backup");

    ui.unmount();
  });

  it("keeps recovery generation inline, hides Back until saved, and completes only on Done", async () => {
    const ui = mount();
    await flush();

    click(findButtonByText(ui.app, "Get started"));
    await flush();

    typeInInput(ui.app.querySelector('input[aria-label="Vault password"]'), "CurrentPass!234");
    typeInInput(ui.app.querySelector('input[aria-label="Confirm vault password"]'), "CurrentPass!234");
    click(findButtonByText(ui.app, "Continue"));
    await flush();

    expect(ui.onMethodSaved).toHaveBeenCalledTimes(1);
    expect(ui.app.textContent).toContain("Save an emergency backup");

    click(findButtonByText(ui.app, "Generate backup code"));
    await flush();

    expect(ui.app.textContent).toContain("Here is your backup code.");
    expect(ui.app.textContent).toContain("Write it down. You won't see it again.");
    expect(listButtonText(ui.app)).not.toContain("Back");

    click(findButtonByText(ui.app, "Copy"));
    await flush();
    expect(ui.onCopyRecoverySecret).toHaveBeenCalledWith("SECRET1-SECRET2-SECRET3-SECRET4-SECRET5-SECRET6", { silent: true });
    expect(listButtonText(ui.app).some((text) => text.includes("Copied"))).toBe(true);

    click(ui.app.querySelector('input[aria-label="Confirm backup code saved"]'));
    await flush();
    click(findButtonByText(ui.app, "Continue"));
    await flush();

    expect(ui.app.textContent).toContain("Add your first app");
    click(findButtonByText(ui.app, "Skip"));
    await flush();
    click(findButtonByText(ui.app, "Continue"));
    await flush();

    expect(ui.app.textContent).toContain("You're all set.");
    expect(ui.onComplete).toHaveBeenCalledTimes(0);

    click(findButtonByText(ui.app, "Done"));
    await flush();

    expect(ui.onComplete).toHaveBeenCalledTimes(1);
    expect(ui.onClose).toHaveBeenCalledTimes(1);

    ui.unmount();
  });

  it("clears the in-memory recovery secret before closing on Done", async () => {
    const onClose = vi.fn();
    const onComplete = vi.fn(async () => true);
    const ui = mount({ onClose, onComplete });
    await flush();

    click(findButtonByText(ui.app, "Get started"));
    await flush();
    typeInInput(ui.app.querySelector('input[aria-label="Vault password"]'), "CurrentPass!234");
    typeInInput(ui.app.querySelector('input[aria-label="Confirm vault password"]'), "CurrentPass!234");
    click(findButtonByText(ui.app, "Continue"));
    await flush();

    click(findButtonByText(ui.app, "Generate backup code"));
    await flush();
    click(ui.app.querySelector('input[aria-label="Confirm backup code saved"]'));
    await flush();
    click(findButtonByText(ui.app, "Continue"));
    await flush();
    click(findButtonByText(ui.app, "Skip"));
    await flush();
    click(findButtonByText(ui.app, "Continue"));
    await flush();

    click(findButtonByText(ui.app, "Done"));
    await flush();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ui.onCopyRecoverySecret).toHaveBeenCalledTimes(0);

    ui.unmount();
  });

  it("uses the sensitive-action runner before generating a backup code", async () => {
    const onGenerateRecoverySecret = vi.fn(async () => "DIRECT-SECRET");
    const runSensitiveAction = vi.fn(async () => ({ status: "cancelled" as const })) as React.ComponentProps<typeof SafetySetupModal>["runSensitiveAction"];
    const ui = mount({ onGenerateRecoverySecret, runSensitiveAction });
    await flush();

    click(findButtonByText(ui.app, "Get started"));
    await flush();

    typeInInput(ui.app.querySelector('input[aria-label="Vault password"]'), "CurrentPass!234");
    typeInInput(ui.app.querySelector('input[aria-label="Confirm vault password"]'), "CurrentPass!234");
    click(findButtonByText(ui.app, "Continue"));
    await flush();

    click(findButtonByText(ui.app, "Generate backup code"));
    await flush();

    expect(runSensitiveAction).toHaveBeenCalledTimes(1);
    expect(runSensitiveAction).toHaveBeenCalledWith(expect.any(Function), { requiresSecuritySession: true, promptFirst: false });
    expect(onGenerateRecoverySecret).not.toHaveBeenCalled();
    expect(ui.app.textContent).toContain("Save an emergency backup");
    expect(ui.app.textContent).not.toContain("Here is your backup code.");

    ui.unmount();
  });

  it("requires identity verification before changing an existing password", async () => {
    const setCredential = vi.fn(async () => {});
    const runSensitiveAction = vi.fn(async <T,>(action: () => Promise<T>) => ({ status: "ok" as const, value: await action() })) as React.ComponentProps<
      typeof SafetySetupModal
    >["runSensitiveAction"];
    const ui = mount({ passwordLockConfigured: true, lockApi: createLockApi({ setCredential }), runSensitiveAction });
    await flush();

    click(findButtonByText(ui.app, "Password"));
    await flush();
    click(findButtonByText(ui.app, "Change it"));
    await flush();

    typeInInput(ui.app.querySelector('input[aria-label="Vault password"]'), "NewPass!23456");
    typeInInput(ui.app.querySelector('input[aria-label="Confirm vault password"]'), "NewPass!23456");
    click(findButtonByText(ui.app, "Continue"));
    await flush();

    expect(runSensitiveAction).toHaveBeenCalledWith(expect.any(Function), { requiresSecuritySession: true, promptFirst: true });
    expect(setCredential).toHaveBeenCalledWith("password", "NewPass!23456");

    ui.unmount();
  });

  it("requires identity verification before replacing an existing backup code", async () => {
    const onGenerateRecoverySecret = vi.fn(async () => "ROTATE1-ROTATE2-ROTATE3-ROTATE4-ROTATE5-ROTATE6");
    const runSensitiveAction = vi.fn(async <T,>(action: () => Promise<T>) => ({ status: "ok" as const, value: await action() })) as React.ComponentProps<
      typeof SafetySetupModal
    >["runSensitiveAction"];
    const ui = mount({ vaultProtection: defaultVaultProtection({ recoveryGenerated: true }), onGenerateRecoverySecret, runSensitiveAction });
    await flush();

    click(findButtonByText(ui.app, "Emergency backup"));
    await flush();
    click(findButtonByText(ui.app, "Replace it"));
    await flush();
    click(findButtonByExactText(ui.app, "Replace"));
    await flush();

    expect(runSensitiveAction).toHaveBeenCalledWith(expect.any(Function), { requiresSecuritySession: true, promptFirst: true });
    expect(onGenerateRecoverySecret).toHaveBeenCalledTimes(1);

    ui.unmount();
  });

  it("adds the Touch ID step only on macOS", async () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

    try {
      const ui = mount();
      await flush();

      expect(countDots(ui.app)).toBe(6);
      expect(ui.app.textContent).toContain("Fingerprint unlock");

      click(findButtonByText(ui.app, "Get started"));
      await flush();
      typeInInput(ui.app.querySelector('input[aria-label="Vault password"]'), "CurrentPass!234");
      typeInInput(ui.app.querySelector('input[aria-label="Confirm vault password"]'), "CurrentPass!234");
      click(findButtonByText(ui.app, "Continue"));
      await flush();

      click(findButtonByText(ui.app, "Skip"));
      await flush();
      click(findButtonByText(ui.app, "Continue"));
      await flush();

      expect(ui.app.textContent).toContain("Open with your fingerprint");
      click(findButtonByText(ui.app, "Enable Touch ID"));
      await flush();

      expect(ui.onEnrollBiometric).toHaveBeenCalledTimes(1);

      ui.unmount();
    } finally {
      platformSpy.mockRestore();
    }
  });

  it("opens add account without advancing and reacts to accountCount updates", async () => {
    const ui = mount();
    await flush();

    click(findButtonByText(ui.app, "Get started"));
    await flush();
    typeInInput(ui.app.querySelector('input[aria-label="Vault password"]'), "CurrentPass!234");
    typeInInput(ui.app.querySelector('input[aria-label="Confirm vault password"]'), "CurrentPass!234");
    click(findButtonByText(ui.app, "Continue"));
    await flush();

    click(findButtonByText(ui.app, "Skip"));
    await flush();
    click(findButtonByText(ui.app, "Continue"));
    await flush();

    expect(ui.app.textContent).toContain("Add your first app");
    click(findButtonByText(ui.app, "Add an app"));
    await flush();

    expect(ui.onOpenAddAccount).toHaveBeenCalledTimes(1);
    expect(ui.app.textContent).toContain("Add your first app");

    ui.rerender({ accountCount: 1 });
    await flush();

    expect(ui.app.textContent).toContain("App added.");

    ui.unmount();
  });
});
