# Scroll Bug Audit (Step 1)

## 1) Repro details

- **Window sizes where failure reproduces**
  - `460x820` (desktop default window from `apps/desktop/src/main.ts`: width `460`, height `820`) with **3-5+ accounts**: lower rows become unreachable unless the window is resized taller.
  - `900x700` (auto layout => grid, 2 columns) with **6-8+ accounts**: content can overflow visual card area without a dedicated list scroll region.
  - `1400x900` (auto layout => grid, 3 columns) with larger account sets: same clipping pattern when content exceeds available card height.
- **OS DPI scaling**
  - Current machine registry reports `AppliedDPI = 96` => **100% scaling**.
  - 125% still requires manual validation after fix.
- **Mode/density context**
  - `accountsLayoutMode: auto` resolves to **list** under `720px` and **grid** above (`packages/ui/src/App.tsx` layout resolver).
  - Issue occurs in both list and grid because the list region itself is not the active constrained scroll container.

## 2) Root cause evidence

- **Which DOM node should scroll**
  - The account list area inside `.auth-card` should be the scroll container (new dedicated wrapper around list/empty/skeleton content).

- **What currently prevents scrolling (with evidence)**
  - ✅ **Parent `overflow: hidden` traps overflow**
    - `.auth-root` has `overflow: hidden` (`packages/ui/src/ui.css`: `.auth-root`).
  - ✅ **Scroll is applied to wrong node / missing dedicated scroll node**
    - `.auth-list` is only a grid (`display: grid`) and has no `overflow-y`/height constraints (`packages/ui/src/ui.css`).
    - There is no `account-list` wrapper with `overflow-y: auto`.
  - ✅ **Scroll container has no constrained height**
    - `.auth-card` has padding but no flex-height constraint / viewport max-height for unlocked layout (`packages/ui/src/ui.css`: `.auth-card`).
    - `.auth-shell` is not a vertical flex container and uses `margin-top: clamp(54px, 9vh, 82px)`, reducing usable viewport space without giving the list a constrained scrollable region.
  - ✅ **Custom titlebar consumes layout space**
    - `.auth-root-with-titlebar` adds extra top padding (`padding-top: calc(18px + var(--auth-titlebar-height) + 8px)`), which further reduces visible card area. Without proper internal scrolling, this worsens clipping.
  - ⚠️ **Missing `min-height: 0` in the list flex path**
    - Current unlocked content path is not set up as flex children with `min-height: 0`, so overflow cannot resolve into the intended inner scroller.

## 3) Target files

- `packages/ui/src/ui.css`
- `packages/ui/src/App.tsx`
- `packages/ui/src/App.responsive-layout.test.tsx` (validation coverage)

## 4) Proposed fix

- Keep global roots constrained:
  - Ensure `html, body, #root, #app` are full-height and non-scrolling (`overflow: hidden`).
- Make unlocked shell/card a constrained flex column path:
  - `.auth-root`: flex column app shell with constrained viewport height.
  - `.auth-shell`: `flex: 1`, `min-height: 0`, column layout, no margin-based vertical clipping.
  - `.auth-card`: `flex: 1`, `min-height: 0`, column layout so header is fixed and list region can scroll.
- Introduce **single list scroll container**:
  - Wrap current list/empty/skeleton conditional in `App.tsx` with `.account-list-container`.
  - `.account-list-container`: `flex: 1`, `min-height: 0`, `overflow-y: auto`, `overscroll-behavior: contain`, FAB bottom clearance.
- Keep list/grid behavior unchanged inside the scroll wrapper (`.auth-list` remains grid/list mode switch).
- Add scoped scrollbar styling for `.account-list-container`.
- Validation:
  - small viewport overflowing account set => `scrollHeight > clientHeight` on `.account-list-container`.
  - large viewport small set => no unnecessary scroll.
  - large viewport larger set => card grows with viewport before scroll engages.
  - ensure last row clear of FAB area.
