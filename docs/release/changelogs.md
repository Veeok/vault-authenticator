# Changelog

## 1.2.1 - Frameless window + custom title bar

### Added
- Added a renderer-driven `CustomTitleBar` with:
  - app icon, `Authenticator` title, and `VAULT` context label
  - frameless window controls (minimize, maximize/restore, close)
  - drag region support and double-click maximize/restore behavior
- Added preload `windowAPI` bridge methods:
  - `window:minimize`
  - `window:maximize`
  - `window:unmaximize`
  - `window:close`
  - `window:isMaximized`
- Added maximize state subscription bridge (`window:maximizedChanged`) and UI state sync handling.
- Added desktop preload unit tests for window-control IPC bridge wiring (`preload.window-api.test.ts`).

### Changed
- Updated desktop main-window creation to remove native Windows chrome (`frame: false`) while preserving resize/minimize/maximize behavior.
- Removed native menu bar across dev and production (`Menu.setApplicationMenu(null)`, hidden menu bar visibility).
- Kept keyboard edit accelerators working without a native menu (`Ctrl+C`, `Ctrl+V`, `Ctrl+X`, `Ctrl+A`) and restricted reload/devtools shortcuts in production.
- Integrated custom title bar into the shared app shell with spacing/layout adjustments to prevent content overlap.

### Fixed
- Fixed missing custom IPC tests for window controls at release checkpoint.
- Fixed initial maximize icon state drift by syncing maximize state on load/focus and window maximize/unmaximize events.

### Validation
- `pnpm test` passed.
- `pnpm --filter desktop exec tsc --noEmit` passed.
- `pnpm --filter @authenticator/ui exec tsc --noEmit` passed.
- `pnpm --filter desktop start` launched successfully.
- `pnpm --filter desktop make` completed and produced installer/zip artifacts.

## 1.2.0 - Lock redesign and emergency passkey recovery

### Added
- Added emergency lock-screen escape hatch: **Other ways to sign in** with options for backup code, PIN, password, pattern, and a confirmed last-resort app-lock reset.
- Added lock API endpoints for quick unlock configuration:
  - `lock:getQuickUnlock`
  - `lock:setQuickUnlock`
- Added `lock:resetAppLock` endpoint to wipe accounts/credentials and recover from hard lock states.

### Changed
- Redesigned Security settings into two sections:
  - **Lock Method** (`none`, `swipe`, `pin4`, `pin6`, `password`, `pattern`)
  - **Quick Unlock** (`windowsHello`, `passkey`) as additive shortcuts
- Updated lock storage model to persist lock method and quick unlock separately.
- Updated lock-screen flow so quick unlock attempts first, then always falls back to the selected lock method.
- Updated passkey registration flow to enable quick unlock without replacing the primary lock method.

### Fixed
- Removed passkey-only dead-end lock screen by always exposing alternate sign-in paths.
- Prevented permanent lockout loops by adding credential fallback and reset path on the lock screen.

### Validation
- `pnpm test` passed.
- `pnpm --filter desktop exec tsc --noEmit` passed.
- `pnpm --filter desktop start` launched successfully.

## 1.1.3 - Passkey cross-device verification fixes

### Fixed
- Added COSE EC2 public-key decoding fallback for passkey verification when key material is not returned as SPKI.
- Added DER/ECDSA signature compatibility handling in the verifier across key import paths.
- Removed unsafe attestation-byte fallback during registration (which could store invalid public keys and cause constant unlock failures).
- Added clearer registration failure messaging when a compatible public key is not provided by the platform.

### Validation
- `pnpm test` passed.
- `pnpm --filter desktop exec tsc --noEmit` passed.
- `pnpm --filter @authenticator/ui exec tsc --noEmit` passed.
- `pnpm --filter desktop start` launched successfully.

## 1.1.2 - Passkey signature verification compatibility

### Fixed
- Improved passkey assertion verification to handle ECDSA signature encodings more reliably.
- Added DER-to-raw ECDSA signature conversion fallback during WebCrypto verification.
- Expanded verification attempts to cover SPKI/raw ECDSA import paths with signature fallbacks.

### Validation
- `pnpm test` passed.
- `pnpm --filter desktop exec tsc --noEmit` passed.
- `pnpm --filter @authenticator/ui exec tsc --noEmit` passed.
- `pnpm --filter desktop start` launched successfully.

## 1.1.1 - Passkey unlock reliability fix

### Fixed
- Improved passkey assertion request compatibility by using explicit `ArrayBuffer` values for challenge and credential IDs in renderer WebAuthn requests.
- Set passkey `rpId` dynamically from renderer hostname (fallback `localhost`) for registration and unlock consistency.
- Removed automatic passkey unlock attempt on lock-screen mount to avoid non-gesture WebAuthn failures.
- Added clearer passkey failure messaging for canceled/timed-out prompts and invalid credential states.

### Validation
- `pnpm test` passed.
- `pnpm --filter desktop exec tsc --noEmit` passed.
- `pnpm --filter @authenticator/ui exec tsc --noEmit` passed.
- `pnpm --filter desktop start` launched successfully.

## 1.1.0 - Multi-lock security + passkeys

### Added
- Added a full desktop lock-method model with support for `none`, `swipe`, `pin`, `password`, `pattern`, `windowshello`, and `passkey`.
- Added `lock-store.ts` credential operations for PIN/password/pattern plus lock-method startup policy checks.
- Added `passkey-store.ts` for encrypted passkey credential storage (credential ID + public key).
- Added passkey IPC channels:
  - `passkey:getChallenge`
  - `passkey:saveCredential`
  - `passkey:getCredentialId`
  - `passkey:verifyAssertion`
  - `passkey:clearCredential`
- Added renderer-side passkey helpers in `packages/ui/src/utils/passkey.ts` for registration and assertion.
- Added a full security settings replacement (`SecurityPicker.tsx`) with method setup flows and live status handling.
- Added a custom renderer pattern component (`PatternLock.tsx`) with pointer tracking and verification feedback.
- Added a full method-aware lock screen with per-method unlock UX and backup-code entry.

### Changed
- Updated secure encrypted payload schema in `secure-store.ts` to store multi-method credentials and passkey data.
- Updated preload API to expose a dedicated `lockAPI` plus passkey bridge methods.
- Updated desktop renderer/global typings and UI bridge typings for all new lock and passkey methods.
- Updated app bootstrap lock gating to enforce startup lock only when the selected method is actually configured.
- Updated settings and lock screens to integrate passkey registration, passkey unlock, and passkey removal.
- Updated swipe lock UX with progress visuals, better gesture detection, keyboard fallback, and reduced-motion support.

### Security and policy
- Enforced one-time passkey challenges in memory (challenge consumed on save/verify).
- Added passkey assertion verification in main process using `crypto.webcrypto.subtle`.
- Enforced backup-code lifecycle policy:
  - changing security settings invalidates existing backup codes
  - opting out (`none`/`swipe`) removes backup codes
  - backup-code feature is enabled only when PIN lock is active

### Validation
- `pnpm test` passed.
- `pnpm --filter desktop exec tsc --noEmit` passed.
- `pnpm --filter @authenticator/ui exec tsc --noEmit` passed.
- `pnpm --filter desktop start` launched successfully.
