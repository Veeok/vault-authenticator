import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LockApi } from "../bridge";
import { SecurityPicker } from "./SecurityPicker";
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
  act(() => target.click());
}

function typeInInput(target: Element | null, value: string): void {
  if (!(target instanceof HTMLInputElement)) {
    throw new Error("Expected input element.");
  }
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (!valueSetter) {
    throw new Error("Expected HTMLInputElement value setter.");
  }
  act(() => {
    valueSetter.call(target, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function mount(isMacOS = false, lockApiOverrides: Partial<LockApi> = {}, requestStepUpAuth = async () => true) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  const onGenerateRecoverySecret = vi.fn(async () => "SECRET1-SECRET2-SECRET3-SECRET4-SECRET5-SECRET6");
  const onCopyRecoverySecret = vi.fn(async () => {});
  const onEnrollBiometricUnlock = vi.fn(async () => true);
  const lockApi = createLockApi(lockApiOverrides);
  act(() => {
    root.render(
      <SecurityPicker
        lockApi={lockApi}
        currentMethod="password"
        methodConfigured={true}
        locked={false}
        biometricAvailable={true}
        isMacOS={isMacOS}
        biometricEnrolled={false}
        recoveryGenerated={false}
        onMethodSaved={async () => {}}
        requestStepUpAuth={requestStepUpAuth}
        requestSecuritySession={async () => true}
        onGenerateRecoverySecret={onGenerateRecoverySecret}
        onEnrollBiometricUnlock={onEnrollBiometricUnlock}
        onRemoveBiometricUnlock={async () => true}
        onCopyRecoverySecret={onCopyRecoverySecret}
        onLockNow={async () => {}}
        onError={() => {}}
      />
    );
  });
  return {
    host,
    lockApi,
    onGenerateRecoverySecret,
    onEnrollBiometricUnlock,
    onCopyRecoverySecret,
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

describe("SecurityPicker", () => {
  it("shows only password, Touch ID, and recovery secret sections", async () => {
    const ui = mount(true);
    await flush();
    expect(ui.host.textContent).toContain("Password");
    expect(ui.host.textContent).toContain("Touch ID");
    expect(ui.host.textContent).toContain("Recovery secret");
    expect(ui.host.textContent).not.toContain("Passkey");
    expect(ui.host.textContent).not.toContain("Pattern");
    expect(ui.host.textContent).not.toContain("Swipe");
    ui.unmount();
  });

  it("generates and displays a recovery secret", async () => {
    const ui = mount();
    await flush();
    click(Array.from(ui.host.querySelectorAll("button")).find((button) => (button.textContent ?? "").includes("Generate recovery secret")) ?? null);
    await flush();
    expect(ui.onGenerateRecoverySecret).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Shown once. Save the full key.");
    expect(document.body.textContent).toContain("Use every group together as a single key.");
    ui.unmount();
  });

  it("opens the shared password prompt and saves a new password", async () => {
    const setCredential = vi.fn(async () => {});
    const requestStepUpAuth = vi.fn(async () => true);
    const ui = mount(false, { setCredential }, requestStepUpAuth);
    await flush();
    click(Array.from(ui.host.querySelectorAll("button")).find((button) => (button.textContent ?? "").includes("Change password")) ?? null);
    await flush();
    expect(requestStepUpAuth).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Change password");
    expect(document.body.textContent).toContain("Set a new password for this vault.");
    typeInInput(document.body.querySelector('input[aria-label="Vault password"]'), "CurrentPass!234");
    typeInInput(document.body.querySelector('input[aria-label="Confirm vault password"]'), "CurrentPass!234");
    await flush();
    click(Array.from(document.body.querySelectorAll("button")).find((button) => (button.textContent ?? "").includes("Save password")) ?? null);
    await flush();
    await flush();
    expect(setCredential).toHaveBeenCalledWith("password", "CurrentPass!234");
    ui.unmount();
  });
});
