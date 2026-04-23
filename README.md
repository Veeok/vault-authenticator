<p align="center">
  <img src="apps/desktop/assets/icon.png" alt="Vault Authenticator icon" width="120">
</p>

# Vault Authenticator

Offline TOTP authenticator for Electron desktop and Capacitor Android with encrypted local storage, lock methods, and encrypted backup support.

## Feature Overview

| Area | Status | Notes |
| --- | --- | --- |
| Offline TOTP generation | Implemented | Generates codes locally with RFC 6238-compatible logic |
| Desktop app | Implemented | Electron desktop client with encrypted local storage |
| Android app | Implemented | Capacitor Android client with QR scan and secure storage support |
| Backup import/export | Implemented | Uses encrypted backup files with passphrase-based protection |
| Lock methods | Implemented | Includes password, PIN, and platform-specific unlock support |
| Cloud sync | Not included | Repository is intentionally offline-first |

## Features

- Stores TOTP accounts locally with encrypted-at-rest storage on both platforms
- Supports `otpauth://totp/...` import, manual entry, and QR scan on mobile
- Generates rolling TOTP codes fully offline using RFC 6238-compatible parameters
- Supports app lock, backup export/import, and configurable display preferences
- Shares core logic and UI through a `pnpm` workspace

## Security Model

- Offline-only: no telemetry, no remote API calls, no cloud sync
- TOTP secrets stay out of renderer state and ordinary IPC responses
- Desktop secrets are encrypted with Electron `safeStorage`
- Mobile secrets are stored via secure-storage-backed encrypted storage
- Backup files use PBKDF2-SHA256 plus AES-GCM
- The app avoids logging secrets, otpauth URIs, PINs, and one-time codes

## Tech Stack

- Electron + React + TypeScript for desktop
- Capacitor Android + React + TypeScript for mobile
- Shared core and UI packages in a `pnpm` monorepo
- Vitest for package and app-level tests

## Repository Layout

- `apps/desktop` - Electron desktop app
- `apps/mobile` - Capacitor Android app
- `packages/core` - TOTP parsing and generation logic
- `packages/backup` - encrypted backup import and export logic
- `packages/ui` - shared React UI
- `docs` - supporting security, release, and stability notes

## Supported URI Format

- Scheme: `otpauth`
- Type: `totp`
- Required query parameter: `secret` (Base32)
- Optional parameters: `issuer`, `algorithm`, `digits`, `period`
- Supported algorithms: `SHA1`, `SHA256`, `SHA512`
- Supported digits: `6`, `8`
- Supported period: integer from `1` to `300`

Only TOTP URIs are supported.

## Commands

```bash
pnpm test
pnpm --filter desktop exec tsc --noEmit
pnpm --filter mobile exec tsc --noEmit
pnpm --filter desktop make
pnpm --filter mobile build
```

## Validation

| Command | Purpose |
| --- | --- |
| `pnpm test` | Run workspace test suites |
| `pnpm --filter desktop exec tsc --noEmit` | Type-check desktop app |
| `pnpm --filter mobile exec tsc --noEmit` | Type-check mobile app |
| `pnpm --filter desktop make` | Build desktop distributables |
| `pnpm --filter mobile build` | Build the mobile web bundle |

## Docs

- Docs index: `docs/README.md`
- Security notes: `docs/security/`
- Release notes: `docs/release/`
- Stability notes: `docs/stability/`
