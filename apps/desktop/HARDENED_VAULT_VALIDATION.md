# Hardened Vault Validation

## Files Changed

### Core storage / crypto

- `authenticator/apps/desktop/src/main/secure-store.ts`
- `authenticator/apps/desktop/src/__tests__/secure-store.hardened-vault.test.ts`

### Main process / IPC

- `authenticator/apps/desktop/src/main/ipc-handlers.ts`
- `authenticator/apps/desktop/src/main.ts`

### Auth window / preload

- `authenticator/apps/desktop/src/preload.auth.ts`
- `authenticator/apps/desktop/src/auth-renderer.tsx`
- `authenticator/apps/desktop/src/__tests__/auth-window.main-config.test.ts`

### Full renderer bridge / UI

- `authenticator/apps/desktop/src/preload.ts`
- `authenticator/apps/desktop/src/renderer.d.ts`
- `authenticator/packages/ui/src/bridge.ts`
- `authenticator/packages/ui/index.d.ts`
- `authenticator/packages/ui/src/App.tsx`
- `authenticator/packages/ui/src/App.vault-protection.test.tsx`
- `authenticator/packages/ui/src/utils/errors.ts`

### Manual validation helpers

- `authenticator/apps/desktop/scripts/manual-seed-hardened-profile.cjs`
- `authenticator/apps/desktop/scripts/manual-seed-profile.cjs`
- `authenticator/apps/desktop/scripts/manual-auth-window-check.ps1`

### Planning doc

- `authenticator/apps/desktop/PLAN_AUDIT_HARDENED_VAULT.md`

## Automated Checks Run

### Desktop Type Check

Command:

```powershell
pnpm --filter desktop exec tsc --noEmit
```

Result:

- Passed.

### UI Type Check

Command:

```powershell
pnpm --filter @authenticator/ui exec tsc --noEmit
```

Result:

- Passed.

### Focused Desktop Tests

Command:

```powershell
pnpm --filter desktop test -- src/__tests__/secure-store.hardened-vault.test.ts src/__tests__/secure-store.resilience.test.ts src/__tests__/preload.auth-window-api.test.ts src/__tests__/auth-window.main-config.test.ts src/__tests__/ipc-handlers.security.test.ts
```

Result:

- Passed.

Covered cases:

- standard mode vault round-trips correctly
- hardened mode vault encrypts and decrypts correctly
- wrong master password fails
- corrupted hardened wrapping metadata fails closed
- migration standard -> hardened preserves accounts
- migration hardened -> standard preserves accounts
- auth window preload / lifecycle regressions remain green

### Focused UI Tests

Command:

```powershell
pnpm --filter @authenticator/ui test -- src/App.theme.test.tsx src/App.header-menu.test.tsx src/App.quick-actions.test.tsx src/App.safety-setup.test.tsx src/App.responsive-layout.test.tsx src/App.motion.test.tsx src/components/LockScreen.test.tsx src/components/SecurityPicker.passkey.test.tsx src/components/SecurityPicker.pin-policy.test.tsx src/components/SecurityPicker.backup-codes.test.tsx
pnpm --filter @authenticator/ui test -- src/App.vault-protection.test.tsx
```

Result:

- Passed.

Additional covered cases:

- vault protection status renders in Security settings
- vault protection modal shows stronger warnings and validates master password confirmation

### Packaged Desktop Build

Command:

```powershell
pnpm --filter desktop package
```

Result:

- Passed.

## Manual Checks Performed

### Fresh Install Defaults To Standard Mode

Packaged app was launched on an empty disposable profile.

Observed:

- main window created directly
- auth window was not created first

This validates the default remains standard mode.

### Standard Auth Window Flow Still Works

Packaged app was run against a seeded standard password profile using the updated manual harness.

Observed:

- startup auth window
- password unlock
- focus-loss relock
- locked/open focus behavior
- recovery-code unlock
- unlocked/open focus behavior

Result:

- passed

### Auth Window Theme Sync Works

Observed / automated coverage:

- auth renderer now reads persisted non-sensitive UI settings from outer store metadata before hardened vault decrypt
- master-password screen no longer hardcodes `theme-dark accent-none`
- persisted auth UI settings survive while the hardened vault itself remains locked

Packaged hardened-flow rerun after the theme-sync change:

- passed

### Hardened Startup Flow Works

Packaged app was run against a seeded hardened password profile with:

- master password
- app-lock password
- recovery code

Observed:

- startup auth window appears first
- master-password stage succeeds
- app-lock password stage succeeds
- focus-loss relock shows auth window again
- recovery-code unlock still works after hardened master unlock path
- locked/open focus behavior works
- unlocked/open focus behavior works

Result:

- passed

### DPAPI / `safeStorage` Blob No Longer Present In Hardened Mode

Checked the seeded hardened store file directly:

```json
{"hasBlob":false,"hasHardenedEnvelope":true,"vaultMode":"hardened"}
```

This confirms the hardened profile no longer stores the live vault as a single `safeStorage`-encrypted `blob` field.

## Manual Checks Not Fully Clicked Through In UI

- Full settings-driven enable/disable hardened mode click-through was not automated end-to-end in the renderer UI.
- Migration correctness is covered by automated secure-store tests.
- Passkey and biometric flows remain hardware-dependent and were not manually exercised in hardened mode during this pass.

## Notes

- Prompt 7 required one design correction from the original prompt text:
  - the actual vault mode and hardened envelope metadata are stored outside the encrypted settings payload
  - master-password lockout state is also stored outside the encrypted payload
- Without that correction, startup decrypt branching and wrong-master-password lockout could not be implemented safely in this repo.
