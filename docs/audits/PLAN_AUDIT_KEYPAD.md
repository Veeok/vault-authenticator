# Plan Audit: Lock Screen PIN Keypad Redesign

## Scope and Current Implementation

- Keypad component is implemented in `packages/ui/src/components/LockScreen.tsx`.
- PIN keypad render path is in the `mode === "pin"` branch with:
  - `PIN_PAD_LAYOUT` constant (`1..9`, spacer, `0`, backspace)
  - `pin-dot-row` for PIN progress dots and clear action
  - `pin-pad-grid` for keypad buttons
  - `pin-pad-key` for digits and backspace button
  - current backspace glyph is text (`⌫`) rather than an icon component
- Current CSS selectors live in `packages/ui/src/ui.css`:
  - `.pin-dot-row`, `.pin-dot-center`, `.pin-dot-actions`, `.pin-dot-spacer`
  - `.pin-clear-link`
  - `.pin-dot`, `.pin-dot.is-filled`
  - `.pin-pad-grid`, `.pin-pad-key`, `.pin-pad-spacer`
  - responsive overrides under `@media (max-height: 780px|700px|640px)` for `.pin-pad-key` and `.pin-dot`

## Icon System Audit

- Project icon system is `lucide-react` (already used throughout UI and lock screen, currently `Lock` icon imported in `LockScreen.tsx`).
- Keypad currently mixes icon system + text glyphs:
  - lock header uses Lucide icon
  - backspace uses text symbol (`⌫`)
  - clear is text-only link

## Layout Audit (Why It Feels Inconsistent)

- Current keypad uses a 3-column grid but keys are not circular:
  - `.pin-pad-key` uses `min-height` and rounded rectangle radius, no fixed width/height token.
- Last row contains a spacer node for left cell, but spacing and visual weight are inconsistent with top rows.
- Dot row is a 3-column balancing layout with a text clear link on the right; this is functional but visually weak vs the keypad style.
- Press state uses `scale(0.95)` and rectangular keys; interaction feels heavier than desired for premium keypad interactions.

## Exact Implementation Plan

### Components to Change

1. `packages/ui/src/components/LockScreen.tsx`
   - Keep existing lock/unlock logic, verification flow, and keyboard listeners.
   - Replace backspace text glyph with a proper icon from existing icon system (Lucide).
   - Upgrade clear control from plain text link to compact icon+label action aligned to dot row.
   - Keep 3x4 keypad semantics and ARIA labels.

2. `packages/ui/src/ui.css`
   - Redesign PIN keypad visuals with fixed circular key sizing token:
     - `--key-size: clamp(56px, 7vh, 72px)`
   - Make keypad a centered fixed 3x4 grid with consistent gaps (`12px` to `16px`).
   - Convert key visuals to premium circular style with subtle hover/press/focus.
   - Implement dot fill micro-animation using only `transform` + `opacity`.
   - Ensure transitions stay lightweight and motion-token driven.
   - Keep reduced-motion compatibility via existing motion tokens and mode overrides.

### Tests to Change/Add

3. `packages/ui/src/components/LockScreen.test.tsx`
   - Add keypad 3x4 structure snapshot/assertion.
   - Add auto-submit test for 6-digit PIN mode.
   - Update/confirm backspace + clear behavior test against new clear control selector.
   - Keep keyboard behavior coverage (digits/backspace/enter) and ensure it still passes.

### What Will Stay Unchanged

- Lock state machine and API calls (`verify`, lockout countdown, quick-unlock flow) remain unchanged.
- Non-PIN modes (swipe/password/pattern/backup) remain functionally unchanged.
- Existing settings/motion architecture remains unchanged; keypad animation will rely on existing motion token system.
