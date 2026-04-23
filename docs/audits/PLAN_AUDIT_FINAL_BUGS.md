# PLAN AUDIT — Final 3 Bugs (Step 1)

## A) Repro details

### Bug 1 — Search / Command Palette overlap + 1-result behavior
- **Window sizes tested for repro path**:
  - `460x820` (desktop default) and `900x700` (mid-size desktop), with titlebar enabled.
- **Account count/state**:
  - Repro is easiest with exactly **1 account**.
- **Steps**:
  1. Open the FAB menu.
  2. Click `⌘K Command Palette`.
  3. Keep query empty (single account result) or query that matches exactly one account.
  4. Observe the results section: the single result row stretches excessively and can visually crowd/overlap the input region.

### Bug 2 — Delete modal misalignment
- **Window sizes tested for repro path**:
  - `900x700` and `480x800`.
- **Steps**:
  1. Open any account row and trigger Delete.
  2. In the confirmation modal, compare left edges for:
     - Title line (`Delete this account?`)
     - Body copy line (`You are about to delete ...`)
     - Warning line (`This action cannot be reversed.`)
  3. Warning line starts farther left than body copy; icon/title baseline can also look off.

### Bug 3 — Clear Clipboard fails in Electron renderer
- **Platform**: Windows desktop (AppliedDPI registry value currently `96` => 100%).
- **Steps to prove failure**:
  1. Copy an OTP code from the app.
  2. Open FAB menu → `Clear Clipboard`.
  3. Paste in Notepad and open Windows clipboard history (`Win+V`).
  4. Clipboard entry can remain because renderer-side `navigator.clipboard.writeText("")` does not definitively clear OS clipboard history in Electron.

## B) Root cause evidence (exact locations)

### Bug 1 — Search layout
- **Component path**: `packages/ui/src/components/CommandPalette.tsx`
  - Header title still `Command Palette` and dialog label still `Command palette`.
  - Results region is rendered as `.auth-command-results` listbox.
- **CSS path**: `packages/ui/src/ui.css`
  - `.auth-command-palette` is `display: grid; grid-template-rows: auto auto 1fr;` with fixed height.
  - `.auth-command-results` is `display: grid; overflow: auto;` **without** `min-height: 0` and without `align-content: start`.
- **Why this causes the bug**:
  - Grid track + default content stretching makes the 1-item state look like an oversized panel.
  - Missing explicit flex/min-height constraints on the results region allows visual crowding against the input area under constrained heights.

### Bug 2 — Delete modal typography alignment
- **Component path**: `packages/ui/src/App.tsx` (delete confirm modal markup)
  - Body text uses `<p className="auth-confirm-copy">...` and `<p className="auth-confirm-warning">...`.
- **CSS path**: `packages/ui/src/ui.css`
  - `.auth-confirm-copy` uses horizontal margins (`margin: 14px 20px 0;`).
  - `.auth-confirm-warning` inherits only top margin (`margin: 8px 0 0;`) from shared warning rule.
  - `.auth-modal-header` uses internal padding (`18px 20px 14px`) and `.auth-confirm-title` is inline-flex with icon.
- **Why this causes the bug**:
  - Body copy and warning do not share the same left inset; warning starts at x=0 while copy starts at x=20.
  - Inconsistent margins create visible baseline/left-edge drift in the modal rhythm.

### Bug 3 — Clear Clipboard API mismatch
- **Component path**: `packages/ui/src/App.tsx`
  - `handleQuickClearClipboard` reads/writes via `navigator.clipboard.readText()` and `navigator.clipboard.writeText("")`.
- **Desktop bridge path**: `apps/desktop/src/preload.ts`, `apps/desktop/src/main/ipc-handlers.ts`, `packages/ui/src/bridge.ts`
  - No dedicated `clipboard:clear` IPC channel exists.
  - No renderer-exposed `clipboardAPI.clear()` bridge exists.
- **Why this causes the bug**:
  - Renderer clipboard API is not a reliable way to clear Windows clipboard history in Electron.
  - Need main-process Electron `clipboard` module (`clipboard.writeText(' '); clipboard.clear();`) for definitive clear.

## C) Fix plan (files, functions, selectors)

### Bug 1 — Rename + Search layout fix
- **Files**:
  - `packages/ui/src/components/HeaderMenu.tsx`
  - `packages/ui/src/components/CommandPalette.tsx`
  - `packages/ui/src/ui.css`
  - `packages/ui/src/components/HeaderMenu.test.tsx`
  - `packages/ui/src/App.quick-actions.test.tsx`
- **Changes**:
  - Rename FAB action label from `⌘K Command Palette` to `Ctrl+K Search` (icon remains magnifier).
  - Rename modal title to `Search` and aria label to `Search`.
  - Keep keyboard UX (Arrow/Enter/Escape) intact.
  - Replace command palette layout with strict vertical structure:
    - Header (fixed)
    - Search row (fixed, `flex-shrink: 0`)
    - Results (`flex: 1; min-height: 0; overflow-y: auto`)
  - Ensure 1-result state is normal row (`align-content: start` / no stretching).
  - Zero-result text becomes exact `No matches`.

### Bug 2 — Delete modal alignment
- **Files**:
  - `packages/ui/src/ui.css`
  - (if needed for class hooks) `packages/ui/src/App.tsx`
- **Changes**:
  - Normalize confirm modal body insets with a shared horizontal token/rule.
  - Remove conflicting paragraph default/override margins for `.auth-confirm-copy` and `.auth-confirm-warning`.
  - Keep icon/title baseline aligned in `.auth-confirm-title`.
  - Ensure body text + warning share identical left edge.

### Bug 3 — Clear Clipboard via Electron IPC
- **Files**:
  - `apps/desktop/src/main/ipc-handlers.ts`
  - `apps/desktop/src/preload.ts`
  - `apps/desktop/src/renderer.d.ts`
  - `packages/ui/src/bridge.ts`
  - `packages/ui/src/App.tsx`
  - `packages/ui/src/App.quick-actions.test.tsx`
- **Changes**:
  - Add main-process IPC handler `clipboard:clear` using Electron `clipboard` module.
  - Implement match guard in main process:
    - if current clipboard text matches renderer-provided last copied code => clear and return `true`
    - else return `false`.
  - Expose `clipboardAPI.clear(expectedText)` in preload and window typings.
  - Add bridge method `clearClipboard(expectedText)` and use it in `handleQuickClearClipboard`.
  - Update toast text behavior:
    - success: `Clipboard cleared`
    - mismatch: `Clipboard changed. Nothing cleared.`

## Validation plan
- Automated:
  - search modal structure assertions (header/search/results hierarchy + no result stretch)
  - quick-action clipboard clear asserts bridge/IPC clear path usage
  - existing keyboard interaction tests remain passing
- Manual:
  - 1-account search: result does not overlap input
  - delete modal: title/body/warning left edge alignment
  - clear clipboard: copy OTP → Clear Clipboard → paste in Notepad empty + `Win+V` entry gone
- Commands:
  - `pnpm --filter @authenticator/ui exec tsc --noEmit`
  - `pnpm --filter desktop exec tsc --noEmit`
  - `pnpm --filter @authenticator/ui test`
  - `pnpm --filter desktop start`
