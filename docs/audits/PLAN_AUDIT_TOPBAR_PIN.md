# Plan Audit — Topbar Pin / Always-on-Top

## A) Current implementation map

- **BrowserWindow creation + window controls IPC**
  - `apps/desktop/src/main.ts`
    - Creates `BrowserWindow`.
    - Registers `window:minimize`, `window:maximize`, `window:unmaximize`, `window:close`, `window:isMaximized`.
    - Emits renderer event `window:maximizedChanged`.

- **Custom titlebar UI component**
  - `packages/ui/src/components/CustomTitleBar.tsx`
    - Renders app icon/name/context + minimize/maximize/close buttons.
    - Tracks maximize state via `controls.isMaximized()` + `controls.onMaximizedChanged`.

- **Settings UI**
  - `packages/ui/src/App.tsx`
    - Settings modal under `activeSettingsCategory === "security"` contains lock/privacy/biometric options.
    - Persists settings through `saveSettings()` -> `bridge.updateSettings()`.

- **Current settings persistence**
  - `apps/desktop/src/main/secure-store.ts`
    - Defines `AppSettings`, `DEFAULT_SETTINGS`, `normalizeSettings`, `loadSettings`, `saveSettings`.
  - `apps/desktop/src/main/ipc-handlers.ts`
    - Validates incoming settings via `validateSettings`.
    - Handles `app:getSettings` / `app:updateSettings` (persists and applies privacy screen content protection).
  - Renderer bridge path:
    - `apps/desktop/src/preload.ts` (`appAPI.getSettings/updateSettings`)
    - `apps/desktop/src/renderer.d.ts` (typed API)
    - `packages/ui/src/bridge.ts` (`AppSettings` + `desktopBridge` normalization)

## B) IPC & state sync plan (critical)

Because topbar and settings can both toggle the same value, we need shared state driven by main-process events.

### IPC channels
1. `window:getAlwaysOnTop` (invoke)
   - Returns current `BrowserWindow.isAlwaysOnTop()`.
2. `window:setAlwaysOnTop` (invoke, boolean)
   - Applies `win.setAlwaysOnTop(enabled)`.
   - Persists to settings store (`saveSettings({ ...settings, alwaysOnTop: enabled })`).
   - Broadcasts `window:alwaysOnTopChanged` to renderer.
3. `window:alwaysOnTopChanged` (event)
   - Renderer subscriber updates all relevant UI state live.

### Renderer sync strategy
- Extend `windowAPI` in preload with:
  - `getAlwaysOnTop()`
  - `setAlwaysOnTop(enabled)`
  - `onAlwaysOnTopChanged(cb)`
- In `App.tsx` (single source of truth in UI):
  - keep `settings.alwaysOnTop` in React state;
  - load initial from `windowAPI.getAlwaysOnTop()`;
  - subscribe to `window:alwaysOnTopChanged` and update state;
  - pass `alwaysOnTop` + toggle callback down to `CustomTitleBar`;
  - settings toggle uses same callback.

### Persistence path
- Add `alwaysOnTop: boolean` to app settings models in both desktop + ui bridge types:
  - `apps/desktop/src/main/secure-store.ts`
  - `apps/desktop/src/main/ipc-handlers.ts` (`validateSettings`)
  - `packages/ui/src/bridge.ts` (`AppSettings`, defaults, normalization)
  - `apps/desktop/src/renderer.d.ts`
- Apply at startup in window creation (`main.ts`) after loading settings.

## C) UI layout plan

- **Pin button placement**
  - Add pin button in `CustomTitleBar.tsx` immediately left of Minimize.

- **Pin active/inactive visuals**
  - CSS classes in `packages/ui/src/ui.css`:
    - base pin button style inherits titlebar button style;
    - active class (`.is-active`) uses accent color/background/border tint;
    - inactive remains muted like other controls.

- **Topbar alignment polish**
  - Keep drag behavior on `auth-titlebar-drag` (`-webkit-app-region: drag`).
  - Ensure all controls are `-webkit-app-region: no-drag`.
  - Normalize titlebar centerline and hit targets:
    - explicit titlebar height token;
    - clean `display:flex` + `align-items:center` on bar and controls;
    - button hit targets at least `40px` width/height;
    - consistent spacing between brand text and controls.

## Validation plan

- Manual sync
  - Topbar pin toggles Settings checkbox immediately.
  - Settings checkbox toggles topbar pin immediately.
- OS behavior
  - Pinned window stays above other apps; unpinned does not.
- Persistence
  - Enable pin, restart app, verify launches pinned.
- UX
  - Dragging empty titlebar area moves window.
  - Clicking pin/min/max/close does not drag window.
