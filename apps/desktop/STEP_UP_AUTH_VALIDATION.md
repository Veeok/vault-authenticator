# Step-Up Auth Validation

## Channels Requiring Step-Up

Main-process step-up enforcement is now applied to:

- `backup:export`
- `lock:generateBackupCodes`
- `lock:resetAppLock`
- `passkey:saveCredential`
- `passkey:renameCredential`
- `passkey:removeCredential`
- `passkey:clearCredential`

Additional step-up support channels added:

- `lock:stepUpGetChallenge`
- `lock:stepUpVerify`

## Main Process Validation

Confirmed in `authenticator/apps/desktop/src/main/ipc-handlers.ts`:

- `E_STEP_UP_REQUIRED` error code added
- `requireStepUpAuth(event)` added
- short-lived sender-bound step-up timestamp window added
- step-up token cleared when the app locks or IPC registry reinitializes

## Renderer Validation

Confirmed in renderer/UI:

- `StepUpAuthModal` added for re-auth prompts
- `App.tsx` now requests step-up and retries sensitive actions after successful verification
- `SecurityPicker.tsx` now routes passkey registration, rename, and removal through the step-up flow
- `SafetySetupModal.tsx` passes step-up request handling through to nested `SecurityPicker`

## Automated Checks Run

### Type Checks

Commands run:

```powershell
pnpm --filter desktop exec tsc --noEmit
pnpm --filter @authenticator/ui exec tsc --noEmit
```

Result:

- Passed.

### Focused Desktop Tests

Command:

```powershell
pnpm --filter desktop test -- src/__tests__/ipc-handlers.security.test.ts src/__tests__/lock-store.test.ts src/__tests__/secure-store.resilience.test.ts
```

Result:

- Passed.

Covered behavior includes:

- step-up required for backup-code generation when unlocked
- passkey mutation channels require step-up when unlocked
- successful step-up unlocks those sensitive operations for the short token window
- locked-state hardening and passkey assertion checks still pass

### Focused UI Tests

Command:

```powershell
pnpm --filter @authenticator/ui test -- src/components/LockScreen.test.tsx src/components/SecurityPicker.passkey.test.tsx src/components/SecurityPicker.pin-policy.test.tsx src/components/SecurityPicker.backup-codes.test.tsx src/App.theme.test.tsx src/App.header-menu.test.tsx
```

Result:

- Passed.

This confirms the step-up plumbing did not break the existing lock, settings, passkey, or app-shell flows covered by those suites.

## Manual Checks

### Backup Export

1. Unlock the app.
2. Open Settings -> Accounts -> Encrypted Account Backup.
3. Click `Export Encrypted Backup`.
4. Confirm the step-up prompt appears.
5. Enter the correct credential.
6. Confirm the file-save flow proceeds.
7. Repeat and enter a wrong credential.
8. Confirm export does not proceed.
9. Repeat and click `Cancel`.
10. Confirm export is aborted with no side effects.

### Backup Code Generation

1. Unlock the app.
2. Open Settings -> Security.
3. Trigger backup-code generation.
4. Confirm the step-up prompt appears before generation.
5. Verify that successful re-auth opens the generated codes dialog.
6. Verify that cancel leaves the existing backup-code state unchanged.

### Passkey Management

1. Unlock the app.
2. Open Settings -> Security.
3. Rename or remove an existing passkey.
4. Confirm the step-up prompt appears first.
5. Verify that successful re-auth allows the action.
6. Verify that cancel leaves the passkey unchanged.

## Regression Checks

- Normal unlock flow still works.
- Non-sensitive settings changes do not trigger step-up.
- Existing lockout/backoff logic still applies through `verifyCredentialWithLimit(...)`.
- Locked-state IPC hardening remains in place.
