# PLAN AUDIT: Native Tray Menu Refactor

## Scope
- Objective: replace the tray BrowserWindow UX with a fully native `Tray + Menu` experience on Windows.
- Constraint: this audit file is created before implementation edits.

## A) Current Tray Implementation

### Where Tray is created
- Tray is created in `apps/desktop/src/main.ts` inside `createTray()` at `apps/desktop/src/main.ts:516`.
- Singleton storage exists at module scope: `let tray: Tray | null = null;` (`apps/desktop/src/main.ts:48`).
- Creation currently uses `ensureTraySingleton(...)` at `apps/desktop/src/main.ts:517`.

### Whether a tray menu BrowserWindow exists
- Yes. `let trayMenuWindow: BrowserWindow | null = null;` exists at `apps/desktop/src/main.ts:47`.
- It is created by `createTrayMenuWindow()` at `apps/desktop/src/main.ts:325`.
- It is shown on tray click via `showTrayMenu()` -> `win.showInactive()` at `apps/desktop/src/main.ts:487` and `apps/desktop/src/main.ts:508`.

### Multiple Tray instances risk
- In a single process, guarded by singleton (`ensureTraySingleton`).
- Across processes, duplicate tray icons are prevented by single-instance lock flow:
  - `acquireSingleInstanceLock(app, ...)` at `apps/desktop/src/main.ts:832`.
  - App startup gated on lock at `apps/desktop/src/main.ts:912-915`.

### requestSingleInstanceLock usage
- Yes, indirectly through helper:
  - helper definition in `apps/desktop/src/main/runtime-guards.ts:9-21`.
  - consumed in `apps/desktop/src/main.ts:832`.

## B) Why It Looks Like a Duplicate App

### Is a BrowserWindow shown on tray click?
- Yes. Tray click handlers call `showTrayMenu(bounds)`:
  - `createdTray.on("click", ...)` at `apps/desktop/src/main.ts:523-525`
  - `createdTray.on("right-click", ...)` at `apps/desktop/src/main.ts:527-529`
- `showTrayMenu()` creates/positions a BrowserWindow and calls `win.showInactive()` (`apps/desktop/src/main.ts:495-508`).

### Is tray menu implemented as a window?
- Yes. The tray menu is a dedicated BrowserWindow:
  - `createTrayMenuWindow()` at `apps/desktop/src/main.ts:325`
  - renderer entry `tray_menu.html` + `src/tray-menu.tsx` loaded at `apps/desktop/src/main.ts:357-360`.

### Is it appearing in taskbar / Alt-Tab due to options?
- Current config sets `skipTaskbar: true` (`apps/desktop/src/main.ts:326`), so taskbar is suppressed.
- But it is still a real top-level window (`alwaysOnTop`, `focusable`) being shown (`apps/desktop/src/main.ts:328-329`, `apps/desktop/src/main.ts:508`), which makes UX feel like a second app/tray window rather than a native menu.

### Root cause (exact)
- Root cause is architectural: tray interaction is implemented as a custom BrowserWindow popover instead of native tray context menu.
- Exact code path:
  - tray click -> `showTrayMenu()` (`apps/desktop/src/main.ts:487`)
  - creates/uses `trayMenuWindow` (`apps/desktop/src/main.ts:325`)
  - shows it via `win.showInactive()` (`apps/desktop/src/main.ts:508`).

## C) Target Behavior

- Keep a single global tray instance (`tray` module variable), guarded by `if (tray) return` semantics.
- Remove tray BrowserWindow menu entirely:
  - delete `trayMenuWindow`, `createTrayMenuWindow`, tray menu IPC channels, and tray renderer route/entry.
- Use native Electron menu only:
  - `Menu.buildFromTemplate(...)`
  - `tray.setContextMenu(menu)` and/or `tray.popUpContextMenu(menu)` on right-click.
- Preserve single-instance lock (`requestSingleInstanceLock`) so only one process owns one tray icon.
- Close main window to tray (hide), and only tray `Exit` performs full quit.

## Target Files For Step 2
- `apps/desktop/src/main.ts` (primary tray refactor to native menu only)
- `apps/desktop/src/preload.ts` (remove `trayMenuAPI` bridge)
- `apps/desktop/src/renderer.d.ts` (remove `trayMenuAPI` global typing)
- `apps/desktop/src/__tests__/preload.window-api.test.ts` (remove tray menu bridge tests)
- `apps/desktop/src/__tests__/renderer-csp-config.test.ts` (remove tray-menu html coupling assertions)
- `apps/desktop/forge.config.ts` (remove `tray_menu` renderer entry)
- `apps/desktop/tray_menu.html` and `apps/desktop/src/tray-menu.tsx` (+ related CSS) removal
- `packages/ui/src/App.tsx` (extend app-command handling for tray quick actions/settings categories)
