import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountMeta, CodeResult } from "@authenticator/core";
import { AccountRow } from "../components/AccountRow";
import "../ui.css";

function createAccount(): AccountMeta {
  return {
    id: "acc-1",
    issuer: "GitHub",
    label: "user@example.com",
    digits: 6,
    period: 30,
  };
}

function createCodeResult(): CodeResult {
  return {
    id: "acc-1",
    code: "123456",
    remainingSeconds: 20,
  };
}

function mountRow(account: AccountMeta, codeResult: CodeResult) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);

  act(() => {
    root.render(
      React.createElement(AccountRow, {
        account,
        codeResult,
        onEdit: () => undefined,
        onDelete: () => undefined,
      })
    );
  });

  return {
    host,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("AccountRow clipboard clear", () => {
  it("swaps copy button icon and label briefly on success", async () => {
    vi.useFakeTimers();
    const account = createAccount();
    const codeResult = createCodeResult();

    let clipboardValue = "";
    const writeText = vi.fn(async (value: string) => {
      clipboardValue = value;
    });
    const readText = vi.fn(async () => clipboardValue);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, readText },
    });

    const ui = mountRow(account, codeResult);
    const copyButton = ui.host.querySelector(".account-copy-btn") as HTMLButtonElement;
    expect(copyButton).toBeTruthy();

    act(() => {
      copyButton.click();
    });
    await flush();

    expect(copyButton.className).toContain("is-copied");
    expect(copyButton.textContent ?? "").toContain("Copied");
    expect(copyButton.querySelector(".lucide-check")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    await flush();

    expect(copyButton.className).not.toContain("is-copied");
    expect(copyButton.textContent ?? "").toContain("Copy");
    expect(copyButton.querySelector(".lucide-copy")).toBeTruthy();

    ui.unmount();
  });

  it("clears clipboard after 30 seconds when unchanged", async () => {
    vi.useFakeTimers();
    const account = createAccount();
    const codeResult = createCodeResult();

    let clipboardValue = "";
    const writeText = vi.fn(async (value: string) => {
      clipboardValue = value;
    });
    const readText = vi.fn(async () => clipboardValue);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, readText },
    });

    const ui = mountRow(account, codeResult);
    const copyButton = ui.host.querySelector(".account-copy-btn") as HTMLButtonElement;
    expect(copyButton).toBeTruthy();

    act(() => {
      copyButton.click();
    });
    await flush();

    expect(clipboardValue).toBe("123456");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await flush();

    expect(readText).toHaveBeenCalled();
    expect(clipboardValue).toBe("");
    expect(writeText).toHaveBeenCalledWith("");

    ui.unmount();
  });

  it("does not clear clipboard after 30 seconds when content changed", async () => {
    vi.useFakeTimers();
    const account = createAccount();
    const codeResult = createCodeResult();

    let clipboardValue = "";
    const writeText = vi.fn(async (value: string) => {
      clipboardValue = value;
    });
    const readText = vi.fn(async () => clipboardValue);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, readText },
    });

    const ui = mountRow(account, codeResult);
    const copyButton = ui.host.querySelector(".account-copy-btn") as HTMLButtonElement;
    expect(copyButton).toBeTruthy();

    act(() => {
      copyButton.click();
    });
    await flush();
    expect(clipboardValue).toBe("123456");

    clipboardValue = "user-notes";

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await flush();

    expect(readText).toHaveBeenCalled();
    expect(clipboardValue).toBe("user-notes");
    expect(writeText).not.toHaveBeenCalledWith("");

    ui.unmount();
  });

  it("renders transform-based TOTP progress track and fill", async () => {
    const account = createAccount();
    const codeResult = createCodeResult();

    const ui = mountRow(account, codeResult);
    await flush();

    const track = ui.host.querySelector(".totp-progress-track") as HTMLElement;
    const fill = ui.host.querySelector(".totp-fill") as HTMLElement;

    expect(track).toBeTruthy();
    expect(track.getAttribute("role")).toBe("progressbar");
    expect(fill).toBeTruthy();

    const fillStyle = fill.getAttribute("style") ?? "";
    expect(fillStyle).toMatch(/--totp-progress-scale\s*:\s*(?:0(?:\.\d+)?|1(?:\.0+)?)/i);
    expect(fillStyle).not.toMatch(/--totp-progress-width/i);

    ui.unmount();
  });
});
