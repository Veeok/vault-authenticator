import * as React from "react";
import {
  getVaultPasswordPolicyIssue,
  getVaultPasswordPolicyMessage,
  type AccountMeta,
  type CodeResult,
} from "@authenticator/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  Columns3,
  Copy,
  Download,
  Fingerprint,
  Grid3x3,
  Inbox,
  KeyRound,
  LockKeyhole,
  List,
  Loader2,
  Monitor,
  Palette,
  RefreshCw,
  Settings2,
  Shield,
  SlidersHorizontal,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { AddModal } from "./components/AddModal";
import { AccountRow } from "./components/AccountRow";
import { CommandPalette } from "./components/CommandPalette";
import { CustomTitleBar, type CustomTitleBarControls } from "./components/CustomTitleBar";
import { EditModal } from "./components/EditModal";
import { HeaderMenu, type SettingsCategory } from "./components/HeaderMenu";
import { LockScreen } from "./components/LockScreen";
import { SafetySetupModal } from "./components/SafetySetupModal";
import { SecurityPicker } from "./components/SecurityPicker";
import { SettingsSwitch } from "./components/SettingsSwitch";
import { StepUpAuthModal } from "./components/StepUpAuthModal";
import { ThemedSelect } from "./components/ThemedSelect";
import { useDpiMode } from "./hooks/useDpiMode";
import { useReorder } from "./hooks/useReorder";
import { MotionModeContext, combineMotionPresets, duration, ease, getMotionVariants, resolveMotionState } from "./lib/motion";
import {
  ACCENT_OVERRIDE_OPTIONS,
  BASE_MODE_OPTIONS,
  THEME_COLOR_OPTIONS,
  MOTION_MODE_OPTIONS,
  DEFAULT_SETTINGS,
  accentOverrideLabel,
  baseModeLabel,
  motionModeLabel,
  normalizeAccentOverrideId,
  normalizeBaseModeId,
  normalizeMotionMode,
  normalizeThemeColorId,
  type AccentOverrideId,
  type AccountsDensity,
  type AccountsGridColumns,
  type AccountsLayoutMode,
  type AppSettings,
  type BaseModeId,
  type Bridge,
  type EditableAccount,
  type LockMethod,
  type LockMethodKind,
  type LockMethodsConfig,
  type MotionMode,
  type ThemeColorId,
  type UpdateAccountPayload,
  type VaultProtectionStatus,
} from "./bridge";
import { useAccounts } from "./hooks/useAccounts";
import { isStepUpRequiredError, toUiError, type UiError } from "./utils/errors";
import "./ui.css";

interface Props {
  bridge: Bridge;
  windowControls?: CustomTitleBarControls;
  titleBarIconSrc?: string;
}

type Banner = {
  tone: "success" | "info" | "error";
  title: string;
  text: string;
  code?: string;
  durationMs?: number;
  replaceKey?: string;
  countdownUntilMs?: number;
  countdownPrefix?: string;
};

type BannerToast = Banner & {
  id: string;
  isExiting?: boolean;
};

type AddModalMethod = "uri" | "manual" | "scan";

type BannerCountdownProps = {
  untilMs: number;
  prefix: string;
  paused: boolean;
};

type BannerTimer = ReturnType<typeof setTimeout> | number;
type SensitiveActionResult<T> = { status: "ok"; value: T } | { status: "cancelled" };

function defaultVaultProtectionStatus(): VaultProtectionStatus {
  return {
    vaultFormat: "vault-v4",
    requiresMasterPassword: false,
    hardenedSessionUnlocked: true,
    masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
    recoveryGenerated: false,
    biometricEnrolled: false,
    migrationRequired: false,
    requiresPasswordSetup: false,
    justUnlockedViaRecovery: false,
    appLockRequired: false,
  };
}

const BANNER_EXIT_DURATION_MS = 220;
const BANNER_MIN_DURATION_MS = 1200;
const BANNER_MAX_DURATION_MS = 10000;
const BANNER_DEFAULT_DURATION_BY_TONE: Record<Banner["tone"], number> = {
  success: 3200,
  info: 3600,
  error: 4500,
};

function resolveBannerDurationMs(next: Banner): number {
  const requested = typeof next.durationMs === "number" ? next.durationMs : BANNER_DEFAULT_DURATION_BY_TONE[next.tone];
  return Math.max(BANNER_MIN_DURATION_MS, Math.min(BANNER_MAX_DURATION_MS, requested));
}

function resolveBannerReplaceKey(next: Banner): string | undefined {
  if (next.replaceKey) return next.replaceKey;
  if (next.countdownUntilMs) return undefined;
  return `banner:${next.tone}:${next.title}`;
}

type SettingsCategoryOption = {
  id: SettingsCategory;
  label: string;
  description: string;
  Icon: LucideIcon;
};

const SETTINGS_CATEGORIES: SettingsCategoryOption[] = [
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and visual preferences",
    Icon: Palette,
  },
  {
    id: "security",
    label: "Security",
    description: "Lock behavior and protection",
    Icon: Shield,
  },
  {
    id: "accounts",
    label: "Accounts",
    description: "Defaults, layout, and backups",
    Icon: Users,
  },
  {
    id: "behavior",
    label: "App behavior",
    description: "Tray, startup, and window behavior",
    Icon: Monitor,
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Diagnostics and build details",
    Icon: SlidersHorizontal,
  },
];

const LAYOUT_MODE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "list", label: "List" },
  { value: "grid", label: "Grid" },
] as const;

const GRID_COLUMN_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
] as const;

const DENSITY_OPTIONS = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
] as const;

const MOTION_MODAL_DURATION_MS = 220;
const SAFETY_SETUP_REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const RECOVERY_ROTATION_PENDING_KEY = "vault-authenticator.recovery-rotation-pending";

function isMacOSRuntime(): boolean {
  return typeof process !== "undefined" && process.platform === "darwin";
}

function readRecoveryRotationPendingFlag(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const storage = window.localStorage;
  if (!storage || typeof storage.getItem !== "function") {
    return false;
  }
  return storage.getItem(RECOVERY_ROTATION_PENDING_KEY) === "1";
}

function writeRecoveryRotationPendingFlag(pending: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  const storage = window.localStorage;
  if (!storage || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") {
    return;
  }
  if (pending) {
    storage.setItem(RECOVERY_ROTATION_PENDING_KEY, "1");
  } else {
    storage.removeItem(RECOVERY_ROTATION_PENDING_KEY);
  }
}

function readPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function shouldReduceForLowEndHardware(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const withDeviceMemory = navigator as Navigator & { deviceMemory?: number };
  const deviceMemory = typeof withDeviceMemory.deviceMemory === "number" ? withDeviceMemory.deviceMemory : undefined;
  const cpuCores = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : undefined;

  return (typeof deviceMemory === "number" && deviceMemory <= 4) || (typeof cpuCores === "number" && cpuCores <= 4);
}

function resolveMotionMode(mode: MotionMode, prefersReducedMotion: boolean, lowEndHardware: boolean): Exclude<MotionMode, "system"> {
  if (mode === "off") return "off";
  if (mode === "reduced") return "reduced";
  if (mode === "full") return "full";
  if (prefersReducedMotion || lowEndHardware) return "reduced";
  return "full";
}

function normalizeLockMethod(input: string): LockMethod {
  if (input === "none") return "none";
  if (input === "swipe") return "swipe";
  if (input === "pin4") return "pin4";
  if (input === "pin6") return "pin6";
  if (input === "password") return "password";
  if (input === "pattern") return "pattern";
  if (input === "pin") return "pin4";
  return "none";
}

function isCredentialMethod(method: LockMethod): method is "pin4" | "pin6" | "password" | "pattern" {
  return method === "pin4" || method === "pin6" || method === "password" || method === "pattern";
}

function normalizeLockMethodKind(input: unknown): LockMethodKind {
  if (input === "none") return "none";
  if (input === "swipe") return "swipe";
  if (input === "pin" || input === "pin4" || input === "pin6") return "pin";
  if (input === "password") return "password";
  if (input === "pattern") return "pattern";
  if (input === "passkey") return "passkey";
  return "none";
}

function normalizeLockMethodsConfig(input: unknown): LockMethodsConfig {
  if (!input || typeof input !== "object") {
    return { primaryLockMethod: "none", secondaryLockMethod: null };
  }

  const payload = input as { primaryLockMethod?: unknown; secondaryLockMethod?: unknown };
  const primary = normalizeLockMethodKind(payload.primaryLockMethod);
  const secondaryKind = normalizeLockMethodKind(payload.secondaryLockMethod);
  const secondary =
    primary === "none" ||
    primary === "swipe" ||
    secondaryKind === "none" ||
    secondaryKind === "swipe" ||
    secondaryKind === primary
      ? null
      : secondaryKind;

  return {
    primaryLockMethod: primary,
    secondaryLockMethod: secondary,
  };
}

function lockMethodFromKind(kind: LockMethodKind, pinDigits: 4 | 6, methodRaw: LockMethod): LockMethod {
  if (kind === "pin") {
    if (methodRaw === "pin4" && pinDigits === 4) return "pin4";
    return pinDigits === 6 ? "pin6" : "pin4";
  }
  if (kind === "password") return "password";
  if (kind === "pattern") return "pattern";
  if (kind === "passkey") return "passkey";
  if (kind === "swipe") return "swipe";
  return "none";
}

function isUnprotectedLockState(method: LockMethod, configured: boolean): boolean {
  return !configured || method === "none" || method === "swipe";
}

function autoLockLabel(seconds: number): string {
  if (seconds === 0) return "Never";
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} min`;
  }
  return `${seconds}s`;
}

function lockMethodLabel(method: LockMethod): string {
  if (method === "none") return "None";
  if (method === "swipe") return "Swipe";
  if (method === "pin4") return "PIN (4-digit)";
  if (method === "pin6") return "PIN (6-digit)";
  if (method === "password") return "Password";
  return "Pattern";
}

function quickUnlockLabel(quickUnlock: { windowsHello: boolean; passkey: boolean }): string {
  const enabledMethods = [quickUnlock.passkey ? "Passkey" : null].filter((entry): entry is string => Boolean(entry));
  return enabledMethods.length ? enabledMethods.join(" + ") : "Disabled";
}

function effectiveThemeColor(baseMode: BaseModeId, themeColor: ThemeColorId): ThemeColorId {
  return baseMode === "amoled" ? "neutral" : themeColor;
}

function effectiveAccentOverride(baseMode: BaseModeId, accentOverride: AccentOverrideId): AccentOverrideId {
  return baseMode === "amoled" ? "none" : accentOverride;
}

function describeSettingChanges(prev: AppSettings, next: AppSettings): string[] {
  const changes: string[] = [];
  if (prev.baseMode !== next.baseMode) changes.push(`Mode: ${baseModeLabel(next.baseMode)}`);
  if (effectiveThemeColor(prev.baseMode, prev.themeColor) !== effectiveThemeColor(next.baseMode, next.themeColor)) {
    changes.push(`Theme color: ${next.baseMode === "amoled" ? "Neutral" : next.themeColor}`);
  }
  if (effectiveAccentOverride(prev.baseMode, prev.accentOverride) !== effectiveAccentOverride(next.baseMode, next.accentOverride)) {
    changes.push(`Accent: ${accentOverrideLabel(effectiveAccentOverride(next.baseMode, next.accentOverride))}`);
  }
  if (prev.motionMode !== next.motionMode) changes.push(`Motion: ${motionModeLabel(next.motionMode)}`);
  if (prev.pauseWhenBackground !== next.pauseWhenBackground) {
    changes.push(`Pause in background: ${next.pauseWhenBackground ? "On" : "Off"}`);
  }
  if (prev.defaultDigits !== next.defaultDigits) changes.push(`Digits: ${next.defaultDigits}`);
  if (prev.defaultPeriod !== next.defaultPeriod) changes.push(`Period: ${next.defaultPeriod}s`);
  if (prev.hideLabelsOnSmall !== next.hideLabelsOnSmall) changes.push(`Compact account text: ${next.hideLabelsOnSmall ? "On" : "Off"}`);
  if (prev.privacyScreen !== next.privacyScreen) changes.push(`Privacy Screen: ${next.privacyScreen ? "On" : "Off"}`);
  if (prev.clipboardSafetyEnabled !== next.clipboardSafetyEnabled) {
    changes.push(`Clipboard safety: ${next.clipboardSafetyEnabled ? "On" : "Off"}`);
  }
  if (prev.runInBackground !== next.runInBackground) {
    changes.push(`Run in background: ${next.runInBackground ? "On" : "Off"}`);
  }
  if (prev.startWithSystem !== next.startWithSystem) {
    changes.push(`Start with system: ${next.startWithSystem ? "On" : "Off"}`);
  }
  if (prev.alwaysOnTop !== next.alwaysOnTop) changes.push(`Always on top: ${next.alwaysOnTop ? "On" : "Off"}`);
  if (prev.biometricEnabled !== next.biometricEnabled) changes.push(`Touch ID Prompt: ${next.biometricEnabled ? "On" : "Off"}`);
  if (prev.autoLockSeconds !== next.autoLockSeconds) changes.push(`Lock after: ${autoLockLabel(next.autoLockSeconds)}`);
  if (prev.lockOnFocusLoss !== next.lockOnFocusLoss) changes.push(`Lock on focus loss: ${next.lockOnFocusLoss ? "On" : "Off"}`);
  if (prev.accountsLayoutMode !== next.accountsLayoutMode) changes.push(`Layout: ${next.accountsLayoutMode}`);
  if (prev.accountsGridColumns !== next.accountsGridColumns) changes.push(`Columns: ${next.accountsGridColumns}`);
  if (prev.accountsDensity !== next.accountsDensity) changes.push(`Density: ${next.accountsDensity}`);
  return changes;
}

function mergeChangedSettings(latest: AppSettings, previous: AppSettings, next: AppSettings): AppSettings {
  const merged: AppSettings = { ...latest };
  const mutableMerged = merged as Record<keyof AppSettings, AppSettings[keyof AppSettings]>;

  for (const key of Object.keys(next) as Array<keyof AppSettings>) {
    if (Object.is(previous[key], next[key])) {
      continue;
    }
    mutableMerged[key] = next[key];
  }

  return merged;
}

function resolveLayoutMode(mode: AccountsLayoutMode, viewportWidth: number): "list" | "grid" {
  if (mode === "list") return "list";
  if (mode === "grid") return "grid";
  return viewportWidth < 720 ? "list" : "grid";
}

function resolveLayoutColumns(layoutMode: "list" | "grid", columns: AccountsGridColumns, viewportWidth: number): 1 | 2 | 3 {
  if (layoutMode === "list") return 1;

  let maxColumns: 1 | 2 | 3 = 1;
  if (viewportWidth >= 900) {
    maxColumns = 2;
  }
  if (viewportWidth >= 1320) {
    maxColumns = 3;
  }

  if (columns === 1 || columns === 2 || columns === 3) {
    return Math.min(columns, maxColumns) as 1 | 2 | 3;
  }

  return maxColumns;
}

function mergeCodeMap(prev: Record<string, CodeResult>, nextResults: CodeResult[]): Record<string, CodeResult> {
  const next: Record<string, CodeResult> = {};
  let changed = false;

  for (const result of nextResults) {
    const previous = prev[result.id];
    if (previous && previous.code === result.code && previous.remainingSeconds === result.remainingSeconds) {
      next[result.id] = previous;
      continue;
    }
    next[result.id] = result;
    changed = true;
  }

  const previousKeys = Object.keys(prev);
  if (previousKeys.length !== nextResults.length) {
    changed = true;
  }

  return changed ? next : prev;
}

function BannerCountdown({ untilMs, prefix, paused }: BannerCountdownProps) {
  const [remainingSeconds, setRemainingSeconds] = React.useState(() => Math.max(0, Math.ceil((untilMs - Date.now()) / 1000)));

  React.useEffect(() => {
    const update = () => {
      setRemainingSeconds(Math.max(0, Math.ceil((untilMs - Date.now()) / 1000)));
    };

    update();
    if (paused) return;

    const timer = window.setInterval(update, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [paused, untilMs]);

  return (
    <span className="auth-banner-countdown" aria-hidden="true">
      {prefix} {remainingSeconds}s
    </span>
  );
}

export function App({ bridge, windowControls, titleBarIconSrc }: Props) {
  const lockApi = bridge.lockAPI;

  const [securityReady, setSecurityReady] = React.useState(false);
  const [locked, setLocked] = React.useState(false);
  const [lockMethod, setLockMethod] = React.useState<LockMethod>("none");
  const [lockMethodsConfig, setLockMethodsConfig] = React.useState<LockMethodsConfig>({
    primaryLockMethod: "none",
    secondaryLockMethod: null,
  });
  const [methodConfigured, setMethodConfigured] = React.useState(false);
  const [pinLockConfigured, setPinLockConfigured] = React.useState(false);
  const [passwordLockConfigured, setPasswordLockConfigured] = React.useState(false);
  const [pinDigits, setPinDigits] = React.useState<4 | 6>(4);
  const [quickUnlock, setQuickUnlock] = React.useState<{ windowsHello: boolean; passkey: boolean }>({
    windowsHello: false,
    passkey: false,
  });
  const [biometricAvailable, setBiometricAvailable] = React.useState(false);

  const [settings, setSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(readPrefersReducedMotion);
  const [documentBackgrounded, setDocumentBackgrounded] = React.useState(
    () => typeof document !== "undefined" && document.visibilityState !== "visible"
  );
  const [windowBackgrounded, setWindowBackgrounded] = React.useState(false);
  const [appVersion, setAppVersion] = React.useState("");
  const [showAdd, setShowAdd] = React.useState(false);
  const [addExiting, setAddExiting] = React.useState(false);
  const [addModalMethod, setAddModalMethod] = React.useState<AddModalMethod>("uri");
  const [addModalAutoScan, setAddModalAutoScan] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [settingsExiting, setSettingsExiting] = React.useState(false);
  const [showSafetySetup, setShowSafetySetup] = React.useState(false);
  const [safetySetupExiting, setSafetySetupExiting] = React.useState(false);
  const [safetySetupMode, setSafetySetupMode] = React.useState<"auto" | "manual">("auto");
  const [showCommandPalette, setShowCommandPalette] = React.useState(false);
  const [commandPaletteExiting, setCommandPaletteExiting] = React.useState(false);
  const [activeSettingsCategory, setActiveSettingsCategory] = React.useState<SettingsCategory>("appearance");
  const [settingsPanelDirection, setSettingsPanelDirection] = React.useState<"forward" | "backward">("forward");
  const [settingsCategoryMenuOpen, setSettingsCategoryMenuOpen] = React.useState(false);
  const [backupPassphrase, setBackupPassphrase] = React.useState("");
  const [backupMode, setBackupMode] = React.useState<"merge" | "replace">("merge");
  const [vaultProtection, setVaultProtection] = React.useState<VaultProtectionStatus>(defaultVaultProtectionStatus);
  const [actionError, setActionError] = React.useState<UiError | null>(null);
  const [showStepUpAuth, setShowStepUpAuth] = React.useState(false);
  const [banners, setBanners] = React.useState<BannerToast[]>([]);
  const [migrationPassword, setMigrationPassword] = React.useState("");
  const [migrationPasswordConfirm, setMigrationPasswordConfirm] = React.useState("");
  const [migrationBusy, setMigrationBusy] = React.useState(false);
  const [migrationError, setMigrationError] = React.useState<string | null>(null);
  const [showRecoveryRotationPrompt, setShowRecoveryRotationPrompt] = React.useState(false);
  const [recoveryRotationPending, setRecoveryRotationPending] = React.useState(false);
  const [recoveryFocusRequest, setRecoveryFocusRequest] = React.useState(0);

  const [showBackupFlowDialog, setShowBackupFlowDialog] = React.useState(false);
  const [backupFlowDialogExiting, setBackupFlowDialogExiting] = React.useState(false);
  const [backupFlowAction, setBackupFlowAction] = React.useState<"export" | "import">("export");

  const [pendingDelete, setPendingDelete] = React.useState<AccountMeta | null>(null);
  const [deleteDialogExiting, setDeleteDialogExiting] = React.useState(false);
  const [editingAccount, setEditingAccount] = React.useState<EditableAccount | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<UiError | null>(null);
  const [layoutSwitching, setLayoutSwitching] = React.useState(false);
  const [lockVisible, setLockVisible] = React.useState(false);
  const [lockExiting, setLockExiting] = React.useState(false);

  const [viewportWidth, setViewportWidth] = React.useState(() => (typeof window !== "undefined" ? window.innerWidth : 460));
  const [isSmall, setIsSmall] = React.useState(() => (typeof window !== "undefined" ? window.innerWidth < 420 : false));
  const [codes, setCodes] = React.useState<Record<string, CodeResult>>({});
  const lastBackgroundErrorRef = React.useRef("");
  const addCloseTimerRef = React.useRef<number | null>(null);
  const commandPaletteCloseTimerRef = React.useRef<number | null>(null);
  const settingsCloseTimerRef = React.useRef<number | null>(null);
  const safetySetupCloseTimerRef = React.useRef<number | null>(null);
  const backupFlowCloseTimerRef = React.useRef<number | null>(null);
  const deleteCloseTimerRef = React.useRef<number | null>(null);
  const lockCloseTimerRef = React.useRef<number | null>(null);
  const clipboardClearTimerRef = React.useRef<number | null>(null);
  const settingsNavRef = React.useRef<HTMLElement | null>(null);
  const settingsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const bannerCloseTimersRef = React.useRef<Record<string, BannerTimer>>({});
  const bannerExitTimersRef = React.useRef<Record<string, BannerTimer>>({});
  const bannerSequenceRef = React.useRef(0);
  const stepUpResolverRef = React.useRef<((verified: boolean) => void) | null>(null);
  const stepUpPromiseRef = React.useRef<Promise<boolean> | null>(null);
  const securitySessionActiveRef = React.useRef(false);
  const lastCopiedCodeRef = React.useRef("");
  const lowEndMotionLoggedRef = React.useRef(false);
  const safetySetupMigrationRef = React.useRef(false);
  const safetySetupReminderRef = React.useRef(false);

  const activeSettingsCategoryOption =
    SETTINGS_CATEGORIES.find((category) => category.id === activeSettingsCategory) ?? SETTINGS_CATEGORIES[0];
  const ActiveSettingsCategoryIcon = activeSettingsCategoryOption.Icon;
  const isCompactSettingsNav = viewportWidth <= 560;
  const settingsCategoryListExpanded = !isCompactSettingsNav || settingsCategoryMenuOpen;

  const dismissBanner = React.useCallback((bannerId: string) => {
    const timer = bannerCloseTimersRef.current[bannerId];
    if (timer != null) {
      window.clearTimeout(timer);
      delete bannerCloseTimersRef.current[bannerId];
    }

    if (bannerExitTimersRef.current[bannerId] != null) {
      return;
    }

    setBanners((previous) => {
      const next = previous.map((entry) => {
        if (entry.id !== bannerId) return entry;
        if (entry.isExiting) return entry;
        return {
          ...entry,
          isExiting: true,
        };
      });
      return next;
    });

    bannerExitTimersRef.current[bannerId] = window.setTimeout(() => {
      delete bannerExitTimersRef.current[bannerId];
      setBanners((previous) => previous.filter((entry) => entry.id !== bannerId));
    }, BANNER_EXIT_DURATION_MS);
  }, []);

  const pushBanner = React.useCallback((next: Banner) => {
    let bannerId = `banner-${Date.now()}-${bannerSequenceRef.current++}`;
    const entry: BannerToast = {
      id: bannerId,
      ...next,
      replaceKey: resolveBannerReplaceKey(next),
      durationMs: resolveBannerDurationMs(next),
      isExiting: false,
    };
    const durationMs = entry.durationMs;

    setBanners((previous) => {
      if (entry.replaceKey) {
        const existingIndex = previous.findIndex((existing) => existing.replaceKey === entry.replaceKey);
        if (existingIndex >= 0) {
          const existing = previous[existingIndex];
          bannerId = existing.id;

          const existingTimer = bannerCloseTimersRef.current[existing.id];
          if (existingTimer != null) {
            window.clearTimeout(existingTimer);
            delete bannerCloseTimersRef.current[existing.id];
          }

          const existingExitTimer = bannerExitTimersRef.current[existing.id];
          if (existingExitTimer != null) {
            window.clearTimeout(existingExitTimer);
            delete bannerExitTimersRef.current[existing.id];
          }

          const nextEntry: BannerToast = {
            ...existing,
            ...entry,
            id: existing.id,
            isExiting: false,
          };

          return previous.map((current, index) => (index === existingIndex ? nextEntry : current));
        }
      }

      const nextStack = [entry, ...previous];
      while (nextStack.length > 3) {
        const removed = nextStack.pop();
        if (!removed) continue;
        const removedTimer = bannerCloseTimersRef.current[removed.id];
        if (removedTimer != null) {
          window.clearTimeout(removedTimer);
          delete bannerCloseTimersRef.current[removed.id];
        }

        const removedExitTimer = bannerExitTimersRef.current[removed.id];
        if (removedExitTimer != null) {
          window.clearTimeout(removedExitTimer);
          delete bannerExitTimersRef.current[removed.id];
        }
      }

      return nextStack;
    });
    bannerCloseTimersRef.current[bannerId] = window.setTimeout(() => {
      dismissBanner(bannerId);
    }, durationMs);
  }, [dismissBanner]);

  const handleBridgeError = React.useCallback(
    (error: unknown) => {
      const friendly = toUiError(error);
      if (friendly.code === "E_LOCKED") return;
      const signature = `${friendly.code}:${friendly.instruction}`;
      if (lastBackgroundErrorRef.current === signature) return;

      lastBackgroundErrorRef.current = signature;
      pushBanner({
        tone: "error",
        title: friendly.title,
        text: friendly.instruction,
        code: friendly.code,
      });

      window.setTimeout(() => {
        if (lastBackgroundErrorRef.current === signature) {
          lastBackgroundErrorRef.current = "";
        }
      }, 2800);
    },
    [pushBanner]
  );

  const { accounts, optimisticAccounts, loading, addUri, addManual, del, updateAccount, reorderAccounts, refresh } = useAccounts(
    bridge,
    securityReady && !locked,
    handleBridgeError
  );
  const syncAlwaysOnTopSetting = React.useCallback((enabled: boolean) => {
    setSettings((previous) => {
      if (previous.alwaysOnTop === enabled) {
        return previous;
      }
      return {
        ...previous,
        alwaysOnTop: enabled,
      };
    });
  }, []);

  React.useEffect(
    () => () => {
      if (addCloseTimerRef.current != null) window.clearTimeout(addCloseTimerRef.current);
      if (commandPaletteCloseTimerRef.current != null) window.clearTimeout(commandPaletteCloseTimerRef.current);
      if (settingsCloseTimerRef.current != null) window.clearTimeout(settingsCloseTimerRef.current);
      if (safetySetupCloseTimerRef.current != null) window.clearTimeout(safetySetupCloseTimerRef.current);
      if (deleteCloseTimerRef.current != null) window.clearTimeout(deleteCloseTimerRef.current);
      if (lockCloseTimerRef.current != null) window.clearTimeout(lockCloseTimerRef.current);
      if (clipboardClearTimerRef.current != null) window.clearTimeout(clipboardClearTimerRef.current);
      for (const timer of Object.values(bannerCloseTimersRef.current)) {
        window.clearTimeout(timer);
      }
      bannerCloseTimersRef.current = {};
      for (const timer of Object.values(bannerExitTimersRef.current)) {
        window.clearTimeout(timer);
      }
      bannerExitTimersRef.current = {};
    },
    []
  );

  const resolvedBaseMode = settings.baseMode;
  const resolvedThemeColor = effectiveThemeColor(settings.baseMode, settings.themeColor);
  const resolvedAccentOverride = effectiveAccentOverride(settings.baseMode, settings.accentOverride);
  const accentClass = `accent-${resolvedAccentOverride}`;
  const themeClass = `theme-${resolvedBaseMode} theme-color-${resolvedThemeColor} ${accentClass}`;
  const rootClassName = `auth-root ${themeClass}${windowControls ? " auth-root-with-titlebar" : ""}`;
  const lowEndHardwareReduced = React.useMemo(() => shouldReduceForLowEndHardware(), []);
  const resolvedMotionMode = resolveMotionMode(settings.motionMode, prefersReducedMotion, settings.motionMode === "system" && lowEndHardwareReduced);
  const motionVariants = React.useMemo(() => getMotionVariants(settings.motionMode, prefersReducedMotion), [prefersReducedMotion, settings.motionMode]);
  const overlayPresence = React.useMemo(() => combineMotionPresets(motionVariants.fadeIn, motionVariants.fadeOut), [motionVariants]);
  const modalPresence = React.useMemo(() => combineMotionPresets(motionVariants.scaleIn, motionVariants.scaleOut), [motionVariants]);
  const toastPresence = React.useMemo(() => combineMotionPresets(motionVariants.slideUp, motionVariants.fadeOut), [motionVariants]);
  const settingsOverlayPresence = React.useMemo(() => {
    const preset = combineMotionPresets(motionVariants.fadeIn, motionVariants.fadeOut);
    if (resolvedMotionMode !== "full") {
      return preset;
    }

    return {
      ...preset,
      transition: { duration: 0.2, ease: ease.decelerate },
    };
  }, [motionVariants, resolvedMotionMode]);
  const settingsModalPresence = React.useMemo(() => {
    if (resolvedMotionMode !== "full") {
      return modalPresence;
    }

    return {
      initial: "initial",
      animate: "animate",
      exit: "exit",
      variants: {
        initial: { opacity: 0, scale: 0.986, y: 14 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.994, y: 4 },
      },
      transition: { duration: 0.27, ease: ease.decelerate },
    };
  }, [modalPresence, resolvedMotionMode]);
  const settingsLayoutPresence = React.useMemo(() => {
    const preset = combineMotionPresets(motionVariants.fadeSlideUp, motionVariants.fadeOut);
    if (resolvedMotionMode !== "full") {
      return preset;
    }

    return {
      ...preset,
      transition: { duration: 0.18, ease: ease.decelerate },
    };
  }, [motionVariants, resolvedMotionMode]);
  const settingsPanelPresence = React.useMemo(
    () => {
      if (resolvedMotionMode !== "full") {
        return combineMotionPresets(
          settingsPanelDirection === "forward" ? motionVariants.stepEnterForward : motionVariants.stepEnterBackward,
          settingsPanelDirection === "forward" ? motionVariants.stepExitForward : motionVariants.stepExitBackward
        );
      }

      const distance = 14;
      const enterX = settingsPanelDirection === "forward" ? distance : -distance;
      const exitX = settingsPanelDirection === "forward" ? -distance : distance;

      return {
        initial: "initial",
        animate: "animate",
        exit: "exit",
        variants: {
          initial: { opacity: 0, x: enterX, y: 2 },
          animate: { opacity: 1, x: 0, y: 0 },
          exit: { opacity: 0, x: exitX, y: -1 },
        },
        transition: { duration: 0.2, ease: ease.decelerate },
      };
    },
    [motionVariants, resolvedMotionMode, settingsPanelDirection]
  );
  const lockOverlayPresence = React.useMemo(() => {
    if (resolvedMotionMode !== "full") {
      return overlayPresence;
    }

    return {
      initial: "initial",
      animate: "animate",
      exit: "exit",
      variants: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      },
      transition: { duration: 0.2, ease: ease.decelerate },
    };
  }, [overlayPresence, resolvedMotionMode]);
  const isBackgrounded = documentBackgrounded || windowBackgrounded;
  const motionPaused = settings.pauseWhenBackground && isBackgrounded;
  const shouldAnimateSettingsPanels =
    resolvedMotionMode !== "off" && !(typeof process !== "undefined" && typeof process.env === "object" && typeof process.env.VITEST !== "undefined");
  const modalMotionDurationMs = resolvedMotionMode === "off" ? 0 : resolvedMotionMode === "reduced" ? 140 : MOTION_MODAL_DURATION_MS;
  const isDevelopmentBuild = typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(window.location.host);

  React.useEffect(() => {
    if (!showSettings) return;
    const node = settingsScrollRef.current;
    if (!node) return;
    if (typeof node.scrollTo === "function") {
      node.scrollTo({ top: 0, behavior: resolvedMotionMode === "full" ? "smooth" : "auto" });
      return;
    }
    node.scrollTop = 0;
  }, [activeSettingsCategory, resolvedMotionMode, showSettings]);


  React.useEffect(() => {
    if (!windowControls) {
      return;
    }

    let active = true;
    const apply = (enabled: boolean) => {
      if (!active) {
        return;
      }
      syncAlwaysOnTopSetting(!!enabled);
    };

    if (typeof windowControls.getAlwaysOnTop === "function") {
      void windowControls
        .getAlwaysOnTop()
        .then((enabled) => {
          apply(enabled);
        })
        .catch(() => {
          // no-op
        });
    }

    const unsubscribe = windowControls.onAlwaysOnTopChanged?.((enabled) => {
      apply(enabled);
    });

    return () => {
      active = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [syncAlwaysOnTopSetting, windowControls]);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    apply();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", apply);
      return () => {
        mediaQuery.removeEventListener("change", apply);
      };
    }

    mediaQuery.addListener(apply);
    return () => {
      mediaQuery.removeListener(apply);
    };
  }, []);

  React.useEffect(() => {
    const handleVisibilityChange = () => {
      setDocumentBackgrounded(document.visibilityState !== "visible");
    };

    const handleWindowBlur = () => {
      setDocumentBackgrounded(true);
    };

    const handleWindowFocus = () => {
      setDocumentBackgrounded(document.visibilityState !== "visible");
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

  React.useEffect(() => {
    if (!windowControls) {
      setWindowBackgrounded(false);
      return;
    }

    let active = true;
    const apply = (next: boolean) => {
      if (!active) return;
      setWindowBackgrounded(!!next);
    };

    if (typeof windowControls.isBackgrounded === "function") {
      void windowControls
        .isBackgrounded()
        .then((next) => {
          apply(next);
        })
        .catch(() => {
          // no-op
        });
    }

    const unsubscribe = windowControls.onBackgroundedChanged?.((next) => {
      apply(next);
    });

    return () => {
      active = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [windowControls]);

  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.mode = resolvedBaseMode;
    root.dataset.themeColor = resolvedThemeColor;
    root.dataset.accent = resolvedAccentOverride;
    root.dataset.motion = resolvedMotionMode;
    root.dataset.paused = motionPaused ? "true" : "false";
    return () => {
      delete root.dataset.mode;
      delete root.dataset.themeColor;
      delete root.dataset.accent;
      delete root.dataset.motion;
      delete root.dataset.paused;
    };
  }, [motionPaused, resolvedAccentOverride, resolvedBaseMode, resolvedMotionMode, resolvedThemeColor]);

  React.useEffect(() => {
    if (!isDevelopmentBuild) return;
    if (settings.motionMode !== "system") return;
    if (!lowEndHardwareReduced) return;
    if (lowEndMotionLoggedRef.current) return;
    lowEndMotionLoggedRef.current = true;
    const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
    console.info("[motion] low-end hardware hint active in system mode; resolving to reduced motion", {
      deviceMemory: nav?.deviceMemory,
      hardwareConcurrency: nav?.hardwareConcurrency,
    });
  }, [isDevelopmentBuild, lowEndHardwareReduced, settings.motionMode]);

  React.useEffect(() => {
    if (!windowControls || typeof windowControls.getVersion !== "function") {
      return;
    }

    let active = true;
    void windowControls
      .getVersion()
      .then((version) => {
        if (!active) return;
        const normalized = typeof version === "string" ? version.trim() : "";
        if (!normalized) return;
        setAppVersion(normalized);
      })
      .catch(() => {
        // no-op
      });

    return () => {
      active = false;
    };
  }, [windowControls]);

  React.useEffect(() => {
    if (!securityReady || locked) {
      setCodes({});
      return;
    }
    if (motionPaused) {
      return;
    }

    let active = true;

    const refreshCodes = async () => {
      try {
        const next = await bridge.codes();
        if (!active) return;
        setCodes((prev) => mergeCodeMap(prev, next));
      } catch (error) {
        if (!active) return;
        setCodes({});
        handleBridgeError(error);
      }
    };

    void refreshCodes();
    const timer = window.setInterval(() => {
      void refreshCodes();
    }, 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [bridge, handleBridgeError, locked, motionPaused, securityReady]);

  const refreshSettings = React.useCallback(async () => {
    const next = await bridge.getSettings();
    setSettings(next);
  }, [bridge]);

  const loadSecuritySnapshot = React.useCallback(async () => {
    const [methodRaw, methodsConfigRaw, biometric, quickConfig, lockedStatus, hasPinCredential, hasPasswordCredential] = await Promise.all([
      lockApi.getMethod(),
      lockApi.getMethodsConfig ? lockApi.getMethodsConfig() : Promise.resolve(null),
      lockApi.biometricAvailable(),
      lockApi.getQuickUnlock ? lockApi.getQuickUnlock() : Promise.resolve({ windowsHello: false, passkey: false }),
      lockApi.getStatus ? lockApi.getStatus() : Promise.resolve(false),
      lockApi.hasCredential("pin"),
      lockApi.hasCredential("password"),
    ]);

    const method = normalizeLockMethod(methodRaw);
    const methodsConfig = methodsConfigRaw
      ? normalizeLockMethodsConfig(methodsConfigRaw)
      : { primaryLockMethod: normalizeLockMethodKind(method), secondaryLockMethod: null };
    const resolvedPinDigits = lockApi.getPinDigits ? await lockApi.getPinDigits() : 4;
    const primaryMethod = lockMethodFromKind(methodsConfig.primaryLockMethod, resolvedPinDigits === 6 ? 6 : 4, method);
    const passkeys =
      primaryMethod === "passkey" || methodsConfig.secondaryLockMethod === "passkey"
        ? lockApi.passkeyListCredentials
          ? await lockApi.passkeyListCredentials()
          : []
        : [];
    const configured = isCredentialMethod(primaryMethod)
      ? primaryMethod === "pin4" || primaryMethod === "pin6"
        ? (await lockApi.hasCredential("pin")) && (primaryMethod === "pin6" ? resolvedPinDigits === 6 : resolvedPinDigits === 4)
        : await lockApi.hasCredential(primaryMethod)
      : primaryMethod === "swipe"
        ? true
        : primaryMethod === "passkey"
          ? passkeys.length > 0
          : false;
    const digits = primaryMethod === "pin4" || primaryMethod === "pin6" ? resolvedPinDigits : 4;

    return {
      method: primaryMethod,
      methodsConfig,
      configured,
      biometric,
      quickUnlock: {
        windowsHello: false,
        passkey: !!quickConfig.passkey,
      },
      pinDigits: digits as 4 | 6,
      locked: !!lockedStatus,
      pinConfigured: !!hasPinCredential,
      passwordConfigured: !!hasPasswordCredential,
    };
  }, [lockApi]);

  const refreshSecurityState = React.useCallback(async () => {
    const snapshot = await loadSecuritySnapshot();
    setLockMethod(snapshot.method);
    setLockMethodsConfig(snapshot.methodsConfig);
    setMethodConfigured(snapshot.configured);
    setBiometricAvailable(snapshot.biometric);
    setQuickUnlock(snapshot.quickUnlock);
    setPinDigits(snapshot.pinDigits);
    setLocked(snapshot.locked);
    setPinLockConfigured(snapshot.pinConfigured);
    setPasswordLockConfigured(snapshot.passwordConfigured);
    return snapshot;
  }, [loadSecuritySnapshot]);

  const refreshVaultProtectionStatus = React.useCallback(async () => {
    const status = bridge.getVaultProtectionStatus ? await bridge.getVaultProtectionStatus() : defaultVaultProtectionStatus();
    setVaultProtection(status);
    return status;
  }, [bridge]);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [initialSettings, snapshot, initialVaultProtection] = await Promise.all([
          bridge.getSettings(),
          loadSecuritySnapshot(),
          bridge.getVaultProtectionStatus ? bridge.getVaultProtectionStatus() : Promise.resolve(defaultVaultProtectionStatus()),
        ]);
        if (!active) return;
        setSettings(initialSettings);
        setVaultProtection(initialVaultProtection);
        setLockMethod(snapshot.method);
        setLockMethodsConfig(snapshot.methodsConfig);
        setMethodConfigured(snapshot.configured);
        setBiometricAvailable(snapshot.biometric);
        setQuickUnlock(snapshot.quickUnlock);
        setPinDigits(snapshot.pinDigits);
        setLocked(snapshot.locked);
        setPinLockConfigured(snapshot.pinConfigured);
        setPasswordLockConfigured(snapshot.passwordConfigured);
        const shouldAutoShowSafetySetup =
          !initialVaultProtection.migrationRequired &&
          isUnprotectedLockState(snapshot.method, snapshot.configured) &&
          !initialSettings.hasCompletedSafetySetup &&
          !initialSettings.hasSkippedSafetySetup;
        setSafetySetupMode("auto");
        setShowSafetySetup(shouldAutoShowSafetySetup);
      } catch {
        if (!active) return;
        setSettings(DEFAULT_SETTINGS);
        setVaultProtection(defaultVaultProtectionStatus());
        setLockMethod("none");
        setLockMethodsConfig({ primaryLockMethod: "none", secondaryLockMethod: null });
        setMethodConfigured(false);
        setBiometricAvailable(false);
        setQuickUnlock({ windowsHello: false, passkey: false });
        setPinDigits(4);
        setLocked(false);
        setPinLockConfigured(false);
        setPasswordLockConfigured(false);
        setSafetySetupMode("auto");
        setShowSafetySetup(false);
      } finally {
        if (active) {
          setSecurityReady(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [bridge, loadSecuritySnapshot]);

  React.useEffect(() => {
    const unsubscribe = lockApi.onShowLockScreen(() => {
      setLocked(true);
    });
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [lockApi]);

  React.useEffect(() => {
    if (!securityReady || locked) return;
    void refreshSettings();
    void refreshSecurityState();
    void refreshVaultProtectionStatus();
  }, [locked, refreshSecurityState, refreshSettings, refreshVaultProtectionStatus, securityReady]);

  React.useEffect(() => {
    if (vaultProtection.justUnlockedViaRecovery) {
      writeRecoveryRotationPendingFlag(true);
      setRecoveryRotationPending(true);
      setShowRecoveryRotationPrompt(true);
    }
  }, [vaultProtection.justUnlockedViaRecovery]);

  React.useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (!settings.privacyScreen || !methodConfigured) return;
        void lockApi.lock();
        setLocked(true);
        return;
      }
      if (!locked) {
        void refreshSecurityState();
      }
    };

    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setIsSmall(window.innerWidth < 420);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", onResize);
    };
  }, [lockApi, locked, methodConfigured, refreshSecurityState, settings.privacyScreen]);

  React.useEffect(() => {
    if (!showSettings) {
      setActionError(null);
    }
  }, [showSettings]);

  React.useEffect(() => {
    setLayoutSwitching(true);
    const timer = window.setTimeout(() => setLayoutSwitching(false), 180);
    return () => window.clearTimeout(timer);
  }, [settings.accountsDensity, settings.accountsGridColumns, settings.accountsLayoutMode]);

  React.useEffect(() => {
    if (showSettings) return;
    setBackupPassphrase("");
    setShowBackupFlowDialog(false);
    setBackupFlowDialogExiting(false);
    setBackupFlowAction("export");
  }, [showSettings]);

  React.useEffect(() => {
    if (!locked) return;
    setShowRecoveryRotationPrompt(false);
    setShowAdd(false);
    if (commandPaletteCloseTimerRef.current != null) {
      window.clearTimeout(commandPaletteCloseTimerRef.current);
      commandPaletteCloseTimerRef.current = null;
    }
    setShowCommandPalette(false);
    setCommandPaletteExiting(false);
    setShowSettings(false);
    setBackupPassphrase("");
    setShowBackupFlowDialog(false);
    setBackupFlowDialogExiting(false);
    setBackupFlowAction("export");
    setShowSafetySetup(false);
    setEditingAccount(null);
    setPendingDelete(null);
    setDeleteError(null);
  }, [locked]);

  React.useEffect(() => {
    if (locked) {
      securitySessionActiveRef.current = false;
      if (stepUpResolverRef.current) {
        stepUpResolverRef.current(false);
        stepUpResolverRef.current = null;
      }
      stepUpPromiseRef.current = null;
      setShowStepUpAuth(false);
      if (lockCloseTimerRef.current != null) {
        window.clearTimeout(lockCloseTimerRef.current);
        lockCloseTimerRef.current = null;
      }
      setLockVisible(true);
      setLockExiting(false);
      return;
    }

    if (!lockVisible) return;
    setLockExiting(true);
    if (lockCloseTimerRef.current != null) {
      window.clearTimeout(lockCloseTimerRef.current);
    }
    lockCloseTimerRef.current = window.setTimeout(() => {
      setLockVisible(false);
      setLockExiting(false);
      lockCloseTimerRef.current = null;
    }, modalMotionDurationMs);
  }, [lockVisible, locked, modalMotionDurationMs]);

  const previousLockedRef = React.useRef(locked);

  React.useEffect(() => {
    if (previousLockedRef.current && !locked && recoveryRotationPending) {
      setShowRecoveryRotationPrompt(true);
    }
    previousLockedRef.current = locked;
  }, [locked, recoveryRotationPending]);

  const requestStepUpAuth = React.useCallback((): Promise<boolean> => {
    if (stepUpPromiseRef.current) {
      return stepUpPromiseRef.current;
    }

    const pending = new Promise<boolean>((resolve) => {
      stepUpResolverRef.current = (verified) => {
        stepUpResolverRef.current = null;
        stepUpPromiseRef.current = null;
        setShowStepUpAuth(false);
        resolve(verified);
      };
      setShowStepUpAuth(true);
    });

    stepUpPromiseRef.current = pending;
    return pending;
  }, []);

  const closeSecuritySession = React.useCallback(async () => {
    if (!securitySessionActiveRef.current) {
      return;
    }
    securitySessionActiveRef.current = false;
    if (!lockApi.closeSecuritySession) {
      return;
    }
    await lockApi.closeSecuritySession().catch((): undefined => undefined);
  }, [lockApi]);

  const requestSecuritySession = React.useCallback(async (): Promise<boolean> => {
    if (securitySessionActiveRef.current) {
      return true;
    }
    return await requestStepUpAuth();
  }, [requestStepUpAuth]);

  const resolveStepUpAuth = React.useCallback((verified: boolean) => {
    if (!stepUpResolverRef.current) {
      setShowStepUpAuth(false);
      stepUpPromiseRef.current = null;
      return;
    }

    const resolve = stepUpResolverRef.current;
    stepUpResolverRef.current = null;
    stepUpPromiseRef.current = null;
    setShowStepUpAuth(false);
    resolve(verified);
  }, []);

  const runSensitiveAction = React.useCallback(
    async <T,>(
      action: () => Promise<T>,
      options?: { requiresSecuritySession?: boolean; promptFirst?: boolean }
    ): Promise<SensitiveActionResult<T>> => {
      if (options?.requiresSecuritySession && options.promptFirst) {
        await closeSecuritySession();
        const verified = await requestStepUpAuth();
        if (!verified) {
          return { status: "cancelled" };
        }
        const opened = lockApi.openSecuritySession ? await lockApi.openSecuritySession() : false;
        if (opened === false) {
          return { status: "cancelled" };
        }
        securitySessionActiveRef.current = true;
      }

      try {
        return { status: "ok", value: await action() };
      } catch (error) {
        if (!isStepUpRequiredError(error)) {
          throw error;
        }

        if (options?.requiresSecuritySession) {
          securitySessionActiveRef.current = false;
        }

        const verified = await requestStepUpAuth();
        if (!verified) {
          return { status: "cancelled" };
        }

        try {
          return { status: "ok", value: await action() };
        } catch (retryError) {
          if (!options?.requiresSecuritySession || !isStepUpRequiredError(retryError)) {
            throw retryError;
          }

          const opened = lockApi.openSecuritySession ? await lockApi.openSecuritySession() : false;
          if (opened === false) {
            return { status: "cancelled" };
          }
          securitySessionActiveRef.current = true;
          return { status: "ok", value: await action() };
        }
      }
    },
    [closeSecuritySession, lockApi, requestStepUpAuth]
  );

  const clearClipboardAutoClearTimer = React.useCallback(() => {
    if (clipboardClearTimerRef.current == null) return;
    window.clearTimeout(clipboardClearTimerRef.current);
    clipboardClearTimerRef.current = null;
  }, []);

  const scheduleClipboardAutoClear = React.useCallback(
    (copiedCode: string, clearAfterMs = 30_000) => {
      lastCopiedCodeRef.current = copiedCode;
      clearClipboardAutoClearTimer();

      if (!settings.clipboardSafetyEnabled) {
        return;
      }

      clipboardClearTimerRef.current = window.setTimeout(async () => {
        if (bridge.clearClipboard) {
          await bridge.clearClipboard(copiedCode).catch(() => false);
        } else {
          const current = await navigator.clipboard.readText().catch(() => "");
          if (current === copiedCode) {
            await navigator.clipboard.writeText("").catch((): undefined => undefined);
          }
        }
        if (lastCopiedCodeRef.current === copiedCode) {
          lastCopiedCodeRef.current = "";
        }
        clipboardClearTimerRef.current = null;
      }, clearAfterMs);
    },
    [bridge, clearClipboardAutoClearTimer, settings.clipboardSafetyEnabled]
  );

  React.useEffect(() => {
    if (settings.clipboardSafetyEnabled) {
      return;
    }
    clearClipboardAutoClearTimer();
  }, [clearClipboardAutoClearTimer, settings.clipboardSafetyEnabled]);

  const openAddModal = React.useCallback((options?: { method?: AddModalMethod; openScanOverlay?: boolean }) => {
    if (addCloseTimerRef.current != null) {
      window.clearTimeout(addCloseTimerRef.current);
      addCloseTimerRef.current = null;
    }
    setAddModalMethod(options?.method ?? "uri");
    setAddModalAutoScan(Boolean(options?.openScanOverlay));
    setAddExiting(false);
    setShowAdd(true);
  }, []);

  const closeAddModal = React.useCallback(() => {
    if (!showAdd) return;
    setAddExiting(true);
    if (addCloseTimerRef.current != null) {
      window.clearTimeout(addCloseTimerRef.current);
    }
    addCloseTimerRef.current = window.setTimeout(() => {
      setShowAdd(false);
      setAddExiting(false);
      setAddModalMethod("uri");
      setAddModalAutoScan(false);
      addCloseTimerRef.current = null;
    }, modalMotionDurationMs);
  }, [modalMotionDurationMs, showAdd]);

  const openCommandPalette = React.useCallback(() => {
    if (commandPaletteCloseTimerRef.current != null) {
      window.clearTimeout(commandPaletteCloseTimerRef.current);
      commandPaletteCloseTimerRef.current = null;
    }
    setCommandPaletteExiting(false);
    setShowCommandPalette(true);
  }, []);

  const closeCommandPalette = React.useCallback(() => {
    if (!showCommandPalette) return;
    setCommandPaletteExiting(true);
    if (commandPaletteCloseTimerRef.current != null) {
      window.clearTimeout(commandPaletteCloseTimerRef.current);
    }
    commandPaletteCloseTimerRef.current = window.setTimeout(() => {
      setShowCommandPalette(false);
      setCommandPaletteExiting(false);
      commandPaletteCloseTimerRef.current = null;
    }, modalMotionDurationMs);
  }, [modalMotionDurationMs, showCommandPalette]);

  const selectSettingsCategory = React.useCallback((category: SettingsCategory) => {
    if (category !== activeSettingsCategory) {
      const currentIndex = SETTINGS_CATEGORIES.findIndex((item) => item.id === activeSettingsCategory);
      const nextIndex = SETTINGS_CATEGORIES.findIndex((item) => item.id === category);
      setSettingsPanelDirection(nextIndex >= currentIndex ? "forward" : "backward");
      setActiveSettingsCategory(category);
    }
    setSettingsCategoryMenuOpen(false);
  }, [activeSettingsCategory]);

  const openSettingsModal = React.useCallback(() => {
    if (settingsCloseTimerRef.current != null) {
      window.clearTimeout(settingsCloseTimerRef.current);
      settingsCloseTimerRef.current = null;
    }
    setSettingsExiting(false);
    setSettingsCategoryMenuOpen(false);
    setShowSettings(true);
  }, []);

  const openSecuritySettings = React.useCallback(() => {
    setShowRecoveryRotationPrompt(false);
    openSettingsModal();
    selectSettingsCategory("security");
    setRecoveryFocusRequest((previous) => previous + 1);
  }, [openSettingsModal, selectSettingsCategory]);

  const closeSettingsModal = React.useCallback(() => {
    if (!showSettings) return;
    void closeSecuritySession();
    setSettingsExiting(true);
    setSettingsCategoryMenuOpen(false);
    if (settingsCloseTimerRef.current != null) {
      window.clearTimeout(settingsCloseTimerRef.current);
    }
    settingsCloseTimerRef.current = window.setTimeout(() => {
      setShowSettings(false);
      setSettingsExiting(false);
      settingsCloseTimerRef.current = null;
    }, modalMotionDurationMs);
  }, [closeSecuritySession, modalMotionDurationMs, showSettings]);

  const openSafetySetup = React.useCallback((mode: "auto" | "manual") => {
    if (safetySetupCloseTimerRef.current != null) {
      window.clearTimeout(safetySetupCloseTimerRef.current);
      safetySetupCloseTimerRef.current = null;
    }
    setSafetySetupMode(mode);
    setSafetySetupExiting(false);
    setShowSafetySetup(true);
  }, []);

  const closeSafetySetup = React.useCallback(() => {
    if (!showSafetySetup) return;
    void closeSecuritySession();
    setSafetySetupExiting(true);
    if (safetySetupCloseTimerRef.current != null) {
      window.clearTimeout(safetySetupCloseTimerRef.current);
    }
    safetySetupCloseTimerRef.current = window.setTimeout(() => {
      setShowSafetySetup(false);
      setSafetySetupExiting(false);
      safetySetupCloseTimerRef.current = null;
    }, modalMotionDurationMs);
  }, [closeSecuritySession, modalMotionDurationMs, showSafetySetup]);

  const openBackupFlowDialog = React.useCallback((action: "export" | "import" = "export") => {
    if (backupFlowCloseTimerRef.current != null) {
      window.clearTimeout(backupFlowCloseTimerRef.current);
      backupFlowCloseTimerRef.current = null;
    }
    setActionError(null);
    setBackupFlowAction(action);
    setBackupFlowDialogExiting(false);
    setShowBackupFlowDialog(true);
  }, []);

  const closeBackupFlowDialog = React.useCallback(() => {
    if (!showBackupFlowDialog) return;
    void closeSecuritySession();
    setBackupFlowDialogExiting(true);
    if (backupFlowCloseTimerRef.current != null) {
      window.clearTimeout(backupFlowCloseTimerRef.current);
    }
    backupFlowCloseTimerRef.current = window.setTimeout(() => {
      setShowBackupFlowDialog(false);
      setBackupFlowDialogExiting(false);
      setBackupFlowAction("export");
      setBackupPassphrase("");
      setActionError(null);
      backupFlowCloseTimerRef.current = null;
    }, modalMotionDurationMs);
  }, [closeSecuritySession, modalMotionDurationMs, showBackupFlowDialog]);

  const closeDeleteDialog = React.useCallback(() => {
    if (!pendingDelete) return;
    setDeleteDialogExiting(true);
    if (deleteCloseTimerRef.current != null) {
      window.clearTimeout(deleteCloseTimerRef.current);
    }
    deleteCloseTimerRef.current = window.setTimeout(() => {
      setPendingDelete(null);
      setDeleteError(null);
      setDeleteDialogExiting(false);
      deleteCloseTimerRef.current = null;
    }, modalMotionDurationMs);
  }, [modalMotionDurationMs, pendingDelete]);

  React.useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (editingAccount) {
        setEditingAccount(null);
        return;
      }
      if (showCommandPalette) {
        closeCommandPalette();
        return;
      }
      if (showSafetySetup) {
        closeSafetySetup();
        return;
      }
      if (pendingDelete) {
        closeDeleteDialog();
        return;
      }
      if (showBackupFlowDialog) {
        closeBackupFlowDialog();
        return;
      }
      if (showAdd) {
        closeAddModal();
        return;
      }
      if (showSettings) {
        closeSettingsModal();
      }
    };

    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [
    closeAddModal,
    closeBackupFlowDialog,
    closeCommandPalette,
    closeDeleteDialog,
    closeSafetySetup,
    closeSettingsModal,
    editingAccount,
    pendingDelete,
    showAdd,
    showBackupFlowDialog,
    showCommandPalette,
    showSafetySetup,
    showSettings,
  ]);

  React.useEffect(() => {
    const onCommandPaletteShortcut = (event: KeyboardEvent) => {
      const isPaletteShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (!isPaletteShortcut) return;
      if (locked) return;

      event.preventDefault();
      if (showCommandPalette) {
        closeCommandPalette();
        return;
      }
      openCommandPalette();
    };

    document.addEventListener("keydown", onCommandPaletteShortcut);
    return () => document.removeEventListener("keydown", onCommandPaletteShortcut);
  }, [closeCommandPalette, locked, openCommandPalette, showCommandPalette]);

  React.useEffect(() => {
    if (!windowControls || typeof windowControls.onAppCommand !== "function") {
      return;
    }

    const unsubscribe = windowControls.onAppCommand((command) => {
      const closeTransientViews = () => {
        if (showCommandPalette) {
          closeCommandPalette();
        }
        if (showAdd) {
          closeAddModal();
        }
        if (showBackupFlowDialog) {
          closeBackupFlowDialog();
        }
        if (showSafetySetup) {
          closeSafetySetup();
        }
      };

      if (command === "open-search") {
        if (locked) return;
        setActionError(null);
        if (showSettings) {
          closeSettingsModal();
        }
        closeTransientViews();
        openCommandPalette();
        return;
      }

      if (command === "open-add-account") {
        if (locked) return;
        setActionError(null);
        if (showSettings) {
          closeSettingsModal();
        }
        closeTransientViews();
        openAddModal({ method: "uri" });
        return;
      }

      if (command === "scan-from-screen") {
        if (locked) return;
        setActionError(null);
        if (showSettings) {
          closeSettingsModal();
        }
        closeTransientViews();
        if (!bridge.scanFromScreen) {
          pushBanner({
            tone: "info",
            title: "Scan unavailable",
            text: "This build does not support screen QR scanning.",
          });
          return;
        }
        openAddModal({ method: "scan", openScanOverlay: true });
        return;
      }

      if (command === "clear-clipboard") {
        if (locked) return;
        setActionError(null);
        void (async () => {
          const lastCopiedCode = lastCopiedCodeRef.current;
          if (!lastCopiedCode) {
            pushBanner({
              tone: "info",
              title: "Clipboard changed. Nothing cleared.",
              text: "Nothing from Vault Authenticator is ready to clear.",
              durationMs: 4000,
            });
            return;
          }

          try {
            let cleared = false;

            if (bridge.clearClipboard) {
              cleared = await bridge.clearClipboard(lastCopiedCode);
            } else {
              const currentValue = await navigator.clipboard.readText();
              if (currentValue === lastCopiedCode) {
                await navigator.clipboard.writeText("");
                cleared = true;
              }
            }

            if (!cleared) {
              pushBanner({
                tone: "info",
                title: "Clipboard changed. Nothing cleared.",
                text: "Current clipboard content was not copied by Vault Authenticator.",
                durationMs: 4000,
              });
              return;
            }

            lastCopiedCodeRef.current = "";
            clearClipboardAutoClearTimer();
            pushBanner({
              tone: "success",
              title: "Clipboard cleared",
              text: "Copied sign-in code was removed from the clipboard.",
              durationMs: 3500,
            });
          } catch {
            pushBanner({
              tone: "error",
              title: "Clipboard unavailable",
              text: "Could not access the clipboard right now.",
              durationMs: 4500,
            });
          }
        })();
        return;
      }

      const settingsCategoryMatch = /^open-settings:(appearance|security|accounts|behavior|advanced)$/.exec(command);
      if (command === "open-settings" || settingsCategoryMatch) {
        if (locked) return;
        setActionError(null);
        closeTransientViews();
        const category = (settingsCategoryMatch?.[1] as SettingsCategory | undefined) ?? "appearance";
        selectSettingsCategory(category);
        openSettingsModal();
        void refreshSecurityState();
        return;
      }

      if (command === "open-safety-setup") {
        if (locked) return;
        setActionError(null);
        closeTransientViews();
        if (showSettings) {
          closeSettingsModal();
        }
        openSafetySetup("manual");
      }
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [
    closeAddModal,
    closeBackupFlowDialog,
    closeCommandPalette,
    closeSettingsModal,
    closeSafetySetup,
    locked,
    openAddModal,
    openCommandPalette,
    openSafetySetup,
    openSettingsModal,
    refreshSecurityState,
    clearClipboardAutoClearTimer,
    bridge,
    lastCopiedCodeRef,
    pushBanner,
    selectSettingsCategory,
    showAdd,
    showBackupFlowDialog,
    showCommandPalette,
    showSafetySetup,
    showSettings,
    windowControls,
  ]);

  React.useEffect(() => {
    const selector =
      ".account-row, .auth-btn, .auth-icon-btn, .auth-fab-trigger, .auth-fab-menu-item, .auth-method-card, .auth-settings-nav-item, .auth-settings-nav-toggle, .pin-pad-key, .auth-titlebar-btn";

    const applyWillChange = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      const animated = target.closest(selector);
      if (!(animated instanceof HTMLElement)) return;
      animated.style.willChange = "transform";
    };

    const clearWillChange = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      const animated = target.closest(selector);
      if (!(animated instanceof HTMLElement)) return;
      animated.style.willChange = "auto";
    };

    const onPointerOver = (event: Event) => applyWillChange(event.target);
    const onFocusIn = (event: Event) => applyWillChange(event.target);
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.propertyName !== "transform" && event.propertyName !== "box-shadow" && event.propertyName !== "opacity") {
        return;
      }
      clearWillChange(event.target);
    };

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("transitionend", onTransitionEnd);

    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("transitionend", onTransitionEnd);
    };
  }, []);

  const saveSettings = async (next: AppSettings) => {
    setActionError(null);
    try {
      const previous = settings;
      let latest = previous;
      try {
        latest = await bridge.getSettings();
      } catch {
        // Fall back to the renderer snapshot if the latest persisted settings are unavailable.
      }
      const updated = await bridge.updateSettings(mergeChangedSettings(latest, previous, next));
      setSettings(updated);
      const changes = describeSettingChanges(latest, updated);
      pushBanner({
        tone: "success",
        title: "Settings updated",
        text: changes.length ? `Updated: ${changes.join(" • ")}` : "No setting changes were detected.",
        replaceKey: "settings-update",
      });
    } catch (error) {
      setActionError(toUiError(error));
    }
  };

  const updateSettingsSilently = React.useCallback(
    async (next: AppSettings): Promise<AppSettings | null> => {
      setActionError(null);
      try {
        let latest = settings;
        try {
          latest = await bridge.getSettings();
        } catch {
          // Fall back to the renderer snapshot if the latest persisted settings are unavailable.
        }
        const updated = await bridge.updateSettings(mergeChangedSettings(latest, settings, next));
        setSettings(updated);
        return updated;
      } catch (error) {
        setActionError(toUiError(error));
        return null;
      }
    },
    [bridge]
  );

  React.useEffect(() => {
    if (!securityReady || locked || showSafetySetup) {
      return;
    }

    if (settings.hasCompletedSafetySetup || settings.hasSkippedSafetySetup) {
      return;
    }

    const unprotected = isUnprotectedLockState(lockMethod, methodConfigured);
    if (unprotected) {
      openSafetySetup("auto");
      return;
    }

    if (safetySetupMigrationRef.current) {
      return;
    }

    safetySetupMigrationRef.current = true;
    void updateSettingsSilently({
      ...settings,
      hasCompletedSafetySetup: true,
      hasSkippedSafetySetup: false,
      lastSafetySetupReminderAt: undefined,
    }).finally(() => {
      safetySetupMigrationRef.current = false;
    });
  }, [
    lockMethod,
    locked,
    methodConfigured,
    openSafetySetup,
    securityReady,
    settings,
    showSafetySetup,
    updateSettingsSilently,
  ]);

  React.useEffect(() => {
    if (!securityReady || locked || showSafetySetup) {
      return;
    }

    if (settings.hasCompletedSafetySetup || !settings.hasSkippedSafetySetup) {
      return;
    }

    if (!isUnprotectedLockState(lockMethod, methodConfigured)) {
      return;
    }

    const now = Date.now();
    const lastReminderAt = settings.lastSafetySetupReminderAt ?? 0;
    if (lastReminderAt > 0 && now - lastReminderAt < SAFETY_SETUP_REMINDER_COOLDOWN_MS) {
      return;
    }

    if (safetySetupReminderRef.current) {
      return;
    }

    safetySetupReminderRef.current = true;
    pushBanner({
      tone: "info",
      title: "Your vault is not fully protected",
      text: "Finish Safety Setup to secure access and recovery options.",
      durationMs: 5000,
      replaceKey: "safety-setup-reminder",
    });

    void updateSettingsSilently({
      ...settings,
      lastSafetySetupReminderAt: now,
    }).finally(() => {
      safetySetupReminderRef.current = false;
    });
  }, [
    lockMethod,
    locked,
    methodConfigured,
    pushBanner,
    securityReady,
    settings,
    showSafetySetup,
    updateSettingsSilently,
  ]);

  const handleAlwaysOnTopChange = React.useCallback(
    async (enabled: boolean) => {
      setActionError(null);

      if (!windowControls || typeof windowControls.setAlwaysOnTop !== "function") {
        await saveSettings({
          ...settings,
          alwaysOnTop: enabled,
        });
        return;
      }

      const previous = settings.alwaysOnTop;
      syncAlwaysOnTopSetting(enabled);
      try {
        await windowControls.setAlwaysOnTop(enabled);
        pushBanner({
          tone: "success",
          title: "Settings updated",
          text: `Updated: Always on top: ${enabled ? "On" : "Off"}`,
          replaceKey: "settings-update",
        });
      } catch (error) {
        syncAlwaysOnTopSetting(previous);
        setActionError(toUiError(error));
      }
    },
    [pushBanner, saveSettings, settings, syncAlwaysOnTopSetting, windowControls]
  );

  const persistAppearanceSettings = React.useCallback(
    async (next: AppSettings) => {
      setActionError(null);
      const previous = settings;
      setSettings(next);

      try {
        let updated: AppSettings;
        const supportsGranularThemeApis =
          typeof bridge.setBaseMode === "function" ||
          typeof bridge.setThemeColor === "function" ||
          typeof bridge.setAccentOverride === "function" ||
          typeof bridge.setBaseTheme === "function" ||
          typeof bridge.setAccent === "function";

        if (supportsGranularThemeApis) {
          if ((typeof bridge.setBaseMode === "function" || typeof bridge.setBaseTheme === "function") && next.baseMode !== previous.baseMode) {
            if (typeof bridge.setBaseMode === "function") {
              await bridge.setBaseMode(next.baseMode);
            } else if (typeof bridge.setBaseTheme === "function") {
              await bridge.setBaseTheme(next.baseMode);
            }
          }

          const targetThemeColor = next.baseMode === "amoled" ? "neutral" : next.themeColor;
          if (typeof bridge.setThemeColor === "function" && targetThemeColor !== previous.themeColor) {
            await bridge.setThemeColor(targetThemeColor);
          }

          const targetAccentOverride = next.baseMode === "amoled" ? "none" : next.accentOverride;
          if ((typeof bridge.setAccentOverride === "function" || typeof bridge.setAccent === "function") && targetAccentOverride !== previous.accentOverride) {
            if (typeof bridge.setAccentOverride === "function") {
              await bridge.setAccentOverride(targetAccentOverride);
            } else if (typeof bridge.setAccent === "function") {
              await bridge.setAccent(targetAccentOverride);
            }
          }

          updated = await bridge.getSettings();
        } else {
          const latest = await bridge.getSettings().catch(() => previous);
          updated = await bridge.updateSettings(mergeChangedSettings(latest, previous, next));
        }

        setSettings(updated);
        const changes = describeSettingChanges(previous, updated);
        pushBanner({
          tone: "success",
          title: "Settings updated",
          text: changes.length ? `Updated: ${changes.join(" • ")}` : "No setting changes were detected.",
          replaceKey: "settings-update",
        });
      } catch (error) {
        setSettings(previous);
        setActionError(toUiError(error));
      }
    },
    [bridge, pushBanner, settings]
  );

  const handleBaseModeChange = React.useCallback(
    (selectedBaseMode: string) => {
      const baseMode = normalizeBaseModeId(selectedBaseMode);
      if (isDevelopmentBuild && selectedBaseMode !== baseMode) {
        console.warn("[theme] invalid base mode id, defaulting", {
          selectedBaseMode,
          resolved: baseMode,
        });
      }

      const themeColor = baseMode === "amoled" ? "neutral" : settings.themeColor;
      const accentOverride = baseMode === "amoled" ? "none" : settings.accentOverride;
      if (baseMode === settings.baseMode && themeColor === settings.themeColor && accentOverride === settings.accentOverride) {
        return;
      }
      void persistAppearanceSettings({ ...settings, baseMode, themeColor, accentOverride });
    },
    [isDevelopmentBuild, persistAppearanceSettings, settings]
  );

  const handleThemeColorChange = React.useCallback(
    (selectedThemeColor: string) => {
      if (settings.baseMode === "amoled") {
        return;
      }

      const themeColor = normalizeThemeColorId(selectedThemeColor);
      if (isDevelopmentBuild && selectedThemeColor !== themeColor) {
        console.warn("[theme] invalid theme color id, defaulting", {
          selectedThemeColor,
          resolved: themeColor,
        });
      }

      if (themeColor === settings.themeColor) {
        return;
      }

      void persistAppearanceSettings({ ...settings, themeColor });
    },
    [isDevelopmentBuild, persistAppearanceSettings, settings]
  );

  const handleAccentOverrideChange = React.useCallback(
    (selectedAccentOverride: string) => {
      if (settings.baseMode === "amoled") {
        return;
      }

      const accentOverride = normalizeAccentOverrideId(selectedAccentOverride);
      if (isDevelopmentBuild && selectedAccentOverride !== accentOverride) {
        console.warn("[theme] invalid accent override id, defaulting", {
          selectedAccentOverride,
          resolved: accentOverride,
        });
      }

      if (accentOverride === settings.accentOverride) {
        return;
      }

      void persistAppearanceSettings({ ...settings, accentOverride });
    },
    [isDevelopmentBuild, persistAppearanceSettings, settings]
  );

  const handleLockNow = React.useCallback(async () => {
    setActionError(null);
    if (lockMethod === "none") {
      pushBanner({ tone: "info", title: "No lock method", text: "Set a lock method before locking the app." });
      return;
    }
    if (!methodConfigured) {
      pushBanner({ tone: "info", title: "Setup required", text: "Finish setting up this lock method first." });
      return;
    }

    try {
      await lockApi.lock();
      setLocked(true);
    } catch (error) {
      setActionError(toUiError(error));
    }
  }, [lockApi, lockMethod, methodConfigured, pushBanner]);

  const handleExportBackup = async () => {
    setActionError(null);
    const passphrase = backupPassphrase;
    if (passphrase.length < 8) {
      setActionError({ code: "E_PASSPHRASE_INVALID", title: "Passphrase too short", instruction: "Use at least 8 characters before exporting." });
      return;
    }

    try {
      const result = await runSensitiveAction(async () => await bridge.exportBackup(passphrase), { requiresSecuritySession: true });
      if (result.status === "cancelled") {
        return;
      }
      const ok = result.value;
      if (!ok) {
        pushBanner({ tone: "info", title: "Export canceled", text: "No backup file was saved." });
        return;
      }
      closeBackupFlowDialog();
      pushBanner({ tone: "success", title: "Backup exported", text: "Encrypted backup saved successfully." });
    } catch (error) {
      setActionError(toUiError(error));
    } finally {
      setBackupPassphrase("");
    }
  };

  const handleImportBackup = async () => {
    setActionError(null);
    const passphrase = backupPassphrase;
    if (passphrase.length < 8) {
      setActionError({ code: "E_PASSPHRASE_INVALID", title: "Passphrase too short", instruction: "Use at least 8 characters before importing." });
      return;
    }

    try {
      const result = await runSensitiveAction(async () => await bridge.importBackup(passphrase, backupMode), {
        requiresSecuritySession: true,
      });
      if (result.status === "cancelled") {
        return;
      }
      const ok = result.value;
      if (!ok) {
        pushBanner({ tone: "info", title: "Import canceled", text: "No backup file was imported." });
        return;
      }
      closeBackupFlowDialog();
      await refresh();
      pushBanner({
        tone: "success",
        title: "Backup imported",
        text:
          backupMode === "replace"
            ? "Accounts were replaced with imported backup data."
            : "Accounts from backup were merged into your list.",
      });
    } catch (error) {
      setActionError(toUiError(error));
    } finally {
      setBackupPassphrase("");
    }
  };

  const persistRecoveryRotationPending = React.useCallback((pending: boolean) => {
    if (typeof window === "undefined") {
      return;
    }
    const storage = window.localStorage;
    if (!storage || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") {
      return;
    }
    if (pending) {
      storage.setItem(RECOVERY_ROTATION_PENDING_KEY, "1");
    } else {
      storage.removeItem(RECOVERY_ROTATION_PENDING_KEY);
    }
  }, []);

  const handleCopyRecoverySecret = React.useCallback(
    async (secret: string, options?: { silent?: boolean }): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(secret);
        scheduleClipboardAutoClear(secret, 30_000);
        if (!options?.silent) {
          pushBanner({ tone: "success", title: "Recovery secret copied", text: "Copied to clipboard. Clears in 30 seconds.", countdownUntilMs: Date.now() + 30_000, countdownPrefix: "Clears in", replaceKey: "recovery-secret-copy", durationMs: 5000 });
        }
        return true;
      } catch {
        if (!options?.silent) {
          pushBanner({ tone: "error", title: "Copy failed", text: "Clipboard is unavailable. Keep this secret visible until you save it.", replaceKey: "recovery-secret-copy" });
        }
        return false;
      }
    },
    [pushBanner, scheduleClipboardAutoClear]
  );

  const handleGenerateRecoverySecret = React.useCallback(async (): Promise<string | null> => {
    if (!bridge.generateRecoverySecret) {
      return null;
    }
    try {
      const secret = await bridge.generateRecoverySecret();
      if (!secret) {
        return null;
      }
      setShowRecoveryRotationPrompt(false);
      setRecoveryRotationPending(false);
      persistRecoveryRotationPending(false);
      const nextStatus = await refreshVaultProtectionStatus();
      setVaultProtection(nextStatus);
      return secret;
    } catch (error) {
      setActionError(toUiError(error));
      throw error;
    }
  }, [bridge, persistRecoveryRotationPending, refreshVaultProtectionStatus]);

  const handleSubmitMigration = React.useCallback(async () => {
    if (!vaultProtection.migrationRequired) {
      return;
    }
    const password = migrationPassword.trim();
    if (vaultProtection.requiresPasswordSetup) {
      const passwordIssue = getVaultPasswordPolicyIssue(password);
      if (passwordIssue) {
        setMigrationError(getVaultPasswordPolicyMessage(passwordIssue));
        return;
      }
    }
    if (vaultProtection.requiresPasswordSetup && password !== migrationPasswordConfirm) {
      setMigrationError("Passwords must match.");
      return;
    }
    if (!vaultProtection.requiresPasswordSetup && password.length === 0) {
      setMigrationError("Incorrect password. Try again.");
      return;
    }

    setMigrationBusy(true);
    setMigrationError(null);
    try {
      const ok = vaultProtection.requiresPasswordSetup
        ? await bridge.migrateSetPassword?.(password)
        : await bridge.migrateWithPassword?.(password);
      if (!ok) {
        setMigrationError("Incorrect password. Try again.");
        return;
      }
      setMigrationPassword("");
      setMigrationPasswordConfirm("");
      await refreshVaultProtectionStatus();
      await refreshSecurityState();
      pushBanner({ tone: "success", title: "Vault upgraded", text: "Consider setting up Touch ID and a recovery secret in Settings." });
    } catch (error) {
      const resolved = toUiError(error);
      setMigrationError(resolved.instruction || resolved.title);
    } finally {
      setMigrationBusy(false);
    }
  }, [bridge, migrationPassword, migrationPasswordConfirm, pushBanner, refreshSecurityState, refreshVaultProtectionStatus, vaultProtection.migrationRequired, vaultProtection.requiresPasswordSetup]);

  const showCopiedToast = React.useCallback(() => {
    if (!settings.clipboardSafetyEnabled) {
      pushBanner({
        tone: "success",
        title: "Copied",
        text: "Copied to clipboard.",
        replaceKey: "copy-feedback",
        durationMs: 3500,
      });
      return;
    }

    pushBanner({
      tone: "success",
      title: "Copied",
      text: "Copied to clipboard. Clears in 30 seconds.",
      countdownUntilMs: Date.now() + 30_000,
      countdownPrefix: "Clears in",
      replaceKey: "copy-feedback",
      durationMs: 5000,
    });
  }, [pushBanner, settings.clipboardSafetyEnabled]);

  const handleCopyFeedback = React.useCallback(
    (payload: { status: "success" | "error"; account: AccountMeta; code?: string }) => {
      if (payload.status === "success") {
        if (payload.code) {
          scheduleClipboardAutoClear(payload.code);
        }
        showCopiedToast();
        return;
      }

      pushBanner({
        tone: "error",
        title: "Copy failed",
        text: `Clipboard is unavailable for ${payload.account.issuer || payload.account.label || "this account"}.`,
        replaceKey: "copy-feedback",
        durationMs: 5000,
      });
    },
    [pushBanner, scheduleClipboardAutoClear, showCopiedToast]
  );

  const handleCopyFromCommandPalette = React.useCallback(
    async (account: AccountMeta) => {
      let code: string | null = codes[account.id]?.code ?? null;

      if (!code) {
        try {
          const latest = await bridge.codes();
          setCodes((previous) => mergeCodeMap(previous, latest));
          code = latest.find((entry) => entry.id === account.id)?.code ?? null;
        } catch (error) {
          handleBridgeError(error);
          return;
        }
      }

      if (!code) {
        pushBanner({
          tone: "info",
          title: "Code unavailable",
          text: `No active code is available for ${account.issuer || account.label || "this account"}.`,
          durationMs: 3500,
          replaceKey: "copy-feedback",
        });
        return;
      }

      try {
        await navigator.clipboard.writeText(code);
        scheduleClipboardAutoClear(code);
        showCopiedToast();
        closeCommandPalette();
      } catch {
        pushBanner({
          tone: "error",
          title: "Copy failed",
          text: `Clipboard is unavailable for ${account.issuer || account.label || "this account"}.`,
          replaceKey: "copy-feedback",
          durationMs: 5000,
        });
      }
    },
    [bridge, closeCommandPalette, codes, handleBridgeError, pushBanner, scheduleClipboardAutoClear, showCopiedToast]
  );

  const handleAddModalScanFeedback = React.useCallback(
    (scanError: UiError) => {
      const noQrDetected = scanError.code === "E_SCAN_NO_QR";
      pushBanner({
        tone: noQrDetected ? "info" : "error",
        title: scanError.title,
        text: scanError.instruction,
        code: noQrDetected ? undefined : scanError.code,
        replaceKey: "scan-feedback",
        durationMs: noQrDetected ? 3600 : 5000,
      });
    },
    [pushBanner]
  );

  const handleQuickScanFromScreen = React.useCallback(async () => {
    if (!bridge.scanFromScreen) {
      pushBanner({
        tone: "info",
        title: "Scan unavailable",
        text: "This build does not support screen QR scanning.",
      });
      return;
    }
    setActionError(null);
    openAddModal({ method: "scan", openScanOverlay: true });
  }, [bridge.scanFromScreen, openAddModal, pushBanner]);

  const handleQuickClearClipboard = React.useCallback(async () => {
    const lastCopiedCode = lastCopiedCodeRef.current;
    if (!lastCopiedCode) {
      pushBanner({ tone: "info", title: "Clipboard changed. Nothing cleared.", text: "Nothing from Vault Authenticator is ready to clear.", durationMs: 4000 });
      return;
    }

    try {
      let cleared = false;

      if (bridge.clearClipboard) {
        cleared = await bridge.clearClipboard(lastCopiedCode);
      } else {
        const currentValue = await navigator.clipboard.readText();
        if (currentValue === lastCopiedCode) {
          await navigator.clipboard.writeText("");
          cleared = true;
        }
      }

      if (!cleared) {
        pushBanner({
          tone: "info",
          title: "Clipboard changed. Nothing cleared.",
          text: "Current clipboard content was not copied by Vault Authenticator.",
          durationMs: 4000,
        });
        return;
      }

      lastCopiedCodeRef.current = "";
      clearClipboardAutoClearTimer();
      pushBanner({ tone: "success", title: "Clipboard cleared", text: "Copied sign-in code was removed from the clipboard.", durationMs: 3500 });
    } catch {
      pushBanner({ tone: "error", title: "Clipboard unavailable", text: "Could not access the clipboard right now.", durationMs: 4500 });
    }
  }, [bridge, clearClipboardAutoClearTimer, pushBanner]);

  const handleRequestDelete = React.useCallback((account: AccountMeta) => {
    if (deleteCloseTimerRef.current != null) {
      window.clearTimeout(deleteCloseTimerRef.current);
      deleteCloseTimerRef.current = null;
    }
    setDeleteDialogExiting(false);
    setDeleteError(null);
    setPendingDelete(account);
  }, []);

  const handleRequestEdit = React.useCallback(
    async (account: AccountMeta) => {
      try {
        const details = await bridge.getAccountForEdit(account.id);
        setEditingAccount(details);
      } catch (error) {
        const friendly = toUiError(error);
        pushBanner({
          tone: "error",
          title: friendly.title,
          text: friendly.instruction,
          code: friendly.code,
        });
      }
    },
    [bridge, pushBanner]
  );

  const handleSaveEdit = React.useCallback(
    async (payload: UpdateAccountPayload) => {
      if (!editingAccount) return;
      await updateAccount(editingAccount.id, payload);
      const name = payload.issuer || payload.label || "Account";
      pushBanner({ tone: "success", title: "Account updated", text: `${name} was updated.` });
      setEditingAccount(null);
    },
    [editingAccount, pushBanner, updateAccount]
  );

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      await del(pendingDelete.id);
      const name = pendingDelete.issuer || pendingDelete.label || "Account";
      pushBanner({ tone: "success", title: "Account deleted", text: `${name} was removed.` });
      closeDeleteDialog();
    } catch (error) {
      setDeleteError(toUiError(error));
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleUnlockSuccess = React.useCallback(() => {
    setLocked(false);
    setActionError(null);
    void refreshVaultProtectionStatus();
  }, [refreshVaultProtectionStatus]);

  const handleSkipSafetySetup = React.useCallback(async () => {
    if (safetySetupMode === "manual") {
      closeSafetySetup();
      return;
    }

    const updated = await updateSettingsSilently({
      ...settings,
      hasCompletedSafetySetup: false,
      hasSkippedSafetySetup: true,
      lastSafetySetupReminderAt: Date.now(),
    });
    if (!updated) {
      return;
    }

    closeSafetySetup();
    pushBanner({
      tone: "info",
      title: "Safety Setup skipped",
      text: "You can run it again anytime from Security settings.",
      durationMs: 4200,
    });
  }, [closeSafetySetup, pushBanner, safetySetupMode, settings, updateSettingsSilently]);

  const handleCompleteSafetySetup = React.useCallback(async (): Promise<boolean> => {
    const updated = await updateSettingsSilently({
      ...settings,
      hasCompletedSafetySetup: true,
      hasSkippedSafetySetup: false,
      lastSafetySetupReminderAt: undefined,
    });
    if (!updated) {
      return false;
    }
    return true;
  }, [settings, updateSettingsSilently]);

  const visibleAccounts = React.useMemo(() => [...optimisticAccounts, ...accounts], [accounts, optimisticAccounts]);
  const dpiMode = useDpiMode();
  const reorderMode = dpiMode === "compact" ? "vertical" : "free";
  const canReorderAccounts = optimisticAccounts.length === 0 && accounts.length > 1;
  const handleReorderAccounts = React.useCallback(
    (reordered: AccountMeta[]) => {
      if (!canReorderAccounts) {
        return;
      }
      void reorderAccounts(reordered.map((account) => account.id));
    },
    [canReorderAccounts, reorderAccounts]
  );
  const { orderedItems: orderedAccounts, getDragHandleProps, getDragItemProps } = useReorder(accounts, handleReorderAccounts, reorderMode);
  const accountsLayout = resolveLayoutMode(settings.accountsLayoutMode, viewportWidth);
  const accountsColumns = resolveLayoutColumns(accountsLayout, settings.accountsGridColumns, viewportWidth);
  const shouldShowColumnPreference = settings.accountsLayoutMode !== "list";
  const versionLabel = appVersion ? `v${appVersion}` : "Unavailable";
  const runtimeLabel = windowControls ? "Desktop (Electron)" : "Browser preview";
  const themeProfileLabel = `${baseModeLabel(resolvedBaseMode)} / ${resolvedThemeColor} / ${resolvedAccentOverride}`;
  const motionProfileLabel =
    settings.motionMode === "system"
      ? `System (${motionModeLabel(resolvedMotionMode)} active)`
      : `${motionModeLabel(settings.motionMode)} (${motionModeLabel(resolvedMotionMode)} active)`;
  const lockMethodStatus =
    lockMethod === "none" ? "None" : `${lockMethodLabel(lockMethod)}${methodConfigured ? "" : " (setup incomplete)"}`;
  const quickUnlockStatus = quickUnlockLabel(quickUnlock);
  const accountsLayoutLabel =
    accountsLayout === "grid"
      ? `Grid (${accountsColumns} columns), ${settings.accountsDensity}`
      : `List, ${settings.accountsDensity}`;
  const listClassName = `auth-list auth-list-${accountsLayout} auth-density-${settings.accountsDensity}${layoutSwitching ? " is-layout-switching" : ""}`;
  const listStyle = {
    "--auth-grid-columns": String(accountsColumns),
  } as React.CSSProperties;
  const showSkeletonRows = !locked && loading && visibleAccounts.length === 0;
  if (!securityReady) {
    return (
      <div className={rootClassName} data-mode={resolvedBaseMode} data-theme-color={resolvedThemeColor} data-accent={resolvedAccentOverride} data-dpi-mode={dpiMode}>
        <div className="auth-bg-orb auth-bg-orb-a" />
        <div className="auth-bg-orb auth-bg-orb-b" />
        {windowControls ? (
          <CustomTitleBar
            controls={windowControls}
            appName="Vault Authenticator"
            contextLabel={appVersion ? `v${appVersion}` : undefined}
            iconSrc={titleBarIconSrc}
            alwaysOnTop={settings.alwaysOnTop}
            onToggleAlwaysOnTop={() => {
              void handleAlwaysOnTopChange(!settings.alwaysOnTop);
            }}
          />
        ) : null}
        <main className="auth-lock-shell">
          <section className="auth-lock-card">
            <p className="auth-muted auth-loading-inline">
              <Loader2 size={14} className="auth-loading-icon" aria-hidden="true" />
              <span>Loading secure vault...</span>
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <MotionModeContext.Provider value={settings.motionMode}>
      <div className={rootClassName} data-mode={resolvedBaseMode} data-theme-color={resolvedThemeColor} data-accent={resolvedAccentOverride} data-dpi-mode={dpiMode}>
        <div className="auth-bg-orb auth-bg-orb-a" />
        <div className="auth-bg-orb auth-bg-orb-b" />
      {windowControls ? (
        <CustomTitleBar
          controls={windowControls}
          appName="Vault Authenticator"
          contextLabel={appVersion ? `v${appVersion}` : undefined}
          iconSrc={titleBarIconSrc}
          alwaysOnTop={settings.alwaysOnTop}
          onToggleAlwaysOnTop={() => {
            void handleAlwaysOnTopChange(!settings.alwaysOnTop);
          }}
        />
      ) : null}

      {banners.length > 0 ? (
        <motion.section className="auth-toast-host" aria-live="polite" aria-atomic="false" layout>
          <AnimatePresence initial={false}>
            {banners.map((banner) => (
              <motion.article
                key={banner.id}
                className={`auth-banner auth-banner-${banner.tone}${banner.isExiting ? " is-exiting" : ""}`}
                layout="position"
                initial={toastPresence.initial}
                animate={resolveMotionState(toastPresence, banner.isExiting === true)}
                exit={toastPresence.exit}
                variants={toastPresence.variants}
                transition={toastPresence.transition}
              >
                <div>
                  <p className="auth-banner-title">{banner.title}</p>
                  <p className="auth-banner-text">
                    {banner.countdownUntilMs ? (
                      <>
                        <span className="auth-sr-only">{banner.text}</span>
                        <BannerCountdown untilMs={banner.countdownUntilMs} prefix={banner.countdownPrefix ?? "Clears in"} paused={motionPaused} />
                      </>
                    ) : (
                      <>
                        {banner.text}
                        {banner.code ? <span className="auth-error-code"> Code: {banner.code}</span> : null}
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="auth-banner-close ui-focus"
                  onClick={() => dismissBanner(banner.id)}
                  aria-label={`Dismiss ${banner.title} message`}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </motion.article>
            ))}
          </AnimatePresence>
        </motion.section>
      ) : null}

      {!locked && showRecoveryRotationPrompt ? (
        <motion.div className={`auth-overlay ${themeClass}`} role="presentation" initial={overlayPresence.initial} animate={overlayPresence.animate} exit={overlayPresence.exit} variants={overlayPresence.variants} transition={overlayPresence.transition}>
          <motion.section className={`auth-confirm-modal ${themeClass}`} role="dialog" aria-modal="true" aria-label="Recovery secret used" initial={modalPresence.initial} animate={modalPresence.animate} exit={modalPresence.exit} variants={modalPresence.variants} transition={modalPresence.transition}>
            <header className="auth-modal-header">
              <h2 className="auth-modal-title auth-confirm-title">
                <span className="auth-confirm-title-icon" aria-hidden="true">
                  <Shield size={16} />
                </span>
                <span>Recovery secret used</span>
              </h2>
            </header>
            <div className="auth-confirm-body">
              <p className="auth-confirm-copy">Generate a new recovery secret to stay protected.</p>
            </div>
            <footer className="auth-confirm-actions">
              <button
                type="button"
                className="auth-btn auth-btn-subtle ui-focus auth-btn-modal"
                onClick={() => setShowRecoveryRotationPrompt(false)}
              >
                Later
              </button>
              <button type="button" className="auth-btn auth-btn-primary ui-focus auth-btn-modal" onClick={openSecuritySettings}>
                <Shield size={15} className="auth-btn-icon" aria-hidden="true" />
                Open Security
              </button>
            </footer>
          </motion.section>
        </motion.div>
      ) : null}

      {!locked ? (
        <main className="auth-shell auth-shell-with-fab">
          <section className="auth-card">
            <header className="auth-header">
              <div className="auth-header-brand">
                <span className="auth-brand-dot" />
                <div className="auth-header-copy">
                  <p className="auth-eyebrow">Vault</p>
                  <h1 className="auth-title">Vault Authenticator</h1>
                </div>
              </div>
              <div className="auth-header-meta">
                <span className="auth-pill">
                  <Users size={13} className="auth-pill-icon" aria-hidden="true" />
                  <span>
                    {visibleAccounts.length} account{visibleAccounts.length === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
            </header>

            <div className="account-list-container">
              {showSkeletonRows ? (
                <section className={listClassName} style={listStyle}>
                  {Array.from({ length: 3 }, (_, index) => (
                    <article key={`skeleton-${index}`} className="account-row account-row-skeleton" aria-hidden="true">
                      <div className="account-row-layout">
                        <div className="account-main">
                          <span className="auth-skeleton-line auth-skeleton-line-title" />
                          <span className="auth-skeleton-line" />
                        </div>
                        <div className="account-code-wrap">
                          <span className="auth-skeleton-block" />
                        </div>
                        <div className="account-actions-inline">
                          <span className="auth-skeleton-btn" />
                          <span className="auth-skeleton-btn" />
                        </div>
                      </div>
                    </article>
                  ))}
                </section>
              ) : visibleAccounts.length === 0 ? (
                <section className="auth-empty-state">
                  <span className="auth-empty-icon" aria-hidden="true">
                    <Inbox size={22} />
                  </span>
                  <p className="auth-empty-title">No accounts yet</p>
                  <p className="auth-muted">Add your first 2FA account and tap Copy on any code to paste sign-in codes faster.</p>
                </section>
              ) : (
                <section className={listClassName} style={listStyle} data-reorder-mode={reorderMode}>
                  {optimisticAccounts.map((account, index) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      codeResult={codes[account.id]}
                      hideCompactLabels={settings.hideLabelsOnSmall && isSmall}
                      onEdit={handleRequestEdit}
                      onDelete={handleRequestDelete}
                      onCopyFeedback={handleCopyFeedback}
                      clipboardSafetyEnabled={settings.clipboardSafetyEnabled}
                      index={index}
                      pending
                      dragEnabled={false}
                      dragMode={reorderMode}
                    />
                  ))}
                  {orderedAccounts.map((account, index) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      codeResult={codes[account.id]}
                      hideCompactLabels={settings.hideLabelsOnSmall && isSmall}
                      onEdit={handleRequestEdit}
                      onDelete={handleRequestDelete}
                      onCopyFeedback={handleCopyFeedback}
                      clipboardSafetyEnabled={settings.clipboardSafetyEnabled}
                      index={optimisticAccounts.length + index}
                      pending={false}
                      dragItemProps={getDragItemProps(account.id)}
                      dragHandleProps={getDragHandleProps(account.id)}
                      dragEnabled={canReorderAccounts}
                      dragMode={reorderMode}
                    />
                  ))}
                </section>
              )}
            </div>
          </section>

          <HeaderMenu
            onAddAccount={() => {
              setActionError(null);
              openAddModal({ method: "uri" });
            }}
            onOpenCommandPalette={openCommandPalette}
            onScanFromScreen={handleQuickScanFromScreen}
            onClearClipboard={handleQuickClearClipboard}
            canScanFromScreen={Boolean(bridge.scanFromScreen)}
            onOpenSettings={(category) => {
              openSettingsModal();
              setActionError(null);
              selectSettingsCategory(category);
              void refreshSecurityState();
            }}
            onLockApp={handleLockNow}
          />
        </main>
      ) : null}

      {lockVisible ? (
        <motion.main
          className="auth-lock-shell auth-lock-shell-overlay"
          initial={lockOverlayPresence.initial}
          animate={resolveMotionState(lockOverlayPresence, lockExiting)}
          exit={lockOverlayPresence.exit}
          variants={lockOverlayPresence.variants}
          transition={lockOverlayPresence.transition}
        >
          <LockScreen
            lockApi={lockApi}
            vaultProtection={vaultProtection}
            biometricPromptEnabled={settings.biometricEnabled}
            onUnlocked={handleUnlockSuccess}
            paused={motionPaused}
          />
        </motion.main>
      ) : null}

      {!locked && showAdd ? (
        <AddModal
          bridge={bridge}
          theme={settings.baseMode}
          defaultDigits={settings.defaultDigits}
          defaultPeriod={settings.defaultPeriod}
          onAddUri={addUri}
          onAddManual={addManual}
          onScanFeedback={handleAddModalScanFeedback}
          initialMethod={addModalMethod}
          openScanOverlayOnOpen={addModalAutoScan}
          isClosing={addExiting}
          onClose={closeAddModal}
        />
      ) : null}

      {!locked && showCommandPalette ? (
        <CommandPalette
          theme={settings.baseMode}
          accounts={accounts}
          onCopyAccount={handleCopyFromCommandPalette}
          onClose={closeCommandPalette}
          isClosing={commandPaletteExiting}
        />
      ) : null}

      <AnimatePresence>
        {!locked && editingAccount ? (
          <EditModal theme={settings.baseMode} account={editingAccount} onSave={handleSaveEdit} onClose={() => setEditingAccount(null)} />
        ) : null}
      </AnimatePresence>

      {!locked && showSettings ? (
        <motion.div
          className={`auth-overlay ${themeClass}`}
          onClick={closeSettingsModal}
          role="presentation"
          initial={settingsOverlayPresence.initial}
          animate={resolveMotionState(settingsOverlayPresence, settingsExiting)}
          exit={settingsOverlayPresence.exit}
          variants={settingsOverlayPresence.variants}
          transition={settingsOverlayPresence.transition}
        >
          <motion.section
            className={`auth-settings-modal ${themeClass}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            initial={settingsModalPresence.initial}
            animate={resolveMotionState(settingsModalPresence, settingsExiting)}
            exit={settingsModalPresence.exit}
            variants={settingsModalPresence.variants}
            transition={settingsModalPresence.transition}
          >
            <header className="auth-modal-header">
              <h2 className="auth-modal-title auth-modal-title-row">
                <Settings2 size={16} className="auth-modal-title-icon" aria-hidden="true" />
                <span>Settings</span>
              </h2>
            </header>

            <motion.div
              className="auth-settings-layout"
              initial={settingsLayoutPresence.initial}
              animate={settingsLayoutPresence.animate}
              exit={settingsLayoutPresence.exit}
              variants={settingsLayoutPresence.variants}
              transition={settingsLayoutPresence.transition}
            >
              <nav ref={settingsNavRef} className="auth-settings-nav" aria-label="Settings categories">
                <button
                  type="button"
                  className={`auth-settings-nav-toggle ui-focus${settingsCategoryListExpanded ? " is-open" : ""}`}
                  onClick={() => setSettingsCategoryMenuOpen((previous) => !previous)}
                  aria-label="Toggle settings categories"
                  aria-expanded={settingsCategoryListExpanded}
                  aria-controls="settings-category-list"
                >
                  <span className="auth-settings-nav-toggle-copy">
                    <span className="auth-settings-nav-toggle-label">Category</span>
                    <span className="auth-settings-nav-toggle-value">
                      <ActiveSettingsCategoryIcon size={14} className="auth-settings-nav-toggle-value-icon" aria-hidden="true" />
                      <span>{activeSettingsCategoryOption.label}</span>
                    </span>
                  </span>
                  <ChevronDown size={16} className="auth-settings-nav-toggle-icon" aria-hidden="true" />
                </button>

                <div
                  id="settings-category-list"
                  className={`auth-settings-nav-list${settingsCategoryListExpanded ? " is-open" : ""}`}
                  aria-hidden={isCompactSettingsNav && !settingsCategoryListExpanded}
                >
                  {SETTINGS_CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={`auth-settings-nav-item ui-focus${activeSettingsCategory === category.id ? " is-active" : ""}`}
                      onClick={() => selectSettingsCategory(category.id)}
                      aria-label={`Open ${category.label} settings`}
                      tabIndex={settingsCategoryListExpanded ? 0 : -1}
                    >
                      <span className="auth-settings-nav-label auth-settings-nav-label-with-icon">
                        <category.Icon size={14} className="auth-settings-nav-item-icon" aria-hidden="true" />
                        <span>{category.label}</span>
                      </span>
                      <span className="auth-settings-nav-note">{category.description}</span>
                    </button>
                  ))}
                </div>
              </nav>

              <div ref={settingsScrollRef} className="auth-settings-scroll">
                <div className="auth-settings-panel-shell">
                  <AnimatePresence mode="sync" initial={false}>
                <motion.div
                  key={activeSettingsCategory}
                  className="auth-settings-panel"
                  data-direction={settingsPanelDirection}
                  data-settings-panel={activeSettingsCategory}
                  initial={settingsPanelPresence.initial}
                  animate={settingsPanelPresence.animate}
                  exit={shouldAnimateSettingsPanels ? settingsPanelPresence.exit : undefined}
                  variants={settingsPanelPresence.variants}
                  transition={settingsPanelPresence.transition}
                >
                {activeSettingsCategory === "appearance" ? (
                  <section className="settings-section" data-settings-category="appearance">
                    <h3 className="settings-title settings-title-with-icon">
                      <Palette size={15} aria-hidden="true" />
                      <span>Appearance</span>
                    </h3>
                      <div className="settings-grid">
                        <div className="auth-field">
                          <span className="settings-control-label">
                            <Monitor size={14} aria-hidden="true" />
                            <span>Mode</span>
                          </span>
                          <ThemedSelect
                            value={settings.baseMode}
                            onChange={handleBaseModeChange}
                          options={BASE_MODE_OPTIONS}
                          ariaLabel="Mode"
                        />
                      </div>

                      <div className="auth-field">
                        <span className="settings-control-label">
                          <Palette size={14} aria-hidden="true" />
                          <span>Theme color</span>
                        </span>
                        <ThemedSelect
                          value={effectiveThemeColor(settings.baseMode, settings.themeColor)}
                          onChange={handleThemeColorChange}
                          options={THEME_COLOR_OPTIONS}
                          ariaLabel="Theme color"
                          disabled={settings.baseMode === "amoled"}
                        />
                        {settings.baseMode === "amoled" ? <p className="settings-note">Theme colors are disabled in Amoled mode.</p> : null}
                      </div>

                      <div className="auth-field">
                        <span className="settings-control-label">
                          <Palette size={14} aria-hidden="true" />
                          <span>Accent override</span>
                        </span>
                        <ThemedSelect
                          value={effectiveAccentOverride(settings.baseMode, settings.accentOverride)}
                          onChange={handleAccentOverrideChange}
                          options={ACCENT_OVERRIDE_OPTIONS}
                          ariaLabel="Accent override"
                          disabled={settings.baseMode === "amoled"}
                        />
                        {settings.baseMode === "amoled" ? <p className="settings-note">Accent overrides are disabled in Amoled mode.</p> : null}
                      </div>

                      <div className="auth-field">
                        <span className="settings-control-label">
                          <SlidersHorizontal size={14} aria-hidden="true" />
                          <span>Motion</span>
                        </span>
                        <ThemedSelect
                          value={settings.motionMode}
                          onChange={(next) =>
                            void saveSettings({
                              ...settings,
                              motionMode: normalizeMotionMode(next),
                            })
                          }
                          options={MOTION_MODE_OPTIONS}
                          ariaLabel="Motion"
                        />
                      </div>

                      <SettingsSwitch
                        label={
                          <span className="settings-control-label">
                            <Monitor size={14} aria-hidden="true" />
                            <span>Pause animations when app is in background</span>
                          </span>
                        }
                        checked={settings.pauseWhenBackground}
                        onChange={(checked) =>
                          void saveSettings({
                            ...settings,
                            pauseWhenBackground: checked,
                          })
                        }
                        ariaLabel="Pause animations when app is in background"
                      />

                    </div>

                  </section>
                ) : null}

                {activeSettingsCategory === "security" ? (
                  <>
                    <section className="settings-section" data-settings-category="security">
                      <h3 className="settings-title settings-title-with-icon">
                        <Shield size={15} aria-hidden="true" />
                        <span>Security</span>
                      </h3>
                      <div className="settings-grid">
                        <div className="auth-field">
                          <span className="settings-control-label">
                            <LockKeyhole size={14} aria-hidden="true" />
                            <span>Lock after</span>
                          </span>
                          <ThemedSelect
                            value={String(settings.autoLockSeconds)}
                            onChange={(next) =>
                              void saveSettings({
                                ...settings,
                                autoLockSeconds: next === "0" ? 0 : next === "60" ? 60 : next === "900" ? 900 : 300,
                              })
                            }
                            options={[
                              { value: "60", label: "1 min" },
                              { value: "300", label: "5 min" },
                              { value: "900", label: "15 min" },
                              { value: "0", label: "Never" },
                            ]}
                            ariaLabel="Lock after"
                          />
                        </div>

                        <SettingsSwitch
                          label={
                            <span className="settings-control-label">
                              <Shield size={14} aria-hidden="true" />
                              <span>Privacy screen lock on app switch</span>
                            </span>
                          }
                          checked={settings.privacyScreen}
                          onChange={(checked) => void saveSettings({ ...settings, privacyScreen: checked })}
                          ariaLabel="Enable privacy screen lock"
                        />

                        <SettingsSwitch
                          label={
                            <span className="settings-control-label">
                              <LockKeyhole size={14} aria-hidden="true" />
                              <span>Lock when app loses focus</span>
                            </span>
                          }
                          checked={settings.lockOnFocusLoss}
                          onChange={(checked) => void saveSettings({ ...settings, lockOnFocusLoss: checked })}
                          ariaLabel="Lock when app loses focus"
                        />

                        {isMacOSRuntime() ? (
                          <SettingsSwitch
                            label={
                              <span className="settings-control-label">
                                <Fingerprint size={14} aria-hidden="true" />
                                <span>Touch ID prompt on lock screen</span>
                              </span>
                            }
                            checked={settings.biometricEnabled}
                            onChange={(checked) => void saveSettings({ ...settings, biometricEnabled: checked })}
                            ariaLabel="Enable Touch ID prompt"
                          />
                        ) : null}

                        <SettingsSwitch
                          label={
                            <span className="settings-control-label">
                              <Copy size={14} aria-hidden="true" />
                              <span>Clipboard safety (clear copied codes after 30s)</span>
                            </span>
                          }
                          checked={settings.clipboardSafetyEnabled}
                          onChange={(checked) => void saveSettings({ ...settings, clipboardSafetyEnabled: checked })}
                          ariaLabel="Enable clipboard safety auto-clear"
                        />

                      </div>

                      <p className="settings-note">
                        {settings.clipboardSafetyEnabled
                          ? "Clipboard safety is on. Copied 2FA codes clear after 30 seconds if unchanged."
                          : "Clipboard safety is off. Copied 2FA codes stay in your clipboard until you clear them yourself."}
                      </p>

                      {!settings.privacyScreen ? (
                        <p className="settings-warning">
                          Warning: Turning off Privacy Screen is not recommended. Your vault can remain visible when you switch apps.
                        </p>
                      ) : null}

                      <div className="auth-inline-actions">
                        <button
                          type="button"
                          onClick={() => {
                            closeSettingsModal();
                            openSafetySetup("manual");
                          }}
                          className="auth-btn auth-btn-subtle ui-focus"
                        >
                          <Shield size={15} className="auth-btn-icon" aria-hidden="true" />
                          Run Safety Setup again
                        </button>
                        {settings.hasSkippedSafetySetup && !settings.hasCompletedSafetySetup ? (
                          <p className="settings-note" style={{ margin: 0 }}>
                            Safety Setup is currently skipped.
                          </p>
                        ) : null}
                      </div>
                    </section>

                    <section className="settings-section">
                      <h3 className="settings-title settings-title-with-icon">
                        <LockKeyhole size={15} aria-hidden="true" />
                        <span>Vault Protection</span>
                      </h3>

                      <div className="settings-grid">
                        <div className="auth-field">
                          <span className="settings-control-label">
                            <LockKeyhole size={14} aria-hidden="true" />
                            <span>Current mode</span>
                          </span>
                          <div className="settings-note">
                            Vault v4 (password-backed)
                          </div>
                        </div>
                      </div>

                      <p className="settings-note">
                        Vault Authenticator now uses one encrypted vault format. Password is the mandatory cold-start fallback, and other lock methods are post-unlock convenience only.
                      </p>

                      <p className="settings-note">
                        Recovery secret and Touch ID enrollment are managed here as part of the single vault format.
                      </p>
                    </section>

                    <SecurityPicker
                      lockApi={lockApi}
                      themeClass={themeClass}
                      currentMethod={lockMethod}
                      methodConfigured={methodConfigured}
                      locked={locked}
                      biometricAvailable={biometricAvailable}
                      isMacOS={isMacOSRuntime()}
                      biometricEnrolled={vaultProtection.biometricEnrolled === true}
                      recoveryGenerated={vaultProtection.recoveryGenerated === true}
                      recoveryRotationPending={recoveryRotationPending}
                      recoveryFocusRequest={recoveryFocusRequest}
                      onMethodSaved={async () => {
                        await refreshSecurityState();
                        await refreshVaultProtectionStatus();
                      }}
                      requestStepUpAuth={requestStepUpAuth}
                      requestSecuritySession={requestSecuritySession}
                      onGenerateRecoverySecret={handleGenerateRecoverySecret}
                      onEnrollBiometricUnlock={async () => {
                        if (!bridge.enrollBiometricUnlock) return false;
                        const status = await bridge.enrollBiometricUnlock();
                        setVaultProtection(status);
                        return status.biometricEnrolled === true;
                      }}
                      onRemoveBiometricUnlock={async () => {
                        if (!bridge.removeBiometricUnlock) return false;
                        const status = await bridge.removeBiometricUnlock();
                        setVaultProtection(status);
                        return status.biometricEnrolled !== true;
                      }}
                      onCopyRecoverySecret={async (secret) => {
                        await handleCopyRecoverySecret(secret);
                      }}
                      onLockNow={handleLockNow}
                      onError={(error) => setActionError(toUiError(error))}
                    />
                  </>
                ) : null}

                {activeSettingsCategory === "accounts" ? (
                  <>
                    <section className="settings-section" data-settings-category="accounts">
                      <h3 className="settings-title settings-title-with-icon">
                        <UserRound size={15} aria-hidden="true" />
                        <span>Account preferences</span>
                      </h3>
                      <div className="settings-grid">
                        <div className="auth-field">
                          <span className="settings-control-label">
                            <KeyRound size={14} aria-hidden="true" />
                            <span>Default digits</span>
                          </span>
                          <ThemedSelect
                            value={String(settings.defaultDigits)}
                            onChange={(next) => void saveSettings({ ...settings, defaultDigits: next === "8" ? 8 : 6 })}
                            options={[
                              { value: "6", label: "6 digits" },
                              { value: "8", label: "8 digits" },
                            ]}
                            ariaLabel="Default digits"
                          />
                        </div>

                        <div className="auth-field">
                          <span className="settings-control-label">
                            <RefreshCw size={14} aria-hidden="true" />
                            <span>Default period</span>
                          </span>
                          <ThemedSelect
                            value={String(settings.defaultPeriod)}
                            onChange={(next) => void saveSettings({ ...settings, defaultPeriod: Number(next) || 30 })}
                            options={[
                              { value: "30", label: "30 seconds" },
                              { value: "60", label: "60 seconds" },
                            ]}
                            ariaLabel="Default period"
                          />
                        </div>

                        <div className="auth-field">
                          <span className="settings-control-label">
                            <List size={14} aria-hidden="true" />
                            <span>Layout</span>
                          </span>
                          <ThemedSelect
                            value={settings.accountsLayoutMode}
                            onChange={(next) =>
                              void saveSettings({
                                ...settings,
                                accountsLayoutMode: next === "list" ? "list" : next === "grid" ? "grid" : "auto",
                              })
                            }
                            options={LAYOUT_MODE_OPTIONS}
                            ariaLabel="Layout"
                          />
                        </div>

                        {shouldShowColumnPreference ? (
                          <div className="auth-field">
                            <span className="settings-control-label">
                              <Columns3 size={14} aria-hidden="true" />
                              <span>Columns</span>
                            </span>
                            <ThemedSelect
                              value={String(settings.accountsGridColumns)}
                              onChange={(next) =>
                                void saveSettings({
                                  ...settings,
                                  accountsGridColumns: next === "1" ? 1 : next === "2" ? 2 : next === "3" ? 3 : "auto",
                                })
                              }
                              options={GRID_COLUMN_OPTIONS}
                              ariaLabel="Grid columns"
                            />
                          </div>
                        ) : null}

                        <div className="auth-field">
                          <span className="settings-control-label">
                            <Grid3x3 size={14} aria-hidden="true" />
                            <span>Density</span>
                          </span>
                          <ThemedSelect
                            value={settings.accountsDensity}
                            onChange={(next) =>
                              void saveSettings({
                                ...settings,
                                accountsDensity: next === "compact" ? "compact" : "comfortable",
                              })
                            }
                            options={DENSITY_OPTIONS}
                            ariaLabel="Density"
                          />
                        </div>

                        <SettingsSwitch
                          label={
                            <span className="settings-control-label">
                              <List size={14} aria-hidden="true" />
                              <span>Hide extra account text on small screens</span>
                            </span>
                          }
                          checked={settings.hideLabelsOnSmall}
                          onChange={(checked) => void saveSettings({ ...settings, hideLabelsOnSmall: checked })}
                          ariaLabel="Hide extra account text on small screens"
                        />
                      </div>
                    </section>

                    <section className="settings-section">
                      <h3 className="settings-title settings-title-with-icon">
                        <KeyRound size={15} aria-hidden="true" />
                        <span>Encrypted Account Backup</span>
                      </h3>
                      <p className="settings-note">
                        Open a guided backup window to choose export or import, set the backup passphrase, and complete verification before saving a file.
                      </p>

                      <div className="auth-modal-actions">
                        <button
                          type="button"
                          onClick={() => openBackupFlowDialog("export")}
                          className="auth-btn auth-btn-primary ui-focus"
                          aria-label="Open encrypted backup flow"
                        >
                          <KeyRound size={15} className="auth-btn-icon" aria-hidden="true" />
                          Open Encrypted Backup Flow
                        </button>
                      </div>
                    </section>
                  </>
                ) : null}

                {activeSettingsCategory === "behavior" ? (
                  <section className="settings-section" data-settings-category="behavior">
                    <h3 className="settings-title settings-title-with-icon">
                      <Monitor size={15} aria-hidden="true" />
                      <span>App behavior</span>
                    </h3>
                    <div className="settings-grid">
                      <SettingsSwitch
                        label={
                          <span className="settings-control-label">
                            <Monitor size={14} aria-hidden="true" />
                            <span>Always on top</span>
                          </span>
                        }
                        checked={settings.alwaysOnTop}
                        onChange={(checked) => {
                          void handleAlwaysOnTopChange(checked);
                        }}
                        ariaLabel="Always on top"
                      />

                      <SettingsSwitch
                        label={
                          <span className="settings-control-label">
                            <Monitor size={14} aria-hidden="true" />
                            <span>Run in background when window closes</span>
                          </span>
                        }
                        checked={settings.runInBackground}
                        onChange={(checked) => void saveSettings({ ...settings, runInBackground: checked })}
                        ariaLabel="Run in background when window closes"
                      />

                      <SettingsSwitch
                        label={
                          <span className="settings-control-label">
                            <Monitor size={14} aria-hidden="true" />
                            <span>Start with system</span>
                          </span>
                        }
                        checked={settings.startWithSystem}
                        onChange={(checked) => void saveSettings({ ...settings, startWithSystem: checked })}
                        ariaLabel="Start app with system"
                      />
                    </div>

                    <p className="settings-note">
                      {settings.runInBackground
                        ? "Run in background is enabled. Closing the window keeps Vault Authenticator in the tray."
                        : "Run in background is disabled. Closing the window exits the app."}
                    </p>

                    <p className="settings-note">
                      {settings.startWithSystem
                        ? "Start with system is enabled. Vault Authenticator launches at sign-in and stays available from the tray."
                        : "Start with system is disabled."}
                    </p>
                  </section>
                ) : null}

                {activeSettingsCategory === "advanced" ? (
                  <section className="settings-section" data-settings-category="advanced">
                    <h3 className="settings-title settings-title-with-icon">
                      <SlidersHorizontal size={15} aria-hidden="true" />
                      <span>Advanced</span>
                    </h3>
                    <p className="settings-note">Diagnostics logs are available in development builds only.</p>
                    <div className="auth-settings-meta-list">
                      <div className="auth-settings-meta-row">
                        <span className="settings-control-label">
                          <Settings2 size={14} aria-hidden="true" />
                          <span>Version</span>
                        </span>
                        <strong>{versionLabel}</strong>
                      </div>
                      <div className="auth-settings-meta-row">
                        <span className="settings-control-label">
                          <SlidersHorizontal size={14} aria-hidden="true" />
                          <span>Build mode</span>
                        </span>
                        <strong>{isDevelopmentBuild ? "Development" : "Production"}</strong>
                      </div>
                      <div className="auth-settings-meta-row">
                        <span className="settings-control-label">
                          <Monitor size={14} aria-hidden="true" />
                          <span>Runtime</span>
                        </span>
                        <strong>{runtimeLabel}</strong>
                      </div>
                      <div className="auth-settings-meta-row">
                        <span className="settings-control-label">
                          <Palette size={14} aria-hidden="true" />
                          <span>Active theme</span>
                        </span>
                        <strong>{themeProfileLabel}</strong>
                      </div>
                      <div className="auth-settings-meta-row">
                        <span className="settings-control-label">
                          <SlidersHorizontal size={14} aria-hidden="true" />
                          <span>Motion profile</span>
                        </span>
                        <strong>{motionProfileLabel}</strong>
                      </div>
                      <div className="auth-settings-meta-row">
                        <span className="settings-control-label">
                          <LockKeyhole size={14} aria-hidden="true" />
                          <span>Lock method</span>
                        </span>
                        <strong>{lockMethodStatus}</strong>
                      </div>
                      <div className="auth-settings-meta-row">
                        <span className="settings-control-label">
                          <KeyRound size={14} aria-hidden="true" />
                          <span>Quick unlock</span>
                        </span>
                        <strong>{quickUnlockStatus}</strong>
                      </div>
                      <div className="auth-settings-meta-row">
                        <span className="settings-control-label">
                          <Users size={14} aria-hidden="true" />
                          <span>Vault accounts</span>
                        </span>
                        <strong>{accounts.length}</strong>
                      </div>
                      <div className="auth-settings-meta-row">
                        <span className="settings-control-label">
                          <Grid3x3 size={14} aria-hidden="true" />
                          <span>Account layout</span>
                        </span>
                        <strong>{accountsLayoutLabel}</strong>
                      </div>
                      <div className="auth-settings-meta-row">
                        <span className="settings-control-label">
                          <Monitor size={14} aria-hidden="true" />
                          <span>Window behavior</span>
                        </span>
                        <strong>
                          {settings.runInBackground ? "Tray on close" : "Exit on close"} / {settings.startWithSystem ? "Startup on" : "Startup off"} /
                          {" "}
                          {settings.alwaysOnTop ? "Always-on-top" : "Normal window"}
                        </strong>
                      </div>
                      <div className="auth-settings-meta-row">
                        <span className="settings-control-label">
                          <Copy size={14} aria-hidden="true" />
                          <span>Clipboard safety</span>
                        </span>
                        <strong>{settings.clipboardSafetyEnabled ? "Auto-clear enabled (30s)" : "Auto-clear disabled"}</strong>
                      </div>
                      <div className="auth-settings-meta-row">
                        <span className="settings-control-label">
                          <RefreshCw size={14} aria-hidden="true" />
                          <span>Screen QR scanner</span>
                        </span>
                        <strong>In-app retry flow enabled</strong>
                      </div>
                    </div>
                  </section>
                ) : null}

                {actionError ? (
                  <p className="auth-error" aria-live="polite">
                    {actionError.title}. {actionError.instruction} <span className="auth-error-code">Code: {actionError.code}</span>
                  </p>
                ) : null}
                </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>

            <footer className="auth-modal-footer">
              <button type="button" onClick={closeSettingsModal} className="auth-btn auth-btn-ghost ui-focus" aria-label="Close settings">
                <X size={15} className="auth-btn-icon" aria-hidden="true" />
                Close
              </button>
            </footer>
          </motion.section>
        </motion.div>
      ) : null}

      {!locked && showSafetySetup ? (
        <SafetySetupModal
          mode={safetySetupMode}
          isClosing={safetySetupExiting}
          themeClass={themeClass}
          settings={settings}
          lockApi={lockApi}
          passwordLockConfigured={passwordLockConfigured}
          vaultProtection={vaultProtection}
          accountCount={accounts.length}
          runSensitiveAction={runSensitiveAction}
          onMethodSaved={async () => {
            await refreshSecurityState();
            await refreshVaultProtectionStatus();
          }}
          onGenerateRecoverySecret={handleGenerateRecoverySecret}
          onCopyRecoverySecret={handleCopyRecoverySecret}
          onEnrollBiometric={async () => {
            if (!bridge.enrollBiometricUnlock) return false;
            const status = await bridge.enrollBiometricUnlock();
            setVaultProtection(status);
            return status.biometricEnrolled === true;
          }}
          onRemoveBiometric={async () => {
            if (!bridge.removeBiometricUnlock) return false;
            const status = await bridge.removeBiometricUnlock();
            setVaultProtection(status);
            return status.biometricEnrolled !== true;
          }}
          onOpenAddAccount={async () => {
            openAddModal({ method: "uri" });
          }}
          onSettingsChange={saveSettings}
          onError={(error) => setActionError(toUiError(error))}
          onSkip={handleSkipSafetySetup}
          onClose={closeSafetySetup}
          onComplete={handleCompleteSafetySetup}
        />
      ) : null}

      {securityReady && vaultProtection.migrationRequired ? (
        <motion.div className={`auth-overlay ${themeClass}`} role="presentation" initial={overlayPresence.initial} animate={overlayPresence.animate} exit={overlayPresence.exit} variants={overlayPresence.variants} transition={overlayPresence.transition}>
          <motion.section className={`auth-confirm-modal ${themeClass}`} role="dialog" aria-modal="true" aria-label="Vault security upgrade" initial={modalPresence.initial} animate={modalPresence.animate} exit={modalPresence.exit} variants={modalPresence.variants} transition={modalPresence.transition}>
            <header className="auth-modal-header">
              <h2 className="auth-modal-title auth-confirm-title">
                <span className="auth-confirm-title-icon" aria-hidden="true">
                  <LockKeyhole size={16} />
                </span>
                <span>{vaultProtection.requiresPasswordSetup ? "Set a vault password" : "Vault security upgrade"}</span>
              </h2>
            </header>
            <div className="auth-confirm-body">
              <p className="auth-confirm-copy">
                {vaultProtection.requiresPasswordSetup
                  ? "To keep your vault secure, set a password. This is a one-time step."
                  : "Enter your password to upgrade your vault. This is a one-time step."}
              </p>
              <div className="auth-field">
                <span>Vault password</span>
                <input
                  type="password"
                  className="auth-input ui-focus"
                  value={migrationPassword}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMigrationPassword(event.target.value)}
                  placeholder="Vault password"
                  autoFocus
                />
              </div>
              {vaultProtection.requiresPasswordSetup ? (
                <div className="auth-field">
                  <span>Confirm vault password</span>
                  <input
                    type="password"
                    className="auth-input ui-focus"
                    value={migrationPasswordConfirm}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setMigrationPasswordConfirm(event.target.value)}
                    placeholder="Confirm vault password"
                  />
                </div>
              ) : null}
              {migrationError ? <p className="settings-warning">{migrationError}</p> : null}
            </div>
            <footer className="auth-confirm-actions">
              <button type="button" className="auth-btn auth-btn-primary ui-focus auth-btn-modal" onClick={() => void handleSubmitMigration()} disabled={migrationBusy}>
                <LockKeyhole size={15} className="auth-btn-icon" aria-hidden="true" />
                {migrationBusy ? "Working..." : vaultProtection.requiresPasswordSetup ? "Set password and continue" : "Upgrade vault"}
              </button>
            </footer>
          </motion.section>
        </motion.div>
      ) : null}

      {!locked && showSettings && showBackupFlowDialog ? (
        <motion.div
          className={`auth-overlay ${themeClass}`}
          onClick={closeBackupFlowDialog}
          role="presentation"
          initial={overlayPresence.initial}
          animate={resolveMotionState(overlayPresence, backupFlowDialogExiting)}
          exit={overlayPresence.exit}
          variants={overlayPresence.variants}
          transition={overlayPresence.transition}
        >
          <motion.section
            className={`auth-confirm-modal auth-backup-flow-modal ${themeClass}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Encrypted account backup"
            initial={modalPresence.initial}
            animate={resolveMotionState(modalPresence, backupFlowDialogExiting)}
            exit={modalPresence.exit}
            variants={modalPresence.variants}
            transition={modalPresence.transition}
          >
            <header className="auth-modal-header">
              <h2 className="auth-modal-title auth-confirm-title">
                <span className="auth-confirm-title-icon" aria-hidden="true">
                  <KeyRound size={16} />
                </span>
                <span>Encrypted Account Backup</span>
              </h2>
            </header>

            <div className="auth-confirm-body auth-backup-flow-body">
              <p className="auth-confirm-copy">
                Choose whether you want to export a new encrypted backup or import one you already have. Use the same backup passphrase later when you restore it.
              </p>

              <div className="auth-backup-flow-switch" role="tablist" aria-label="Backup action">
                <button
                  type="button"
                  className={`auth-btn ui-focus ${backupFlowAction === "export" ? "auth-btn-primary" : "auth-btn-subtle"}`}
                  onClick={() => {
                    setActionError(null);
                    setBackupFlowAction("export");
                  }}
                  aria-pressed={backupFlowAction === "export"}
                >
                  <Download size={15} className="auth-btn-icon" aria-hidden="true" />
                  Export
                </button>
                <button
                  type="button"
                  className={`auth-btn ui-focus ${backupFlowAction === "import" ? "auth-btn-primary" : "auth-btn-subtle"}`}
                  onClick={() => {
                    setActionError(null);
                    setBackupFlowAction("import");
                  }}
                  aria-pressed={backupFlowAction === "import"}
                >
                  <Upload size={15} className="auth-btn-icon" aria-hidden="true" />
                  Import
                </button>
              </div>

              <div className="auth-backup-flow-card">
                <div className="auth-field auth-backup-flow-field">
                  <span>Backup passphrase</span>
                  <input
                    aria-label="Backup passphrase"
                    type="password"
                    value={backupPassphrase}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setBackupPassphrase(event.target.value)}
                    placeholder="Choose a separate backup passphrase"
                    className="auth-input ui-focus"
                    autoFocus
                  />
                </div>

                {backupFlowAction === "import" ? (
                  <div className="auth-field auth-backup-flow-field">
                    <span>Account import mode</span>
                    <ThemedSelect
                      value={backupMode}
                      onChange={(next) => setBackupMode(next === "replace" ? "replace" : "merge")}
                      options={[
                        { value: "merge", label: "Merge" },
                        { value: "replace", label: "Replace" },
                      ]}
                      ariaLabel="Account import mode"
                    />
                  </div>
                ) : null}

                <p className="settings-note auth-backup-flow-note">
                  {backupFlowAction === "export"
                    ? "Choose a separate passphrase for the backup file. Export will ask you to verify your identity before the save dialog opens."
                    : backupMode === "replace"
                      ? "Replace removes your current local accounts and replaces them with the backup file contents."
                      : "Merge keeps your current local accounts and adds any accounts from the backup file."}
                </p>

                {actionError ? (
                  <p className="auth-error auth-confirm-error" aria-live="polite">
                    {actionError.title}. {actionError.instruction} <span className="auth-error-code">Code: {actionError.code}</span>
                  </p>
                ) : null}
              </div>
            </div>

            <footer className="auth-confirm-actions">
              <button type="button" onClick={closeBackupFlowDialog} className="auth-btn auth-btn-subtle ui-focus auth-btn-modal">
                <X size={15} className="auth-btn-icon" aria-hidden="true" />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void (backupFlowAction === "export" ? handleExportBackup() : handleImportBackup())}
                className="auth-btn auth-btn-primary ui-focus auth-btn-modal"
              >
                {backupFlowAction === "export" ? (
                  <Download size={15} className="auth-btn-icon" aria-hidden="true" />
                ) : (
                  <Upload size={15} className="auth-btn-icon" aria-hidden="true" />
                )}
                {backupFlowAction === "export" ? "Continue to Export" : "Continue to Import"}
              </button>
            </footer>
          </motion.section>
        </motion.div>
      ) : null}

      <AnimatePresence initial={false} mode="wait">
        {!locked && showStepUpAuth ? (
          <StepUpAuthModal
            themeClass={themeClass}
            lockApi={lockApi}
            onCancel={() => resolveStepUpAuth(false)}
            onVerified={() => resolveStepUpAuth(true)}
          />
        ) : null}
      </AnimatePresence>

      {!locked && pendingDelete ? (
        <motion.div
          className={`auth-overlay ${themeClass}`}
          onClick={() => {
            if (deleteBusy) return;
            closeDeleteDialog();
          }}
          role="presentation"
          initial={overlayPresence.initial}
          animate={resolveMotionState(overlayPresence, deleteDialogExiting)}
          exit={overlayPresence.exit}
          variants={overlayPresence.variants}
          transition={overlayPresence.transition}
        >
          <motion.section
            className={`auth-confirm-modal ${themeClass}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm account deletion"
            initial={modalPresence.initial}
            animate={resolveMotionState(modalPresence, deleteDialogExiting)}
            exit={modalPresence.exit}
            variants={modalPresence.variants}
            transition={modalPresence.transition}
          >
            <header className="auth-modal-header">
              <h2 className="auth-modal-title auth-confirm-title">
                <span className="auth-confirm-title-icon" aria-hidden="true">
                  <AlertTriangle size={16} />
                </span>
                <span>Delete this account?</span>
              </h2>
            </header>

            <div className="auth-confirm-body">
              <p className="auth-confirm-copy">
                You are about to delete <strong>{pendingDelete.issuer || pendingDelete.label || "this account"}</strong>.
              </p>
              <p className="auth-confirm-warning">This action cannot be reversed.</p>

              {deleteError ? (
                <p className="auth-error auth-confirm-error" aria-live="polite">
                  {deleteError.title}. {deleteError.instruction} <span className="auth-error-code">Code: {deleteError.code}</span>
                </p>
              ) : null}
            </div>

            <footer className="auth-confirm-actions">
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="auth-btn auth-btn-subtle ui-focus auth-btn-modal"
                disabled={deleteBusy}
              >
                <X size={15} className="auth-btn-icon" aria-hidden="true" />
                Cancel
              </button>
              <button type="button" onClick={() => void handleConfirmDelete()} className="auth-btn auth-btn-danger ui-focus auth-btn-modal" disabled={deleteBusy}>
                <Trash2 size={15} className="auth-btn-icon" aria-hidden="true" />
                {deleteBusy ? "Deleting..." : "Delete Account"}
              </button>
            </footer>
          </motion.section>
        </motion.div>
      ) : null}
      </div>
    </MotionModeContext.Provider>
  );
}
