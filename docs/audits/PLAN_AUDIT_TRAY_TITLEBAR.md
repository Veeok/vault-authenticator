# PLAN AUDIT: Tray + Titlebar Regressions

## Scope
- Goal: fix double titlebar, missing tray icon reliability, and duplicate tray/app window behavior.
- Constraint honored: this file is created before any implementation edits.

## A) Window Inventory

### 1) Main app window
- **Creation site:** `apps/desktop/src/main.ts:592` (`createMainWindow`), options start at `apps/desktop/src/main.ts:601`.
- **Options (current):**
  - `frame`: `!isMac` at `apps/desktop/src/main.ts:608` (Windows => `true`)
  - `titleBarStyle`: `hiddenInset` on macOS only at `apps/desktop/src/main.ts:609`
  - `titleBarOverlay`: not set
  - `skipTaskbar`: not set (default false)
  - `show`: `!launchHidden` at `apps/desktop/src/main.ts:614`
  - `parent`: not set
  - `alwaysOnTop`: applied after creation via `win.setAlwaysOnTop(...)` at `apps/desktop/src/main.ts:636`
- **Chrome/titlebar outcome:** native OS chrome is visible on Windows because `frame` is true.
- **Renderer custom titlebar usage:** custom titlebar is rendered in UI when desktop window controls exist:
  - `packages/ui/src/App.tsx:1635` (`<CustomTitleBar ... />` in normal app state)
  - `packages/ui/src/App.tsx:1610` (`<CustomTitleBar ... />` in security-loading state)
  - desktop renderer always supplies `windowControls` at `apps/desktop/src/renderer.ts:93-103`

### 2) Tray menu popover window
- **Creation site:** `apps/desktop/src/main.ts:261` (`createTrayMenuWindow`), options at `apps/desktop/src/main.ts:266`.
- **Options (current):**
  - `frame`: `false` at `apps/desktop/src/main.ts:270`
  - `titleBarStyle/titleBarOverlay`: not set
  - `skipTaskbar`: `true` at `apps/desktop/src/main.ts:276`
  - `show`: `false` at `apps/desktop/src/main.ts:269`
  - `parent`: not set
  - `alwaysOnTop`: `true` at `apps/desktop/src/main.ts:278`, and `setAlwaysOnTop(true, "pop-up-menu")` at `apps/desktop/src/main.ts:293`
- **Chrome/titlebar outcome:** frameless, no native chrome.
- **Rendered content:** dedicated tray renderer loaded from `apps/desktop/tray_menu.html:10` -> `apps/desktop/src/tray-menu.tsx`.

### 3) QR scan selection overlays (dialog-like windows)
- **Creation site:** `apps/desktop/src/main/screen-qr.ts:253` (`promptUserForSelection`).
- **Options (current):**
  - `frame`: `false` at `apps/desktop/src/main/screen-qr.ts:260`
  - `titleBarStyle/titleBarOverlay`: not set
  - `skipTaskbar`: `true` at `apps/desktop/src/main/screen-qr.ts:266`
  - `show`: `false` at `apps/desktop/src/main/screen-qr.ts:271` (then shown programmatically)
  - `parent`: `parentWindow` at `apps/desktop/src/main/screen-qr.ts:254`
  - `alwaysOnTop`: `true` at `apps/desktop/src/main/screen-qr.ts:269`
- **Chrome/titlebar outcome:** frameless overlay; no custom app titlebar.

## B) Tray Inventory

- **Tray creation site:** `apps/desktop/src/main.ts:450` (`createTray`).
- **Module-level storage:** yes, `let tray: Tray | null = null;` at `apps/desktop/src/main.ts:47`.
- **Singleton guard:** yes in-process, `if (tray) return;` at `apps/desktop/src/main.ts:451-453`.
- **Lifecycle:** created after ready at `apps/desktop/src/main.ts:862`, destroyed on quit paths at `apps/desktop/src/main.ts:322-325` and `apps/desktop/src/main.ts:831-834`.
- **Re-created on reload/multi-launch risk:**
  - Not re-created inside one process due guard.
  - Can be created by each separate app process because no single-instance lock exists (root cause for duplicates).
- **Icon resolution audit (dev vs packaged):**
  - Tray icon currently does **not** resolve from file path.
  - It is generated from inline SVG data URL via `buildTrayIcon` at `apps/desktop/src/main.ts:101-118`, then used in `createTray` at `apps/desktop/src/main.ts:456-458`.
  - No `process.resourcesPath`-based tray icon path handling exists.
  - `__dirname` path resolution exists only for **window icon** (`resolveWindowIconPath`) at `apps/desktop/src/main.ts:62`.

## C) “Duplicate app in tray” Root Cause

### Determination
- **Primary root cause identified:** **(3) second app instance running** (no single-instance lock).

### Evidence
- `app.requestSingleInstanceLock()` is not present anywhere in `apps/desktop/src/main.ts`.
- Startup always creates main window + tray on ready:
  - `createMainWindow()` at `apps/desktop/src/main.ts:861`
  - `createTray()` at `apps/desktop/src/main.ts:862`
- Since singleton guard is process-local (`apps/desktop/src/main.ts:451`), each process gets its own tray icon/window.

### Additional checks
- **(1) Two tray instances in one process:** not indicated (guard exists).
- **(2) Tray menu window appearing as normal app window:** less likely from current options (`frame: false`, `skipTaskbar: true`), but still worth hardening with explicit parent/focus behavior.

## D) Intended Architecture + Target Files

### Intended architecture decisions
- Main window uses renderer custom titlebar, so native chrome must be removed on Windows.
- Exactly one tray icon per user session/process set.
- Enforce single-instance app behavior.
- Keep tray menu as a popover utility window (no taskbar/Alt-Tab style app duplication behavior), and keep it separate from full app shell.

### Exact root-cause lines to fix
- **Double titlebar:**
  - Native chrome enabled on Windows: `apps/desktop/src/main.ts:608` (`frame: !isMac`).
  - Custom titlebar rendered by UI: `packages/ui/src/App.tsx:1635` (and `:1610` loading branch).
- **Duplicate tray/app behavior:**
  - Missing single-instance lock in `apps/desktop/src/main.ts`.
  - Per-process startup creation at `apps/desktop/src/main.ts:861-863`.
- **Tray icon reliability gap:**
  - Inline generated icon pathless flow at `apps/desktop/src/main.ts:101-123` and `:456-458`.

### Target files for implementation
- `apps/desktop/src/main.ts`
  - enforce frameless Windows main window with custom controls only
  - add single-instance lock + second-instance focusing
  - harden tray singleton lifecycle and deterministic tray icon path resolution (dev + packaged)
  - harden tray popover window behavior (`skipTaskbar`, `show false`, parent/stacking/blur-hide/showInactive)
- `apps/desktop/forge.config.ts` (if packaged asset routing needs explicit extra resources)
- `apps/desktop/src/__tests__/...` (new tests for tray singleton guard / single-instance behavior if feasible)

## Implementation Plan (post-audit)
1. Update window/tray runtime in `main.ts` to remove native titlebar on Windows and add single-instance lock.
2. Replace tray icon creation with absolute-path icon resolver using dev + packaged paths and Windows `.ico` preference.
3. Ensure tray menu window remains utility popover (no main-shell rendering, hidden until tray click, hide on blur/Esc).
4. Add/adjust tests for singleton lock/tray behavior where feasible.
5. Run desktop/workspace tests and produce validation notes (manual + automated).
