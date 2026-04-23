# Secret Lifetime Validation

## Locations Changed

- `authenticator/packages/ui/src/components/LockScreen.tsx`
- `authenticator/packages/ui/src/components/SecurityPicker.tsx`
- `authenticator/packages/ui/src/App.tsx`

## Before / After

### `LockScreen.tsx`

- Before:
  - PIN input was cleared after verify responses, but password and backup-code cleanup depended on specific result paths.
  - typed inputs could remain in state when switching away from a mode
- After:
  - PIN, password, and backup-code values are cleared after their IPC calls complete
  - inactive mode inputs are cleared when the user switches modes
  - unlock success still clears all lock-screen secret inputs

### `SecurityPicker.tsx`

- Before:
  - new PIN/password confirmation state and first pattern state survived thrown `setCredential(...)` failures
  - setup secrets could linger until manual reset or successful setup
- After:
  - PIN and password setup values are captured locally for IPC calls and cleared after the IPC completes
  - pattern setup state is cleared after completion attempts, including thrown errors
  - switching setup modes clears unrelated stale setup secret state

### `App.tsx`

- Before:
  - `backupPassphrase` was only cleared after successful export/import
  - canceled/error export/import paths left the passphrase in state
  - closing settings or locking the app did not clear the passphrase
- After:
  - `backupPassphrase` is cleared in `finally` after export/import IPC calls
  - closing settings clears the passphrase
  - locking the app clears the passphrase

## Validation Commands

Commands run:

```powershell
pnpm --filter @authenticator/ui exec tsc --noEmit
pnpm --filter @authenticator/ui test -- src/components/LockScreen.test.tsx src/components/SecurityPicker.pin-policy.test.tsx src/components/SecurityPicker.backup-codes.test.tsx src/components/SecurityPicker.passkey.test.tsx
```

Results:

- Type check passed.
- Focused UI tests passed.

## Manual Checks

### Unlock Flow

- Verify PIN unlock still succeeds.
- Verify password unlock still succeeds.
- Verify pattern unlock still succeeds.
- Verify switching between lock modes clears stale typed values.

### Backup Passphrase

- Open settings backup section.
- Type a backup passphrase.
- Run export or import.
- Confirm the passphrase field is empty afterward, including cancel and error paths.
- Close and reopen settings and confirm the passphrase field stays empty.

## Notes

- This pass intentionally did not change IPC signatures or lock/unlock semantics.
- Cleanup was applied at meaningful lifecycle boundaries: after IPC completion, on lock-screen mode changes, and on settings close/lock transitions.
