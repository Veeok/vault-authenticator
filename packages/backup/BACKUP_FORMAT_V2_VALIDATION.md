# Backup Format v2 Validation

## Files Changed

- `authenticator/packages/backup/PLAN_AUDIT_BACKUP_FORMAT_V2.md`
- `authenticator/packages/backup/src/index.ts`
- `authenticator/packages/backup/src/__tests__/backup.test.ts`
- `authenticator/packages/backup/package.json`
- `authenticator/apps/mobile/src/mobile-bridge.ts`
- `authenticator/apps/mobile/vite.config.ts`

## What Changed

- New backup exports now produce envelope `version: 2` with:
  - `kdf: "argon2id"`
  - `argon2Params: { m: 65536, t: 3, p: 1 }`
  - `algorithm: "aes-256-gcm"`
- v1 PBKDF2 import path remains supported unchanged.
- v2 decryption uses Argon2id-derived raw 32-byte key material via `@node-rs/argon2` `hashRaw(...)`.
- Unknown or mismatched envelope versions/parameters fail with `Unsupported backup format`.
- Mobile backup-code bridge return type was aligned with the newer shared `LockVerifyResult` contract.
- Mobile Vite target was raised to `esnext` so the Argon2 wasm browser build can bundle successfully.

## Automated Tests

### Backup Package

Command:

```powershell
pnpm --filter @authenticator/backup test
```

Result:

- Passed.

Covered cases:

- new export produces v2 Argon2id envelope
- v2 backup decrypts correctly
- wrong passphrase fails
- legacy v1 PBKDF2 backup still decrypts correctly
- unsupported backup format fails clearly

### Desktop Type Check

Command:

```powershell
pnpm --filter desktop exec tsc --noEmit
```

Result:

- Passed.

### Mobile Type Check

Command:

```powershell
pnpm --filter mobile exec tsc --noEmit
```

Result:

- Passed.

### Mobile Build

Command:

```powershell
pnpm --filter mobile build
```

Result:

- Passed.
- Argon2 wasm assets were emitted into the mobile build output.

## Manual Export / Import Check

- No separate interactive app-level export/import click-through was performed in this prompt.
- Validation relied on:
  - direct backup package round-trip tests
  - legacy v1 compatibility test
  - desktop type safety
  - successful mobile production build using the shared backup package

## Notes

- Prompt 6 only changes exported backup files, not live vault storage.
- The mobile build required `build.target = "esnext"` to support the wasm Argon2 browser bundle’s top-level await.
