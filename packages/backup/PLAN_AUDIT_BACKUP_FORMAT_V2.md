# Plan Audit: Backup Format v2

## A) Current Backup Format

### File Paths

- Encrypt and decrypt functions live in:
  - `authenticator/packages/backup/src/index.ts`
- Current tests live in:
  - `authenticator/packages/backup/src/__tests__/backup.test.ts`

### Current v1 Envelope Schema

Defined in `authenticator/packages/backup/src/index.ts:16-25`:

```ts
{
  version: 1,
  kdf: "PBKDF2-SHA256",
  iterations: number,
  algorithm: "AES-GCM",
  salt: string,
  iv: string,
  ciphertext: string,
  authTag: string,
}
```

### Current KDF Parameters

- PBKDF2 with SHA-256:
  - `deriveKey(...)` at `index.ts:58-80`
- Iteration count:
  - `ITERATIONS = 210000` at `index.ts:27`

### Current Flow

- `encryptBackup(...)`:
  - `index.ts:82-106`
  - builds `{ version: 1, accounts }`
  - random salt (16 bytes)
  - random IV (12 bytes)
  - derives AES-256-GCM key via PBKDF2-SHA256
  - returns v1 envelope
- `decryptBackup(...)`:
  - `index.ts:108-145`
  - requires exact v1/PBKDF2 envelope values today
  - rejects all non-v1 envelopes as unsupported

## B) Proposed v2 Envelope Schema

### New Envelope

```ts
{
  version: 2,
  kdf: "argon2id",
  argon2Params: {
    m: 65536,
    t: 3,
    p: 1,
  },
  algorithm: "AES-GCM",
  salt: string,
  iv: string,
  ciphertext: string,
  authTag: string,
}
```

### Argon2id Parameters

- Proposed parameters:
  - `m = 65536`
  - `t = 3`
  - `p = 1`
- Rationale:
  - matches the existing desktop Argon2id credential hashing posture
  - is a reasonable stronger KDF baseline for exported backup files

### Cipher

- Keep AES-256-GCM unchanged.

## C) Backward Compatibility Plan

- Import should branch on `version` / `kdf`:
  - v1 or `kdf === "PBKDF2-SHA256"` => current PBKDF2 path
  - v2 or `kdf === "argon2id"` => Argon2id path
- New export should always write v2 going forward.
- Unknown version should fail with a clear error.
- Payload schema stays additive:
  - v2 adds `argon2Params`
  - v1 import remains unchanged

## D) Target Files

- `authenticator/packages/backup/src/index.ts`
- `authenticator/packages/backup/src/__tests__/backup.test.ts`
- likely `authenticator/packages/backup/package.json` if the package needs its own direct `@node-rs/argon2` dependency declaration
