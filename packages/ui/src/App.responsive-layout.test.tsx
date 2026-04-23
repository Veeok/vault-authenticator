import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountMeta } from "@authenticator/core";
import { App } from "./App";
import { DEFAULT_SETTINGS, type AppSettings, type Bridge, type LockApi } from "./bridge";

function createLockApi(lockFn: ReturnType<typeof vi.fn>): LockApi {
  return {
    getMethod: async () => "none",
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

type BridgeHarness = {
  bridge: Bridge;
  accountsRef: { current: AccountMeta[] };
};

function createBridge(seedAccounts: AccountMeta[], settingsOverrides?: Partial<AppSettings>): BridgeHarness {
  const lockFn = vi.fn(async () => {});
  const accountsRef = { current: [...seedAccounts] };
  const settings: AppSettings = { ...DEFAULT_SETTINGS, ...settingsOverrides };

  const bridge: Bridge = {
    lockAPI: createLockApi(lockFn),
    getSettings: async () => settings,
    updateSettings: async (next) => ({ ...settings, ...next }),
    exportBackup: async () => false,
    importBackup: async () => false,
    list: async () => [...accountsRef.current],
    getAccountForEdit: async (id) => {
      const account = accountsRef.current.find((entry) => entry.id === id) ?? accountsRef.current[0];
      const digits = account?.digits === 8 ? 8 : 6;
      return {
        id,
        issuer: account?.issuer ?? "",
        label: account?.label ?? "Account",
        digits,
        period: account?.period ?? 30,
        algorithm: "SHA1",
      };
    },
    updateAccount: async (id, payload) => {
      const index = accountsRef.current.findIndex((entry) => entry.id === id);
      if (index >= 0) {
        const current = accountsRef.current[index];
        accountsRef.current[index] = {
          ...current,
          issuer: payload.issuer ?? current.issuer,
          label: payload.label ?? current.label,
          digits: payload.digits ?? current.digits,
          period: payload.period ?? current.period,
        };
      }
      return accountsRef.current[index] ?? accountsRef.current[0];
    },
    addUri: async () => seedAccounts[0],
    addManual: async () => seedAccounts[0],
    del: async (id) => {
      accountsRef.current = accountsRef.current.filter((entry) => entry.id !== id);
      return true;
    },
    codes: async () =>
      accountsRef.current.map((account, index) => ({
        id: account.id,
        code: `${(123456 + index).toString().padStart(6, "0")}`,
        remainingSeconds: 20,
      })),
  };

  return { bridge, accountsRef };
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: height });
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

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function clamp(min: number, value: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function estimateShellWidth(viewportWidth: number): number {
  const widthRule = Math.min(viewportWidth * 0.92, 1200);
  const maxWidthRule = clamp(720, viewportWidth * 0.82, 1200);
  return Math.min(widthRule, maxWidthRule);
}

function estimateCardPadding(viewportWidth: number): number {
  if (viewportWidth <= 560) return 16;
  if (viewportWidth <= 860) return 20;
  return 24;
}

function estimateColumns(viewportWidth: number): number {
  if (viewportWidth < 720) return 1;
  if (viewportWidth < 1320) return 2;
  return 3;
}

function estimateRowWidth(viewportWidth: number): number {
  const shellWidth = estimateShellWidth(viewportWidth);
  const cardInnerWidth = shellWidth - estimateCardPadding(viewportWidth) * 2;
  const columns = estimateColumns(viewportWidth);
  const listGap = 14;
  return (cardInnerWidth - (columns - 1) * listGap) / columns;
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

describe("App responsive layout", () => {
  it("keeps stable list/grid classes and columns across small, medium, and large windows", async () => {
    const baseAccounts: AccountMeta[] = [
      { id: "acc-1", issuer: "GitHub", label: "dev@example.com", digits: 6, period: 30 },
      { id: "acc-2", issuer: "Cloudflare", label: "infra@example.com", digits: 6, period: 30 },
      { id: "acc-3", issuer: "Microsoft", label: "ops@example.com", digits: 6, period: 30 },
    ];

    const checkpoints = [
      { size: "small", width: 480, height: 800, expectedClass: "auth-list-list", expectedColumns: "1" },
      { size: "medium", width: 900, height: 700, expectedClass: "auth-list-grid", expectedColumns: "2" },
      { size: "large", width: 1400, height: 900, expectedClass: "auth-list-grid", expectedColumns: "3" },
    ];

    const snapshot: Array<{ size: string; listClass: string; columns: string }> = [];

    for (const checkpoint of checkpoints) {
      setViewport(checkpoint.width, checkpoint.height);
      const harness = createBridge(baseAccounts, { accountsLayoutMode: "auto", accountsGridColumns: "auto" });
      const ui = mount(harness.bridge);
      await flush();

      const list = ui.host.querySelector(".auth-list");
      if (!(list instanceof HTMLElement)) {
        throw new Error("Expected account list to be rendered.");
      }

      const listClass = list.className.replace(/\bis-layout-switching\b/g, "").replace(/\s+/g, " ").trim();
      const columns = list.style.getPropertyValue("--auth-grid-columns").trim();

      expect(listClass).toContain(checkpoint.expectedClass);
      expect(columns).toBe(checkpoint.expectedColumns);

      snapshot.push({ size: checkpoint.size, listClass, columns });
      ui.unmount();
    }

    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "columns": "1",
          "listClass": "auth-list auth-list-list auth-density-comfortable",
          "size": "small",
        },
        {
          "columns": "2",
          "listClass": "auth-list auth-list-grid auth-density-comfortable",
          "size": "medium",
        },
        {
          "columns": "3",
          "listClass": "auth-list auth-list-grid auth-density-comfortable",
          "size": "large",
        },
      ]
    `);
  });

  it("keeps full text available via tooltip metadata on long account names", async () => {
    setViewport(1400, 900);
    const issuer = "SMSF-IdentityProvider-WithAVeryLongNameAndNoSpacesAtAll_ABCDEFGHIJKLMN";
    const label = "veok+very.long.alias.with.many.parts_and-separators@example-enterprise-domain.internal";

    const harness = createBridge([
      {
        id: "acc-long",
        issuer,
        label,
        digits: 6,
        period: 30,
      },
    ]);

    const ui = mount(harness.bridge);
    await flush();

    const main = ui.host.querySelector(".account-main");
    const issuerLine = ui.host.querySelector(".account-issuer");
    const labelLine = ui.host.querySelector(".account-label");

    expect(main).toBeTruthy();
    expect(main?.getAttribute("title")).toBe(`${issuer} — ${label}`);
    expect(main?.getAttribute("tabindex")).toBe("0");
    expect(issuerLine?.getAttribute("title")).toBe(issuer);
    expect(labelLine?.getAttribute("title")).toBe(label);

    ui.unmount();
  });

  it("hides extra account text only on small screens when compact labels are enabled", async () => {
    const account: AccountMeta = {
      id: "acc-1",
      issuer: "GitHub",
      label: "dev@example.com",
      digits: 6,
      period: 30,
    };

    setViewport(390, 800);
    const compactHarness = createBridge([account], { hideLabelsOnSmall: true });
    const compactUi = mount(compactHarness.bridge);
    await flush();

    expect(compactUi.host.querySelector(".account-issuer")?.textContent).toContain("GitHub");
    expect(compactUi.host.querySelector(".account-label")).toBeNull();
    expect(compactUi.host.querySelector(".account-code-copy-hint")).toBeNull();

    compactUi.unmount();

    setViewport(390, 800);
    const defaultHarness = createBridge([account], { hideLabelsOnSmall: false });
    const defaultUi = mount(defaultHarness.bridge);
    await flush();

    expect(defaultUi.host.querySelector(".account-label")?.textContent).toContain("dev@example.com");
    expect(defaultUi.host.querySelector(".account-code-copy-hint")?.textContent).toContain("Copy");

    defaultUi.unmount();
  });

  it("renders a dedicated toast host outside the main card and stacks messages", async () => {
    setViewport(1400, 900);
    const harness = createBridge([
      { id: "acc-1", issuer: "GitHub", label: "dev@example.com", digits: 6, period: 30 },
      { id: "acc-2", issuer: "GitLab", label: "dev@example.com", digits: 6, period: 30 },
    ]);

    const ui = mount(harness.bridge);
    await flush();

    click(ui.host.querySelector('button[aria-label^="Delete "]'));
    await flush();
    click(findButtonByText(ui.host, "Delete Account"));
    await flush();

    click(ui.host.querySelector('button[aria-label="Menu"]'));
    click(findButtonByText(document.body, "Lock app"));
    await flush();

    const toastHost = ui.host.querySelector(".auth-toast-host");
    const card = ui.host.querySelector(".auth-card");

    expect(toastHost).toBeTruthy();
    expect(card?.contains(toastHost as Node)).toBe(false);
    expect(ui.host.querySelectorAll(".auth-toast-host .auth-banner").length).toBeGreaterThanOrEqual(2);

    ui.unmount();
  });

  it("renders menu panel outside card for empty and single-account states", async () => {
    setViewport(900, 700);

    const scenarios: Array<{ id: string; accounts: AccountMeta[] }> = [
      { id: "empty", accounts: [] },
      { id: "single", accounts: [{ id: "acc-1", issuer: "GitHub", label: "dev@example.com", digits: 6, period: 30 }] },
    ];

    for (const scenario of scenarios) {
      const harness = createBridge(scenario.accounts);
      const ui = mount(harness.bridge);
      await flush();

      click(ui.host.querySelector('button[aria-label="Menu"]'));
      await flush();

      const menu = document.body.querySelector('[role="menu"]');
      const card = ui.host.querySelector(".auth-card");
      expect(menu).toBeTruthy();
      expect(card?.contains(menu as Node)).toBe(false);

      ui.unmount();
      document.body.querySelectorAll('[role="menu"]').forEach((node) => node.remove());
    }
  });

  it("uses toast host copy feedback and does not render in-card copy bubble", async () => {
    setViewport(900, 700);
    let clipboardValue = "";
    const writeText = vi.fn(async (value: string) => {
      clipboardValue = value;
    });
    const readText = vi.fn(async () => clipboardValue);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, readText },
    });

    const harness = createBridge([{ id: "acc-1", issuer: "GitHub", label: "dev@example.com", digits: 6, period: 30 }]);
    const ui = mount(harness.bridge);
    await flush();

    click(ui.host.querySelector('button[aria-label^="Copy code for "]'));
    await flush();

    expect(writeText).toHaveBeenCalledWith("123456");
    expect(ui.host.querySelector(".account-copy-indicator")).toBeNull();
    expect(ui.host.querySelector(".account-clipboard-countdown")).toBeNull();

    const toastTitle = ui.host.querySelector(".auth-toast-host .auth-banner-title");
    const toastText = ui.host.querySelector(".auth-toast-host .auth-banner-text");
    expect(toastTitle?.textContent).toContain("Copied");
    expect(toastText?.textContent).toContain("Clears in");

    ui.unmount();
  });

  it("renders pill and action controls at 480x800, 900x700, and 1400x900", async () => {
    const checkpoints = [
      { width: 480, height: 800 },
      { width: 900, height: 700 },
      { width: 1400, height: 900 },
    ];

    for (const checkpoint of checkpoints) {
      setViewport(checkpoint.width, checkpoint.height);
      const harness = createBridge([{ id: "acc-1", issuer: "GitHub", label: "dev@example.com", digits: 6, period: 30 }]);
      const ui = mount(harness.bridge);
      await flush();

      const row = ui.host.querySelector(".account-row");
      const rowLayout = ui.host.querySelector(".account-row-layout");
      const pill = ui.host.querySelector(".account-code-wrap");
      const actions = ui.host.querySelector(".account-actions-inline");
      const copyButton = ui.host.querySelector(".account-copy-btn");
      const editButton = ui.host.querySelector(".account-edit-btn");
      const deleteButton = ui.host.querySelector(".account-delete");

      expect(row).toBeTruthy();
      expect(rowLayout).toBeTruthy();
      expect(pill).toBeTruthy();
      expect(actions).toBeTruthy();
      expect(copyButton).toBeTruthy();
      expect(editButton).toBeTruthy();
      expect(deleteButton).toBeTruthy();

      ui.unmount();
    }
  });

  it("uses a dedicated list scroll container for small and large viewport account counts", async () => {
    const buildAccounts = (count: number): AccountMeta[] =>
      Array.from({ length: count }, (_, index) => ({
        id: `acc-${index + 1}`,
        issuer: `Issuer ${index + 1}`,
        label: `user${index + 1}@example.com`,
        digits: 6,
        period: 30,
      }));

    const scenarios = [
      { width: 480, height: 800, accounts: 10, shouldOverflow: true },
      { width: 1920, height: 1080, accounts: 2, shouldOverflow: false },
      { width: 1920, height: 1080, accounts: 8, shouldOverflow: true },
    ];

    for (const scenario of scenarios) {
      setViewport(scenario.width, scenario.height);
      const harness = createBridge(buildAccounts(scenario.accounts), { accountsLayoutMode: "auto", accountsGridColumns: "auto" });
      const ui = mount(harness.bridge);
      await flush();

      const scroller = ui.host.querySelector(".account-list-container") as HTMLElement;
      expect(scroller).toBeTruthy();
      expect(ui.host.querySelectorAll(".account-row").length).toBe(scenario.accounts);

      const estimatedClientHeight = scenario.height < 900 ? 360 : 700;
      const estimatedRowHeight = 96;
      Object.defineProperty(scroller, "clientHeight", { configurable: true, value: estimatedClientHeight });
      Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: scenario.accounts * estimatedRowHeight });

      if (scenario.shouldOverflow) {
        expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
      } else {
        expect(scroller.scrollHeight).toBeLessThanOrEqual(scroller.clientHeight);
      }

      ui.unmount();
    }
  });

  it("keeps estimated pill/actions DOMRects non-overlapping at target sizes", () => {
    const checkpoints = [480, 900, 1400];
    const actionsWidth = 34 * 3 + 6 * 2;
    const columnGap = 12;
    const fallbackThreshold = 560;
    const pillMin = 200;
    const pillMax = 360;

    for (const viewportWidth of checkpoints) {
      const rowWidth = estimateRowWidth(viewportWidth);
      const usesFallback = rowWidth <= fallbackThreshold;
      const pillWidth = Math.min(pillMax, Math.max(pillMin, rowWidth * 0.26));

      const actionsRect = new DOMRect(rowWidth - actionsWidth, 0, actionsWidth, 32);
      const pillRect = usesFallback
        ? new DOMRect(0, 42, rowWidth, 58)
        : new DOMRect(rowWidth - actionsWidth - columnGap - pillWidth, 0, pillWidth, 58);

      expect(actionsRect.width).toBeGreaterThan(0);
      expect(pillRect.width).toBeGreaterThanOrEqual(pillMin);
      expect(rectsOverlap(pillRect, actionsRect)).toBe(false);
    }
  });

  it("keeps account row and toast positioning guards in CSS", () => {
    const cssPath = join(process.cwd(), "src", "ui.css");
    const source = readFileSync(cssPath, "utf8");

    expect(source).toMatch(/--pill-min:\s*200px;/s);
    expect(source).toMatch(/--pill-max:\s*clamp\(260px,\s*26vw,\s*360px\);/s);
    expect(source).toMatch(/--totp-progress-h:\s*5px;/s);
    expect(source).toMatch(/--totp-fill-gradient:\s*linear-gradient\(/s);
    expect(source).toMatch(/html,[\s\S]*body,[\s\S]*#root,[\s\S]*#app\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s);
    expect(source).toMatch(/\.auth-shell\s*\{[^}]*flex:\s*1;[^}]*display:\s*flex;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(source).toMatch(/\.auth-card\s*\{[^}]*display:\s*flex;[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(source).toMatch(/\.auth-add-modal\s*\{[^}]*max-height:\s*min\(88vh,\s*820px\);[^}]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\)\s+auto;/s);
    expect(source).toMatch(/\.auth-add-modal\s+\.auth-modal-panel\s*\{[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s);
    expect(source).toMatch(/\.account-list-container\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*padding-bottom:\s*calc\(52px\s*\+\s*24px\);/s);
    expect(source).toMatch(/@media \(min-height:\s*900px\)\s*\{[\s\S]*--auth-shell-top-gap:/s);
    expect(source).toMatch(/\.account-list-container::-webkit-scrollbar\s*\{[^}]*width:\s*6px;/s);
    expect(source).toMatch(/\.account-row-layout\s*\{[^}]*grid-template-columns:\s*44px\s*minmax\(0,\s*1fr\)\s*minmax\(var\(--pill-min\),\s*var\(--pill-max\)\)\s*auto;[^}]*grid-template-areas:\s*"handle main pill actions";/s);
    expect(source).toMatch(/@container\s+account-row\s*\(max-width:\s*560px\)\s*\{[\s\S]*grid-template-areas:\s*"handle main actions"[\s\S]*"pill pill pill";/s);
    expect(source).toMatch(/\.account-main\s*\{[^}]*min-width:\s*0;/s);
    expect(source).toMatch(/\.account-label\s*\{[^}]*-webkit-line-clamp:\s*2;[^}]*word-break:\s*normal;/s);
    expect(source).toMatch(/\.totp-progress-viewport\s*\{[^}]*width:\s*100%;/s);
    expect(source).toMatch(/\.totp-progress-track\s*\{[^}]*height:\s*var\(--totp-progress-h\);[^}]*overflow:\s*hidden;[^}]*position:\s*relative;/s);
    expect(source).toMatch(/\.totp-fill\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*transform-origin:\s*left\s+center;[^}]*transform:\s*translateZ\(0\)\s+scaleX\(var\(--totp-progress-scale,\s*0\)\);[^}]*transition:\s*transform\s+250ms\s+linear;[^}]*will-change:\s*transform;/s);
    expect(source).toMatch(/\.account-list-container\s*\{[^}]*scrollbar-gutter:\s*stable\s+both-edges;/s);
    expect(source).toMatch(/\.auth-list-list\s+\.account-copy-btn\s*\{[^}]*inline-size:\s*74px;/s);
    expect(source).toMatch(/\.auth-titlebar-btn-pin\.is-active\s+\.auth-titlebar-pin-icon\s*\{[^}]*transform:\s*translateY\(0\);/s);

    const accountRowHoverMatch = source.match(/\.account-row:hover\s*\{([\s\S]*?)\}/);
    expect(accountRowHoverMatch).toBeTruthy();
    const accountRowHoverBlock = accountRowHoverMatch?.[1] ?? "";
    expect(accountRowHoverBlock).not.toMatch(/(?:border-width|padding|margin|width|height)\s*:/i);
    expect(accountRowHoverBlock).not.toMatch(/\btransform\s*:/i);
    expect(accountRowHoverBlock).not.toMatch(/animation-play-state\s*:/i);

    const accountCodeHoverMatch = source.match(/\.account-code:hover\s*\{([\s\S]*?)\}/);
    expect(accountCodeHoverMatch).toBeTruthy();
    const accountCodeHoverBlock = accountCodeHoverMatch?.[1] ?? "";
    expect(accountCodeHoverBlock).not.toMatch(/(?:border-width|padding|margin|width|height)\s*:/i);
    expect(source).toMatch(/\.auth-toast-host\s*\{[^}]*position:\s*fixed;[^}]*right:\s*16px;/s);
    expect(source).toMatch(/:root\[data-motion="reduced"\]\s+\.auth-root\s*\{[^}]*--slide-sm:\s*0px;[^}]*--slide-md:\s*2px;/s);
    expect(source).toMatch(/:root\[data-paused="true"\]\s*\*,[\s\S]*animation-play-state:\s*paused\s*!important;/s);
    expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*:root:not\(\[data-motion\]\)\s+\.auth-root/s);
    expect(source).toMatch(/\.auth-fab-menu-panel\.is-exiting\s*\{[^}]*transform:\s*translateY\(var\(--slide-sm\)\)/s);
    expect(source).not.toMatch(/word-break:\s*break-all/i);
    expect(source).not.toMatch(/overflow-wrap:\s*anywhere/i);
  });
});
