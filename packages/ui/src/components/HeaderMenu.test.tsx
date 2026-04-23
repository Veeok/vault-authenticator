import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { HeaderMenu } from "./HeaderMenu";
import "../ui.css";

function click(target: HTMLElement): void {
  act(() => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function keydown(target: HTMLElement, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, writable: true, value: height });
}

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function getButton(container: ParentNode, label: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const match = buttons.find((button) => {
    const aria = button.getAttribute("aria-label");
    if (aria === label) return true;
    const text = (button.textContent ?? "").replace(/\s+/g, " ").trim();
    return text.includes(label);
  });

  if (!match) {
    throw new Error(`Button not found: ${label}`);
  }

  return match as HTMLButtonElement;
}

function getMenu(): HTMLElement | null {
  return document.body.querySelector('[role="menu"]');
}

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const onAddAccount = vi.fn();
  const onOpenCommandPalette = vi.fn();
  const onScanFromScreen = vi.fn();
  const onClearClipboard = vi.fn();
  const onOpenSettings = vi.fn((category: string) => category);
  const onLockApp = vi.fn(async () => {});

  const root: Root = createRoot(host);
  act(() => {
    root.render(
      <HeaderMenu
        onAddAccount={onAddAccount}
        onOpenCommandPalette={onOpenCommandPalette}
        onScanFromScreen={onScanFromScreen}
        onClearClipboard={onClearClipboard}
        onOpenSettings={onOpenSettings}
        onLockApp={onLockApp}
      />
    );
  });

  return {
    host,
    onAddAccount,
    onOpenCommandPalette,
    onScanFromScreen,
    onClearClipboard,
    onOpenSettings,
    onLockApp,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("HeaderMenu", () => {
  it("opens in portal and closes from outside click and escape", () => {
    vi.useFakeTimers();
    const ui = mount();

    try {
      const trigger = getButton(ui.host, "Menu");
      expect(getMenu()).toBeNull();

      click(trigger);
      const menu = getMenu();
      expect(menu).toBeTruthy();
      expect(ui.host.contains(menu as Node)).toBe(false);

      act(() => {
        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(260);
      });
      expect(getMenu()).toBeNull();

      click(trigger);
      const keyboardMenu = getMenu() as HTMLElement;
      expect(keyboardMenu).toBeTruthy();
      keydown(keyboardMenu, "Escape");
      act(() => {
        vi.advanceTimersByTime(260);
      });
      expect(getMenu()).toBeNull();
    } finally {
      ui.unmount();
    }
  });

  it("keeps menu panel placement inside viewport across common window sizes", () => {
    vi.useFakeTimers();
    const ui = mount();
    const trigger = getButton(ui.host, "Menu");

    const scenarios = [
      { width: 480, height: 800 },
      { width: 900, height: 700 },
      { width: 1400, height: 900 },
    ];

    const panelWidth = 276;
    const panelHeight = 340;
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");

    try {
      for (const scenario of scenarios) {
        setViewport(scenario.width, scenario.height);

        rectSpy.mockImplementation(function mockRect(this: HTMLElement) {
          if (this.classList.contains("auth-fab-trigger")) {
            return createRect(scenario.width - 64, scenario.height - 64, 52, 52);
          }

          if (this.classList.contains("auth-fab-menu-panel")) {
            const left = Number.parseFloat(this.style.left || "12");
            const top = Number.parseFloat(this.style.top || "12");
            return createRect(left, top, panelWidth, panelHeight);
          }

          return createRect(0, 0, 0, 0);
        });

        click(trigger);
        act(() => {
          vi.advanceTimersByTime(32);
        });

        const menu = getMenu() as HTMLElement;
        expect(menu).toBeTruthy();

        const left = Number.parseFloat(menu.style.left || "0");
        const top = Number.parseFloat(menu.style.top || "0");
        const effectiveHeight = Math.min(panelHeight, scenario.height - 24);

        expect(left).toBeGreaterThanOrEqual(12);
        expect(top).toBeGreaterThanOrEqual(12);
        expect(left + panelWidth).toBeLessThanOrEqual(scenario.width - 12);
        expect(top + effectiveHeight).toBeLessThanOrEqual(scenario.height - 12);

        keydown(menu, "Escape");
        act(() => {
          vi.advanceTimersByTime(260);
        });
        expect(getMenu()).toBeNull();
      }
    } finally {
      rectSpy.mockRestore();
      ui.unmount();
    }
  });

  it("renders grouped sections and runs actions", () => {
    vi.useFakeTimers();
    const ui = mount();
    const trigger = getButton(ui.host, "Menu");

    click(trigger);
    const menu = getMenu() as HTMLElement;
    expect(menu.textContent).toContain("Quick actions");
    expect(menu.textContent).toContain("Settings");
    expect(menu.textContent).toContain("Ctrl+K Search");

    click(getButton(document.body, "Ctrl+K Search"));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(ui.onOpenCommandPalette).toHaveBeenCalledTimes(1);

    click(trigger);
    click(getButton(document.body, "Scan QR from Screen"));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(ui.onScanFromScreen).toHaveBeenCalledTimes(1);

    click(trigger);
    click(getButton(document.body, "Add account"));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(ui.onAddAccount).toHaveBeenCalledTimes(1);

    click(trigger);
    click(getButton(document.body, "Clear Clipboard"));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(ui.onClearClipboard).toHaveBeenCalledTimes(1);

    click(trigger);
    click(getButton(document.body, "Settings"));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(ui.onOpenSettings).toHaveBeenCalledWith("appearance");

    click(trigger);
    click(getButton(document.body, "Lock app"));
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(ui.onLockApp).toHaveBeenCalledTimes(1);

    ui.unmount();
  });
});
