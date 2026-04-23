# Plan Audit: Step-Up Auth for Sensitive Actions

## A) Sensitive Action Inventory

### 1) `backup:export`

- Main IPC: `authenticator/apps/desktop/src/main/ipc-handlers.ts:2450-2467`
- Current guard: `ensureUnlockedFromTrustedSender(evt)`
- Current UI flow:
  - settings backup section in `authenticator/packages/ui/src/App.tsx:2906-2941`
  - submit handler in `authenticator/packages/ui/src/App.tsx:1993-2012`
- Unlocked-but-unattended access today: yes
- Existing confirmation/re-auth today: no identity re-auth; only a backup passphrase field

### 2) `passkey:saveCredential`

- Main IPC: `authenticator/apps/desktop/src/main/ipc-handlers.ts:1811-1839`
- Current guard: `ensureLockAdminAccess(_evt)`
- Current UI flow:
  - passkey registration in `authenticator/packages/ui/src/components/SecurityPicker.tsx:486-531`
- Unlocked-but-unattended access today: yes
- Existing confirmation/re-auth today: no app credential re-auth

### 3) `passkey:renameCredential`

- Main IPC: `authenticator/apps/desktop/src/main/ipc-handlers.ts:1849-1862`
- Current guard: `ensureLockAdminAccess(_evt)`
- Current UI flow:
  - rename handler in `authenticator/packages/ui/src/components/SecurityPicker.tsx:562-589`
- Unlocked-but-unattended access today: yes
- Existing confirmation/re-auth today: no

### 4) `passkey:removeCredential`

- Main IPC: `authenticator/apps/desktop/src/main/ipc-handlers.ts:1864-1878`
- Current guard: `ensureLockAdminAccess(_evt)`
- Current UI flow:
  - remove handler in `authenticator/packages/ui/src/components/SecurityPicker.tsx:533-560`
- Unlocked-but-unattended access today: yes
- Existing confirmation/re-auth today: no

### 5) `passkey:clearCredential`

- Main IPC: `authenticator/apps/desktop/src/main/ipc-handlers.ts:1900-1904`
- Current guard: `ensureLockAdminAccess(evt)`
- Current UI flow: no active UI flow found in current renderer
- Unlocked-but-unattended access today: yes if a future UI or renderer caller uses the exposed API
- Existing confirmation/re-auth today: no

### 6) `lock:generateBackupCodes`

- Main IPC: `authenticator/apps/desktop/src/main/ipc-handlers.ts:1771-1775`
- Current guard: `ensureLockAdminAccess(evt)`
- Current UI flow:
  - request/generation flow in `authenticator/packages/ui/src/App.tsx:1927-1979`
  - entry point from `SecurityPicker` in `authenticator/packages/ui/src/components/SecurityPicker.tsx:1105`
- Unlocked-but-unattended access today: yes
- Existing confirmation/re-auth today:
  - if backup codes already exist, replacement confirm dialog appears
  - no identity re-auth

### 7) `lock:resetAppLock`

- Main IPC: `authenticator/apps/desktop/src/main/ipc-handlers.ts:1791-1804`
- Current guard: `ensureLockAdminAccess(_evt)`
- Current UI flow: no active renderer flow found in current UI, but API remains exposed through preload/bridge
- Unlocked-but-unattended access today: yes if called by a current or future renderer path
- Existing confirmation/re-auth today: no

### 8) Future Secret-Reveal Paths

- Current desktop edit flow intentionally avoids returning `secretBase32` in `totp:getForEdit`
- If a future secret reveal/export-to-clipboard path is added, it should use the same step-up gate by default

## B) Step-Up Auth Design Decision

### Chosen Approach

- Option 2: show a minimal credential re-auth dialog, not the full lock screen.

### Why This Instead Of Reusing `LockScreen`

- `LockScreen` is tightly coupled to actual app-lock lifecycle and full-screen lock presentation:
  - fixed title and unlock copy
  - backup-code mode and lockout messaging intended for real unlock
  - unlock success semantics tied to opening the vault
- Reusing it for ephemeral step-up would require more invasive behavior branching than a focused modal.
- A minimal dialog is safer for this pass and keeps the scope targeted to sensitive actions.

### Supported Step-Up Methods

- Primary configured secure method by default.
- Secondary configured secure method offered as a fallback if present.
- Supported secure methods for this pass:
  - PIN
  - password
  - pattern
  - passkey
- Explicitly not used for step-up:
  - backup codes
  - swipe
  - none

### No-Secure-Method Decision

- If the app has no configured secure credential/passkey, step-up cannot add real identity verification.
- In that state, `requireStepUpAuth(...)` should allow the action rather than breaking legitimate usage.
- This keeps behavior compatible for users who still run `none` or `swipe` lock modes.

## C) UX Flow Design

### Where The Prompt Appears

- A modal overlay inside `authenticator/packages/ui/src/App.tsx`, above the current unlocked UI.
- It should not force a full app lock or navigate away from the current screen.

### Copy

- Title: `Confirm your identity`
- Body: `This action requires you to verify your identity.`
- Cancel button: `Cancel`
- Confirm button: `Verify`

### Success / Cancel Behavior

- Cancel:
  - dismiss modal
  - abort the original action
  - no side effects
- Success:
  - main process issues a short-lived step-up token
  - renderer retries the original action immediately

### Cooldown / Token Window

- Use a 60-second time window.
- Within that window, repeated sensitive actions from the same trusted renderer do not re-prompt.

## D) Main Process Enforcement

### Enforcement Requirements

- Step-up must be enforced in the main process.
- UI-only gating is insufficient.

### Proposed Main-Process Model

- Add `requireStepUpAuth(event)` in `authenticator/apps/desktop/src/main/ipc-handlers.ts`.
- Store step-up verification timestamps per trusted sender/webContents.
- If the timestamp is recent enough (<= 60s), allow the action.
- Otherwise fail with `E_STEP_UP_REQUIRED`.

### Proposed Verification Channels

- `lock:stepUpVerify`
  - verifies PIN/password/pattern input or passkey assertion payload
  - on success, records the timestamp for the sender and returns `true`
- `lock:stepUpGetChallenge`
  - creates a passkey challenge for the step-up modal when passkey verification is used

### Required Plumbing Adjustments

- Sensitive lock/passkey preload methods currently use raw `ipcRenderer.invoke(...)` and shared bridge wrappers often swallow errors.
- To preserve `E_STEP_UP_REQUIRED` in the renderer:
  - convert the sensitive preload methods to `invokeSafe(...)`
  - wrap the corresponding main handlers with `safeHandle(...)`
  - adjust shared bridge wrappers for those sensitive methods so `E_STEP_UP_REQUIRED` is re-thrown instead of collapsed into `false`/`[]`

## Implementation Scope

- Main process:
  - `authenticator/apps/desktop/src/main/ipc-handlers.ts`
- Preload / bridge contracts:
  - `authenticator/apps/desktop/src/preload.ts`
  - `authenticator/apps/desktop/src/renderer.d.ts`
  - `authenticator/packages/ui/src/bridge.ts`
  - `authenticator/packages/ui/index.d.ts`
- Renderer:
  - `authenticator/packages/ui/src/App.tsx`
  - `authenticator/packages/ui/src/components/SecurityPicker.tsx`
  - likely a new focused step-up modal component under `packages/ui/src/components/`
- Validation:
  - targeted desktop IPC tests
  - targeted UI tests
  - `STEP_UP_AUTH_VALIDATION.md`
