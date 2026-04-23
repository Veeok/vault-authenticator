# Theme Refactor Plan Audit

## A) Current state map (evidence-based)

### Where themes are defined today
- UI theme ids/options are defined in `packages/ui/src/bridge.ts:17`.
- Current labels/ids are semantically split in a confusing way:
  - `"dark"` is labeled `"Green"` (`packages/ui/src/bridge.ts:18`)
  - `"black"` is labeled `"Dark"` (`packages/ui/src/bridge.ts:19`)
- CSS theme palettes are in `packages/ui/src/ui.css`:
  - `.auth-root.theme-dark` (`packages/ui/src/ui.css:98`) is green-accented dark.
  - `.auth-root.theme-black` (`packages/ui/src/ui.css:134`) is true dark.
  - `.auth-root.theme-purple` (`packages/ui/src/ui.css:170`).

### Where theme selection is stored
- Desktop persisted settings live in encrypted payload key `settings` in `apps/desktop/src/main/secure-store.ts` (`EncryptedPayload.settings` at `:43`).
- Current persisted schema uses a single `theme` key (`apps/desktop/src/main/secure-store.ts:66`).
- Settings are normalized on load via `normalizeSettings` (`apps/desktop/src/main/secure-store.ts:208`) and returned by `loadSettings()` (`apps/desktop/src/main/secure-store.ts:593`).

### Where theme is applied
- Renderer applies a root class via `theme-${settings.theme}` in `packages/ui/src/App.tsx:384`.
- Appearance dropdown uses `THEME_OPTIONS` from bridge in `packages/ui/src/App.tsx:1481` and `:1484`.
- Selection path is `handleThemeChange -> resolveThemeId -> saveSettings` in `packages/ui/src/App.tsx:907`.

### Exact reason Dark falls back to Green
The failure is a combination of brittle semantics and fallback behavior:

1. **Label vs id semantic mismatch**
   - The id `dark` does not mean dark; it means green variant (`packages/ui/src/bridge.ts:18`, `packages/ui/src/ui.css:98`).
   - The user-visible label `Dark` points to id `black` (`packages/ui/src/bridge.ts:19`).

2. **Invalid/unknown value fallback defaults to `dark`**
   - Renderer resolver falls unknown values back to `DEFAULT_THEME_ID` (`packages/ui/src/bridge.ts:83` -> fallback to `dark` at `:30`, `:122`).
   - Main-process settings normalization also falls unknown values to `dark` (`apps/desktop/src/main/secure-store.ts:224`; `apps/desktop/src/main/ipc-handlers.ts:366`).

3. **Because `dark` is green, any fallback presents as green**
   - So when any mismatch/legacy/invalid value appears, the fallback path visually becomes Green.

Root cause category: **id/label mismatch + invalid enum fallback policy + overloaded single-key model (`theme`)**.

## B) Current stored values and schema

### Legacy/current value surface
- Persisted key today is `settings.theme` (single string) in desktop secure store (`apps/desktop/src/main/secure-store.ts:66`).
- Known values handled in current desktop main normalization:
  - `light`, `dark`, `black`, `purple` (`apps/desktop/src/main/secure-store.ts:224`).
- Renderer-side alias handling accepts additional names (`packages/ui/src/bridge.ts:50`) such as:
  - `green`, `emerald`, `blue`, `blue-dark`, `bluedark`, `violet`, `purple-theme`, `midnight`, `true-dark`, `truedark`.

### How settings are loaded in MAIN PROCESS
- `loadSettings()` in `apps/desktop/src/main/secure-store.ts:593` returns `payload.settings ?? DEFAULT_SETTINGS`.
- `decodePayload()` calls `normalizeSettings(candidate.settings)` when reading encrypted blob (`apps/desktop/src/main/secure-store.ts:420`).
- Current migration is not explicit; normalization happens but legacy semantics remain in the same single `theme` key.

## C) New data model proposal (canonical)

Persist in existing settings object (same encrypted store), replacing legacy single theme key:

```ts
settings.baseTheme: "light" | "dark" | "amoled"
settings.accent:
  | "none"
  | "green"
  | "red"
  | "blue"
  | "purple"
  | "pink"
  | "orange"
  | "teal"
  | "cyan"
  | "lime"
  | "gray"
  | "white"
  | "black"
  | "lightGray"
  | "lightBlue"
```

Defaults:
- `baseTheme = "dark"`
- `accent = "none"`

Invariant:
- If `baseTheme === "amoled"`, persisted and returned `accent` must be `"none"`.

## D) Application strategy

Single canonical renderer pathway:

1. `applyBaseTheme(baseTheme)`
   - root classes: `theme-light` / `theme-dark` / `theme-amoled`
   - base classes define only neutral/background/surface/text/border/shadow tokens.

2. `applyAccent(accent)`
   - root classes: `accent-none` / `accent-red` / etc.
   - accent classes define only accent tokens (`--accent`, `--accent2`, `--accentText`, optional focus ring).
   - if `baseTheme === "amoled"`, force `accent-none` regardless of requested accent.

CSS variable ownership:
- Variables remain on app container (`.auth-root`) so existing components continue reading shared tokens.
- No per-component theme branching.

Fallback rule:
- Any invalid stored values normalize to `baseTheme="dark", accent="none"`.
- Never default to green unless explicit accent `green` is selected.

## E) Migration strategy (MAIN PROCESS ONLY)

Migration location:
- Implement inside desktop main settings load path in `apps/desktop/src/main/secure-store.ts` (not React).

Migration behavior:
1. Read legacy `settings.theme` if present.
2. Map to canonical keys:
   - `Light`/`light` -> `baseTheme="light"`, `accent="none"`
   - `Dark`/`black`/`dark` ->
     - `dark` (legacy green id) -> `baseTheme="dark"`, `accent="green"`
     - `black`/`Dark` (true dark semantics) -> `baseTheme="dark"`, `accent="none"`
   - `Purple`/`purple` -> `baseTheme="dark"`, `accent="purple"`
   - other known color themes (Green, Blue, etc.) -> `baseTheme="dark"`, mapped accent
   - unknown -> `baseTheme="dark"`, `accent="none"`
3. Delete legacy `theme` key from persisted settings.
4. Persist migrated settings immediately during load.
5. IPC/preload returns only new keys: `baseTheme` and `accent`.

Enforcement in main process:
- On read and write, if `baseTheme === "amoled"`, force `accent="none"` before returning/persisting.

## F) Validation plan

### Automated tests
1. Renderer regression: selecting **Dark** applies dark neutrals and does not resolve to green.
2. Accent behavior:
   - Amoled => accent control disabled + persisted accent forced to none.
   - Light/Dark => accent control enabled.
3. Main-process migration tests:
   - legacy `theme="dark"` (green-id legacy) -> `{ baseTheme: "dark", accent: "green" }`, and legacy key removed.
   - legacy `theme="Dark"`/`"black"` -> `{ baseTheme: "dark", accent: "none" }`, key removed.
   - unknown theme -> `{ baseTheme: "dark", accent: "none" }`.
4. Persistence test: restart/load keeps canonical schema and values.

### Manual validation
- Light, Dark, Amoled visual checks.
- Amoled background pitch black; cards/surfaces near-black; reduced glare.
- Accent changes alter accent-only affordances (buttons/focus/progress), not neutral surfaces.
- Startup: no flash/flicker from wrong theme.
- Restart: retains baseTheme/accent correctly.

## Root-cause conclusion

The Dark->Green behavior is caused by a **semantic mismatch in ids** (`dark` means green) combined with **fallback-to-dark normalization** in both renderer and main process. The architecture should be replaced with canonical `baseTheme + accent` and main-process migration so renderer only consumes normalized new schema.
