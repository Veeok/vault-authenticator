# PLAN AUDIT: Tray Theme Modes

## Scope
- Goal: add dual tray menu modes (`native` + `themed`) with runtime switching and a performance-first default.
- Constraint honored: this audit is written before any implementation edits.

## A) Current Tray Implementation (as-is)

### Tray creation and click handlers
- Tray is created in `apps/desktop/src/main.ts` via `createTray()` (`apps/desktop/src/main.ts:546`).
- Native menu is built with `Menu.buildFromTemplate(...)` in `buildTrayContextMenu()` (`apps/desktop/src/main.ts:244`).
- Right-click opens native popup through `tray.popUpContextMenu()` in `showNativeTrayMenu()` (`apps/desktop/src/main.ts:536`).
- Left-click currently focuses/opens the main window (`apps/desktop/src/main.ts:558-560`).

### Duplicate prevention status
- Single-instance lock exists: `acquireSingleInstanceLock(app, ...)` at `apps/desktop/src/main.ts:827`.
- Tray singleton guard exists: `if (tray) return;` inside `createTray()` at `apps/desktop/src/main.ts:547-549`.

### Tray BrowserWindow status
- No tray BrowserWindow is currently active in main process.
- Main process has no `trayMenuWindow`/`createTrayMenuWindow` symbols in `apps/desktop/src/main.ts`.

## B) Theme System Inputs (as-is)

### Theme model
- Theme model is `baseTheme` (`light|dark|amoled`) + `accent` (`none|...`) in shared types at `packages/ui/src/bridge.ts:149-168`.
- Amoled accent forcing exists in both renderer normalization and main-store normalization.

### Settings flow (renderer/main)
- Renderer reads/updates settings via `desktopBridge` (`packages/ui/src/bridge.ts:739`, `:748`).
- Main process persists settings in secure store (`apps/desktop/src/main/secure-store.ts:666`, `:676`).
- IPC validates settings and notifies runtime listeners (`apps/desktop/src/main/ipc-handlers.ts:387`, `:1480`, `:1490`).
- Main process listens via `setSettingsAppliedListener(...)` and applies runtime tray behavior in `apps/desktop/src/main.ts:915-917`.

### Icon resolution (dev vs packaged)
- Main process resolves tray icon candidates from:
  - dev assets path (`__dirname`-relative), and
  - packaged `process.resourcesPath` + `app.asar` asset paths.
- Resolution entrypoints: `resolveTrayIconPath(...)` and `trayIconAssetBasePaths()` in `apps/desktop/src/main.ts:85-106`.

## C) New Settings Keys (decision)

Implement these keys in shared settings model, defaults, validation, and persistence:

- `trayMenuStyle: "native" | "themed"` (default: `"native"`)
- `trayMenuAnimations: "off" | "reduced"` (default: `"off"`)
- `trayMenuThemeSync: boolean` (default: `true`; used only in themed mode)
- `trayIconStyle: "auto" | "light" | "dark"` (default: `"auto"`)

## D) Target UX Behavior (decision)

- Right-click tray always opens menu according to current style:
  - `native` => Electron native context menu.
  - `themed` => dedicated lightweight tray popover window.
- Left-click behavior remains quick-open main window by default (optional popup path can be added later).
- Themed popover hard requirements:
  - no taskbar entry (`skipTaskbar: true`)
  - no titlebar (`frame: false`)
  - not a full app shell (dedicated tray route/component only)
  - hide on blur and Esc
  - positioned near tray icon and clamped to display work area

## E) Platform Gotchas and Planned Handling

### 1) Rounded corners vs transparency paradox (Windows/Linux)
- Plan:
  - default themed tray window: `transparent: false` for performance.
  - add runtime fallback to `transparent: true` if corner artifacts are detected/flagged, while keeping tray DOM lightweight.
  - no blur/vibrancy effects; minimal shadows/gradients.

### 2) Tray click vs blur race condition
- Plan:
  - add guards with `lastShownAt`, `lastHiddenAt`, `lastBlurAt` timestamps.
  - ignore reopen/rehide actions when events occur within ~100ms threshold.
  - ensures no open-close-open flicker loops when tray click and blur interleave.

### 3) Linux `tray.getBounds()` can return zeros
- Plan:
  - if tray bounds are invalid (zero/NaN), anchor using `screen.getCursorScreenPoint()`.
  - always clamp popover bounds to nearest display `workArea`.

## Implementation Targets

- Main process: `apps/desktop/src/main.ts`
  - dual-mode tray menu orchestration, native menu cleanup, optional themed popover window, gotcha handling.
- Settings model/persistence/validation:
  - `packages/ui/src/bridge.ts`
  - `apps/desktop/src/main/secure-store.ts`
  - `apps/desktop/src/main/ipc-handlers.ts`
  - `apps/mobile/src/mobile-bridge.ts`
- Renderer command handling and settings UI:
  - `packages/ui/src/App.tsx`
- Desktop build entries/types/preload if themed window route is reintroduced:
  - `apps/desktop/forge.config.ts`
  - `apps/desktop/src/preload.ts`
  - `apps/desktop/src/renderer.d.ts`
  - `apps/desktop/tray_menu.html` + `apps/desktop/src/tray-menu.tsx` (+ css)
- Tests:
  - desktop main/preload config tests + settings normalization tests.
