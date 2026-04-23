# Plan Audit: Tray + Startup + Background Runtime

## A) Current architecture map

### Main window creation
- Main `BrowserWindow` is created in `apps/desktop/src/main.ts` inside `app.whenReady()`.
- It is assigned to `mainWindow` and configured with preload `src/preload.ts`, custom title bar on Windows, and security hardening (`contextIsolation`, `sandbox`, navigation lock-down).

### Existing preload bridges / window commands
- Preload bridge is in `apps/desktop/src/preload.ts`.
- Exposed globals:
  - `authAPI` (accounts and code operations)
  - `appAPI` (settings / backup / account edit)
  - `lockAPI` (lock methods, verify, passkey, backup codes)
  - `windowAPI` (min/max/close, version, always-on-top, background-state events)
  - `clipboardAPI` (clipboard clear)
- Renderer wiring and window-control typing live in:
  - `apps/desktop/src/renderer.ts`
  - `apps/desktop/src/renderer.d.ts`

### Settings load/persist in main process
- Encrypted settings persistence is centralized in `apps/desktop/src/main/secure-store.ts`:
  - `loadSettings()`
  - `saveSettings()`
  - schema normalization in `normalizeSettings(...)`
- IPC settings validation and update path is in `apps/desktop/src/main/ipc-handlers.ts`:
  - `app:getSettings`
  - `app:updateSettings`
  - theme APIs `settings:setBaseTheme` and `settings:setAccent`

### Theme application and renderer theme state
- Renderer theme state is in `packages/ui/src/App.tsx` (`settings.baseTheme` + `settings.accent`).
- The root class uses theme + accent classes (`theme-light|dark|amoled`, `accent-*`) and UI tokens in `packages/ui/src/ui.css`.
- Amoled accent override already exists (`accent` forced to `none` logic in bridge/main).
- Renderer learns theme from `bridge.getSettings()` and updates via `bridge.updateSettings()` and granular theme APIs.

## B) Current close behavior audit

### Existing handlers
- `mainWindow.on("close")`: **no interception currently** (no hide-to-tray behavior).
- `app.on("window-all-closed")`: currently defined twice in `main.ts`:
  - first handler logs diagnostics only.
  - second handler quits on non-macOS (`if (process.platform !== "darwin") app.quit()`).
- `app.on("before-quit")`: currently clears idle timer, no `isQuitting` gate.

### Effective current behavior
- Windows/Linux: closing the main window eventually quits app.
- macOS: app stays resident after all windows close (default mac behavior via current guard).
- No tray exists yet, so there is no background UX after close.

## C) Startup settings feasibility

### Platform/package context
- Desktop build uses Electron Forge in `apps/desktop/forge.config.ts`.
- Packaging targets configured now are Windows-focused (NSIS + win32 ZIP), with code still cross-platform aware.

### Login startup API placement
- `app.setLoginItemSettings(...)` is feasible in main process after `app.whenReady()` and whenever relevant setting changes.
- Best placement:
  1. apply once after startup settings are loaded.
  2. apply again immediately when settings are updated through IPC.

## D) Tray UI approach decision

### Primary UX
- Implement a **custom tray menu popover** (`BrowserWindow`, frameless, always-on-top, skip-taskbar, hidden by default).
- It will be loaded as a lightweight second renderer entry (`tray_menu`) and styled with existing theme token classes (`theme-*`, `accent-*`) to match app look.

### Secondary fallback
- Provide a native `Menu` fallback context menu for platforms/failure paths where custom popover cannot be shown.

### Tray icon theming assets strategy
- Provide two icon variants logically:
  - dark glyph for Light theme backgrounds
  - light glyph for Dark/Amoled backgrounds
- Implementation choice: generate tray icon images from inline SVG at runtime (light/dark variants) and resize to tray-friendly sizes (Windows-first).
- This avoids adding new binary asset tooling while still supporting immediate icon switching on theme changes.

## E) Validation plan

### Manual validation
1. Close-to-tray
   - With `runInBackground` ON, clicking window close hides window, keeps process + tray alive.
2. Exit behavior
   - Tray `Exit` fully quits app and removes tray icon.
3. Start with system
   - Toggle ON/OFF in settings and verify login item state via Electron API and actual session restart.
4. Theme sync
   - Change Light/Dark/Amoled in app settings and confirm:
     - tray icon swaps variant immediately
     - tray popover updates theme classes immediately
     - Amoled forces accent `none` as existing rule.
5. Tray actions
   - Open Authenticator, Search, Lock now, Settings, Always on top toggle all invoke expected behavior.

### Automated checks to add/extend
- Extend settings normalization/persistence tests for new keys:
  - `runInBackground`
  - `startWithSystem`
- Extend preload bridge tests for any new window/tray event methods.
- Keep existing desktop/ui/mobile test suites green after IPC/schema updates.
