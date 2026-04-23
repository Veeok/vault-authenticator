import * as React from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import type { Bridge } from "../bridge";
import { AddModal } from "./AddModal";
import "../ui.css";

function click(target: Element | null): void {
  if (!(target instanceof HTMLElement)) {
    throw new Error("Expected clickable element.");
  }
  act(() => {
    target.click();
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
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

function mount(bridge: Bridge, onAddUri: ReturnType<typeof vi.fn>, onScanFeedback?: ReturnType<typeof vi.fn>) {
  const host = document.createElement("div");
  document.body.appendChild(host);

  const onClose = vi.fn();
  const onAddManual = vi.fn(async () => {});
  const root: Root = createRoot(host);

  act(() => {
    root.render(
      <AddModal
        bridge={bridge}
        theme="dark"
        defaultDigits={6}
        defaultPeriod={30}
        onAddUri={onAddUri}
        onAddManual={onAddManual}
        onScanFeedback={onScanFeedback}
        onClose={onClose}
      />
    );
  });

  return {
    host,
    onClose,
    onAddManual,
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

describe("AddModal screen scan flow", () => {
  it("shows inline failure in scan overlay and allows retry", async () => {
    const scanFromScreen = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce({ code: "E_SCAN_NO_QR", message: "No QR code found in the selected area." })
      .mockResolvedValueOnce(null);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => false);

    const bridge = {
      scanFromScreen,
      scanQr: undefined,
    } as unknown as Bridge;

    const onAddUri = vi.fn(async () => {});
    const ui = mount(bridge, onAddUri);
    expect(ui.host.querySelector(".auth-add-modal")).toBeTruthy();

    click(findButtonByText(ui.host, "Scan QR"));
    click(findButtonByText(ui.host, "Scan QR from Screen"));
    await flush();

    click(findButtonByText(ui.host, "Start selection"));
    await flush();

    expect(scanFromScreen).toHaveBeenCalledTimes(1);
    expect(ui.host.textContent).toContain("No QR code found in the selected area.");
    expect(findButtonByText(ui.host, "Try again")).toBeTruthy();

    click(findButtonByText(ui.host, "Try again"));
    await flush();
    expect(scanFromScreen).toHaveBeenCalledTimes(2);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onAddUri).toHaveBeenCalledTimes(0);

    ui.unmount();
  });

  it("sends no-qr scan result to banner feedback callback", async () => {
    const scanFromScreen = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce({ code: "E_SCAN_NO_QR", message: "No QR code found in the selected area." });

    const bridge = {
      scanFromScreen,
      scanQr: undefined,
    } as unknown as Bridge;

    const onAddUri = vi.fn(async () => {});
    const onScanFeedback = vi.fn();
    const ui = mount(bridge, onAddUri, onScanFeedback);

    click(findButtonByText(ui.host, "Scan QR"));
    click(findButtonByText(ui.host, "Scan QR from Screen"));
    await flush();

    click(findButtonByText(ui.host, "Start selection"));
    await flush();

    expect(onScanFeedback).toHaveBeenCalledTimes(1);
    expect(onScanFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "E_SCAN_NO_QR",
        title: "No QR code found",
      })
    );

    ui.unmount();
  });

  it("requires confirmation before adding scanned otpauth account", async () => {
    const scanFromScreen = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValue("otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub");

    const bridge = {
      scanFromScreen,
      scanQr: undefined,
    } as unknown as Bridge;

    const onAddUri = vi.fn(async () => {});
    const ui = mount(bridge, onAddUri);

    click(findButtonByText(ui.host, "Scan QR"));
    click(findButtonByText(ui.host, "Scan QR from Screen"));
    await flush();

    click(findButtonByText(ui.host, "Start selection"));
    await flush();

    expect(ui.host.textContent).toContain("Review scanned account details before adding.");
    expect(ui.host.textContent).toContain("GitHub");
    expect(ui.host.textContent).toContain("user@example.com");

    click(findButtonByText(ui.host, "Add account"));
    await flush();

    expect(onAddUri).toHaveBeenCalledTimes(1);
    expect(ui.onClose).toHaveBeenCalledTimes(1);

    ui.unmount();
  });
});
