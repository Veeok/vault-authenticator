# Plan Audit: Backup Code Lockout / Backoff

## A) Current Backup Code Redemption Flow

### Main Process Paths

- `lock:redeemBackupCode` IPC handler:
  - `authenticator/apps/desktop/src/main/ipc-handlers.ts:1916-1928`
  - current behavior:
    - trusted sender check
    - backup feature enabled check
    - backup count check
    - validate code format
    - call `redeemBackupCode(code)`
    - if `true`, clear locked state in memory and unlock app
    - returns plain `boolean`
- Recovery/auth handlers also redeem backup codes without throttling:
  - `auth:unlockWithRecoveryCode`: `ipc-handlers.ts:2180-2193`
  - `auth:redeemBackupCode`: `ipc-handlers.ts:2222-2234`

### Verification Logic

- Backup code hash verification logic:
  - `authenticator/apps/desktop/src/main/backup-codes.ts:25-31` (`verifyRecord(...)`)
  - `authenticator/apps/desktop/src/main/backup-codes.ts:50-60` (`redeemBackupCode(...)`)
- Current hashing/storage model:
  - one-time SHA256 + salt records
  - records loaded via `loadBackupCodeRecords()` and saved back via `saveBackupCodeRecords()`

### Current Lock State Persistence

- Existing credential lock state read/write:
  - read: `authenticator/apps/desktop/src/main/secure-store.ts:929-932`
  - write: `authenticator/apps/desktop/src/main/secure-store.ts:934-937`
- Existing encrypted payload stores `lockState` only:
  - schema definition: `secure-store.ts:65-85`
  - normalization into payload: `secure-store.ts:702-715`

### Does Backup Code Failure Increment Any Counter Today?

- No.
- `backup-codes.ts:50-60` only returns `false` on mismatch.
- No failed-count increment, no `lockUntilEpochMs`, no persistence, no backoff.

## B) Existing Lockout Model Reference

### Current PIN / Password / Pattern Model

- Shared credential lockout logic lives in `authenticator/apps/desktop/src/main/lock-store.ts`.
- Delay schedule:
  - helper: `delaySecondsForFailure(...)` at `lock-store.ts:212-215`
  - failures 1 => 0s, 2 => 1s, 3 => 2s, 4 => 4s, 5 => 8s, doubling up to 300s max
- Verification flow with persistence:
  - `verifyCredentialWithLimit(...)` at `lock-store.ts:229-250`
  - reads state via `getCredentialLockState()`
  - blocks when `lockUntilEpochMs > now`
  - increments `failedCount`
  - persists `lockUntilEpochMs`
  - clears state on success

### Where Credential Lock State Is Persisted

- `LockState` shape defined in `secure-store.ts:53-56`
- current payload key is `lockState`
- lock state is normalized with `normalizeLockState(...)` in `secure-store.ts:373-385`
- persisted via `saveLockState(...)` in `secure-store.ts:934-937`

### Reuse Same State Or Separate State?

- Proposed: **separate** `backupCodeLockState: { failedCount, lockUntilEpochMs }`
- Reason:
  - safer isolation
  - failed backup code attempts should not lock out PIN/password/pattern verification
  - failed PIN guesses should not affect recovery-code redemption
- Reuse the same `LockState` shape and normalization helper, but store it under a separate encrypted payload key.

## C) Proposed Lockout Parameters For Backup Codes

### Proposed Schedule

- 1 failed attempt: no lockout yet
- 2 failed attempts: no lockout yet
- 3-4 failed attempts: 30 second lockout
- 5-6 failed attempts: 120 second lockout
- 7+ failed attempts: 300 second lockout (max)

### Rationale

- Backup codes are a recovery path and should stay usable.
- They are also an online guessing surface and deserve harsher throttling than normal PIN entry.
- This keeps the same persisted `failedCount + lockUntilEpochMs` model as PIN lockout, while using stronger delays appropriate for a recovery secret.

### Reset Rule

- Successful redemption clears `backupCodeLockState` back to `{ failedCount: 0, lockUntilEpochMs: 0 }`.

## D) UI / UX Plan

### Current Renderer State

- Current lock-screen backup submission path:
  - `authenticator/packages/ui/src/components/LockScreen.tsx:516-537`
- Current behavior:
  - calls `lockApi.redeemBackupCode(code)`
  - expects `boolean`
  - on `false`, shows `Backup code not accepted.`
- Current lock-screen lockout display is wired to credential lockout state loaded from `lockApi.getLockState()`:
  - load at `LockScreen.tsx:251-295`
  - countdown/status handling at `LockScreen.tsx:314-340`

### Required UI Change

- `LockScreen` does **not** currently handle backup-code lockout results.
- Minimal plan:
  - change `lockApi.redeemBackupCode(...)` to return the same structured result shape used by `lockApi.verify(...)`
  - reuse existing countdown + status display when the result is `LOCKED`
  - update backup submit flow to set `attemptsUsed` / `lockedUntil` like PIN flow
- Optional tiny polish:
  - show attempts text in backup mode too, not only PIN mode

### Recovery/Auth Handlers

- For `auth:unlockWithRecoveryCode` and `auth:redeemBackupCode`, apply the same persisted lockout in main process.
- Those handlers can keep their current error-driven contract by mapping:
  - `LOCKED` => `E_LOCKED`
  - `INCORRECT` => existing recovery-code invalid error

## E) Target Files

- `authenticator/apps/desktop/src/main/backup-codes.ts`
- `authenticator/apps/desktop/src/main/secure-store.ts`
- `authenticator/apps/desktop/src/main/ipc-handlers.ts`
- `authenticator/apps/desktop/src/preload.ts`
- `authenticator/apps/desktop/src/renderer.d.ts`
- `authenticator/packages/ui/src/bridge.ts`
- `authenticator/packages/ui/index.d.ts`
- `authenticator/packages/ui/src/components/LockScreen.tsx`
- tests:
  - `authenticator/apps/desktop/src/__tests__/...`
  - `authenticator/packages/ui/src/components/LockScreen.test.tsx`
