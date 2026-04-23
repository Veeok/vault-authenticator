import { BrowserWindow, screen, type Rectangle } from "electron";
import { spawn } from "node:child_process";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { logDesktopDebug } from "./diagnostics";

const MIN_SELECTION_SIZE = 18;
const POWERSHELL_TIMEOUT_MS = 30000;

type CapturedBitmap = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
};

type SelectionResult =
  | { cancelled: true }
  | {
      cancelled: false;
      x: number;
      y: number;
      width: number;
      height: number;
    };

type CaptureScriptResult = {
  pngBase64?: string;
  error?: string;
};

export type ScreenScanResult =
  | { status: "cancelled" }
  | { status: "no_qr" }
  | { status: "decoded"; text: string };

const OVERLAY_HTML = "<!doctype html><html><head><meta charset=\"UTF-8\"></head><body></body></html>";

const OVERLAY_SCRIPT = String.raw`
(() =>
  new Promise((resolve) => {
    const html = document.documentElement;
    const body = document.body;
    html.style.margin = "0";
    html.style.width = "100%";
    html.style.height = "100%";
    body.style.margin = "0";
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.cursor = "crosshair";
    body.style.userSelect = "none";
    body.style.position = "relative";
    body.style.background = "rgba(6, 8, 16, 0.34)";
    body.tabIndex = 0;
    body.focus();

    const hint = document.createElement("div");
    hint.textContent = "Drag to select QR area  |  Esc to cancel";
    hint.style.position = "fixed";
    hint.style.top = "14px";
    hint.style.left = "50%";
    hint.style.transform = "translateX(-50%)";
    hint.style.padding = "8px 12px";
    hint.style.borderRadius = "8px";
    hint.style.background = "rgba(15, 18, 31, 0.86)";
    hint.style.border = "1px solid rgba(150, 164, 203, 0.6)";
    hint.style.color = "#eef2ff";
    hint.style.fontFamily = "Segoe UI, system-ui, sans-serif";
    hint.style.fontSize = "12px";
    hint.style.letterSpacing = "0.02em";
    hint.style.zIndex = "10";

    const box = document.createElement("div");
    box.style.position = "fixed";
    box.style.border = "2px solid rgba(136, 152, 255, 0.95)";
    box.style.background = "rgba(88, 101, 242, 0.2)";
    box.style.boxShadow = "0 0 0 99999px rgba(5, 8, 14, 0.35)";
    box.style.display = "none";
    box.style.pointerEvents = "none";
    box.style.zIndex = "11";

    body.appendChild(hint);
    body.appendChild(box);

    let startX = 0;
    let startY = 0;
    let dragging = false;
    let done = false;

    const cleanup = () => {
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("mouseup", onMouseUp, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("contextmenu", onContextMenu, true);
    };

    const finish = (payload) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(payload);
    };

    const setBox = (x, y, w, h) => {
      box.style.display = "block";
      box.style.left = x + "px";
      box.style.top = y + "px";
      box.style.width = w + "px";
      box.style.height = h + "px";
    };

    const onMouseDown = (event) => {
      if (event.button === 2) {
        event.preventDefault();
        finish({ cancelled: true });
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      setBox(startX, startY, 0, 0);
    };

    const onMouseMove = (event) => {
      if (!dragging) return;
      event.preventDefault();
      const x = Math.min(startX, event.clientX);
      const y = Math.min(startY, event.clientY);
      const width = Math.abs(event.clientX - startX);
      const height = Math.abs(event.clientY - startY);
      setBox(x, y, width, height);
    };

    const onMouseUp = (event) => {
      if (!dragging) return;
      event.preventDefault();
      dragging = false;

      const x = Math.min(startX, event.clientX);
      const y = Math.min(startY, event.clientY);
      const width = Math.abs(event.clientX - startX);
      const height = Math.abs(event.clientY - startY);

      if (width < 4 || height < 4) {
        finish({ cancelled: true });
        return;
      }

      finish({ cancelled: false, x, y, width, height });
    };

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      finish({ cancelled: true });
    };

    const onContextMenu = (event) => {
      event.preventDefault();
      finish({ cancelled: true });
    };

    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mouseup", onMouseUp, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("contextmenu", onContextMenu, true);
  }))()
`;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeRect(rect: Rectangle): Rectangle | null {
  const x = Math.floor(rect.x);
  const y = Math.floor(rect.y);
  const width = Math.floor(rect.width);
  const height = Math.floor(rect.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width < MIN_SELECTION_SIZE || height < MIN_SELECTION_SIZE) return null;
  return { x, y, width, height };
}

function isSelectionArea(value: SelectionResult | null): value is Extract<SelectionResult, { cancelled: false }> {
  return !!value && value.cancelled === false;
}

function getVirtualDesktopBounds(): Rectangle {
  const displays = screen.getAllDisplays();
  const minX = Math.min(...displays.map((display) => display.bounds.x));
  const minY = Math.min(...displays.map((display) => display.bounds.y));
  const maxX = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width));
  const maxY = Math.max(...displays.map((display) => display.bounds.y + display.bounds.height));

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function disposeOverlayWindow(overlay: BrowserWindow): void {
  try {
    overlay.setAlwaysOnTop(false);
  } catch {
    // ignore
  }
  try {
    overlay.setIgnoreMouseEvents(true);
  } catch {
    // ignore
  }
  try {
    overlay.hide();
  } catch {
    // ignore
  }
  try {
    if (!overlay.isDestroyed()) {
      overlay.destroy();
    }
  } catch {
    // ignore
  }
}

async function promptUserForSelection(parentWindow?: BrowserWindow): Promise<Rectangle | null> {
  const displays = screen.getAllDisplays();

  logDesktopDebug("scan prompt start", {
    displayCount: displays.length,
    displays: displays.map((display) => ({
      id: display.id,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
    })),
    virtualBounds: getVirtualDesktopBounds(),
  });

  if (!displays.length) {
    logDesktopDebug("scan prompt no displays available");
    return null;
  }

  const overlays: Array<{ displayId: number; displayBounds: Rectangle; window: BrowserWindow }> = [];

  try {
    for (const display of displays) {
      const overlay = new BrowserWindow({
        parent: parentWindow,
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
        transparent: true,
        frame: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        resizable: false,
        closable: true,
        skipTaskbar: true,
        hasShadow: false,
        focusable: true,
        alwaysOnTop: true,
        fullscreenable: false,
        show: false,
        enableLargerThanScreen: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: false,
        },
      });

      overlay.setAlwaysOnTop(true);
      await overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(OVERLAY_HTML)}`);
      overlay.show();

      overlays.push({
        displayId: display.id,
        displayBounds: display.bounds,
        window: overlay,
      });
    }

    const pointer = screen.getCursorScreenPoint();
    const activeDisplay = screen.getDisplayNearestPoint(pointer);
    const preferred = overlays.find((entry) => entry.displayId === activeDisplay.id) ?? overlays[0];
    preferred.window.focus();

    const firstCompletion = await new Promise<
      { entry: (typeof overlays)[number]; selected: SelectionResult | null; error?: string } | null
    >((resolve) => {
      let settled = false;

      const finish = (value: { entry: (typeof overlays)[number]; selected: SelectionResult | null; error?: string } | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      for (const entry of overlays) {
        entry.window.webContents
          .executeJavaScript(OVERLAY_SCRIPT, true)
          .then((selected) => {
            finish({ entry, selected: selected as SelectionResult | null });
          })
          .catch((error) => {
            finish({
              entry,
              selected: null,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }
    });

    if (!firstCompletion) {
      logDesktopDebug("scan prompt no completion received");
      return null;
    }

    if (firstCompletion.error) {
      logDesktopDebug("scan prompt overlay script error", {
        displayId: firstCompletion.entry.displayId,
        error: firstCompletion.error,
      });
      return null;
    }

    if (!isSelectionArea(firstCompletion.selected)) {
      logDesktopDebug("scan prompt cancelled", {
        displayId: firstCompletion.entry.displayId,
      });
      return null;
    }

    const normalized = normalizeRect({
      x: firstCompletion.entry.displayBounds.x + firstCompletion.selected.x,
      y: firstCompletion.entry.displayBounds.y + firstCompletion.selected.y,
      width: firstCompletion.selected.width,
      height: firstCompletion.selected.height,
    });

    if (!normalized) {
      logDesktopDebug("scan prompt selection rejected", {
        displayId: firstCompletion.entry.displayId,
        selected: firstCompletion.selected,
      });
      return null;
    }

    logDesktopDebug("scan prompt selection captured", {
      displayId: firstCompletion.entry.displayId,
      selected: firstCompletion.selected,
      normalized,
    });
    return normalized;
  } catch (error) {
    logDesktopDebug("scan prompt failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  } finally {
    for (const entry of overlays) {
      if (!entry.window.isDestroyed()) {
        disposeOverlayWindow(entry.window);
      }
    }
    logDesktopDebug("scan prompt overlays disposed", { count: overlays.length });
  }
}

function buildCaptureScript(selection: Rectangle): string {
  const x = Math.floor(selection.x);
  const y = Math.floor(selection.y);
  const width = Math.max(1, Math.floor(selection.width));
  const height = Math.max(1, Math.floor(selection.height));

  return [
    "$ErrorActionPreference='Stop'",
    "Add-Type -AssemblyName System.Drawing",
    `$x=${x}`,
    `$y=${y}`,
    `$w=${width}`,
    `$h=${height}`,
    "$result=[ordered]@{pngBase64=$null;error=$null}",
    "try {",
    "  $bmp=New-Object System.Drawing.Bitmap($w,$h)",
    "  $g=[System.Drawing.Graphics]::FromImage($bmp)",
    "  $g.CopyFromScreen($x,$y,0,0,$bmp.Size)",
    "  $ms=New-Object System.IO.MemoryStream",
    "  $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png)",
    "  $result.pngBase64=[System.Convert]::ToBase64String($ms.ToArray())",
    "  $g.Dispose()",
    "  $bmp.Dispose()",
    "  $ms.Dispose()",
    "} catch {",
    "  $result.error=$_.Exception.Message",
    "}",
    "$result | ConvertTo-Json -Compress -Depth 3",
  ].join("\n");
}

function parsePowerShellJsonOutput(stdoutText: string): CaptureScriptResult | null {
  const lines = stdoutText
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const candidate = lines[i];
    if (!candidate.startsWith("{") || !candidate.endsWith("}")) continue;
    try {
      return JSON.parse(candidate) as CaptureScriptResult;
    } catch {
      // Keep trying other lines.
    }
  }

  return null;
}

async function captureSelection(selection: Rectangle): Promise<string | null> {
  if (process.platform !== "win32") {
    logDesktopDebug("scan capture unsupported platform", { platform: process.platform });
    return null;
  }

  const script = buildCaptureScript(selection);
  const encoded = Buffer.from(script, "utf16le").toString("base64");

  return await new Promise<string | null>((resolve) => {
    const child = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let done = false;

    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill();
      logDesktopDebug("scan capture powershell timeout");
      resolve(null);
    }, POWERSHELL_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => outChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    child.on("error", (error) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      logDesktopDebug("scan capture powershell spawn error", {
        message: error.message,
        stack: error.stack,
      });
      resolve(null);
    });

    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);

      const stdoutText = Buffer.concat(outChunks).toString("utf8");
      const stderrText = Buffer.concat(errChunks).toString("utf8");

      if (code !== 0) {
        logDesktopDebug("scan capture powershell non-zero exit", {
          code,
          stderr: stderrText.slice(0, 600),
        });
        resolve(null);
        return;
      }

      const parsed = parsePowerShellJsonOutput(stdoutText);
      if (!parsed) {
        logDesktopDebug("scan capture powershell parse failure", {
          stdout: stdoutText.slice(0, 600),
          stderr: stderrText.slice(0, 600),
        });
        resolve(null);
        return;
      }

      if (parsed.error) {
        logDesktopDebug("scan capture powershell script error", {
          message: parsed.error,
        });
      }

      if (!parsed.pngBase64) {
        resolve(null);
        return;
      }

      resolve(parsed.pngBase64);
    });
  });
}

function decodeBitmapFromBase64Png(base64Png: string): CapturedBitmap | null {
  try {
    const png = PNG.sync.read(Buffer.from(base64Png, "base64"));
    if (png.width < MIN_SELECTION_SIZE || png.height < MIN_SELECTION_SIZE) return null;
    return {
      width: png.width,
      height: png.height,
      rgba: new Uint8ClampedArray(png.data),
    };
  } catch {
    return null;
  }
}

function decodeQrFromBitmap(bitmap: CapturedBitmap): string | null {
  const result = jsQR(bitmap.rgba, bitmap.width, bitmap.height, {
    inversionAttempts: "attemptBoth",
  });
  return result?.data?.trim() || null;
}

export function isOtpauthUri(value: string): boolean {
  return /^otpauth:\/\/totp\//i.test(value.trim());
}

export async function scanQrFromScreen(parentWindow?: BrowserWindow): Promise<ScreenScanResult> {
  try {
    logDesktopDebug("scan flow start");

    const selection = await promptUserForSelection(parentWindow);
    if (!selection) {
      logDesktopDebug("scan flow selection cancelled");
      return { status: "cancelled" };
    }

    await wait(35);

    logDesktopDebug("scan capture start", { selection });
    const pngBase64 = await captureSelection(selection);
    if (!pngBase64) {
      logDesktopDebug("scan flow capture unavailable");
      return { status: "no_qr" };
    }

    const bitmap = decodeBitmapFromBase64Png(pngBase64);
    if (!bitmap) {
      logDesktopDebug("scan flow png decode failed");
      return { status: "no_qr" };
    }

    logDesktopDebug("scan flow decode start", {
      width: bitmap.width,
      height: bitmap.height,
    });

    const decoded = decodeQrFromBitmap(bitmap);
    if (!decoded) {
      logDesktopDebug("scan flow decode no result");
      return { status: "no_qr" };
    }

    logDesktopDebug("scan flow decode success", {
      length: decoded.length,
      otpauth: /^otpauth:\/\/totp\//i.test(decoded),
    });

    return { status: "decoded", text: decoded };
  } catch (error) {
    logDesktopDebug("scan flow failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return { status: "no_qr" };
  }
}
