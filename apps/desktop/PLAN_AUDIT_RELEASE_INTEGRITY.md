# Plan Audit: Release Integrity Hardening

## A) Current Signing State

- Current Forge config: `authenticator/apps/desktop/forge.config.ts`.
- Current makers:
  - `MakerNSIS` for Windows installer output: `forge.config.ts:63-65`
  - `MakerZIP` for Windows ZIP output: `forge.config.ts:63-65`
- Current packager hardening already present:
  - `asar: true`: `forge.config.ts:47-53`
  - Electron fuses include:
    - `RunAsNode: false`
    - `EnableEmbeddedAsarIntegrityValidation: true`
    - `OnlyLoadAppFromAsar: true`
    - `EnableNodeOptionsEnvironmentVariable: false`
    - `EnableNodeCliInspectArguments: false`
    - `EnableCookieEncryption: true`
    - `forge.config.ts:89-97`
- Missing today:
  - No `windowsSign` config in `packagerConfig`
  - No NSIS installer `codesign` config
  - No `osxSign` config
  - No `osxNotarize` config
  - No release checksum generation step
  - No release checklist in desktop root covering signing and checksum verification
- Current repo-visible signing credential expectation:
  - None. No certificate env vars or config-file references are present in `forge.config.ts`.

## B) Windows Signing Plan

### Build Targets

- Windows is the primary packaged target today.
- The installer maker is NSIS via `@electron-addons/electron-forge-maker-nsis`.
- The app package itself can be signed via Electron Packager `packagerConfig.windowsSign`.
- The NSIS installer can be signed via maker config `codesign`.

### Proposed Env Vars

- Required for standard PFX signing:
  - `WINDOWS_CERTIFICATE_FILE`
  - `WINDOWS_CERTIFICATE_PASSWORD`
- Optional Windows signing tuning:
  - `WINDOWS_SIGN_WITH_PARAMS`
  - `WINDOWS_TIMESTAMP_SERVER`
  - `WINDOWS_SIGN_DESCRIPTION`
  - `WINDOWS_SIGN_WEBSITE`

### Wiring Plan

- Add a shared helper in `forge.config.ts` to build a Windows sign config from env vars.
- Apply that config in two places:
  - `packagerConfig.windowsSign` for packaged Windows binaries
  - `new MakerNSIS({ codesign: ... })` for the generated installer
- Add a dev-mode guard:
  - if required Windows signing env vars are missing, skip signing and log a clear warning
  - do not fail local dev packaging

### Local vs CI Testing

- Local dev:
  - `pnpm --filter desktop package`
  - expected behavior without cert env vars: unsigned package, warning emitted, build still succeeds
- CI or release machine:
  - provide signing env vars
  - run `pnpm --filter desktop make`
  - verify resulting installer is signed

## C) macOS Notarization Plan

### Current Target State

- Current Forge makers only produce Windows artifacts: `MakerNSIS` and `MakerZIP` with `win32` target restriction.
- There is no current packaged macOS release path in repo-visible Forge makers.
- Conclusion: the app is Windows-primary today, but macOS should remain build-compatible.

### Proposed Guarded macOS Config

- Add guarded `packagerConfig.osxSign` and `packagerConfig.osxNotarize` entries.
- These should remain inactive unless the relevant Apple credentials are present.

### Proposed Apple Env Vars

- Signing identity:
  - `APPLE_SIGN_IDENTITY`
- Notarization options:
  - preferred API-key path:
    - `APPLE_API_KEY`
    - `APPLE_API_KEY_ID`
    - `APPLE_API_ISSUER`
    - `APPLE_TEAM_ID`
  - fallback Apple ID path:
    - `APPLE_ID`
    - `APPLE_APP_SPECIFIC_PASSWORD`
    - `APPLE_TEAM_ID`

### Behavior Plan

- If macOS signing/notarization env vars are absent:
  - skip `osxSign`/`osxNotarize`
  - log a clear warning only when packaging macOS
- This keeps current Windows packaging untouched while not breaking future macOS packaging.

## D) Artifact Verification Plan

- Add a small Node.js script under desktop tooling to generate SHA256 checksums for built artifacts.
- The script should:
  - scan `authenticator/apps/desktop/out/make`
  - hash installer and archive artifacts
  - emit `CHECKSUMS.txt` alongside the artifacts or at `out/make/CHECKSUMS.txt`
- Publish plan:
  - upload the installer artifacts and `CHECKSUMS.txt` together
  - include checksum verification instructions in the release checklist

## E) Release Checklist Proposal

Create `authenticator/apps/desktop/RELEASE_CHECKLIST.md` covering:

### Pre-release

- version bump completed
- changelog reviewed/published
- Windows signing credentials available on release machine
- macOS signing/notarization credentials available if macOS release is being built

### Build

- `pnpm --filter desktop package` succeeds
- `pnpm --filter desktop make` succeeds
- signed artifacts are produced when signing credentials are present
- unsigned dev-mode build is only allowed for local testing, not release publication

### Post-build

- checksum script run successfully
- `CHECKSUMS.txt` generated and reviewed

### Publish

- upload artifacts and `CHECKSUMS.txt` together
- do not publish unsigned release installers

### Verification

- verify Authenticode signature on the Windows installer
- verify SHA256 checksum from `CHECKSUMS.txt`
- record release operator sign-off

## Implementation Scope Chosen

- Update `authenticator/apps/desktop/forge.config.ts`
- Add a checksum generation script in desktop tooling
- Add `authenticator/apps/desktop/RELEASE_CHECKLIST.md`
- Add `authenticator/apps/desktop/RELEASE_INTEGRITY_VALIDATION.md`
- Keep changes out of core TOTP, vault, and renderer logic
