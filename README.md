# Authenticator

Offline TOTP authenticator for desktop (Electron) and mobile (Capacitor Android).

## What It Does

- Stores TOTP accounts locally with encrypted-at-rest storage on both platforms.
- Supports adding accounts from `otpauth://totp/...` URIs, manual entry, and QR scan on mobile.
- Generates rolling TOTP codes fully offline using RFC 6238-compatible parameters.
- Supports app lock (PIN, plus biometric unlock when available on mobile).
- Supports encrypted backup export/import using a user-supplied passphrase.
- Includes settings for default code digits/period, light/dark theme toggle, and compact labels on small screens.

## Security Model

- App is offline-only: no telemetry, no auto-update channels, no remote API calls.
- TOTP secrets are kept out of renderer state and IPC responses.
- Desktop secrets are encrypted with Electron `safeStorage` before persistence.
- Mobile secrets are stored via secure storage plugin-backed encrypted storage.
- Backup files are encrypted with PBKDF2-SHA256 key derivation + AES-GCM.
- The app does not log secrets, otpauth URIs, PINs, or one-time codes.

## Supported URI Format

- Scheme: `otpauth`
- Type: `totp`
- Required query parameter: `secret` (Base32)
- Optional parameters: `issuer`, `algorithm`, `digits`, `period`
- Supported algorithms: `SHA1`, `SHA256`, `SHA512`
- Supported digits: `6`, `8`
- Supported period: integer from `1` to `300`

Only TOTP URIs are supported.

## Workspace Commands

```bash
pnpm test
pnpm --filter desktop exec tsc --noEmit
pnpm --filter mobile exec tsc --noEmit
pnpm --filter desktop make
pnpm --filter mobile build
```

## Documentation

- Project plans, audits, and reports are bundled under `docs/`.
- See `docs/README.md` for the subfolder index.
