# PLAN AUDIT - THEMES V3

This document is a plan-only audit. No implementation changes are included in this step.

## A) Current Theme Keys and Root Cause Analysis

### Where theme data is stored
- Persistent settings are stored in encrypted payload (`electron-store` + `safeStorage`) under `payload.settings` in `apps/desktop/src/main/secure-store.ts`.
- Current persisted theme keys in settings are:
  - `baseTheme: "light" | "dark" | "amoled"`
  - `accent: AccentId`
  - legacy key: `theme` (string, migrated)

### Where theme data is normalized/migrated
- Main-process normalization logic is in `apps/desktop/src/main/theme-settings.ts`:
  - `normalizeThemeSettings(...)`
  - `migrateLegacyTheme(...)`
- Main-process settings load + migration persistence is in `apps/desktop/src/main/secure-store.ts`:
  - `loadSettings()` calls `normalizeSettings(...)`
  - when normalization reports `changed`, settings are persisted immediately.

### Where theme data is exposed and applied
- IPC/preload boundary:
  - `app:getSettings`, `app:updateSettings`, `settings:setBaseTheme`, `settings:setAccent` in `apps/desktop/src/main/ipc-handlers.ts`
  - exposed via `apps/desktop/src/preload.ts`
- Renderer schema and normalization:
  - `packages/ui/src/bridge.ts` (`AppSettings`, `normalizeAppSettings`)
- Renderer application:
  - `packages/ui/src/App.tsx` uses classes `theme-${baseTheme}` + `accent-${accent}`
  - CSS variables and theme/accent classes in `packages/ui/src/ui.css`

### Exact root cause of "falls back to Green"
- In `apps/desktop/src/main/theme-settings.ts`, `migrateLegacyTheme(...)` has a special-case:
  - lowercase legacy string `"dark"` maps to `{ baseTheme: "dark", accent: "green" }`
  - while `"Dark"` maps to `{ baseTheme: "dark", accent: "none" }`
- This case-sensitive branch is the direct source of dark->green fallback behavior.
- Existing tests confirm this behavior (`apps/desktop/src/__tests__/secure-store.theme-migration.test.ts` currently asserts `theme: "dark"` -> green).

---

## B) Proposed Canonical Schema (Themes V3)

### New canonical keys
- `baseMode: "light" | "dark" | "amoled"`
- `themeColor: "neutral" | "red" | "orange" | "yellow" | "green" | "blue" | "indigo" | "violet" | "purple"`
- `accentOverride:`
  - `"theme" | "none" | "red" | "orange" | "yellow" | "green" | "blue" | "indigo" | "violet" | "purple"`
  - plus current legacy-safe overrides (kept for compatibility): `"pink" | "teal" | "cyan" | "lime" | "gray" | "white" | "black" | "lightGray" | "lightBlue"`

### Invariants
- If `baseMode === "amoled"`:
  - force `themeColor = "neutral"`
  - force `accentOverride = "none"`
  - treat `accentOverride = "theme"` as `"none"`

### Defaults (canonical)
- `baseMode = "dark"`
- `themeColor = "neutral"`
- `accentOverride = "none"`

### Fallback rule for unknown/invalid values
- Always resolve to `dark + neutral + none` (never green).

---

## C) Migration Plan (Main Process Only)

All migration runs in main process during settings load, then persists immediately.

### Migration source inputs
Priority order during normalization:
1. New V3 keys (`baseMode`, `themeColor`, `accentOverride`) if present
2. Current keys (`baseTheme`, `accent`) if present
3. Legacy key (`theme`) if present
4. Default fallback (`dark + neutral + none`)

### Legacy mapping rules
- `theme: "Light"` -> `baseMode="light", themeColor="neutral", accentOverride="none"`
- `theme: "Dark"` -> `baseMode="dark", themeColor="neutral", accentOverride="none"`
- `theme: "Green"` -> `baseMode="dark", themeColor="green", accentOverride="theme"`
- `theme: "Purple"` -> `baseMode="dark", themeColor="purple", accentOverride="theme"`
- legacy lowercase `"dark"` must map to dark+neutral+none (remove old green special-case)
- unknown legacy theme -> dark+neutral+none

### Current schema (`baseTheme` + `accent`) mapping
- `baseMode = baseTheme`
- `themeColor = "neutral"` (preserve existing neutral surface behavior for current users)
- `accentOverride = accent` (or `"none"` if invalid)
- If `baseTheme === "amoled"`, force `themeColor="neutral"`, `accentOverride="none"`

### Persistence behavior
- After normalization, remove legacy keys from stored settings:
  - delete `theme`
  - delete `baseTheme`
  - delete `accent`
- Persist only canonical keys (`baseMode`, `themeColor`, `accentOverride`) plus unrelated settings.

### IPC/Preload contract changes
- Main IPC returns/accepts V3 fields.
- Preload exposes V3 APIs only to renderer (schema translation is main-side).
- React renderer performs no migration logic.

---

## D) CSS Strategy

### Selected approach: Option 1 (preferred)
- Base neutrals are defined by `baseMode`.
- `themeColor` applies subtle tints to surfaces and borders.
- `accentOverride` controls emphasis elements independently.

### Token model
1. Base neutral tokens per mode:
   - `light`: light page/surface, dark text
   - `dark`: dark page/surface, light text
   - `amoled`: pitch black page (`#000000`), near-black surfaces (`#07070A`, `#0B0B10`), low-strain contrast
2. Theme tint tokens:
   - `--theme-color-rgb` from `data-theme-color`
   - `--surface-page`, `--surface-card`, `--surface-card-alt`, `--surface-border` derived from neutral + low-ratio tint (about 6-12%)
3. Accent tokens:
   - if `accentOverride="theme"`: use `themeColor`
   - if `accentOverride="none"`: use neutral accent
   - else use explicit override color
   - in amoled: always neutral

### Delivery mechanism in renderer
- Apply attributes on root:
  - `data-mode="light|dark|amoled"`
  - `data-theme-color="neutral|red|..."`
  - `data-accent="theme|none|red|..."`
- Keep class support only as temporary compatibility if needed during transition.

### Performance constraints
- Constant-time variable switching only.
- No animated backgrounds or heavy gradients as part of theme switching.
- Reuse existing CSS variable pipeline.

---

## E) Validation Plan

### Automated tests

#### Main process migration/normalization
- `theme: "Green"` -> `dark + green + theme`, legacy key removed
- `theme: "Dark"` -> `dark + neutral + none`
- `theme: "dark"` (legacy lowercase) -> `dark + neutral + none` (regression guard)
- unknown legacy -> `dark + neutral + none`
- existing `baseTheme/accent` migrate to V3 and remove old keys

#### Amoled invariants
- Any `themeColor/accentOverride` input under amoled resolves to `neutral/none`
- IPC set/update enforces amoled lockout rules

#### Renderer behavior
- Settings UI shows:
  - Mode dropdown (Light/Dark/Amoled)
  - Theme Color dropdown (Neutral + requested colors)
  - Accent Override dropdown (Theme default, None, explicit colors)
- Theme Color and Accent Override controls disabled in amoled with helper text
- Root data attributes update correctly

#### Regression
- Selecting Dark never resolves to green.

### Manual checklist
- Light/Dark/Amoled mode visuals correct
- Theme colors (Light/Dark): visible surface + border tint (not just button color)
- Contrast/readability passes for each color
- Amoled remains pitch black and low-strain; color/accent controls disabled
- Restart persistence keeps selected values
- No startup flicker when loading previous theme

---

## Implementation Notes (for Step 2)
- Introduce a dedicated V3 theme normalization module in main process (recommended) to keep migration deterministic and testable.
- Update existing theme migration tests to new expectations and add explicit regression for lowercase `dark` mapping.
- Keep renderer dumb: consume normalized schema from bridge only.
