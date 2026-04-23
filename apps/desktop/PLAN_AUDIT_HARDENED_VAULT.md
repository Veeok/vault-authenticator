# Plan Audit: Hardened Vault Mode

## A) Current Vault Encryption Path

### Current Code Path

The current desktop vault path is exactly:

```text
JSON.stringify(payload)
  -> safeStorage.encryptString(...)
  -> base64 blob in electron-store
```

Confirmed at:

- decrypt path:
  - `authenticator/apps/desktop/src/main/secure-store.ts:607-609`
- load path:
  - `secure-store.ts:720-739`
- save path:
  - `secure-store.ts:742-745`

### Current Encrypted Payload Schema

Current `EncryptedPayload` fields:

- `accounts`
- `backupCodes`
- `backupCodeLockState`
- `settings`
- `lockState`
- `lockMethod`
- `primaryLockMethod`
- `secondaryLockMethod`
- `quickUnlock`
- `pinCredential`
- `passwordCredential`
- `patternCredential`
- `passkeyCredentials`
- legacy compatibility fields:
  - `passkeyCredential`
  - `pin`
  - `pinHash`
  - `recoveryCodeHashes`

Source:

- `authenticator/apps/desktop/src/main/secure-store.ts:65-86`

### Important Current Behavior

- `loadPayload()` decrypts on every read via `safeStorage`.
- There is no separate in-memory vault key today.
- App-lock credentials are stored inside the same decrypted payload but are not used to derive the vault encryption key.

## B) Proposed Hardened Vault Design

### Core Cryptographic Design

```text
Master password
  -> Argon2id (m=65536, t=3, p=1, salt=random 32 bytes)
  -> 32-byte masterKey

Random 32-byte vaultKey

vaultKey
  -> AES-256-GCM encrypted with masterKey
  -> stored as { wrappedKey, wrapIv, wrapAuthTag }

Vault payload JSON
  -> AES-256-GCM encrypted with vaultKey
  -> stored as { ciphertext, iv, authTag }
```

### Recommended Persisted Hardened Envelope

```ts
type HardenedVaultEnvelope = {
  version: 1;
  mode: "hardened";
  argon2Params: { m: 65536; t: 3; p: 1 };
  salt: string;
  wrappedKey: string;
  wrapIv: string;
  wrapAuthTag: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  masterPasswordLockState?: { failedCount: number; lockUntilEpochMs: number };
};
```

### Design Correction Needed

The prompt proposed `vaultMode` as a normal setting, but in this repo that does not work as the primary source of truth because:

- `settings` live inside the encrypted vault payload
- mode must be known **before** decrypting the payload

So the hardened-mode state must be stored in outer store metadata, not only inside `AppSettings`.

## C) What Changes And What Stays The Same

### Standard Mode

- Existing `safeStorage` path remains unchanged.
- Existing users are not forced to migrate.
- Existing store `blob` remains valid.

### Hardened Mode

- `safeStorage` is no longer the cryptographic protection for the vault payload.
- The master password-derived key unwraps the vault key.
- The vault key decrypts the payload.

### Unchanged

- TOTP algorithm logic
- Backup export/import format behavior except the already-completed backup-format v2 work
- App-lock credential hashing (PIN/password/pattern Argon2id verifier)

### New Requirement

- Hardened mode needs an in-memory unlocked vault cache because the app cannot re-prompt for the master password on every settings/account read.

Recommended runtime cache:

- `vaultKey` kept in memory only while the process remains unlocked for hardened mode
- decrypted payload cached in memory while active
- process exit clears it naturally

## D) Settings And Migration Plan

### UI Setting

Add a visible Security setting:

- `Vault Protection`
  - `Standard (OS-protected)`
  - `Hardened (password-protected)`

### Storage Reality

For implementation safety, split the concept into:

- outer persisted vault metadata:
  - actual source of truth used before decrypt
- UI-visible mode label in settings:
  - optional mirror for display, not the only source of truth

### Standard -> Hardened Migration

1. User opts in from Settings > Security.
2. Step-up auth is required first.
3. User enters a new master password.
4. App loads current payload using the existing standard path.
5. App derives `masterKey` with Argon2id.
6. App generates random `vaultKey`.
7. App encrypts payload with `vaultKey`.
8. App wraps `vaultKey` with `masterKey`.
9. App writes hardened envelope to outer store metadata.
10. App clears legacy `blob`.
11. App marks outer store mode as `hardened`.
12. App keeps hardened vault loaded in memory for the current session.

### Hardened -> Standard Migration

1. User chooses disable hardened mode.
2. Step-up auth is required first.
3. User re-enters the master password.
4. App verifies/unlocks hardened payload.
5. App re-encrypts payload through `safeStorage.encryptString(...)`.
6. App writes standard `blob`.
7. App clears hardened envelope + outer hardened metadata.
8. App marks mode as `standard`.

## E) Unlock Flow Changes In Hardened Mode

### Current Auth Window

- Current auth window mounts only `LockScreen`:
  - `authenticator/apps/desktop/src/auth-renderer.tsx:74-83`
- Current auth preload assumes lock settings can be queried immediately:
  - `authenticator/apps/desktop/src/preload.auth.ts:41-66`

### Hardened Mode Requirement

At startup in hardened mode, the app cannot show the normal lock screen first because `lock:getMethod`, `lock:getMethodsConfig`, and credential lookups depend on reading the vault payload.

So startup becomes a two-stage auth flow:

1. **Master password stage**
  - auth window shows a dedicated master-password prompt
  - main process derives `masterKey`, unwraps `vaultKey`, decrypts payload, caches it in memory
2. **App-lock stage**
  - after vault decrypt succeeds, auth window can show the existing `LockScreen`
  - existing PIN/password/pattern/passkey app-lock flow proceeds as normal if configured

### Later Re-locks

- For convenience, later relocks should use the existing app-lock only, not require the master password again while the process stays alive.
- On full process restart, hardened mode should require the master password again.

### New Auth-Window IPC Needed

Likely additions:

- `vault:getProtectionStatus`
  - returns mode and whether hardened decrypt is required before lock screen
- `vault:unlockWithMasterPassword`
  - attempts master-password unlock
- optional `vault:clearHardenedSession`
  - if you decide to support a full purge-on-lock variant later

## F) First-Run And Edge Cases

### Fresh Install

- Default remains `standard` mode.
- No forced hardened mode.

### Wrong Master Password

The prompt requires wrong-password lockout, and that cannot live only inside the encrypted payload because the payload is still locked.

So the master-password lockout must live in the outer hardened envelope metadata, e.g.:

- `masterPasswordLockState: { failedCount, lockUntilEpochMs }`

### Corrupted Hardened Metadata

- If wrapped-key data or ciphertext is malformed/corrupted:
  - fail closed
  - show clear error
  - do not silently fall back to standard mode

### No App Lock After Master Decrypt

- If the vault is hardened but no app-lock credential is configured, successful master-password decrypt should hand off directly to the main window.

## G) Target Files

### Main Storage / Crypto

- `authenticator/apps/desktop/src/main/secure-store.ts`

### IPC / Main Process

- `authenticator/apps/desktop/src/main/ipc-handlers.ts`

### Auth Window / Startup Flow

- `authenticator/apps/desktop/src/preload.auth.ts`
- `authenticator/apps/desktop/src/auth-renderer.tsx`
- possibly `authenticator/apps/desktop/src/main.ts`

### Shared Desktop Bridge Types

- `authenticator/apps/desktop/src/renderer.d.ts`
- `authenticator/packages/ui/src/bridge.ts`
- `authenticator/packages/ui/index.d.ts`

### UI

- `authenticator/packages/ui/src/App.tsx`
- likely a new master-password auth component for auth window and settings-driven enable/disable flows

### Tests

- secure-store tests
- desktop IPC tests
- auth window / preload tests
- UI tests for settings + unlock flow

## Design Confirmation Needed Before Build

I recommend proceeding with **one correction** to the prompt’s storage model:

1. keep `vaultMode` visible in settings/UI if desired,
2. but store the actual hardened/standard mode and hardened-envelope metadata in outer store metadata,
3. and store master-password lockout there too.

Without that correction, startup decrypt and wrong-password lockout cannot be implemented safely in this repo.
