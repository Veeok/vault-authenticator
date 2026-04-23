import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  net,
  nativeImage,
  powerMonitor,
  protocol,
  session,
  Tray,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type NativeImage,
} from "electron";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { attachSecuritySessionLifecycle, isAppLocked, lockApp, registerIpc, setSettingsAppliedListener } from "./main/ipc-handlers";
import { acquireSingleInstanceLock } from "./main/runtime-guards";
import {
  ensureOuterVaultMetadata,
  DEFAULT_SETTINGS,
  isHardenedVaultUnlocked,
  loadAuthUiSettings,
  loadProtectedSettingsIfUnlocked,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "./main/secure-store";
import { getDesktopDebugLogPath, logDesktopDebug } from "./main/diagnostics";
import { registerCrashGuards } from "./main/crash-guards";
import { isFocusLossLockSuppressed } from "./main/focus-loss-lock";
import { shouldHideOnWindowClose } from "./main/window-lifecycle";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

type TrayIconTone = "light" | "dark";

type TrayAction =
  | "open-authenticator"
  | "search"
  | "add-account"
  | "scan-screen-qr"
  | "lock-now"
  | "clear-clipboard"
  | "settings-appearance"
  | "settings-security"
  | "safety-setup"
  | "settings-accounts"
  | "settings-behavior"
  | "settings-advanced"
  | "toggle-run-in-background"
  | "toggle-start-with-system"
  | "toggle-always-on-top"
  | "exit";

type TrayMenuIconName =
  | "open"
  | "search"
  | "add"
  | "scan"
  | "lock"
  | "clear"
  | "settings"
  | "appearance"
  | "security"
  | "accounts"
  | "behavior"
  | "advanced"
  | "exit";

const APP_PROTOCOL = "app";
const APP_PROTOCOL_HOST = "vault-authenticator";
const APP_PROTOCOL_ORIGIN = `${APP_PROTOCOL}://${APP_PROTOCOL_HOST}`;
const APP_PROTOCOL_INDEX_URL = `${APP_PROTOCOL_ORIGIN}/index.html`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

function getTrustedRendererUrl(): string {
  return APP_PROTOCOL_INDEX_URL;
}

function getTrustedRendererOrigin(): string {
  return APP_PROTOCOL_ORIGIN;
}

function resolvePackagedRendererFilePath(requestUrl: string): string | null {
  try {
    const parsed = new URL(requestUrl);
    if (parsed.protocol !== `${APP_PROTOCOL}:` || parsed.hostname !== APP_PROTOCOL_HOST) {
      return null;
    }
    const rendererRoot = path.join(app.getAppPath(), ".vite", "renderer", MAIN_WINDOW_VITE_NAME);
    const relativePath = decodeURIComponent(parsed.pathname === "/" ? "/index.html" : parsed.pathname).replace(/^\/+/, "");
    const resolvedPath = path.resolve(rendererRoot, relativePath || "index.html");
    const relativeToRoot = path.relative(rendererRoot, resolvedPath);
    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      return null;
    }
    return resolvedPath;
  } catch {
    return null;
  }
}

async function registerAppProtocol(): Promise<void> {
  protocol.handle(APP_PROTOCOL, async (request) => {
    const filePath = resolvePackagedRendererFilePath(request.url);
    if (!filePath) {
      return new Response("Not Found", { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let idleCheckTimer: NodeJS.Timeout | null = null;
let isQuitting = false;
let isDevRuntime = false;
let windowIconPath: string | undefined;
let lastTrayRightClickAt = 0;
const trayMenuIconDecodeFailures = new Set<TrayMenuIconName>();
let trayMenuSvgDecodeSupported: boolean | null = null;
const trayIconPaths: Record<TrayIconTone, string | null> = {
  light: null,
  dark: null,
};

const WINDOWS_APP_USER_MODEL_ID = "com.veok.authenticator";
const TRAY_CLICK_AFTER_RIGHT_CLICK_GUARD_MS = 260;
const PRODUCT_NAME = "Vault Authenticator";
const LEGACY_USER_DATA_DIR_NAME = PRODUCT_NAME.replace("ator", "or");

function directoryHasAnyEntries(directoryPath: string): boolean {
  try {
    return readdirSync(directoryPath).length > 0;
  } catch {
    return false;
  }
}

function migrateLegacyUserDataDirectory(): void {
  try {
    const currentUserDataPath = app.getPath("userData");
    const parentDirectory = path.dirname(currentUserDataPath);
    const legacyUserDataPath = path.join(parentDirectory, LEGACY_USER_DATA_DIR_NAME);

    if (legacyUserDataPath === currentUserDataPath) {
      return;
    }
    if (!existsSync(legacyUserDataPath)) {
      return;
    }
    if (existsSync(currentUserDataPath) && directoryHasAnyEntries(currentUserDataPath)) {
      return;
    }

    mkdirSync(currentUserDataPath, { recursive: true });
    cpSync(legacyUserDataPath, currentUserDataPath, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });

    logDesktopDebug("legacy userData migrated", {
      from: legacyUserDataPath,
      to: currentUserDataPath,
    });
  } catch (error) {
    logDesktopDebug("legacy userData migration failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function resolveWindowIconPath(): string | undefined {
  if (process.platform === "darwin") {
    return undefined;
  }

  const iconFileName = process.platform === "win32" ? "icon.ico" : "icon.png";
  const searchPaths = iconAssetBasePaths().map((basePath) => path.resolve(basePath, iconFileName));
  for (const iconPath of searchPaths) {
    if (existsSync(iconPath)) {
      return iconPath;
    }
  }

  logDesktopDebug("window icon missing", {
    iconFileName,
    searchPaths,
    resourcesPath: process.resourcesPath,
    dirname: __dirname,
    isPackaged: app.isPackaged,
  });

  return undefined;
}

function trayIconFileNamesByPlatform(tone: TrayIconTone): string[] {
  if (process.platform === "win32") {
    return tone === "light"
      ? ["tray-light.ico", "tray-light.png", "tray.ico", "icon.ico", "tray.png", "icon.png"]
      : ["tray-dark.ico", "tray-dark.png", "tray.ico", "icon.ico", "tray.png", "icon.png"];
  }

  return tone === "light"
    ? ["tray-light.png", "tray-light.ico", "tray.png", "icon.png"]
    : ["tray-dark.png", "tray-dark.ico", "tray.png", "icon.png"];
}

function iconAssetBasePaths(): string[] {
  const devBase = path.resolve(__dirname, "..", "..", "assets");
  if (!app.isPackaged) {
    return [devBase];
  }

  return [path.join(process.resourcesPath, "assets"), path.join(process.resourcesPath, "app.asar", "assets"), devBase];
}

function resolveTrayIconPath(tone: TrayIconTone): string | null {
  const iconNames = trayIconFileNamesByPlatform(tone);
  const iconBases = iconAssetBasePaths();
  for (const basePath of iconBases) {
    for (const iconName of iconNames) {
      const candidate = path.resolve(basePath, iconName);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function trayIconFromPath(iconPath: string | null): NativeImage | null {
  if (!iconPath) {
    return null;
  }

  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    return null;
  }

  const iconSize = process.platform === "win32" ? 16 : 18;
  return image.resize({ width: iconSize, height: iconSize, quality: "best" });
}

function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) {
    return null;
  }
  return win;
}

function isWindowBackgrounded(win: BrowserWindow): boolean {
  return !win.isFocused() || win.isMinimized() || !win.isVisible();
}

function shouldStartHiddenFromLogin(settings: AppSettings): boolean {
  if (!settings.startWithSystem) {
    return false;
  }

  const loginItemState = app.getLoginItemSettings();
  return !!(loginItemState.wasOpenedAtLogin || loginItemState.wasOpenedAsHidden);
}

function trayIconToneForTheme(settings: AppSettings): TrayIconTone {
  if (settings.trayIconStyle === "light") return "light";
  if (settings.trayIconStyle === "dark") return "dark";
  return settings.baseMode === "light" ? "dark" : "light";
}

function menuIconColorForTheme(settings: AppSettings): string {
  const syncedTheme = settings.trayMenuThemeSync ? settings.baseMode : "dark";
  return syncedTheme === "light" ? "#111827" : "#f8fafc";
}

function supportsTrayMenuSvgDecode(): boolean {
  if (trayMenuSvgDecodeSupported != null) {
    return trayMenuSvgDecodeSupported;
  }

  const probeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="#ffffff"/></svg>';
  const probeDataUrl = `data:image/svg+xml;base64,${Buffer.from(probeSvg).toString("base64")}`;
  trayMenuSvgDecodeSupported = !nativeImage.createFromDataURL(probeDataUrl).isEmpty();

  if (!trayMenuSvgDecodeSupported) {
    logDesktopDebug("tray menu svg icons unavailable", {
      platform: process.platform,
      electron: process.versions.electron,
    });
  }

  return trayMenuSvgDecodeSupported;
}

function buildTrayIcon(fillColor: string): NativeImage {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <path d="M16 2.8 25 6.2v8.6c0 6.8-3.8 12.3-9 15.2-5.2-2.9-9-8.4-9-15.2V6.2z" fill="${fillColor}"/>
      <path d="M16 11.1a3.3 3.3 0 0 0-3.3 3.3v1.8h6.6v-1.8a3.3 3.3 0 0 0-3.3-3.3zm4.9 6.6h-9.8a.8.8 0 0 0-.8.8v5.2c0 .5.4.8.8.8h9.8c.5 0 .8-.3.8-.8v-5.2a.8.8 0 0 0-.8-.8z" fill="${fillColor}"/>
    </svg>
  `
    .trim()
    .replace(/\n\s+/g, "");

  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) {
    return image;
  }

  const iconSize = process.platform === "win32" ? 16 : 18;
  return image.resize({ width: iconSize, height: iconSize, quality: "best" });
}

function buildSvgMenuIcon(iconBody: string): NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">${iconBody}</svg>`;
  const base64DataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  let image = nativeImage.createFromDataURL(base64DataUrl);

  if (image.isEmpty()) {
    const utf8DataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    image = nativeImage.createFromDataURL(utf8DataUrl);
  }

  if (image.isEmpty()) {
    image = nativeImage.createFromBuffer(Buffer.from(svg));
  }

  if (image.isEmpty()) {
    return image;
  }

  const size = image.getSize();
  if (size.width === 16 && size.height === 16) {
    return image;
  }

  const resized = image.resize({ width: 16, height: 16, quality: "best" });
  return resized.isEmpty() ? image : resized;
}

function trayMenuGlyph(name: TrayMenuIconName, color: string): string {
  if (name === "open") {
    return `<path d="M2.5 3.5h5v2h-3v7h7v-3h2v5H2.5z" fill="${color}"/><path d="M8 2.5h5.5V8h-2V5.9L7.2 10 6 8.8l4.3-4.3H8z" fill="${color}"/>`;
  }

  if (name === "search") {
    return `<circle cx="6.8" cy="6.8" r="3.6" fill="none" stroke="${color}" stroke-width="1.8"/><path d="m9.6 9.6 3.7 3.7" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`;
  }

  if (name === "add") {
    return `<path d="M8 3v10M3 8h10" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
  }

  if (name === "scan") {
    return `<path d="M2.5 5V2.5H5M11 2.5h2.5V5M13.5 11v2.5H11M5 13.5H2.5V11" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round"/><rect x="6" y="6" width="4" height="4" rx=".4" fill="${color}"/>`;
  }

  if (name === "lock") {
    return `<rect x="3.2" y="7" width="9.6" height="6.8" rx="1.2" fill="${color}"/><path d="M5.1 7V5.5a2.9 2.9 0 1 1 5.8 0V7" fill="none" stroke="${color}" stroke-width="1.8"/>`;
  }

  if (name === "clear") {
    return `<path d="m4 4 8 8M12 4 4 12" stroke="${color}" stroke-width="2" stroke-linecap="round"/><rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2" fill="none" stroke="${color}" stroke-width="1.2"/>`;
  }

  if (name === "settings") {
    return `<circle cx="8" cy="8" r="2.1" fill="none" stroke="${color}" stroke-width="1.8"/><path d="M8 2.3v2M8 11.7v2M2.3 8h2M11.7 8h2M4 4l1.4 1.4M10.6 10.6 12 12M12 4l-1.4 1.4M5.4 10.6 4 12" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`;
  }

  if (name === "appearance") {
    return `<path d="M8 2.6A5.4 5.4 0 0 0 2.6 8c0 3 2.4 5.4 5.4 5.4h1a1.2 1.2 0 0 0 0-2.4h-.7a2.4 2.4 0 1 1 0-4.8h5.1A5.4 5.4 0 0 0 8 2.6Z" fill="none" stroke="${color}" stroke-width="1.5"/><circle cx="5" cy="7" r=".8" fill="${color}"/><circle cx="7.2" cy="5.4" r=".8" fill="${color}"/><circle cx="9.8" cy="5.4" r=".8" fill="${color}"/>`;
  }

  if (name === "security") {
    return `<path d="M8 2.2 12.7 4v3.8c0 3-1.7 5.4-4.7 6.9-3-1.5-4.7-3.9-4.7-6.9V4z" fill="none" stroke="${color}" stroke-width="1.5"/><path d="M8 6.2a1.4 1.4 0 0 0-1.4 1.4v.8h2.8v-.8A1.4 1.4 0 0 0 8 6.2Zm2.1 2.8H5.9a.5.5 0 0 0-.5.5v2.4c0 .3.2.5.5.5h4.2c.3 0 .5-.2.5-.5V9.5a.5.5 0 0 0-.5-.5Z" fill="${color}"/>`;
  }

  if (name === "accounts") {
    return `<circle cx="6" cy="6" r="2" fill="none" stroke="${color}" stroke-width="1.5"/><circle cx="10.5" cy="6.8" r="1.6" fill="none" stroke="${color}" stroke-width="1.5"/><path d="M2.9 12.7c.4-1.6 1.6-2.5 3.1-2.5s2.7.9 3.1 2.5" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/><path d="M8.4 12.7c.3-1.2 1.2-1.9 2.2-1.9 1 0 1.9.7 2.2 1.9" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`;
  }

  if (name === "behavior") {
    return `<path d="M3 4h10M3 8h10M3 12h10" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/><circle cx="5" cy="4" r="1.1" fill="${color}"/><circle cx="10" cy="8" r="1.1" fill="${color}"/><circle cx="7" cy="12" r="1.1" fill="${color}"/>`;
  }

  if (name === "advanced") {
    return `<path d="M8 3.3v2.2M8 10.5v2.2M3.3 8h2.2M10.5 8h2.2" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="8" r="2.3" fill="none" stroke="${color}" stroke-width="1.6"/><path d="M5.7 2.8 4.7 4.5M11.3 11.5l-1 1.7M13.2 5.7l-1.7 1M4.5 11.3l-1.7 1" stroke="${color}" stroke-width="1.3" stroke-linecap="round"/>`;
  }

  return `<path d="M8 2.5a5.5 5.5 0 1 0 5.5 5.5" fill="none" stroke="${color}" stroke-width="1.8"/><path d="M8 5v3.2l2 2" stroke="${color}" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="m11.6 1.9 2.2.1-.1 2.2" fill="none" stroke="${color}" stroke-width="1.6"/><path d="m13.6 2-3.2 3.2" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`;
}

function trayMenuIconForTheme(settings: AppSettings, name: TrayMenuIconName): NativeImage | undefined {
  if (!supportsTrayMenuSvgDecode()) {
    return undefined;
  }

  const image = buildSvgMenuIcon(trayMenuGlyph(name, menuIconColorForTheme(settings)));
  if (!image.isEmpty()) {
    trayMenuIconDecodeFailures.delete(name);
    return image;
  }

  if (!trayMenuIconDecodeFailures.has(name)) {
    trayMenuIconDecodeFailures.add(name);
    logDesktopDebug("tray menu svg icon decode failed", {
      icon: name,
      platform: process.platform,
      electron: process.versions.electron,
    });
  }

  return undefined;
}

function trayIconForTheme(settings: AppSettings): NativeImage {
  const iconTone = trayIconToneForTheme(settings);
  const iconFromFile = trayIconFromPath(trayIconPaths[iconTone]);
  if (iconFromFile && !iconFromFile.isEmpty()) {
    return iconFromFile;
  }

  const fillColor = iconTone === "dark" ? "#111827" : "#f8fafc";
  return buildTrayIcon(fillColor);
}

function applyLoginItemSetting(settings: AppSettings): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: settings.startWithSystem === true,
      openAsHidden: true,
    });
  } catch (error) {
    const normalized = error instanceof Error ? error.message : String(error);
    logDesktopDebug("setLoginItemSettings failed", { message: normalized });
  }
}

function currentAlwaysOnTop(settings: AppSettings): boolean {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow.isAlwaysOnTop();
  }
  return !!settings.alwaysOnTop;
}

function buildTrayContextMenu(settings: AppSettings): Menu {
  const alwaysOnTop = currentAlwaysOnTop(settings);
  const icon = (name: TrayMenuIconName): NativeImage | undefined => trayMenuIconForTheme(settings, name);

  const settingsSubMenu: MenuItemConstructorOptions[] = [
    {
      label: "Appearance",
      icon: icon("appearance"),
      click: () => performTrayAction("settings-appearance"),
    },
    {
      label: "Security",
      icon: icon("security"),
      click: () => performTrayAction("settings-security"),
    },
    {
      label: "Run Safety Setup",
      icon: icon("security"),
      click: () => performTrayAction("safety-setup"),
    },
    {
      label: "Accounts",
      icon: icon("accounts"),
      click: () => performTrayAction("settings-accounts"),
    },
    {
      label: "App behavior",
      icon: icon("behavior"),
      click: () => performTrayAction("settings-behavior"),
    },
    {
      label: "Advanced",
      icon: icon("advanced"),
      click: () => performTrayAction("settings-advanced"),
    },
  ];

  const template: MenuItemConstructorOptions[] = [
    {
      label: "Open Vault Authenticator",
      icon: icon("open"),
      click: () => performTrayAction("open-authenticator"),
    },
    {
      label: "Search (Ctrl+K)",
      icon: icon("search"),
      click: () => performTrayAction("search"),
    },
    { type: "separator" },
    {
      label: "QUICK ACTIONS",
      enabled: false,
    },
    {
      label: "Add account",
      icon: icon("add"),
      click: () => performTrayAction("add-account"),
    },
    {
      label: "Scan QR from Screen",
      icon: icon("scan"),
      click: () => performTrayAction("scan-screen-qr"),
    },
    {
      label: "Lock now",
      icon: icon("lock"),
      click: () => performTrayAction("lock-now"),
    },
    {
      label: "Clear clipboard",
      icon: icon("clear"),
      click: () => performTrayAction("clear-clipboard"),
    },
    { type: "separator" },
    {
      label: "Settings",
      icon: icon("settings"),
      submenu: settingsSubMenu,
    },
    { type: "separator" },
    {
      label: "Run in background",
      type: "checkbox",
      checked: settings.runInBackground !== false,
      click: () => performTrayAction("toggle-run-in-background"),
    },
    {
      label: "Start with system",
      type: "checkbox",
      checked: settings.startWithSystem === true,
      click: () => performTrayAction("toggle-start-with-system"),
    },
    {
      label: "Always on top",
      type: "checkbox",
      checked: alwaysOnTop,
      click: () => performTrayAction("toggle-always-on-top"),
    },
    { type: "separator" },
    {
      label: "Exit",
      icon: icon("exit"),
      click: () => performTrayAction("exit"),
    },
  ];

  return Menu.buildFromTemplate(template);
}

function rebuildTrayMenu(settings: AppSettings): void {
  if (!tray) {
    return;
  }

  const menu = buildTrayContextMenu(settings);
  tray.setContextMenu(menu);
}

function updateTrayIcon(settings: AppSettings): void {
  if (!tray) {
    return;
  }

  const themedIcon = trayIconForTheme(settings);
  if (!themedIcon.isEmpty()) {
    tray.setImage(themedIcon);
  }
  tray.setToolTip(PRODUCT_NAME);
  rebuildTrayMenu(settings);
}

function applyRuntimeSettings(settings: AppSettings): void {
  applyLoginItemSetting(settings);
  updateTrayIcon(settings);
  const contentProtectionEnabled = settings.privacyScreen !== false;
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.setContentProtection(contentProtectionEnabled);
    win.setAlwaysOnTop(!!settings.alwaysOnTop);
    win.webContents.send("window:alwaysOnTopChanged", !!settings.alwaysOnTop);
  }
}

function canMutateVaultBackedSettings(): boolean {
  return isHardenedVaultUnlocked();
}

function getUnlockedRuntimeSettings(): AppSettings | null {
  return loadProtectedSettingsIfUnlocked();
}

function broadcastAlwaysOnTopState(enabled: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("window:alwaysOnTopChanged", enabled);
    }
  }
}

function persistAlwaysOnTop(enabled: boolean): void {
  if (!canMutateVaultBackedSettings()) {
    return;
  }
  const current = loadSettings();
  if (current.alwaysOnTop === enabled) {
    rebuildTrayMenu(current);
    return;
  }

  const next = {
    ...current,
    alwaysOnTop: enabled,
  };
  saveSettings(next);
  applyRuntimeSettings(next);
}

function showMainWindow(): BrowserWindow | null {
  const win = mainWindow;
  if (!win || win.isDestroyed()) {
    return null;
  }
  if (win.isMinimized()) {
    win.restore();
  }
  if (!win.isVisible()) {
    win.show();
  }
  win.focus();
  return win;
}

function focusOrCreateMainWindow(): void {
  const existingWindow = showMainWindow();
  if (existingWindow) {
    return;
  }

  const win = createMainWindow();
  if (win.isMinimized()) {
    win.restore();
  }
  if (!win.isVisible()) {
    win.show();
  }
  win.focus();
}

function sendMainWindowCommand(command: string): void {
  let win = showMainWindow();
  if (!win || win.isDestroyed()) {
    focusOrCreateMainWindow();
    win = showMainWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
  }

  const emit = () => {
    if (!win.isDestroyed()) {
      win.webContents.send("window:appCommand", command);
    }
  };

  if (win.webContents.isLoadingMainFrame()) {
    win.webContents.once("did-finish-load", emit);
    return;
  }

  emit();
}

function quitFromTray(): void {
  isQuitting = true;
  if (tray) {
    tray.destroy();
    tray = null;
  }
  app.quit();
}

function performTrayAction(action: TrayAction): void {
  if (action === "open-authenticator") {
    focusOrCreateMainWindow();
    return;
  }

  if (action === "search") {
    sendMainWindowCommand("open-search");
    return;
  }

  if (action === "add-account") {
    sendMainWindowCommand("open-add-account");
    return;
  }

  if (action === "scan-screen-qr") {
    sendMainWindowCommand("scan-from-screen");
    return;
  }

  if (action === "lock-now") {
    lockApp(mainWindow);
    return;
  }

  if (action === "clear-clipboard") {
    sendMainWindowCommand("clear-clipboard");
    return;
  }

  if (action === "settings-appearance") {
    sendMainWindowCommand("open-settings:appearance");
    return;
  }

  if (action === "settings-security") {
    sendMainWindowCommand("open-settings:security");
    return;
  }

  if (action === "safety-setup") {
    sendMainWindowCommand("open-safety-setup");
    return;
  }

  if (action === "settings-accounts") {
    sendMainWindowCommand("open-settings:accounts");
    return;
  }

  if (action === "settings-behavior") {
    sendMainWindowCommand("open-settings:behavior");
    return;
  }

  if (action === "settings-advanced") {
    sendMainWindowCommand("open-settings:advanced");
    return;
  }

  if (action === "toggle-run-in-background") {
    if (!canMutateVaultBackedSettings()) {
      return;
    }
    const settings = loadSettings();
    const next = {
      ...settings,
      runInBackground: settings.runInBackground === false,
    };
    saveSettings(next);
    applyRuntimeSettings(next);
    return;
  }

  if (action === "toggle-start-with-system") {
    if (!canMutateVaultBackedSettings()) {
      return;
    }
    const settings = loadSettings();
    const next = {
      ...settings,
      startWithSystem: settings.startWithSystem !== true,
    };
    saveSettings(next);
    applyRuntimeSettings(next);
    return;
  }

  if (action === "toggle-always-on-top") {
    if (!canMutateVaultBackedSettings()) {
      return;
    }
    const settings = loadSettings();
    const nextAlwaysOnTop = !currentAlwaysOnTop(settings);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(nextAlwaysOnTop);
    }
    persistAlwaysOnTop(nextAlwaysOnTop);
    broadcastAlwaysOnTopState(nextAlwaysOnTop);
    return;
  }

  quitFromTray();
}

function showNativeTrayMenu(): void {
  if (!tray) {
    return;
  }

  const settings = loadSettings();
  rebuildTrayMenu(settings);
  tray.popUpContextMenu();
}

function createTray(): void {
  if (tray) {
    return;
  }

  const startupSettings = loadSettings();
  const image = trayIconForTheme(startupSettings);
  const createdTray = new Tray(image);
  createdTray.setToolTip(PRODUCT_NAME);
  tray = createdTray;
  rebuildTrayMenu(startupSettings);

  createdTray.on("click", (event) => {
    const maybeButton = (event as { button?: unknown }).button;
    if (typeof maybeButton === "number" && maybeButton !== 0) {
      return;
    }
    if (Date.now() - lastTrayRightClickAt <= TRAY_CLICK_AFTER_RIGHT_CLICK_GUARD_MS) {
      return;
    }
    focusOrCreateMainWindow();
  });

  createdTray.on("right-click", () => {
    lastTrayRightClickAt = Date.now();
    showNativeTrayMenu();
  });
}

function registerWindowControlIpc(): void {
  ipcMain.handle("window:minimize", (event) => {
    senderWindow(event)?.minimize();
  });

  ipcMain.handle("window:maximize", (event) => {
    const win = senderWindow(event);
    if (!win) return;
    if (!win.isMaximized()) {
      win.maximize();
    }
  });

  ipcMain.handle("window:unmaximize", (event) => {
    const win = senderWindow(event);
    if (!win) return;
    if (win.isMaximized()) {
      win.unmaximize();
    }
  });

  ipcMain.handle("window:close", (event) => {
    senderWindow(event)?.close();
  });

  ipcMain.handle("window:isMaximized", (event): boolean => {
    return senderWindow(event)?.isMaximized() ?? false;
  });

  ipcMain.handle("window:getAlwaysOnTop", (event): boolean => {
    return senderWindow(event)?.isAlwaysOnTop() ?? false;
  });

  ipcMain.handle("window:setAlwaysOnTop", (event, enabled: unknown): boolean => {
    const win = senderWindow(event);
    if (!win) {
      return false;
    }
    const next = !!enabled;
    win.setAlwaysOnTop(next);
    persistAlwaysOnTop(next);
    broadcastAlwaysOnTopState(next);
    return next;
  });

  ipcMain.handle("window:getVersion", (): string => {
    return app.getVersion();
  });

  ipcMain.handle("window:isBackgrounded", (event): boolean => {
    const win = senderWindow(event);
    if (!win) {
      return true;
    }
    return isWindowBackgrounded(win);
  });
}

function registerDevContentSecurityPolicy(devServerUrl: string): void {
  let devOrigin = "";
  try {
    devOrigin = new URL(devServerUrl).origin;
  } catch {
    return;
  }

  const devCsp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' http://localhost:* http://127.0.0.1:*",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* wss://localhost:* wss://127.0.0.1:*",
    `frame-src 'self' ${APP_PROTOCOL_ORIGIN}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders ?? {};
    if (details.resourceType !== "mainFrame" || !details.url.startsWith(devOrigin)) {
      callback({ responseHeaders });
      return;
    }

    callback({
      responseHeaders: {
        ...responseHeaders,
        "Content-Security-Policy": [devCsp],
      },
    });
  });
}

function createMainWindow(options?: { showOnCreate?: boolean }): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  const startupSettings = getUnlockedRuntimeSettings();
  const launchHidden = startupSettings ? shouldStartHiddenFromLogin(startupSettings) : false;
  const showOnCreate = options?.showOnCreate ?? !launchHidden;

  const win = new BrowserWindow({
    title: PRODUCT_NAME,
    width: 460,
    height: 820,
    minWidth: 440,
    minHeight: 760,
    useContentSize: true,
    frame: isWindows ? false : !isMac,
    ...(isMac ? { titleBarStyle: "hiddenInset" as const } : {}),
    ...(isWindows ? { autoHideMenuBar: true } : {}),
    resizable: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    show: showOnCreate,
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: isDevRuntime,
    },
  });

  mainWindow = win;
  attachSecuritySessionLifecycle(win);
  logDesktopDebug("main window created", { bounds: win.getBounds(), launchHidden });
  if (windowIconPath) {
    logDesktopDebug("window icon configured", { iconPath: windowIconPath });
  }

  win.setAutoHideMenuBar(true);
  win.setMenuBarVisibility(false);
  if (startupSettings) {
    win.setContentProtection(startupSettings.privacyScreen !== false);
    win.setAlwaysOnTop(!!startupSettings.alwaysOnTop);
  }

  const emitMaximizedState = () => {
    if (win.isDestroyed()) return;
    win.webContents.send("window:maximizedChanged", win.isMaximized());
  };

  const emitBackgroundedState = () => {
    if (win.isDestroyed()) return;
    win.webContents.send("window:backgroundedChanged", isWindowBackgrounded(win));
  };

  win.on("maximize", emitMaximizedState);
  win.on("unmaximize", emitMaximizedState);
  win.on("enter-full-screen", emitMaximizedState);
  win.on("leave-full-screen", emitMaximizedState);
  win.on("focus", emitBackgroundedState);
  win.on("blur", emitBackgroundedState);
  win.on("minimize", emitBackgroundedState);
  win.on("restore", emitBackgroundedState);
  win.on("show", emitBackgroundedState);
  win.on("hide", emitBackgroundedState);

  win.on("close", (event) => {
    const settings = getUnlockedRuntimeSettings();
    if (!shouldHideOnWindowClose({ isQuitting, runInBackground: settings?.runInBackground })) {
      return;
    }

    event.preventDefault();
    win.hide();
  });

  win.on("closed", () => {
    logDesktopDebug("main window closed");
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  win.webContents.on("will-navigate", (event, url) => {
    const isDevServerUrl = !!MAIN_WINDOW_VITE_DEV_SERVER_URL && url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    const trustedRendererOrigin = getTrustedRendererOrigin();
    const isTrustedPackagedUrl = url === trustedRendererOrigin || url.startsWith(`${trustedRendererOrigin}/`);
    if (!isDevServerUrl && !isTrustedPackagedUrl) {
      event.preventDefault();
    }
  });

  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;

    const key = input.key.toLowerCase();
    const hasPrimaryModifier = input.control || input.meta;

    if (hasPrimaryModifier && !input.alt) {
      if (!input.shift && key === "c") {
        event.preventDefault();
        win.webContents.copy();
        return;
      }
      if (!input.shift && key === "x") {
        event.preventDefault();
        win.webContents.cut();
        return;
      }
      if (!input.shift && key === "v") {
        event.preventDefault();
        win.webContents.paste();
        return;
      }
      if (!input.shift && key === "a") {
        event.preventDefault();
        win.webContents.selectAll();
        return;
      }
    }

    if (isDevRuntime) {
      return;
    }

    const isDevToolsShortcut = hasPrimaryModifier && input.shift && key === "i";
    const isF12 = input.key === "F12";
    const isReloadShortcut = hasPrimaryModifier && key === "r";
    const isF5 = input.key === "F5";
    if (isDevToolsShortcut || isF12 || isReloadShortcut || isF5) {
      event.preventDefault();
    }
  });

  if (!isDevRuntime) {
    win.webContents.on("devtools-opened", () => {
      win.webContents.closeDevTools();
    });
  }

  win.on("blur", () => {
    const settings = getUnlockedRuntimeSettings();
    if (settings?.lockOnFocusLoss && !isFocusLossLockSuppressed()) {
      lockApp(mainWindow);
    }
  });

  win.webContents.once("did-finish-load", () => {
    if (win.isDestroyed()) return;
    emitMaximizedState();
    emitBackgroundedState();
    broadcastAlwaysOnTopState(win.isAlwaysOnTop());
  });

  if (isDevRuntime) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadURL(getTrustedRendererUrl());
  }

  return win;
}

const hasSingleInstanceLock = acquireSingleInstanceLock(app, () => {
  if (!app.isReady()) {
    app.once("ready", () => {
      focusOrCreateMainWindow();
    });
    return;
  }

  focusOrCreateMainWindow();
});

registerCrashGuards({
  processLike: process,
  appLike: app,
  log: logDesktopDebug,
});

app.on("window-all-closed", () => {
  const runtimeSettings = loadSettings();
  logDesktopDebug("window-all-closed", {
    platform: process.platform,
    isQuitting,
    runInBackground: runtimeSettings.runInBackground,
  });

  if (isQuitting) {
    app.quit();
  }
});

app.on("activate", () => {
  focusOrCreateMainWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
  if (idleCheckTimer) {
    clearInterval(idleCheckTimer);
    idleCheckTimer = null;
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }

  migrateLegacyUserDataDirectory();
  logDesktopDebug("app ready", { logPath: getDesktopDebugLogPath() });
  isDevRuntime = !!MAIN_WINDOW_VITE_DEV_SERVER_URL;
  if (isDevRuntime) {
    registerDevContentSecurityPolicy(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await registerAppProtocol();
  }

  registerWindowControlIpc();
  registerIpc();
  setSettingsAppliedListener((settings) => {
    applyRuntimeSettings(settings);
  });

  if (process.platform === "win32") {
    app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  }

  windowIconPath = resolveWindowIconPath();
  trayIconPaths.light = resolveTrayIconPath("light");
  trayIconPaths.dark = resolveTrayIconPath("dark");
  if (!trayIconPaths.light && !trayIconPaths.dark) {
    logDesktopDebug("tray icon variants missing from known locations", {
      resourcesPath: process.resourcesPath,
      dirname: __dirname,
      isPackaged: app.isPackaged,
    });
  }
  Menu.setApplicationMenu(null);

  const outerVaultMetadata = ensureOuterVaultMetadata();
  logDesktopDebug("vault outer metadata startup", outerVaultMetadata);

  const startupSettings = getUnlockedRuntimeSettings();
  if (startupSettings) {
    // H-001 resolved: protected settings not applied
    // until vault unlock completes.
    // See BUG_HUNT_REPORT.md H-001.
    applyRuntimeSettings(startupSettings);
  } else {
    updateTrayIcon({
      ...DEFAULT_SETTINGS,
      ...loadAuthUiSettings(),
    });
  }

  createMainWindow();
  createTray();

  const lockNow = () => {
    lockApp(mainWindow);
  };

  powerMonitor.on("lock-screen", lockNow);
  powerMonitor.on("suspend", lockNow);
  powerMonitor.on("user-did-resign-active", lockNow);

  idleCheckTimer = setInterval(() => {
    const settings = getUnlockedRuntimeSettings();
    if (!settings || settings.autoLockSeconds === 0) return;
    const idleSeconds = powerMonitor.getSystemIdleTime();
    if (idleSeconds >= settings.autoLockSeconds && !isAppLocked()) {
      lockNow();
    }
  }, 15_000);
});
