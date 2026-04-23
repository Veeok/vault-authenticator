import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountMeta } from "@authenticator/core";
import { App } from "./App";
import { DEFAULT_SETTINGS, type AppSettings, type Bridge, type LockApi } from "./bridge";

function createLockApi(lockFn: ReturnType<typeof vi.fn>): LockApi {
  return {
    getMethod: async () => "swipe",
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

type Harness = {
  bridge: Bridge;
  lockFn: ReturnType<typeof vi.fn>;
  scanFromScreen: ReturnType<typeof vi.fn>;
  clearClipboard: ReturnType<typeof vi.fn>;
  accounts: AccountMeta[];
};

function createBridgeHarness(settingsOverrides?: Partial<AppSettings>): Harness {
  const lockFn = vi.fn(async () => {});
  const scanFromScreen = vi.fn(async () => null);
  const clearClipboard = vi.fn(async (_expectedText: string) => true);
  const settings: AppSettings = { ...DEFAULT_SETTINGS, ...settingsOverrides };
  const accounts: AccountMeta[] = [
    { id: "acc-sms", issuer: "SMS Security", label: "sms@example.com", digits: 6, period: 30 },
    { id: "acc-github", issuer: "GitHub", label: "dev@example.com", digits: 6, period: 30 },
  ];

  const bridge: Bridge = {
    lockAPI: createLockApi(lockFn),
    getSettings: async () => settings,
    updateSettings: async (next) => {
      Object.assign(settings, next);
      return settings;
    },
    exportBackup: async () => false,
    importBackup: async () => false,
    list: async () => [...accounts],
    getAccountForEdit: async (id) => {
      const account = accounts.find((entry) => entry.id === id) ?? accounts[0];
      return {
        id,
        issuer: account.issuer,
        label: account.label,
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      };
    },
    updateAccount: async () => accounts[0],
    addUri: async () => accounts[0],
    addManual: async () => accounts[0],
    del: async () => true,
    codes: async () => [
      { id: "acc-sms", code: "654321", remainingSeconds: 22 },
      { id: "acc-github", code: "123456", remainingSeconds: 16 },
    ],
    scanFromScreen,
    clearClipboard,
  };

  return {
    bridge,
    lockFn,
    scanFromScreen,
    clearClipboard,
    accounts,
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

function typeInInput(input: Element | null, value: string): void {
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected input element to exist.");
  }

  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pressKey(target: Element | Document | Window, key: string, options?: KeyboardEventInit): void {
  act(() => {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, ...options });
    target.dispatchEvent(event);
  });
}

function findButtonByText(container: ParentNode, text: string): HTMLButtonElement {
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("App quick actions", () => {
  it("opens command palette from Ctrl+K and filters SMS accounts", async () => {
    const harness = createBridgeHarness();
    const ui = mount(harness.bridge);
    await flush();

    pressKey(document, "k", { ctrlKey: true });
    await flush();

    expect(document.body.querySelector(".auth-command-palette")).toBeTruthy();

    const searchInput = document.body.querySelector<HTMLInputElement>("#command-palette-search");
    typeInInput(searchInput, "SMS");
    await flush();

    const results = Array.from(document.body.querySelectorAll(".auth-command-item")).map((node) => node.textContent ?? "");
    expect(results.some((text) => text.includes("SMS Security"))).toBe(true);
    expect(results.some((text) => text.includes("GitHub"))).toBe(false);

    ui.unmount();
  });

  it("renders Search modal with header, input, results, and no-match state", async () => {
    const harness = createBridgeHarness();
    const ui = mount(harness.bridge);
    await flush();

    pressKey(document, "k", { ctrlKey: true });
    await flush();

    const palette = document.body.querySelector(".auth-command-palette") as HTMLElement;
    expect(palette).toBeTruthy();
    expect(document.body.querySelector(".auth-command-title")?.textContent).toContain("Search");

    const header = palette.querySelector(":scope > .auth-command-header");
    const search = palette.querySelector(":scope > .auth-command-search");
    const results = palette.querySelector(":scope > .auth-command-results");
    expect(header).toBeTruthy();
    expect(search).toBeTruthy();
    expect(results).toBeTruthy();

    const searchInput = document.body.querySelector<HTMLInputElement>("#command-palette-search");
    typeInInput(searchInput, "no-such-account");
    await flush();

    expect(document.body.querySelector(".auth-command-empty")?.textContent).toBe("No matches");

    ui.unmount();
  });

  it("copies code from palette with arrow and Enter then shows toast", async () => {
    const harness = createBridgeHarness();
    let clipboardValue = "";
    const writeText = vi.fn(async (value: string) => {
      clipboardValue = value;
    });
    const readText = vi.fn(async () => clipboardValue);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, readText },
    });

    const ui = mount(harness.bridge);
    await flush();

    pressKey(document, "k", { ctrlKey: true });
    await flush();

    const searchInput = document.body.querySelector<HTMLInputElement>("#command-palette-search");
    typeInInput(searchInput, "SMS");
    await flush();

    pressKey(searchInput ?? document, "ArrowDown");
    pressKey(searchInput ?? document, "Enter");
    await flush();

    expect(writeText).toHaveBeenCalledWith("654321");
    expect(document.body.querySelector(".auth-banner-title")?.textContent).toContain("Copied");

    ui.unmount();
  });

  it("auto-dismisses copy toast with exit state", async () => {
    vi.useFakeTimers();
    try {
      const harness = createBridgeHarness({ clipboardSafetyEnabled: false });
      let clipboardValue = "";
      const writeText = vi.fn(async (value: string) => {
        clipboardValue = value;
      });
      const readText = vi.fn(async () => clipboardValue);

      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText, readText },
      });

      const ui = mount(harness.bridge);
      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(0);
      });

      click(ui.host.querySelector('button[aria-label^="Copy code for "]'));
      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(0);
      });

      const banner = document.body.querySelector(".auth-banner") as HTMLElement | null;
      expect(banner).toBeTruthy();
      expect(banner?.className).not.toContain("is-exiting");

      await act(async () => {
        vi.advanceTimersByTime(3500);
        await Promise.resolve();
      });

      const exitingBanner = document.body.querySelector(".auth-banner") as HTMLElement | null;
      expect(exitingBanner).toBeTruthy();
      expect(exitingBanner?.className).toContain("is-exiting");

      await act(async () => {
        vi.advanceTimersByTime(260);
        await Promise.resolve();
      });

      expect(document.body.querySelector(".auth-banner")).toBeNull();

      ui.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens scan overlay from quick action menu", async () => {
    const harness = createBridgeHarness();
    const ui = mount(harness.bridge);
    await flush();

    click(ui.host.querySelector('button[aria-label="Menu"]'));
    click(findButtonByText(document.body, "Scan QR from Screen"));
    await flush();

    expect(ui.host.querySelector(".auth-scan-overlay")).toBeTruthy();

    ui.unmount();
  });

  it("shows scan feedback banner when no QR is found", async () => {
    const harness = createBridgeHarness();
    harness.scanFromScreen.mockRejectedValueOnce({ code: "E_SCAN_NO_QR", message: "No QR code found in the selected area." });
    const ui = mount(harness.bridge);
    await flush();

    click(ui.host.querySelector('button[aria-label="Menu"]'));
    click(findButtonByText(document.body, "Scan QR from Screen"));
    await flush();

    click(findButtonByText(ui.host, "Start selection"));
    await flush();

    expect(document.body.querySelector(".auth-banner-title")?.textContent).toContain("No QR code found");
    expect(document.body.querySelector(".auth-banner-text")?.textContent).toContain("Select a larger area");

    ui.unmount();
  });

  it("clears clipboard only when it matches latest copied code", async () => {
    const harness = createBridgeHarness();
    let clipboardValue = "";
    const writeText = vi.fn(async (value: string) => {
      clipboardValue = value;
    });
    const readText = vi.fn(async () => clipboardValue);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, readText },
    });

    const ui = mount(harness.bridge);
    await flush();

    click(ui.host.querySelector('button[aria-label^="Copy code for "]'));
    await flush();

    click(ui.host.querySelector('button[aria-label="Menu"]'));
    click(findButtonByText(document.body, "Clear Clipboard"));
    await flush();

    expect(harness.clearClipboard).toHaveBeenNthCalledWith(1, "654321");
    const firstClearTitles = Array.from(document.body.querySelectorAll(".auth-banner-title")).map((node) => node.textContent ?? "");
    expect(firstClearTitles.some((text) => text.includes("Clipboard cleared"))).toBe(true);

    click(ui.host.querySelector('button[aria-label^="Copy code for "]'));
    await flush();
    harness.clearClipboard.mockResolvedValueOnce(false);
    clipboardValue = "external-note";

    click(ui.host.querySelector('button[aria-label="Menu"]'));
    click(findButtonByText(document.body, "Clear Clipboard"));
    await flush();

    expect(harness.clearClipboard).toHaveBeenNthCalledWith(2, "654321");
    const secondClearTitles = Array.from(document.body.querySelectorAll(".auth-banner-title")).map((node) => node.textContent ?? "");
    expect(secondClearTitles.some((text) => text.includes("Clipboard changed. Nothing cleared."))).toBe(true);

    ui.unmount();
  });

  it("supports manual clipboard clear when clipboard safety is disabled", async () => {
    const harness = createBridgeHarness({ clipboardSafetyEnabled: false });
    let clipboardValue = "";
    const writeText = vi.fn(async (value: string) => {
      clipboardValue = value;
    });
    const readText = vi.fn(async () => clipboardValue);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, readText },
    });

    const ui = mount(harness.bridge);
    await flush();

    click(ui.host.querySelector('button[aria-label^="Copy code for "]'));
    await flush();

    const copyToastText = document.body.querySelector(".auth-banner-text")?.textContent ?? "";
    expect(copyToastText).toContain("Copied to clipboard.");
    expect(copyToastText).not.toContain("Clears in");

    click(ui.host.querySelector('button[aria-label="Menu"]'));
    click(findButtonByText(document.body, "Clear Clipboard"));
    await flush();

    expect(harness.clearClipboard).toHaveBeenCalledWith("654321");

    ui.unmount();
  });

  it("auto-clears clipboard after 30 seconds when safety is enabled", async () => {
    const harness = createBridgeHarness({ clipboardSafetyEnabled: true });
    let clipboardValue = "";
    const writeText = vi.fn(async (value: string) => {
      clipboardValue = value;
    });
    const readText = vi.fn(async () => clipboardValue);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, readText },
    });

    const nativeSetTimeout = window.setTimeout.bind(window);
    vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      const nextDelay = typeof timeout === "number" && timeout >= 30_000 ? 0 : timeout;
      return nativeSetTimeout(handler, nextDelay as number | undefined, ...(args as []));
    }) as typeof window.setTimeout);

    const ui = mount(harness.bridge);
    await flush();

    click(ui.host.querySelector('button[aria-label^="Copy code for "]'));
    await flush();
    await flush();

    expect(harness.clearClipboard).toHaveBeenCalledWith("654321");

    ui.unmount();
  });

  it("locks app from quick action menu", async () => {
    const harness = createBridgeHarness();
    const ui = mount(harness.bridge);
    await flush();

    click(ui.host.querySelector('button[aria-label="Menu"]'));
    click(findButtonByText(document.body, "Lock app"));
    await flush();

    expect(harness.lockFn).toHaveBeenCalledTimes(1);
    expect(ui.host.querySelector(".auth-lock-shell")).toBeTruthy();

    ui.unmount();
  });
});
