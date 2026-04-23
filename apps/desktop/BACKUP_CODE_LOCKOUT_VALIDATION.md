# Backup Code Lockout Validation

## Files Changed

- `authenticator/apps/desktop/PLAN_AUDIT_BACKUP_CODE_LOCKOUT.md`
- `authenticator/apps/desktop/src/main/secure-store.ts`
- `authenticator/apps/desktop/src/main/backup-codes.ts`
- `authenticator/apps/desktop/src/main/ipc-handlers.ts`
- `authenticator/apps/desktop/src/renderer.d.ts`
- `authenticator/apps/desktop/src/__tests__/backup-codes.test.ts`
- `authenticator/apps/desktop/src/__tests__/ipc-handlers.security.test.ts`
- `authenticator/packages/ui/src/bridge.ts`
- `authenticator/packages/ui/index.d.ts`
- `authenticator/packages/ui/src/components/LockScreen.tsx`
- `authenticator/packages/ui/src/components/LockScreen.test.tsx`
- related UI test mocks updated for the new structured backup-code result type

## What Changed

- Added persisted `backupCodeLockState` to the encrypted desktop vault payload.
- Added backup-code redemption backoff in `backup-codes.ts` with a separate state from normal PIN/password/pattern lockout.
- Enforced lockout before verification attempts.
- Reset backup-code failed-attempt state on successful redemption.
- Cleared backup-code lockout state when backup codes are regenerated or cleared.
- Updated `lock:redeemBackupCode` to return the same structured result model used by credential verification.
- Updated recovery/auth backup-code handlers to enforce the same lockout in main process.
- Updated `LockScreen` to display backup-code lockout countdown and attempts used.

## Automated Tests Added / Updated

### Added

- `authenticator/apps/desktop/src/__tests__/backup-codes.test.ts`
  - 3 failed backup code attempts activates lockout
  - attempt during lockout is rejected with remaining time
  - successful redemption resets counter
  - lockout persists across module reload / app restart simulation
  - valid backup code works after lockout expires

### Updated

- `authenticator/apps/desktop/src/__tests__/ipc-handlers.security.test.ts`
  - adjusted backup-code mock contract for structured redemption results
- `authenticator/packages/ui/src/components/LockScreen.test.tsx`
  - added backup-code lockout UI coverage
- UI/App test mocks updated to return structured backup-code verification results

## Validation Commands

Commands run:

```powershell
pnpm --filter desktop exec tsc --noEmit
pnpm --filter desktop test -- src/__tests__/backup-codes.test.ts src/__tests__/ipc-handlers.security.test.ts src/__tests__/lock-store.test.ts src/__tests__/secure-store.resilience.test.ts
pnpm --filter @authenticator/ui exec tsc --noEmit
pnpm --filter @authenticator/ui test -- src/components/LockScreen.test.tsx src/App.theme.test.tsx src/App.header-menu.test.tsx src/App.quick-actions.test.tsx src/App.safety-setup.test.tsx src/App.responsive-layout.test.tsx src/App.motion.test.tsx src/components/SecurityPicker.passkey.test.tsx src/components/SecurityPicker.pin-policy.test.tsx src/components/SecurityPicker.backup-codes.test.tsx
```

Results:

- Desktop TypeScript check passed.
- Desktop focused test suite passed.
- UI TypeScript check passed.
- UI focused test suite passed.

## Manual Checks

- No separate interactive desktop app manual run was performed in this pass.
- Backup-code lockout surfacing was covered through the lock-screen component test and the main-process persisted-state tests.

## Notes

- Backup-code lockout state is intentionally separate from the normal credential lockout state.
- This prevents failed backup-code guesses from locking out PIN/password/pattern entry and vice versa.
