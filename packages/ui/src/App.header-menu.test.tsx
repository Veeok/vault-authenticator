import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountMeta } from "@authenticator/core";
import { App } from "./App";
import { DEFAULT_SETTINGS, type Bridge, type LockApi } from "./bridge";

function createLockApi(lockFn: ReturnType<typeof vi.fn>): LockApi {
  return {
    getMethod: async () => "swipe",
    getStatus: async () => false,
    setMethod: async () => {},
    getQuickUnlock: async () => ({ windowsHello: false, passkey: false }),
    setQuickUnlock: async () => {},
    setCredential: async () => {},
    verify: async () => ({ result: "OK" }),
    hasCredential: async () => false,
    clearCredential: async () => {},
    resetAppLock: async () => true,
    lock: lockFn,
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

function createBridge(lockFn: ReturnType<typeof vi.fn>): Bridge {
  const account: AccountMeta = {
    id: "acc-1",
    issuer: "GitHub",
    label: "user@example.com",
    digits: 6,
    period: 30,
  };

  return {
    lockAPI: createLockApi(lockFn),
    getSettings: async () => DEFAULT_SETTINGS,
    updateSettings: async (next) => next,
    exportBackup: async () => false,
    importBackup: async () => false,
    list: async () => [account],
    getAccountForEdit: async (id) => ({
      id,
      issuer: account.issuer,
      label: account.label,
      digits: 6,
      period: 30,
      algorithm: "SHA1",
    }),
    updateAccount: async () => account,
    addUri: async () => account,
    addManual: async () => account,
    del: async () => true,
    codes: async () => [{ id: account.id, code: "123456", remainingSeconds: 21 }],
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
  act(() => {
    target.click();
  });
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const found = buttons.find((button) => (button.textContent ?? "").replace(/\s+/g, " ").trim().includes(text));
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Expected to find button with text \"${text}\".`);
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

describe("App header menu", () => {
  it("opens floating menu and locks from menu action", async () => {
    const lockFn = vi.fn(async () => {});
    const ui = mount(createBridge(lockFn));

    await flush();

    expect(ui.host.querySelector('button[aria-label="Menu"]')).toBeTruthy();

    click(ui.host.querySelector('button[aria-label="Menu"]'));
    click(findButtonByText(document.body, "Lock app"));
    await flush();

    expect(lockFn).toHaveBeenCalledTimes(1);
    expect(ui.host.querySelector(".auth-lock-shell")).toBeTruthy();

    ui.unmount();
  });

  it("opens settings from header menu and allows category switching", async () => {
    const ui = mount(createBridge(vi.fn(async () => {})));

    await flush();

    click(ui.host.querySelector('button[aria-label="Menu"]'));
    click(findButtonByText(document.body, "Settings"));
    await flush();

    expect(ui.host.querySelector('[data-settings-category="appearance"]')).toBeTruthy();

    click(findButtonByText(ui.host, "Accounts"));
    await flush();
    const accountsSection = ui.host.querySelector('[data-settings-category="accounts"]');
    expect(accountsSection?.textContent ?? "").toContain("Hide extra account text on small screens");

    click(findButtonByText(ui.host, "App behavior"));
    await flush();
    const behaviorSection = ui.host.querySelector('[data-settings-category="behavior"]');
    expect(behaviorSection).toBeTruthy();
    expect(behaviorSection?.textContent ?? "").not.toContain("Tray icon style");

    click(findButtonByText(ui.host, "Advanced"));
    await flush();
    const advancedSection = ui.host.querySelector('[data-settings-category="advanced"]');
    expect(advancedSection).toBeTruthy();
    const advancedText = advancedSection?.textContent ?? "";
    expect(advancedText).toContain("Version");
    expect(advancedText).toContain("Runtime");
    expect(advancedText).toContain("Lock method");
    expect(advancedText).toContain("Vault accounts");

    ui.unmount();
  });

  it("does not show an internal error banner during credential-locked startup", async () => {
    const lockFn = vi.fn(async () => {});
    const lockedList = vi.fn(async () => {
      throw { code: "E_LOCKED", message: "Unlock the app before using this feature." };
    });
    const lockedCodes = vi.fn(async () => {
      throw { code: "E_LOCKED", message: "Unlock the app before using this feature." };
    });

    const bridge: Bridge = {
      ...createBridge(lockFn),
      lockAPI: {
        ...createLockApi(lockFn),
        getMethod: async () => "pin6",
        getStatus: async () => true,
        hasCredential: async (type) => type === "pin",
        getPinDigits: async () => 6,
      },
      list: lockedList,
      codes: lockedCodes,
    };

    const ui = mount(bridge);
    await flush();

    expect(ui.host.querySelector(".auth-lock-shell")).toBeTruthy();
    expect(lockedList).not.toHaveBeenCalled();
    expect(lockedCodes).not.toHaveBeenCalled();
    expect(ui.host.querySelector(".auth-banner-code")?.textContent ?? "").not.toContain("E_INTERNAL");

    ui.unmount();
  });
});
