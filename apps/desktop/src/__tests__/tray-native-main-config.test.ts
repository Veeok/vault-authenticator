import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(path.resolve(__dirname, "../main.ts"), "utf8");

describe("tray main-process configuration", () => {
  it("uses native-only tray menu runtime", () => {
    expect(mainSource).toContain("showNativeTrayMenu");
    expect(mainSource).not.toContain("toggleThemedTrayMenu");
    expect(mainSource).not.toContain("openTrayMenuForMode");
    expect(mainSource).not.toContain("tray:stateChanged");
    expect(mainSource).not.toContain("trayMenuWindow");
  });

  it("uses native tray context menu popup", () => {
    expect(mainSource).toContain("tray.popUpContextMenu()");
    expect(mainSource).toContain("tray.setContextMenu(menu)");
  });

  it("enforces single-instance lock and tray singleton guard", () => {
    expect(mainSource).toContain("acquireSingleInstanceLock(app");
    expect(mainSource).toContain("if (tray) {");
    expect(mainSource).toContain("return;");
  });

  it("reapplies tray icon state when settings change", () => {
    expect(mainSource).toContain("function applyRuntimeSettings(settings: AppSettings): void {");
    expect(mainSource).toContain("updateTrayIcon(settings);");
    expect(mainSource).toContain("setSettingsAppliedListener((settings) => {");
    expect(mainSource).toContain("applyRuntimeSettings(settings);");
  });
});
