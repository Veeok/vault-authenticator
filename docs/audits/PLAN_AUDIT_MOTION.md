# Motion Plan Audit

## 1) Current motion state

### Motion tokens and existing CSS motion
- Motion tokens currently live in `packages/ui/src/ui.css:83`-`packages/ui/src/ui.css:89`:
  - `--dur-fast`, `--dur-base`, `--dur-modal`, `--ease-standard`, `--ease-emphasis`, `--slide-sm`, `--slide-md`.
- Existing transition usage is broad across interactive surfaces (buttons, cards, menus, modals, list/layout updates), e.g.:
  - `packages/ui/src/ui.css:605`, `packages/ui/src/ui.css:778`, `packages/ui/src/ui.css:1028`, `packages/ui/src/ui.css:1315`, `packages/ui/src/ui.css:1332`.
- Existing keyframes:
  - `@keyframes rise-in` (`packages/ui/src/ui.css:2618`)
  - `@keyframes surface-in` (`packages/ui/src/ui.css:2650`)
  - `@keyframes auth-spinner-spin` (`packages/ui/src/ui.css:2629`)
  - `@keyframes float-arrow` (`packages/ui/src/ui.css:2638`)
  - `@keyframes float-orb` exists (`packages/ui/src/ui.css:2608`) but orbs are currently set to `animation: none` (`packages/ui/src/ui.css:377`).

### Existing reduced-motion behavior
- There is a global OS media query block at `packages/ui/src/ui.css:2962`.
- It currently forces near-total motion disable:
  - durations to `0ms` (`packages/ui/src/ui.css:2964`-`packages/ui/src/ui.css:2966`)
  - broad `animation: none !important` (`packages/ui/src/ui.css:2971`-`packages/ui/src/ui.css:2977`)
  - broad `transition: none !important` (`packages/ui/src/ui.css:2980`-`packages/ui/src/ui.css:2985`).

### JS-based loops / animation-adjacent behavior
- Essential timers:
  - TOTP code refresh poll every second in `packages/ui/src/App.tsx:482`.
  - Per-row code clock tick every 250ms in `packages/ui/src/components/AccountRow.tsx:46` (drives progress bar sync).
- Non-decorative but visual timers:
  - Banner countdown interval in `packages/ui/src/App.tsx:216`.
  - Modal/menu exit timers in `packages/ui/src/App.tsx` (multiple close timers using motion constants).
- One-shot layout measuring via `requestAnimationFrame`:
  - `packages/ui/src/components/HeaderMenu.tsx:369`
  - `packages/ui/src/components/ThemedSelect.tsx:118`
  - `packages/ui/src/components/PatternLock.tsx:104`.

### Potentially heavy areas
- Infinite keyframes:
  - Spinner (`packages/ui/src/ui.css:1758`)
  - Swipe arrow (`packages/ui/src/ui.css:2465`).
- Large blur effects (not continuously animated but can still be expensive):
  - Background orbs `filter: blur(28px)` (`packages/ui/src/ui.css:375`)
  - Overlay `backdrop-filter: blur(6px)` (`packages/ui/src/ui.css:1290`)
  - Scan overlay `backdrop-filter: blur(4px)` (`packages/ui/src/ui.css:1704`).

## 2) Settings storage and IPC

### Where settings live and flow
- Main-process persisted settings schema: `apps/desktop/src/main/secure-store.ts:67` (`AppSettings`).
- Main-process load/normalize path: `apps/desktop/src/main/secure-store.ts:236`, `apps/desktop/src/main/secure-store.ts:639`.
- IPC read/write handlers:
  - `app:getSettings` at `apps/desktop/src/main/ipc-handlers.ts:1433`
  - `app:updateSettings` at `apps/desktop/src/main/ipc-handlers.ts:1437`.
- Renderer bridge normalization:
  - `packages/ui/src/bridge.ts:296` (`normalizeAppSettings`).
- UI state binding in React app:
  - `packages/ui/src/App.tsx:244` (`settings` state) and appearance controls in settings panel.

### Proposed new settings keys
- Add to canonical `AppSettings` in main + renderer:
  - `motionMode: "system" | "full" | "reduced" | "off"` (default `"system"`)
  - `pauseWhenBackground: boolean` (default `true`)
- Persist in the same existing secure settings object (no new storage file).

## 3) Background detection

### Existing signals today
- Renderer already listens for document visibility in `packages/ui/src/App.tsx:590` for privacy lock behavior.
- Main process currently listens to window blur for lock behavior only (`apps/desktop/src/main.ts:326`), but does not broadcast generic background state to renderer.
- No dedicated renderer signal for minimized/hidden state today.

### Proposed unified state (`isBackgrounded`)
- Inputs:
  1. `document.visibilityState !== "visible"` (renderer)
  2. Main-process window state from Electron events:
     - `focus` / `blur`
     - `minimize` / `restore`
     - `show` / `hide`
- Main emits a normalized boolean to renderer via preload (`window:backgroundedChanged`) and optional getter (`window:isBackgrounded`).
- Renderer combines signals into a single boolean:
  - `isBackgrounded = documentHidden || electronBackgrounded`.

## 4) Global application strategy

### Single root-level motion controller
- Implement a MotionController in app shell (`packages/ui/src/App.tsx`) as the single resolver.
- It resolves and applies two root dataset attributes on `document.documentElement`:
  - `data-motion="full|reduced|off"`
  - `data-paused="true|false"`

### Resolution rules
- `motionMode="off"` -> `off`
- `motionMode="reduced"` -> `reduced`
- `motionMode="full"` -> `full`
- `motionMode="system"` ->
  - `reduced` when OS prefers reduced motion
  - else `full`
- Low-end tweak in system mode (optional but included):
  - if `navigator.deviceMemory <= 4` or `navigator.hardwareConcurrency <= 4`, resolve to `reduced`.

### Pause rules
- If `pauseWhenBackground === true` and `isBackgrounded === true` -> `data-paused="true"`
- Else `data-paused="false"`

### CSS strategy
- Keep motion centralized through tokens only.
- Add mode overrides via root attributes, not per-component conditionals.
- Add paused behavior that **only pauses keyframes**:
  - `[data-paused="true"] *, [data-paused="true"] *::before, [data-paused="true"] *::after { animation-play-state: paused !important; }`
- Do **not** disable transition durations in paused mode (avoids frozen half-hover/half-pressed states).

## 5) Validation plan

### Automated
1. Settings normalization tests (bridge + main) for:
   - `motionMode` fallback/default behavior
   - `pauseWhenBackground` default behavior
2. Motion resolution tests in renderer:
   - system + prefers-reduced-motion => `data-motion="reduced"`
   - off => `data-motion="off"`
3. Background pause tests:
   - hidden/blurred/minimized state emits `data-paused="true"`
   - visible/focused/restored emits `data-paused="false"`
4. CSS guard assertions:
   - off mode tokens are `0ms`
   - reduced mode durations/slides are smaller than full
   - paused mode applies `animation-play-state: paused` and does not force transition duration to zero.

### Manual
- Full mode: subtle, smooth transitions on buttons/cards/menus/modals/toasts/settings.
- Reduced mode: less movement, mostly fades/short travel.
- Off mode: instant state changes, no animation.
- Pause-in-background enabled:
  - blur/minimize/hide -> infinite keyframes pause
  - restore/focus/show -> resume
  - no stuck half-hover states.
- Performance sanity:
  - compare focused idle vs minimized/background idle CPU/GPU; minimized/background should be lower.

## Implementation readiness conclusion

- The repo already has broad transition coverage and tokenized timing, so no animation library is needed.
- Main gaps are motion settings persistence, unified background state signaling, and root-level mode/paused orchestration.
- Proceed to implementation after this audit with a token-first CSS override model and a single React MotionController.
