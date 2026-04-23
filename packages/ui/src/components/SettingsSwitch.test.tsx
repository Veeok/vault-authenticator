import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsSwitch } from "./SettingsSwitch";
import "../ui.css";

function mount(checked = false) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const onChange = vi.fn();
  const root: Root = createRoot(host);

  act(() => {
    root.render(<SettingsSwitch label={<span>Start with system</span>} checked={checked} onChange={onChange} ariaLabel="Start with system" />);
  });

  return {
    host,
    onChange,
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

describe("SettingsSwitch", () => {
  it("renders the switch track and thumb inside the control", () => {
    const ui = mount(true);

    const control = ui.host.querySelector(".auth-switch-control");
    const track = ui.host.querySelector(".auth-switch-track");
    const thumb = ui.host.querySelector(".auth-switch-thumb");

    expect(control).toBeTruthy();
    expect(track).toBeTruthy();
    expect(thumb).toBeTruthy();
    expect(control?.contains(track as Node)).toBe(true);
    expect(track?.contains(thumb as Node)).toBe(true);

    ui.unmount();
  });

  it("calls onChange with the next checked state", () => {
    const ui = mount(false);
    const input = ui.host.querySelector('input[type="checkbox"]');

    expect(input).toBeTruthy();

    act(() => {
      (input as HTMLInputElement).click();
    });

    expect(ui.onChange).toHaveBeenCalledWith(true);

    ui.unmount();
  });

  it("keeps the switch guardrails in source to prevent thumb escape during parent motion", () => {
    const switchSource = readFileSync(join(process.cwd(), "src", "components", "SettingsSwitch.tsx"), "utf8");
    const cssSource = readFileSync(join(process.cwd(), "src", "ui.css"), "utf8");

    expect(switchSource).not.toMatch(/<motion\.span\s+layout\s+className="auth-switch-thumb"/);
    expect(cssSource).toMatch(/\.auth-switch-track\s*\{[^}]*overflow:\s*hidden;/s);
  });
});
