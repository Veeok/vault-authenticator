# Plan Audit: Typed Secret Lifetime Cleanup

## A) Current State Map

### 1) `authenticator/packages/ui/src/components/LockScreen.tsx`

- `pinInput` (`LockScreen.tsx:178`)
  - Stored in React state.
  - Used for PIN entry and passed to `lockApi.verify("pin", candidate)` via `submitPin(...)`.
  - Cleared on successful unlock in `unlockSuccess()`.
  - Cleared on failed PIN verification in `submitPin()`.
  - Not automatically cleared when the user switches away from PIN mode.
- `passwordInput` (`LockScreen.tsx:179`)
  - Stored in React state.
  - Passed directly to `lockApi.verify("password", passwordInput)` in `submitPassword()`.
  - Cleared on successful unlock via `unlockSuccess()`.
  - Cleared on incorrect/locked verification result in `submitPassword()`.
  - Not automatically cleared when the user switches away from password mode.
- `backupInput` (`LockScreen.tsx:180`)
  - Stored in React state.
  - Passed to `lockApi.redeemBackupCode(backupInput)` in `submitBackupCode()`.
  - Cleared on successful unlock via `unlockSuccess()`.
  - Cleared on false return in `submitBackupCode()`.
  - Not cleared on thrown IPC error.
  - Not automatically cleared when the user switches away from backup mode.
- Pattern unlock in `LockScreen.tsx`
  - No raw pattern is stored in React state or refs during verify.
  - The entered pattern is only held in the local `serialized` variable inside `submitPattern()`.

### 2) `authenticator/packages/ui/src/components/SecurityPicker.tsx`

- `pinInput` (`SecurityPicker.tsx:138`)
  - Stored in React state while setting a new PIN.
  - Passed to `lockApi.setCredential("pin", pinInput)` in `handleSetPin()`.
  - Cleared by `resetSetup()` on success/manual reset.
  - Remains in state if the IPC call throws.
- `pinConfirm` (`SecurityPicker.tsx:139`)
  - Stored in React state during setup.
  - Compared client-side before IPC call.
  - Cleared by `resetSetup()` on success/manual reset.
  - Remains in state if the IPC call throws.
- `passwordInput` (`SecurityPicker.tsx:140`)
  - Stored in React state while setting a password.
  - Passed to `lockApi.setCredential("password", passwordInput)` in `handleSetPassword()`.
  - Cleared by `resetSetup()` on success/manual reset.
  - Remains in state if the IPC call throws.
- `passwordConfirm` (`SecurityPicker.tsx:141`)
  - Stored in React state during setup.
  - Compared client-side before IPC call.
  - Cleared by `resetSetup()` on success/manual reset.
  - Remains in state if the IPC call throws.
- `patternFirst` (`SecurityPicker.tsx:143`)
  - Stores the first drawn pattern as a serialized string during pattern setup.
  - Used to confirm the second pattern entry before calling `lockApi.setCredential("pattern", serialized)`.
  - Cleared on reset, mismatch, or `resetSetup()` success path.
  - Remains in state if the setup IPC call throws.

### 3) `authenticator/packages/ui/src/App.tsx`

- `backupPassphrase` (`App.tsx:457`)
  - Stored in React state.
  - Copied into a local `passphrase` variable in `handleExportBackup()` and `handleImportBackup()`.
  - Cleared only on successful export/import (`App.tsx:2007`, `App.tsx:2028`).
  - Not cleared on canceled export/import.
  - Not cleared on thrown IPC error.
  - Not cleared when the settings modal closes or the app locks.

### 4) Refs Search Result

- Audit of the cited UI files found no `useRef` storing raw PINs, passwords, patterns, or passphrases.
- Existing refs in these files are used for timers, UI transitions, and DOM bookkeeping, not typed secrets.

## B) Risk Ranking

### HIGH

- `backupPassphrase` in `App.tsx`
  - Persists after export/import IPC completes on cancel or error.
  - Persists across settings close/reopen.
- `pinInput`, `pinConfirm`, `passwordInput`, `passwordConfirm` in `SecurityPicker.tsx`
  - Persist after `lockApi.setCredential(...)` throws.
- `patternFirst` in `SecurityPicker.tsx`
  - Persists after `lockApi.setCredential("pattern", ...)` throws.
- `backupInput` in `LockScreen.tsx`
  - Persists after thrown backup-code IPC failures.

### MEDIUM

- `pinInput` in `LockScreen.tsx`
  - Cleared after verification returns, but can persist across mode switches before submission.
- `passwordInput` in `LockScreen.tsx`
  - Cleared after verification returns, but can persist across mode switches before submission.

### LOW

- Pattern verification input in `LockScreen.tsx`
  - Not stored in React state or refs.
  - Exists only as a local variable during submit.

## C) Proposed Fixes

### LockScreen

- After each verify/redeem IPC returns, clear the corresponding typed state in `finally` so success, failure, and thrown error paths all zero out the input.
- Clear inactive mode state when switching between PIN, password, and backup-code modes.
- Keep existing unlock UX and IPC signatures unchanged.

### SecurityPicker

- Capture the current setup values into local variables before calling `lockApi.setCredential(...)`.
- Clear PIN/password confirmation state in `finally` after IPC completion.
- Clear `patternFirst` after pattern setup IPC completes, even on error.
- Preserve current client-side validation behavior before IPC.

### App

- In `handleExportBackup()` and `handleImportBackup()`, clear `backupPassphrase` in `finally` after the IPC call completes, regardless of outcome.
- Clear `backupPassphrase` when the settings modal closes or the app transitions to locked state.

## D) What NOT to Change

- Do not change IPC signatures.
- Do not change the lock/unlock flow semantics.
- Do not introduce new state-management layers.
- Do not add memory-zeroing libraries or secure-string abstractions in this pass.
- Keep the changes limited to `LockScreen.tsx`, `SecurityPicker.tsx`, and `App.tsx`.
