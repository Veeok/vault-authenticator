import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountMeta } from "@authenticator/core";
import { App } from "./App";
import { DEFAULT_SETTINGS, type AppSettings, type Bridge, type LockApi } from "./bridge";

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

type BridgeHarness = {
  bridge: Bridge;
  getSettings: ReturnType<typeof vi.fn>;
  updateSettings: ReturnType<typeof vi.fn>;
  persisted: { current: AppSettings };
};

function createBridge(initialSettings: AppSettings = DEFAULT_SETTINGS): BridgeHarness {
  const persisted = { current: initialSettings };

  const getSettings = vi.fn(async () => persisted.current);
  const updateSettings = vi.fn(async (next: AppSettings) => {
    persisted.current = next;
    return next;
  });

  const placeholderAccount: AccountMeta = {
    id: "placeholder",
    issuer: "",
    label: "Account",
    digits: 6,
    period: 30,
  };

  const bridge: Bridge = {
    lockAPI: createLockApi(),
    getSettings,
    updateSettings,
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

  return {
    bridge,
    getSettings,
    updateSettings,
    persisted,
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function click(element: Element | null): void {
  if (!(element instanceof HTMLElement)) {
    throw new Error("Expected clickable element to exist.");
  }

  act(() => {
    element.click();
  });
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const found = buttons.find((button) => {
    const content = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return content === text || content.includes(text);
  });
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Expected to find button with text \"${text}\".`);
  }
  return found;
}

function ensureSettingsOpen(container: HTMLElement): void {
  const modeTrigger = container.querySelector('button[aria-label="Mode"]');
  if (modeTrigger) {
    return;
  }

  const directSettingsButton = container.querySelector('button[aria-label="Open settings"]');
  if (directSettingsButton) {
    click(directSettingsButton);
    return;
  }

  click(container.querySelector('button[aria-label="Menu"]'));
  click(findButtonByText(document.body, "Settings"));
}

function selectedModeLabel(container: HTMLElement): string {
  const trigger = container.querySelector('button[aria-label="Mode"]');
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error("Mode select trigger not found.");
  }
  return trigger.textContent?.trim() ?? "";
}

function selectedThemeColorLabel(container: HTMLElement): string {
  const trigger = container.querySelector('button[aria-label="Theme color"]');
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error("Theme color select trigger not found.");
  }
  return trigger.textContent?.trim() ?? "";
}

function selectedAccentOverrideLabel(container: HTMLElement): string {
  const trigger = container.querySelector('button[aria-label="Accent override"]');
  if (!(trigger instanceof HTMLButtonElement)) {
    throw new Error("Accent override select trigger not found.");
  }
  return trigger.textContent?.trim() ?? "";
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

describe("App theme settings", () => {
  it("selects Dark base theme and does not fall back to green", async () => {
    const harness = createBridge({ ...DEFAULT_SETTINGS, baseMode: "light", themeColor: "neutral", accentOverride: "none" });
    const ui = mount(harness.bridge);

    await flush();
    ensureSettingsOpen(ui.host);
    await flush();

    click(ui.host.querySelector('button[aria-label="Mode"]'));
    const options = Array.from(document.body.querySelectorAll(".auth-select-option")).map((button) => button.textContent?.trim());
    expect(options).toEqual(["Light", "Dark", "Amoled"]);

    click(findButtonByText(document.body, "Dark"));
    await flush();

    expect(harness.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ baseMode: "dark", themeColor: "neutral", accentOverride: "none" })
    );
    const rootClass = ui.host.querySelector(".auth-root")?.className ?? "";
    expect(rootClass).toContain("theme-dark");
    expect(rootClass).toContain("accent-none");
    expect(rootClass).not.toContain("accent-green");
    expect(selectedModeLabel(ui.host)).toContain("Dark");

    act(() => {
      ui.root.render(<App bridge={harness.bridge} />);
    });
    await flush();

    ensureSettingsOpen(ui.host);
    expect(selectedModeLabel(ui.host)).toContain("Dark");

    ui.unmount();
  });

  it("disables accent and forces none in amoled mode", async () => {
    const harness = createBridge({ ...DEFAULT_SETTINGS, baseMode: "dark", themeColor: "neutral", accentOverride: "purple" });
    const ui = mount(harness.bridge);

    await flush();

    ensureSettingsOpen(ui.host);
    await flush();

    expect(selectedAccentOverrideLabel(ui.host)).toContain("Purple");

    click(ui.host.querySelector('button[aria-label="Mode"]'));
    click(findButtonByText(document.body, "Amoled"));
    await flush();

    expect(harness.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ baseMode: "amoled", themeColor: "neutral", accentOverride: "none" })
    );
    expect(selectedModeLabel(ui.host)).toContain("Amoled");
    expect(selectedAccentOverrideLabel(ui.host)).toContain("None");

    const accentTrigger = ui.host.querySelector('button[aria-label="Accent override"]') as HTMLButtonElement | null;
    expect(accentTrigger?.disabled).toBe(true);
    expect(ui.host.textContent).toContain("Accent overrides are disabled in Amoled mode.");

    const rootClass = ui.host.querySelector(".auth-root")?.className ?? "";
    expect(rootClass).toContain("theme-amoled");
    expect(rootClass).toContain("accent-none");

    ui.unmount();
  });

  it("offers the expanded theme color palette and persists new theme colors", async () => {
    const harness = createBridge({ ...DEFAULT_SETTINGS, baseMode: "dark", themeColor: "neutral", accentOverride: "none" });
    const ui = mount(harness.bridge);

    await flush();
    ensureSettingsOpen(ui.host);
    await flush();

    click(ui.host.querySelector('button[aria-label="Theme color"]'));
    const options = Array.from(document.body.querySelectorAll(".auth-select-option")).map((button) => button.textContent?.trim());
    expect(options).toEqual([
      "Neutral",
      "Gray",
      "Slate",
      "Black",
      "White",
      "Light Gray",
      "Red",
      "Rose",
      "Pink",
      "Orange",
      "Amber",
      "Yellow",
      "Lime",
      "Green",
      "Emerald",
      "Teal",
      "Cyan",
      "Light Blue",
      "Sky",
      "Blue",
      "Indigo",
      "Violet",
      "Purple",
    ]);

    click(findButtonByText(document.body, "Pink"));
    await flush();

    expect(harness.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ themeColor: "pink" })
    );
    expect(selectedThemeColorLabel(ui.host)).toContain("Pink");

    const rootClass = ui.host.querySelector(".auth-root")?.className ?? "";
    expect(rootClass).toContain("theme-color-pink");

    ui.unmount();
  });

  it("toggles settings categories list with the collapse arrow", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 520, configurable: true, writable: true });
    let ui: { unmount: () => void; host: HTMLElement } | null = null;

    try {
      const harness = createBridge({ ...DEFAULT_SETTINGS });
      ui = mount(harness.bridge);

      await flush();
      ensureSettingsOpen(ui.host);
      await flush();

      const categoryToggle = ui.host.querySelector('button[aria-label="Toggle settings categories"]');
      const categoryList = ui.host.querySelector("#settings-category-list");
      expect(categoryToggle).toBeInstanceOf(HTMLButtonElement);
      expect(categoryToggle?.getAttribute("aria-expanded")).toBe("false");
      expect(categoryList?.className).not.toContain("is-open");

      click(categoryToggle);
      expect(categoryToggle?.getAttribute("aria-expanded")).toBe("true");
      expect(categoryList?.className).toContain("is-open");

      click(findButtonByText(ui.host, "Security"));
      await flush();

      expect(categoryToggle?.getAttribute("aria-expanded")).toBe("false");
      expect(ui.host.querySelector('[data-settings-category="security"]')).toBeTruthy();
    } finally {
      ui?.unmount();
      Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true, writable: true });
    }
  });
});
