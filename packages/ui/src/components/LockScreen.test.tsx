import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import type { LockApi, VaultProtectionStatus } from "../bridge";
import { LockScreen } from "./LockScreen";
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
    validateAndBurnRecoverySecret: async () => ({ valid: false }),
    setPasswordAfterRecovery: async () => ({ success: false }),
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

function defaultVaultProtection(overrides?: Partial<VaultProtectionStatus>): VaultProtectionStatus {
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

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function click(target: Element | null): void {
  if (!(target instanceof HTMLElement)) {
    throw new Error("Expected clickable element.");
  }
  act(() => target.click());
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

function submitForm(target: Element | null): void {
  if (!(target instanceof HTMLFormElement)) {
    throw new Error("Expected form element.");
  }
  act(() => {
    target.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

const fullRecoverySecret = "JWCMBY-GR9DSX-Q862MP-SYCQ9C-JKKWMX-JGZVR8-F72XUZ-7CC8PW";

function mount(lockApi: LockApi, vaultProtection?: VaultProtectionStatus, biometricPromptEnabled = true) {
  const app = document.createElement("div");
  app.className = "auth-root theme-dark accent-none";
  document.body.appendChild(app);
  const root: Root = createRoot(app);
  const unlocked = vi.fn();
  act(() => {
    root.render(
      <LockScreen
        lockApi={lockApi}
        vaultProtection={vaultProtection ?? defaultVaultProtection()}
        biometricPromptEnabled={biometricPromptEnabled}
        onUnlocked={unlocked}
      />
    );
  });
  return {
    app,
    unlocked,
    unmount: () => {
      act(() => root.unmount());
      app.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("LockScreen", () => {
  it("always shows the vault password form", async () => {
    const ui = mount(createLockApi());
    await flush();
    expect(ui.app.textContent).toContain("Unlock your vault");
    expect(ui.app.textContent).toContain("Vault password");
    expect(ui.app.textContent).not.toContain("PIN");
    expect(ui.app.textContent).not.toContain("Passkey");
    expect(ui.app.textContent).not.toContain("Swipe");
    ui.unmount();
  });

  it("submits the vault password and unlocks on success", async () => {
    const verify = vi.fn(async () => ({ result: "OK" as const }));
    const ui = mount(createLockApi({ verify }));
    await flush();

    typeInInput(ui.app.querySelector('input[aria-label="Vault password"]'), "CurrentPass!234");
    click(ui.app.querySelector('button[type="submit"].auth-btn-primary'));
    await flush();

    expect(verify).toHaveBeenCalledWith("password", "CurrentPass!234");
    ui.unmount();
  });

  it("shakes the lock screen after incorrect password input", async () => {
    const verify = vi.fn(async () => ({ result: "INCORRECT" as const, attemptsUsed: 1 }));
    const ui = mount(createLockApi({ verify }));
    await flush();

    typeInInput(ui.app.querySelector('input[aria-label="Vault password"]'), "WrongPass!234");
    click(ui.app.querySelector('button[type="submit"].auth-btn-primary'));
    await flush();

    expect(ui.app.querySelector(".auth-lock-card")?.className).toContain("is-shaking");

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    });

    expect(ui.app.querySelector(".auth-lock-card")?.className).not.toContain("is-shaking");
    ui.unmount();
  });

  it("animates the lock glyph to unlocked after a successful unlock", async () => {
    const verify = vi.fn(async () => ({ result: "OK" as const }));
    const ui = mount(createLockApi({ verify }));
    await flush();

    expect(ui.app.querySelector("[data-lock-glyph-state]")?.getAttribute("data-lock-glyph-state")).toBe("locked");

    typeInInput(ui.app.querySelector('input[aria-label="Vault password"]'), "CurrentPass!234");
    click(ui.app.querySelector('button[type="submit"].auth-btn-primary'));
    await flush();

    expect(ui.app.querySelector("[data-lock-glyph-state]")?.getAttribute("data-lock-glyph-state")).toBe("unlocked");
    ui.unmount();
  });

  it("submits the vault password form on Enter", async () => {
    const verify = vi.fn(async () => ({ result: "OK" as const }));
    const ui = mount(createLockApi({ verify }));
    await flush();

    typeInInput(ui.app.querySelector('input[aria-label="Vault password"]'), "CurrentPass!234");
    submitForm(ui.app.querySelector("form.auth-lock-form"));
    await flush();

    expect(verify).toHaveBeenCalledWith("password", "CurrentPass!234");
    ui.unmount();
  });

  it("shows the recovery secret flow only when recovery is configured", async () => {
    const validateAndBurnRecoverySecret = vi.fn(async () => ({ valid: true }));
    const ui = mount(
      createLockApi({ validateAndBurnRecoverySecret, setPasswordAfterRecovery: async () => ({ success: true }) }),
      defaultVaultProtection({ recoveryGenerated: true })
    );
    await flush();

    click(Array.from(ui.app.querySelectorAll("button")).find((button) => (button.textContent ?? "").includes("Use recovery secret")) ?? null);
    await flush();

    typeInInput(ui.app.querySelector('input[aria-label="Recovery secret part 1 of 8"]'), fullRecoverySecret);
    click(Array.from(ui.app.querySelectorAll("button")).find((button) => (button.textContent ?? "").includes("Verify recovery secret")) ?? null);
    await flush();

    expect(validateAndBurnRecoverySecret).toHaveBeenCalledWith(fullRecoverySecret);
    expect(ui.app.textContent).toContain("Create a new password");
    ui.unmount();
  });

  it("rejects incomplete recovery secret input before calling the bridge", async () => {
    const validateAndBurnRecoverySecret = vi.fn(async () => ({ valid: true }));
    const ui = mount(createLockApi({ validateAndBurnRecoverySecret }), defaultVaultProtection({ recoveryGenerated: true }));
    await flush();

    click(Array.from(ui.app.querySelectorAll("button")).find((button) => (button.textContent ?? "").includes("Use recovery secret")) ?? null);
    await flush();

    typeInInput(ui.app.querySelector('input[aria-label="Recovery secret part 1 of 8"]'), "N3QC74");
    click(Array.from(ui.app.querySelectorAll("button")).find((button) => (button.textContent ?? "").includes("Verify recovery secret")) ?? null);
    await flush();

    expect(validateAndBurnRecoverySecret).not.toHaveBeenCalled();
    expect(ui.app.textContent).toContain("Enter the full recovery secret, not one segment.");
    ui.unmount();
  });

  it("keeps the vault locked through recovery password reset and returns to password mode after acknowledgement", async () => {
    const validateAndBurnRecoverySecret = vi.fn(async () => ({ valid: true }));
    const setPasswordAfterRecovery = vi.fn(async () => ({ success: true }));
    const ui = mount(createLockApi({ validateAndBurnRecoverySecret, setPasswordAfterRecovery }), defaultVaultProtection({ recoveryGenerated: true }));
    await flush();

    click(Array.from(ui.app.querySelectorAll("button")).find((button) => (button.textContent ?? "").includes("Use recovery secret")) ?? null);
    await flush();
    typeInInput(ui.app.querySelector('input[aria-label="Recovery secret part 1 of 8"]'), fullRecoverySecret);
    click(Array.from(ui.app.querySelectorAll("button")).find((button) => (button.textContent ?? "").includes("Verify recovery secret")) ?? null);
    await flush();

    typeInInput(ui.app.querySelector('input[aria-label="Create a new password"]'), "CurrentPass!234");
    typeInInput(ui.app.querySelector('input[aria-label="Confirm new password"]'), "CurrentPass!234");
    click(Array.from(ui.app.querySelectorAll("button")).find((button) => (button.textContent ?? "").includes("Save new password")) ?? null);
    await flush();

    expect(setPasswordAfterRecovery).toHaveBeenCalledWith("CurrentPass!234");
    expect(ui.unlocked).not.toHaveBeenCalled();
    expect(ui.app.textContent).toContain("Your recovery secret has been used.");

    click(Array.from(ui.app.querySelectorAll("button")).find((button) => (button.textContent ?? "").includes("Got it")) ?? null);
    await flush();

    expect(ui.app.textContent).toContain("Use your new password to unlock your vault.");
    expect(ui.app.textContent).toContain("Recovery unlock is not set up for this vault.");
    ui.unmount();
  });

  it("shows Touch ID only on macOS when enrolled", async () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    try {
      const ui = mount(createLockApi({ promptBiometric: async () => false }), defaultVaultProtection({ biometricEnrolled: true }));
      await flush();
      expect(ui.app.textContent).toContain("Unlock with Touch ID");
      ui.unmount();
    } finally {
      platformSpy.mockRestore();
    }
  });

  it("hides the Touch ID button when the lock-screen biometric prompt setting is off", async () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    try {
      const ui = mount(createLockApi({ promptBiometric: async () => false }), defaultVaultProtection({ biometricEnrolled: true }), false);
      await flush();
      expect(ui.app.textContent).not.toContain("Use Touch ID");
      ui.unmount();
    } finally {
      platformSpy.mockRestore();
    }
  });
});
